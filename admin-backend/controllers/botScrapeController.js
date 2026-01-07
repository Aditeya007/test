// admin-backend/controllers/botScrapeController.js

/**
 * Bot-scoped scraper and scheduler controller
 * 
 * This is a thin routing + context translation layer that:
 * 1. Resolves bot by botId
 * 2. Validates bot ownership (user owns bot or admin created user)
 * 3. Uses bot.vectorStorePath and bot._id as resourceId
 * 4. Delegates to Python scripts (reusing scraper logic without modifying scrapeController)
 * 5. Stores scheduler state in Bot model (per-bot state)
 * 
 * Does NOT duplicate business logic or rewrite scraper jobs.
 * Does NOT modify existing scrapeController or user-scoped routes.
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Bot = require('../models/Bot');
const User = require('../models/User');

// Path to scheduler script (reuse from scrapeController)
const repoRoot = path.resolve(__dirname, '..', '..');
const schedulerScriptPath = path.resolve(repoRoot, 'UPDATER', 'run_tenant_scheduler.py');

/**
 * Get the Python executable path (reused from scrapeController)
 */
const getPythonExecutable = () => {
  if (!process.env.PYTHON_BIN) {
    throw new Error(
      'PYTHON_BIN not set. PM2 does not use your shell virtualenv.'
    );
  }
  return process.env.PYTHON_BIN.trim();
};

const buildJobId = (prefix, resourceId) => {
  const random = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex');
  return `${prefix}_${resourceId || 'bot'}_${random}`;
};

const toBooleanOrUndefined = (value) => {
  if (typeof value === 'undefined' || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return undefined;
};

const parseIntegerOrUndefined = (value) => {
  if (typeof value === 'undefined' || value === null || value === '') {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/**
 * Resolve bot and validate ownership
 * Attaches bot to request for downstream use
 */
const resolveBotContext = async (req, res, next) => {
  try {
    const { botId } = req.params;
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        error: 'botId is required'
      });
    }

    // Load bot
    const bot = await Bot.findById(botId);
    
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Validate bot is active
    if (!bot.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Bot is inactive'
      });
    }

    // Validate ownership
    const authenticatedUserId = req.user.userId;
    const authenticatedUserRole = req.user.role;
    
    // User must own the bot OR be an admin who created the bot owner
    const isOwner = bot.userId.toString() === authenticatedUserId;
    
    let isAuthorized = isOwner;
    
    if (!isOwner && authenticatedUserRole === 'admin') {
      // Check if admin created the user who owns this bot
      const botOwner = await User.findById(bot.userId);
      if (botOwner && botOwner.adminId && botOwner.adminId.toString() === authenticatedUserId) {
        isAuthorized = true;
      }
    }
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You do not have permission to access this bot'
      });
    }

    // Attach bot for downstream use
    req.bot = bot;
    
    console.log(`✅ Bot context resolved: ${bot.name} (${botId}) for user ${bot.userId}`);
    
    next();
  } catch (err) {
    console.error('❌ Failed to resolve bot context:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve bot context',
      details: err.message
    });
  }
};

/**
 * POST /bot/:botId/scrape
 * Start a scrape for this bot
 * Delegates to Python scraper script with bot's context
 */
exports.startBotScrape = [
  resolveBotContext,
  async (req, res) => {
    try {
      const bot = req.bot;
      const botId = bot._id.toString();
      const vectorStorePath = bot.vectorStorePath;
      
      // Extract parameters from request body
      const startUrl = typeof req.body.startUrl === 'string' ? req.body.startUrl.trim() : '';
      const sitemapUrl = typeof req.body.sitemapUrl === 'string' ? req.body.sitemapUrl.trim() : undefined;
      const embeddingModelName = typeof req.body.embeddingModelName === 'string' ? req.body.embeddingModelName.trim() : undefined;
      const collectionName = typeof req.body.collectionName === 'string' ? req.body.collectionName.trim() : undefined;
      const domain = typeof req.body.domain === 'string' ? req.body.domain.trim() : undefined;
      const respectRobots = toBooleanOrUndefined(req.body.respectRobots);
      const aggressiveDiscovery = toBooleanOrUndefined(req.body.aggressiveDiscovery);
      const maxDepth = parseIntegerOrUndefined(req.body.maxDepth);
      const maxLinksPerPage = parseIntegerOrUndefined(req.body.maxLinksPerPage);
      
      // Use bot.scrapedWebsites[0] as fallback for startUrl
      const effectiveStartUrl = startUrl || (bot.scrapedWebsites && bot.scrapedWebsites.length > 0 ? bot.scrapedWebsites[0] : '');
      
      if (!effectiveStartUrl) {
        return res.status(400).json({
          success: false,
          error: 'startUrl is required (either in request body or bot.scrapedWebsites)'
        });
      }
      
      // Ensure bot vector store directory exists
      if (!fs.existsSync(vectorStorePath)) {
        fs.mkdirSync(vectorStorePath, { recursive: true });
        console.log(`📁 Created vector store directory: ${vectorStorePath}`);
      }
      
      const jobId = buildJobId('scrape', botId);
      
      console.log('🚀 Starting bot scrape (detached background process)', {
        jobId,
        botId,
        botName: bot.name,
        vectorStorePath,
        startUrl: effectiveStartUrl
      });

      // Get Python executable
      const pythonExe = getPythonExecutable();
      
      // Build arguments for the scraper (delegate to Python script)
      const args = ['-m', 'Scraping2.run_tenant_spider'];
      const pushArg = (flag, value) => {
        if (value !== undefined && value !== null) {
          if (typeof value === 'boolean') {
            if (value) args.push(flag);
          } else {
            args.push(flag, String(value));
          }
        }
      };
      
      // Use botId as resourceId (unique identifier for this bot's job)
      pushArg('--start-url', effectiveStartUrl);
      pushArg('--domain', domain);
      pushArg('--resource-id', botId);
      pushArg('--user-id', bot.userId.toString());
      pushArg('--vector-store-path', vectorStorePath);
      pushArg('--collection-name', collectionName);
      pushArg('--embedding-model-name', embeddingModelName);
      pushArg('--max-depth', maxDepth);
      pushArg('--max-links-per-page', maxLinksPerPage);
      pushArg('--sitemap-url', sitemapUrl);
      pushArg('--job-id', jobId);
      pushArg('--log-level', process.env.SCRAPER_LOG_LEVEL || 'INFO');
      
      if (respectRobots === true) args.push('--respect-robots');
      else if (respectRobots === false) args.push('--no-respect-robots');
      
      if (aggressiveDiscovery === true) args.push('--aggressive-discovery');
      else if (aggressiveDiscovery === false) args.push('--no-aggressive-discovery');

      // Create log file for the scraper
      const logFilePath = path.join(vectorStorePath, 'scraper.log');
      const logFile = fs.openSync(logFilePath, 'a');

      // Clear previous scrape completion status and set to 'running' before starting new scrape
      await Bot.findByIdAndUpdate(botId, {
        $set: {
          'schedulerConfig.lastScrapeCompleted': null,
          'schedulerConfig.botReady': false,
          'schedulerConfig.scrapeStatus': 'running'
        }
      });
      console.log(`🔄 Set scrape status to 'running' for bot ${bot.name}`);

      // Spawn as detached background process (reuse spawn logic from scrapeController)
      const child = spawn(pythonExe, args, {
        detached: true,
        stdio: ['ignore', logFile, logFile], // Write stdout and stderr to log file
        cwd: repoRoot,
        env: {
          ...process.env, // Inherit all environment variables (RAG_DATA_ROOT, etc.)
          PYTHONUNBUFFERED: '1',
          PYTHONPATH: repoRoot
        }
      });
      
      // Unref so parent can exit without waiting
      child.unref();
      
      console.log('✅ Scraper spawned successfully', {
        jobId,
        pid: child.pid,
        botId,
        vectorStorePath,
        pythonExe,
        mode: 'python -m Scraping2.run_tenant_spider'
      });

      // Immediately return 202 Accepted (same pattern as scrapeController)
      return res.status(202).json({
        success: true,
        message: 'Scrape job started in background',
        jobId,
        pid: child.pid,
        botId,
        vectorStorePath,
        status: 'running'
      });
      
    } catch (err) {
      console.error('❌ Failed to start bot scrape job:', {
        botId: req.bot?._id,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });

      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message
      });
    }
  }
];

/**
 * Internal helper: Mark scrape as completed
 * Called when Python scraper job finishes
 */
const markScrapeCompleted = async (botId) => {
  try {
    await Bot.findByIdAndUpdate(botId, {
      $set: {
        'schedulerConfig.lastScrapeCompleted': new Date(),
        'schedulerConfig.botReady': true,
        'schedulerConfig.scrapeStatus': 'completed'
      }
    });
    console.log(`✅ Scrape marked as completed for bot ${botId}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to mark scrape completed for bot ${botId}:`, err.message);
    return false;
  }
};

/**
 * POST /bot/:botId/scrape/complete
 * Internal endpoint to mark scrape as completed
 * Called by Python scraper when job finishes
 * Supports both JWT and service secret authentication
 */
exports.markBotScrapeComplete = async (req, res) => {
  try {
    const { botId } = req.params;
    
    // Check for service secret authentication (from Python scraper)
    const serviceSecret = req.headers['x-service-secret'];
    const expectedSecret = process.env.SERVICE_SECRET || 'default_service_secret';
    
    if (serviceSecret === expectedSecret) {
      // Service secret auth: skip ownership validation
      console.log(`📬 Bot scrape complete notification (service secret auth): ${botId}`);
      
      const success = await markScrapeCompleted(botId);
      
      if (success) {
        return res.json({
          success: true,
          message: 'Scrape marked as completed',
          botId
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Failed to mark scrape as completed'
        });
      }
    }
    
    // Fallback to JWT auth (for manual API calls)
    // This path requires auth middleware to have run first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Load bot and validate ownership
    const bot = await Bot.findById(botId);
    
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }
    
    if (!bot.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Bot is inactive'
      });
    }
    
    // Validate ownership
    const authenticatedUserId = req.user.userId;
    const authenticatedUserRole = req.user.role;
    
    const isOwner = bot.userId.toString() === authenticatedUserId;
    
    let isAuthorized = isOwner;
    
    if (!isOwner && authenticatedUserRole === 'admin') {
      const botOwner = await User.findById(bot.userId);
      if (botOwner && botOwner.adminId && botOwner.adminId.toString() === authenticatedUserId) {
        isAuthorized = true;
      }
    }
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You do not have permission to access this bot'
      });
    }
    
    const success = await markScrapeCompleted(botId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Scrape marked as completed',
        botId
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to mark scrape as completed'
      });
    }
  } catch (err) {
    console.error('❌ Failed to mark bot scrape complete:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

/**
 * GET /bot/:botId/scrape/status
 * Get scrape status for this bot
 * Checks bot.schedulerConfig.lastScrapeCompleted and botReady
 */
exports.getBotScrapeStatus = [
  resolveBotContext,
  async (req, res) => {
    try {
      const bot = req.bot;
      
      const schedulerConfig = bot.schedulerConfig || {};
      const lastCompleted = schedulerConfig.lastScrapeCompleted || null;
      const botReady = schedulerConfig.botReady || false;
      
      // Use explicit scrapeStatus field instead of inferring from timestamps
      const status = schedulerConfig.scrapeStatus || 'idle';

      res.json({
        success: true,
        status,
        lastCompleted,
        botReady,
        botId: bot._id,
        botName: bot.name
      });
      
    } catch (err) {
      console.error('❌ Failed to get bot scrape status:', err.message);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
];

/**
 * POST /bot/:botId/scheduler/start
 * Start scheduler for this bot
 * Delegates to Python scheduler script with bot's context
 */
exports.startBotScheduler = [
  resolveBotContext,
  async (req, res) => {
    try {
      const bot = req.bot;
      const botId = bot._id.toString();
      const vectorStorePath = bot.vectorStorePath;
      
      // Extract parameters from request body
      const startUrl = typeof req.body.startUrl === 'string' ? req.body.startUrl.trim() : '';
      const intervalMinutes = 120; // Fixed 2-hour interval (same as scrapeController)
      const runImmediately = true; // Always run immediately on scheduler start
      const sitemapUrl = typeof req.body.sitemapUrl === 'string' ? req.body.sitemapUrl.trim() : undefined;
      const embeddingModelName = typeof req.body.embeddingModelName === 'string' ? req.body.embeddingModelName.trim() : undefined;
      const collectionName = typeof req.body.collectionName === 'string' ? req.body.collectionName.trim() : undefined;
      const domain = typeof req.body.domain === 'string' ? req.body.domain.trim() : undefined;
      const mongoUriOverride = typeof req.body.mongoUri === 'string' ? req.body.mongoUri.trim() : undefined;
      const respectRobots = toBooleanOrUndefined(req.body.respectRobots);
      const aggressiveDiscovery = toBooleanOrUndefined(req.body.aggressiveDiscovery);
      const maxDepth = parseIntegerOrUndefined(req.body.maxDepth);
      const maxLinksPerPage = parseIntegerOrUndefined(req.body.maxLinksPerPage);
      
      // Use bot.scrapedWebsites[0] as fallback for startUrl
      const effectiveStartUrl = startUrl || (bot.scrapedWebsites && bot.scrapedWebsites.length > 0 ? bot.scrapedWebsites[0] : '');
      
      if (!effectiveStartUrl) {
        return res.status(400).json({
          success: false,
          error: 'startUrl is required (either in request body or bot.scrapedWebsites)'
        });
      }

      // Check if scheduler is already running
      if (bot.schedulerPid && bot.schedulerStatus === 'active') {
        // Verify the process is still actually running
        try {
          process.kill(bot.schedulerPid, 0); // Signal 0 = check if process exists
          return res.status(409).json({
            success: false,
            error: 'A scheduler is already running for this bot. Stop it first before starting a new one.',
            schedulerPid: bot.schedulerPid,
            schedulerConfig: bot.schedulerConfig
          });
        } catch (err) {
          // Process doesn't exist anymore, clean up stale data
          console.log(`🧹 Cleaning up stale scheduler PID ${bot.schedulerPid} for bot ${bot.name}`);
        }
      }

      console.log('🕐 Starting bot scheduler', {
        botId,
        botName: bot.name,
        intervalMinutes,
        startUrl: effectiveStartUrl,
        vectorStorePath
      });

      // Build command-line arguments for the scheduler script (reuse from scrapeController)
      const args = [
        schedulerScriptPath,
        '--start-url', effectiveStartUrl,
        '--resource-id', botId, // Use botId as resourceId
        '--vector-store-path', vectorStorePath,
        '--interval-minutes', String(intervalMinutes)
      ];

      if (bot.userId) {
        args.push('--user-id', bot.userId.toString());
      }
      if (domain) {
        args.push('--domain', domain);
      }
      if (collectionName) {
        args.push('--collection-name', collectionName);
      }
      if (embeddingModelName) {
        args.push('--embedding-model-name', embeddingModelName);
      }
      if (mongoUriOverride) {
        args.push('--mongo-uri', mongoUriOverride);
      }
      if (maxDepth !== undefined) {
        args.push('--max-depth', String(maxDepth));
      }
      if (maxLinksPerPage !== undefined) {
        args.push('--max-links-per-page', String(maxLinksPerPage));
      }
      if (sitemapUrl) {
        args.push('--sitemap-url', sitemapUrl);
      }
      if (respectRobots === true) {
        args.push('--respect-robots');
      } else if (respectRobots === false) {
        args.push('--no-respect-robots');
      }
      if (aggressiveDiscovery === true) {
        args.push('--aggressive-discovery');
      } else if (aggressiveDiscovery === false) {
        args.push('--no-aggressive-discovery');
      }
      if (runImmediately) {
        args.push('--run-immediately');
      }

      const pythonExecutable = getPythonExecutable();

      // Log the full command for debugging
      console.log('📜 Bot scheduler command:', pythonExecutable, args.join(' '));

      // Spawn options - fully detached with no stdio connection (reuse from scrapeController)
      const spawnOptions = {
        cwd: repoRoot,
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'], // Fully ignore all stdio - process runs independently
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1'
        }
      };

      // Hide console window on Windows
      if (process.platform === 'win32') {
        spawnOptions.windowsHide = true;
      }

      // Spawn the scheduler in detached mode (reuse spawn logic from scrapeController)
      const child = spawn(pythonExecutable, args, spawnOptions);

      // Handle spawn errors
      child.on('error', (err) => {
        console.error('❌ Bot scheduler spawn error:', err);
      });

      // Unref immediately so parent can exit independently
      child.unref();

      const schedulerPid = child.pid;

      if (!schedulerPid) {
        return res.status(500).json({
          success: false,
          error: 'Failed to start scheduler process'
        });
      }

      console.log(`✅ Scheduler spawned for bot ${bot.name} with PID ${schedulerPid}`);

      // Update bot document with scheduler info
      const schedulerConfig = {
        intervalMinutes,
        startUrl: effectiveStartUrl,
        lastStarted: new Date()
      };

      await Bot.findByIdAndUpdate(botId, {
        schedulerPid,
        schedulerStatus: 'active',
        schedulerConfig
      });

      console.log(`✅ Scheduler started for bot ${bot.name} with PID ${schedulerPid}`);

      res.json({
        success: true,
        message: 'Scheduler started successfully',
        schedulerPid,
        schedulerConfig,
        botId,
        botName: bot.name
      });

    } catch (err) {
      console.error('❌ Failed to start bot scheduler:', {
        botId: req.bot?._id,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });

      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message
      });
    }
  }
];

/**
 * POST /bot/:botId/scheduler/stop
 * Stop scheduler for this bot
 */
exports.stopBotScheduler = [
  resolveBotContext,
  async (req, res) => {
    try {
      const bot = req.bot;
      const botId = bot._id.toString();
      const vectorStorePath = bot.vectorStorePath;

      if (!bot.schedulerPid) {
        return res.status(400).json({
          success: false,
          error: 'No scheduler is currently running for this bot'
        });
      }

      const pid = bot.schedulerPid;

      console.log(`🛑 Stopping scheduler for bot ${bot.name} (PID: ${pid})`);

      // Verify PID exists before attempting to kill (PID-safe)
      let killed = false;
      let pidExists = false;
      
      try {
        // First check if PID exists using signal 0
        process.kill(pid, 0);
        pidExists = true;
      } catch (checkErr) {
        if (checkErr.code === 'ESRCH') {
          // Process doesn't exist - PID is stale
          console.log(`ℹ️ Process ${pid} does not exist (stale PID), cleaning up DB state`);
          pidExists = false;
          killed = true; // Mark as killed so we clean up properly
        } else {
          // Other error (e.g., permission denied)
          throw checkErr;
        }
      }
      
      // Only attempt to kill if PID exists
      if (pidExists) {
        try {
          // First try SIGTERM for graceful shutdown
          process.kill(pid, 'SIGTERM');
          killed = true;
          
          // Wait a moment, then force kill if still running
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            process.kill(pid, 0); // Check if still running
            // Still running, force kill
            console.log(`⚠️ Process ${pid} still running, sending SIGKILL...`);
            process.kill(pid, 'SIGKILL');
          } catch (checkErr) {
            // Process already terminated, good
          }
        } catch (killErr) {
          if (killErr.code === 'ESRCH') {
            // Process doesn't exist - that's fine, just clean up
            console.log(`ℹ️ Process ${pid} was not running (already stopped)`);
            killed = true;
          } else {
            throw killErr;
          }
        }
      }

      // Remove PID file
      const pidFilePath = path.join(vectorStorePath, 'scheduler.pid');
      try {
        if (fs.existsSync(pidFilePath)) {
          fs.unlinkSync(pidFilePath);
          console.log(`🗑️ Removed PID file: ${pidFilePath}`);
        }
      } catch (pidFileErr) {
        console.log(`⚠️ Could not remove PID file: ${pidFileErr.message}`);
      }

      // Update bot document
      const schedulerConfig = bot.schedulerConfig || {};
      schedulerConfig.lastStopped = new Date();

      await Bot.findByIdAndUpdate(botId, {
        schedulerPid: null,
        schedulerStatus: 'inactive',
        schedulerConfig
      });

      console.log(`✅ Scheduler stopped for bot ${bot.name}`);

      res.json({
        success: true,
        message: killed ? 'Scheduler stopped successfully' : 'Scheduler was not running',
        botId,
        botName: bot.name
      });

    } catch (err) {
      console.error('❌ Failed to stop bot scheduler:', {
        botId: req.bot?._id,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });

      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message
      });
    }
  }
];

/**
 * GET /bot/:botId/scheduler/status
 * Get scheduler status for this bot
 */
exports.getBotSchedulerStatus = [
  resolveBotContext,
  async (req, res) => {
    try {
      const bot = req.bot;
      const botId = bot._id.toString();

      // Simply trust the DB status (same pattern as scrapeController)
      const isActive = bot.schedulerPid && bot.schedulerStatus === 'active';

      res.json({
        success: true,
        botId,
        botName: bot.name,
        schedulerStatus: isActive ? 'active' : 'inactive',
        schedulerPid: isActive ? bot.schedulerPid : null,
        schedulerConfig: bot.schedulerConfig
      });

    } catch (err) {
      console.error('❌ Failed to get bot scheduler status:', {
        botId: req.bot?._id,
        error: err.message
      });

      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
];
