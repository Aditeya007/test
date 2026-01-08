// admin-backend/controllers/botController.js

const crypto = require('crypto');
const botJob = require('../jobs/botJob');
const { getUserTenantContext } = require('../services/userContextService');
const { provisionResourcesForBot } = require('../services/provisioningService');
const Bot = require('../models/Bot');
const User = require('../models/User');

/**
 * Run the RAG bot with user's query
 * @route   POST /api/bot/run (dashboard - JWT auth)
 *          POST /api/widget/run (widget - bot token auth)
 * @access  Protected (requires JWT or bot API token)
 * @param   {Object} req.body - { botId?: string, message: string, input?: string }
 * @returns {Object} { answer: string, session_id: string } - The bot's response from FastAPI
 */
exports.runBot = async (req, res) => {
  // Widget case: bot is authenticated via authenticateBotToken middleware
  // Dashboard case: need to resolve bot via botId from request body
  let bot = req.bot;
  const { botId, message, input, sessionId: clientSessionId } = req.body;
  const messageText = message || input;
  
  // If bot not already set (dashboard case), resolve it from botId
  if (!bot && botId) {
    try {
      bot = await Bot.findById(botId);
      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Bot not found',
          errorType: 'NOT_FOUND'
        });
      }
      // For dashboard, verify bot belongs to authenticated user
      if (req.user && bot.userId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this bot',
          errorType: 'FORBIDDEN'
        });
      }
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bot ID',
        errorType: 'BAD_REQUEST'
      });
    }
  }
  
  // Validate bot exists
  if (!bot) {
    return res.status(400).json({
      success: false,
      error: 'Bot not specified or not found',
      errorType: 'BAD_REQUEST',
      widgetError: true
    });
  }

  // Validate message
  if (!messageText || typeof messageText !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'message is required and must be a string',
      errorType: 'BAD_REQUEST',
      widgetError: true
    });
  }

  try {
    // Sanitize input
    const sanitizedInput = messageText.trim();
    
    // Log request
    if (process.env.NODE_ENV === 'development') {
      console.log(`🤖 Bot request: ${bot._id}`);
      console.log(`   Query: "${sanitizedInput}"`);
    } else {
      console.log(`🤖 Bot request: ${bot._id}`);
    }
    
    // Get userId from bot for tenant context
    const userId = bot.userId.toString();
    
    // Load tenant-specific resource metadata for shared infrastructure
    // CRITICAL: tenantContext is for shared infrastructure ONLY (databaseUri, botEndpoint, resourceId).
    // NEVER use tenantContext.vectorStorePath - each bot has its own vectorStorePath.
    const tenantContext = await getUserTenantContext(userId);

    if (!tenantContext.databaseUri) {
      const error = new Error('Tenant resources are not fully provisioned');
      error.statusCode = 503;
      throw error;
    }

    // CRITICAL: Use bot-specific vectorStorePath, not tenant-level path
    if (!bot.vectorStorePath) {
      return res.status(503).json({
        success: false,
        error: 'Bot vector store not initialized. Please scrape websites first.',
        errorType: 'SERVICE_UNAVAILABLE',
        widgetError: true
      });
    }

    console.log("🧠 Chat using vector store:", bot.vectorStorePath);

    // Call the bot job to interact with FastAPI backend for this tenant
    const normalizedSessionId =
      typeof clientSessionId === 'string' && clientSessionId.trim()
        ? clientSessionId.trim()
        : undefined;

    const botResult = await botJob.runBotForUser(
      {
        userId,
        username: `bot_${bot._id}`,
        botEndpoint: tenantContext.botEndpoint,
        resourceId: tenantContext.resourceId,
        vectorStorePath: bot.vectorStorePath, // ✅ Use bot-specific path
        databaseUri: tenantContext.databaseUri
      },
      sanitizedInput,
      { sessionId: normalizedSessionId }
    );
    
    // FastAPI returns answer, session identifier, and optional metadata
    console.log(`✅ Bot response received for bot: ${bot._id}`);
    
    // Return comprehensive response matching widget expectations
    res.json({
      success: true,
      answer: botResult.answer,
      session_id: botResult.session_id || `bot_${bot._id}_${Date.now()}`,
      resource_id: tenantContext.resourceId,
      timestamp: new Date().toISOString(),
      ...(botResult.sources && { sources: botResult.sources }), // Include sources if available
      ...(botResult.confidence && { confidence: botResult.confidence }), // Include confidence if available
      ...(botResult.metadata && { metadata: botResult.metadata })
    });
  } catch (err) {
    console.error(`❌ Bot error for bot ${bot._id}:`, {
      message: err.message,
      code: err.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    
    // Determine appropriate status code and user-friendly message based on error
    let statusCode = err.statusCode || 500;
    let errorMessage = err.statusCode ? err.message : 'Failed to process your request';
    let errorType = err.statusCode ? 'REQUEST_REJECTED' : 'INTERNAL_ERROR';
    
    if (err.message.includes('Cannot connect') || err.code === 'ECONNREFUSED') {
      statusCode = 503; // Service unavailable
      errorMessage = 'Bot service is currently unavailable. Please try again later.';
      errorType = 'SERVICE_UNAVAILABLE';
    } else if (err.message.includes('timeout') || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      statusCode = 504; // Gateway timeout
      errorMessage = 'Bot request timed out. Please try a shorter query or try again.';
      errorType = 'TIMEOUT';
    } else if (err.response && err.response.status === 400) {
      statusCode = 400; // Bad request
      errorMessage = 'Invalid request to bot service';
      errorType = 'BAD_REQUEST';
    } else if (err.response && err.response.status >= 500) {
      statusCode = 502; // Bad gateway
      errorMessage = 'Bot service error. Please try again later.';
      errorType = 'UPSTREAM_ERROR';
    }
    
    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      errorType,
      widgetError: true,
      timestamp: new Date().toISOString(),
      // Include technical details only in development
      ...(process.env.NODE_ENV === 'development' && { 
        details: err.message,
        code: err.code 
      })
    });
  }
};

/**
 * Update a bot's configuration (e.g., scrapedWebsites)
 * @route   PUT /api/bot/:botId
 * @access  Protected (requires JWT)
 * @param   {Object} req.body - { scrapedWebsites: string[] }
 * @returns {Object} { success: boolean, bot: Object } - The updated bot
 */
exports.updateBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const { scrapedWebsites } = req.body;
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    // Validate input
    if (!scrapedWebsites || !Array.isArray(scrapedWebsites)) {
      return res.status(400).json({
        success: false,
        error: 'scrapedWebsites must be an array'
      });
    }

    // Find the bot
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Authorization: Check if user owns this bot
    if (currentUserRole === 'user') {
      // Regular users can only update their own bots
      if (bot.userId.toString() !== currentUserId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: You can only update your own bots'
        });
      }
    } else if (currentUserRole === 'admin') {
      // Admins can only update bots for users they created
      const botOwner = await User.findById(bot.userId);
      if (!botOwner) {
        return res.status(404).json({
          success: false,
          error: 'Bot owner not found'
        });
      }
      if (botOwner.adminId && botOwner.adminId.toString() !== currentUserId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: You can only update bots for users you created'
        });
      }
    }

    // Update the bot
    bot.scrapedWebsites = scrapedWebsites;
    await bot.save();

    console.log(`✅ Bot ${botId} updated by ${currentUserRole} ${currentUserId}`);

    // Return the updated bot with id field
    const botObj = bot.toObject({ versionKey: false });
    res.json({
      success: true,
      bot: {
        ...botObj,
        id: botObj._id
      }
    });
  } catch (err) {
    console.error('❌ Error updating bot:', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update bot'
    });
  }
};

/**
 * Get all bots for the current user
 * @route   GET /api/bot
 * @access  Protected (requires JWT)
 * @returns {Object} { bots: Array, count: number } - List of user's bots
 */
exports.getBots = async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    // Only regular users can fetch their own bots via this endpoint
    if (currentUserRole !== 'user') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is for regular users only. Admins should use /api/users/:id/bots'
      });
    }

    // Find all bots for the current user
    const bots = await Bot.find({ userId: currentUserId }).sort({ createdAt: 1 });

    // Transform bots to include id field
    const botsWithId = bots.map(bot => {
      const botObj = bot.toObject({ versionKey: false });
      return {
        ...botObj,
        id: botObj._id
      };
    });

    res.json({ 
      bots: botsWithId, 
      count: botsWithId.length 
    });
  } catch (err) {
    console.error('❌ Error fetching bots:', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bots'
    });
  }
};

/**
 * Create a new bot for the current user
 * @route   POST /api/bot
 * @access  Protected (requires JWT)
 * @param   {Object} req.body - { scrapedWebsites: string[], name?: string }
 * @returns {Object} { success: boolean, bot: Object } - The created bot
 */
exports.createBot = async (req, res) => {
  try {
    const { scrapedWebsites, name } = req.body;
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    // Only regular users can create bots for themselves
    if (currentUserRole !== 'user') {
      return res.status(403).json({
        success: false,
        error: 'Only users can create bots. Admins must use the user management interface.'
      });
    }

    // Validate scrapedWebsites
    if (!scrapedWebsites || !Array.isArray(scrapedWebsites) || scrapedWebsites.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'scrapedWebsites must be a non-empty array'
      });
    }

    // Get current user from database to check maxBots limit (MUST be authoritative from DB)
    const user = await User.findById(currentUserId).select('maxBots username');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check how many bots the user already has
    const existingBotCount = await Bot.countDocuments({ userId: currentUserId });
    const maxBots = user.maxBots; // Authoritative from database, not from JWT

    // Allow bot creation ONLY if under the limit
    if (existingBotCount >= maxBots) {
      return res.status(403).json({
        success: false,
        error: `Bot limit reached. You can create up to ${maxBots} bot(s).`
      });
    }

    // Create the bot
    const botName = name || `Bot ${existingBotCount + 1}`;
    const bot = new Bot({
      userId: currentUserId,
      name: botName,
      apiToken: crypto.randomBytes(32).toString('hex'),
      vectorStorePath: '',
      scrapedWebsites: scrapedWebsites,
      isActive: true,
      // CRITICAL: Always initialize schedulerConfig as empty object to prevent
      // MongoDB errors when updating nested fields (e.g., schedulerConfig.botReady)
      schedulerConfig: {}
    });

    // Provision bot-specific resources
    try {
      const botResources = provisionResourcesForBot({
        botId: bot._id.toString(),
        userId: currentUserId,
        username: user.username,
        botName: botName,
        index: existingBotCount + 1
      });
      bot.vectorStorePath = botResources.vectorStorePath;
    } catch (botProvisionErr) {
      console.error('❌ Bot provisioning failed:', botProvisionErr);
      return res.status(500).json({
        success: false,
        error: 'Failed to provision bot resources'
      });
    }

    await bot.save();
    console.log(`✅ Bot created: ${botName} for user ${user.username}`);

    // Return the created bot with id field
    const botObj = bot.toObject({ versionKey: false });
    res.status(201).json({
      success: true,
      bot: {
        ...botObj,
        id: botObj._id
      }
    });
  } catch (err) {
    console.error('❌ Error creating bot:', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create bot'
    });
  }
};

