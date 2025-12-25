const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
const fs = require('fs'); // Added missing fs import for stopScheduler
const { spawn } = require('child_process');
const { runTenantScrape, runTenantUpdater } = require('../jobs/scrapeJob');
const { getUserTenantContext } = require('../services/userContextService');
const User = require('../models/User');

// Path to scheduler script
const repoRoot = path.resolve(__dirname, '..', '..');
const schedulerScriptPath = path.resolve(repoRoot, 'UPDATER', 'run_tenant_scheduler.py');

/**
 * Get the Python executable path (reuse logic from pythonJob.js)
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
  return `${prefix}_${resourceId || 'tenant'}_${random}`;
};

/**
 * Wait for bot to come back online after restart
 * * @param {Object} tenantContext - Tenant context with botEndpoint
 * @param {number} maxWaitMs - Maximum time to wait (default 30 seconds)
 * @returns {Promise<Object>} Result with success status
 */
const waitForBotRestart = async (tenantContext, maxWaitMs = 30000) => {
  // Use base bot URL, not the tenant-specific endpoint
  const botBaseUrl = process.env.FASTAPI_BOT_URL || 'http://localhost:8000';
  const startTime = Date.now();
  const pollInterval = 2000; // Check every 2 seconds
  
  console.log(`⏳ Waiting for bot to restart and come back online...`);
  
  // Wait a moment for the restart to actually begin
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await axios.get(`${botBaseUrl}/health`, { timeout: 2000 });
      if (response.status === 200) {
        console.log(`✅ Bot is back online! Ready to serve new data.`);
        return { success: true, message: 'Bot restarted successfully' };
      }
    } catch (err) {
      // Bot still restarting, continue waiting
      console.log(`   Bot not ready yet, waiting...`);
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  console.warn(`⚠️  Bot did not come back online within ${maxWaitMs/1000} seconds`);
  return { success: false, error: 'Bot restart timeout' };
};

const truncateLog = (value) => {
  if (!value) {
    return value;
  }
  const maxLength = 8_192;
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n... [truncated ${value.length - maxLength} chars]`;
};

const ensureTenantResources = (tenantContext) => {
  if (!tenantContext.vectorStorePath || !tenantContext.resourceId) {
    const error = new Error('Tenant resources are incomplete. Re-provision before running scrape.');
    error.statusCode = 503;
    throw error;
  }
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

exports.startScrape = async (req, res) => {
  const startUrl = typeof req.body.startUrl === 'string' ? req.body.startUrl.trim() : '';
  const sitemapUrl = typeof req.body.sitemapUrl === 'string' ? req.body.sitemapUrl.trim() : undefined;
  const embeddingModelName = typeof req.body.embeddingModelName === 'string' ? req.body.embeddingModelName.trim() : undefined;
  const collectionName = typeof req.body.collectionName === 'string' ? req.body.collectionName.trim() : undefined;
  const domain = typeof req.body.domain === 'string' ? req.body.domain.trim() : undefined;
  const respectRobots = toBooleanOrUndefined(req.body.respectRobots);
  const aggressiveDiscovery = toBooleanOrUndefined(req.body.aggressiveDiscovery);
  const maxDepth = parseIntegerOrUndefined(req.body.maxDepth);
  const maxLinksPerPage = parseIntegerOrUndefined(req.body.maxLinksPerPage);

  try {
    const userId = req.tenantUserId || req.user.userId;
    const userRole = req.user.role;

    // Regular users can only scrape their own data
    if (userRole === 'user' && req.tenantUserId && req.tenantUserId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You can only scrape your own data'
      });
    }
    
    const tenantContext = await getUserTenantContext(userId);
    ensureTenantResources(tenantContext);

    // Validate required fields
    if (!startUrl) {
      return res.status(400).json({
        success: false,
        error: 'startUrl is required'
      });
    }

    const jobId = buildJobId('scrape', tenantContext.resourceId);
    
    console.log('🚀 Starting tenant scrape (detached background process)', {
      jobId,
      tenantUserId: tenantContext.userId,
      resourceId: tenantContext.resourceId,
      databaseUri: tenantContext.databaseUri,
      vectorStorePath: tenantContext.vectorStorePath,
      startUrl
    });

    // Get Python executable
    const pythonExe = getPythonExecutable();
    
    
    // Build arguments for the scraper
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
    
    pushArg('--start-url', startUrl);
    pushArg('--domain', domain);
    pushArg('--resource-id', tenantContext.resourceId);
    pushArg('--user-id', tenantContext.userId);
    pushArg('--vector-store-path', tenantContext.vectorStorePath);
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

    // Spawn as detached background process
    const child = spawn(pythonExe, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'], // Don't pipe stdio (fully detached)
      cwd: repoRoot,
      env: {
        ...process.env, // Inherit all environment variables (RAG_DATA_ROOT, etc.)
        PYTHONUNBUFFERED: '1'
      }
    });
    
    // Unref so parent can exit without waiting
    child.unref();
    
    console.log('✅ Scraper spawned successfully', {
      jobId,
      pid: child.pid,
      resourceId: tenantContext.resourceId,
      vectorStorePath: tenantContext.vectorStorePath,
      pythonExe,
      mode: 'python -m Scraping2.run_tenant_spider'
    });

    // Immediately return 202 Accepted
    return res.status(202).json({
      success: true,
      message: 'Scrape job started in background',
      jobId,
      pid: child.pid,
      resourceId: tenantContext.resourceId,
      vectorStorePath: tenantContext.vectorStorePath,
      status: 'running'
    });
    
  } catch (err) {
    console.error('❌ Failed to start scrape job:', {
      userId: req.tenantUserId || req.user.userId,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code,
      summary: err.summary || null
    });
  }
};

exports.runUpdater = async (req, res) => {
  const startUrl = typeof req.body.startUrl === 'string' ? req.body.startUrl.trim() : '';
  const sitemapUrl = typeof req.body.sitemapUrl === 'string' ? req.body.sitemapUrl.trim() : undefined;
  const embeddingModelName = typeof req.body.embeddingModelName === 'string' ? req.body.embeddingModelName.trim() : undefined;
  const collectionName = typeof req.body.collectionName === 'string' ? req.body.collectionName.trim() : undefined;
  const domain = typeof req.body.domain === 'string' ? req.body.domain.trim() : undefined;
  const mongoUriOverride = typeof req.body.mongoUri === 'string' ? req.body.mongoUri.trim() : undefined;
  const respectRobots = toBooleanOrUndefined(req.body.respectRobots);
  const aggressiveDiscovery = toBooleanOrUndefined(req.body.aggressiveDiscovery);
  const maxDepth = parseIntegerOrUndefined(req.body.maxDepth);
  const maxLinksPerPage = parseIntegerOrUndefined(req.body.maxLinksPerPage);

  try {
    const userId = req.tenantUserId || req.user.userId;
    const userRole = req.user.role;

    // Regular users can only update their own data
    if (userRole === 'user' && req.tenantUserId && req.tenantUserId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You can only update your own data'
      });
    }
    
    const tenantContext = await getUserTenantContext(userId);
    ensureTenantResources(tenantContext);

    // Validate required fields
    if (!startUrl) {
      return res.status(400).json({
        success: false,
        error: 'startUrl is required'
      });
    }

    const effectiveMongoUri = mongoUriOverride || tenantContext.databaseUri;
    const jobId = buildJobId('update', tenantContext.resourceId);

    console.log('🚀 Starting tenant updater (detached background process)', {
      jobId,
      tenantUserId: tenantContext.userId,
      resourceId: tenantContext.resourceId,
      databaseUri: effectiveMongoUri,
      vectorStorePath: tenantContext.vectorStorePath,
      startUrl
    });

    // Get Python executable
    const pythonExe = getPythonExecutable();
    const updaterScript = path.resolve(repoRoot, 'UPDATER', 'run_tenant_updater.py');
    
    // Build arguments for the updater
    const args = [updaterScript];
    const pushArg = (flag, value) => {
      if (value !== undefined && value !== null) {
        if (typeof value === 'boolean') {
          if (value) args.push(flag);
        } else {
          args.push(flag, String(value));
        }
      }
    };
    
    pushArg('--start-url', startUrl);
    pushArg('--domain', domain);
    pushArg('--resource-id', tenantContext.resourceId);
    pushArg('--user-id', tenantContext.userId);
    pushArg('--vector-store-path', tenantContext.vectorStorePath);
    pushArg('--mongo-uri', effectiveMongoUri);
    pushArg('--collection-name', collectionName);
    pushArg('--embedding-model-name', embeddingModelName);
    pushArg('--max-depth', maxDepth);
    pushArg('--max-links-per-page', maxLinksPerPage);
    pushArg('--sitemap-url', sitemapUrl);
    pushArg('--job-id', jobId);
    pushArg('--log-level', process.env.UPDATER_LOG_LEVEL || 'INFO');
    
    if (respectRobots === true) args.push('--respect-robots');
    else if (respectRobots === false) args.push('--no-respect-robots');
    
    if (aggressiveDiscovery === true) args.push('--aggressive-discovery');
    else if (aggressiveDiscovery === false) args.push('--no-aggressive-discovery');

    // Spawn as detached background process
    const child = spawn(pythonExe, args, {
  detached: true,
  stdio: ['ignore', 'ignore', 'pipe'],
  cwd: repoRoot,
  env: {
    ...process.env,
    PYTHONPATH: repoRoot,
    PYTHONUNBUFFERED: '1'
  }
});

    
    // Unref so parent can exit without waiting
    child.unref();
    
    console.log('✅ Updater spawned successfully', {
      jobId,
      pid: child.pid,
      resourceId: tenantContext.resourceId,
      vectorStorePath: tenantContext.vectorStorePath,
      mongoUri: effectiveMongoUri,
      pythonExe,
      script: updaterScript
    });

    // Immediately return 202 Accepted
    return res.status(202).json({
      success: true,
      message: 'Update job started in background',
      jobId,
      pid: child.pid,
      resourceId: tenantContext.resourceId,
      vectorStorePath: tenantContext.vectorStorePath,
      status: 'running'
    });
    
  } catch (err) {
    console.error('❌ Failed to start updater job:', {
      userId: req.tenantUserId || req.user.userId,
      error: err.message,
      code: err.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code,
      summary: err.summary || null
    });
  }
};

/**
 * Start a persistent scheduler for the tenant
 * * Spawns a detached Python process that runs run_tenant_scheduler.py
 * which will execute the updater on the configured schedule.
 */
exports.startScheduler = async (req, res) => {
  const startUrl = typeof req.body.startUrl === 'string' ? req.body.startUrl.trim() : '';
  const intervalMinutes = 120; // Fixed 2-hour interval
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

  try {
    const userId = req.tenantUserId || req.user.userId;
    const userRole = req.user.role;

    console.log(`🚀 startScheduler called - userId: ${userId}, tenantUserId: ${req.tenantUserId}, user.userId: ${req.user.userId}`);

    // Regular users can only start scheduler for their own data
    if (userRole === 'user' && req.tenantUserId && req.tenantUserId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You can only manage your own scheduler'
      });
    }

    const tenantContext = await getUserTenantContext(userId);
    ensureTenantResources(tenantContext);

    // Fetch the user document to check existing scheduler
    const userDoc = await User.findById(userId);
    if (!userDoc) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if scheduler is already running
    if (userDoc.schedulerPid && userDoc.schedulerStatus === 'active') {
      // Verify the process is still actually running
      try {
        process.kill(userDoc.schedulerPid, 0); // Signal 0 = check if process exists
        return res.status(409).json({
          success: false,
          error: 'A scheduler is already running for this tenant. Stop it first before starting a new one.',
          schedulerPid: userDoc.schedulerPid,
          schedulerConfig: userDoc.schedulerConfig
        });
      } catch (err) {
        // Process doesn't exist anymore, clean up stale data
        console.log(`🧹 Cleaning up stale scheduler PID ${userDoc.schedulerPid} for ${tenantContext.resourceId}`);
      }
    }

    const effectiveMongoUri = mongoUriOverride || tenantContext.databaseUri;

    console.log('🕐 Starting persistent scheduler', {
      tenantUserId: tenantContext.userId,
      resourceId: tenantContext.resourceId,
      intervalMinutes,
      startUrl, // Log the start URL
      vectorStorePath: tenantContext.vectorStorePath
    });

    // Validate start URL is provided
    if (!startUrl) {
      return res.status(400).json({
        success: false,
        error: 'Start URL is required to start the scheduler'
      });
    }

    // Build command-line arguments for the scheduler script
    const args = [
      schedulerScriptPath,
      '--start-url', startUrl,
      '--resource-id', tenantContext.resourceId,
      '--vector-store-path', tenantContext.vectorStorePath,
      '--interval-minutes', String(intervalMinutes)
    ];

    if (tenantContext.userId) {
      args.push('--user-id', tenantContext.userId);
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
    if (effectiveMongoUri) {
      args.push('--mongo-uri', effectiveMongoUri);
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
    console.log('📜 Scheduler command:', pythonExecutable, args.join(' '));

    // Spawn options - fully detached with no stdio connection
    // This ensures the process runs completely independently
    const spawnOptions = {
      cwd: repoRoot,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'], // Fully ignore all stdio - process runs independently
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      }
    };

    // Hide console window on Windows
    if (process.platform === 'win32') {
      spawnOptions.windowsHide = true;
    }

    // Spawn the scheduler in detached mode
    const child = spawn(pythonExecutable, args, spawnOptions);

    // Handle spawn errors
    child.on('error', (err) => {
      console.error('❌ Scheduler spawn error:', err);
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

    console.log(`✅ Scheduler spawned for ${tenantContext.resourceId} with PID ${schedulerPid}`);

    // Update user document with scheduler info
    const schedulerConfig = {
      intervalMinutes,
      startUrl,
      lastStarted: new Date()
    };

    await User.findByIdAndUpdate(userId, {
      schedulerPid,
      schedulerStatus: 'active',
      schedulerConfig
    });

    console.log(`✅ Scheduler started for ${tenantContext.resourceId} with PID ${schedulerPid}`);

    res.json({
      success: true,
      message: 'Scheduler started successfully',
      schedulerPid,
      schedulerConfig,
      resourceId: tenantContext.resourceId
    });

  } catch (err) {
    console.error('❌ Failed to start scheduler:', {
      userId: req.tenantUserId || req.user.userId,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message
    });
  }
};

/**
 * Stop a running scheduler for the tenant
 */
exports.stopScheduler = async (req, res) => {
  try {
    const userId = req.tenantUserId || req.user.userId;
    const userRole = req.user.role;

    // Regular users can only stop their own scheduler
    if (userRole === 'user' && req.tenantUserId && req.tenantUserId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You can only manage your own scheduler'
      });
    }

    const tenantContext = await getUserTenantContext(userId);

    // Fetch the user document
    const userDoc = await User.findById(userId);
    if (!userDoc) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!userDoc.schedulerPid) {
      return res.status(400).json({
        success: false,
        error: 'No scheduler is currently running for this tenant'
      });
    }

    const pid = userDoc.schedulerPid;

    console.log(`🛑 Stopping scheduler for ${tenantContext.resourceId} (PID: ${pid})`);

    // Try to kill the process
    let killed = false;
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

    // Remove PID file
    const pidFilePath = path.join(tenantContext.vectorStorePath, 'scheduler.pid');
    try {
      if (fs.existsSync(pidFilePath)) {
        fs.unlinkSync(pidFilePath);
        console.log(`🗑️ Removed PID file: ${pidFilePath}`);
      }
    } catch (pidFileErr) {
      console.log(`⚠️ Could not remove PID file: ${pidFileErr.message}`);
    }

    // Update user document
    const schedulerConfig = userDoc.schedulerConfig || {};
    schedulerConfig.lastStopped = new Date();

    await User.findByIdAndUpdate(userId, {
      schedulerPid: null,
      schedulerStatus: 'inactive',
      schedulerConfig
    });

    console.log(`✅ Scheduler stopped for ${tenantContext.resourceId}`);

    res.json({
      success: true,
      message: killed ? 'Scheduler stopped successfully' : 'Scheduler was not running',
      resourceId: tenantContext.resourceId
    });

  } catch (err) {
    console.error('❌ Failed to stop scheduler:', {
      userId: req.tenantUserId || req.user.userId,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message
    });
  }
};

/**
 * Get scheduler status for the tenant
 */
exports.getSchedulerStatus = async (req, res) => {
  try {
    const userId = req.tenantUserId || req.user.userId;
    const userRole = req.user.role;

    console.log(`📊 getSchedulerStatus called - userId: ${userId}, tenantUserId: ${req.tenantUserId}, user.userId: ${req.user.userId}`);

    // Regular users can only check their own scheduler
    if (userRole === 'user' && req.tenantUserId && req.tenantUserId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You can only view your own scheduler status'
      });
    }

    const tenantContext = await getUserTenantContext(userId);

    const userDoc = await User.findById(userId);
    if (!userDoc) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log(`📊 User doc found - schedulerPid: ${userDoc.schedulerPid}, schedulerStatus: ${userDoc.schedulerStatus}`);

    // Simply trust the DB status - the scheduler process manages its own state
    // The PID file is just for additional verification, not the source of truth
    const isActive = userDoc.schedulerPid && userDoc.schedulerStatus === 'active';

    res.json({
      success: true,
      resourceId: tenantContext.resourceId,
      schedulerStatus: isActive ? 'active' : 'inactive',
      schedulerPid: isActive ? userDoc.schedulerPid : null,
      schedulerConfig: userDoc.schedulerConfig
    });

  } catch (err) {
    console.error('❌ Failed to get scheduler status:', {
      userId: req.tenantUserId || req.user.userId,
      error: err.message
    });

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

/**
 * Internal endpoint for scheduler to notify when a scrape completes.
 * Uses service secret for authentication (not user JWT).
 */
exports.notifyScrapeComplete = async (req, res) => {
  try {
    const serviceSecret = req.headers['x-service-secret'];
    const expectedSecret = process.env.SERVICE_SECRET || 'default_service_secret';
    
    if (serviceSecret !== expectedSecret) {
      return res.status(401).json({
        success: false,
        error: 'Invalid service secret'
      });
    }

    const { resourceId, success, message, documentCount } = req.body;

    if (!resourceId) {
      return res.status(400).json({
        success: false,
        error: 'resourceId is required'
      });
    }

    console.log(`📬 Scrape complete notification for ${resourceId}`);
    console.log(`   Success: ${success}, Documents: ${documentCount || 'unknown'}`);

    // Find user by resourceId
    const userDoc = await User.findOne({ resourceId });
    if (!userDoc) {
      return res.status(404).json({
        success: false,
        error: `User with resourceId ${resourceId} not found`
      });
    }

    // Update scheduler config with completion info
    const schedulerConfig = userDoc.schedulerConfig || {};
    schedulerConfig.lastScrapeCompleted = new Date();
    schedulerConfig.botReady = success === true;

    await User.findByIdAndUpdate(userDoc._id, {
      schedulerConfig
    });

    console.log(`✅ Updated scheduler config for ${resourceId}: botReady = ${success}`);

    res.json({
      success: true,
      message: 'Scrape completion recorded',
      resourceId,
      botReady: success === true
    });

  } catch (err) {
    console.error('❌ Failed to process scrape completion:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};