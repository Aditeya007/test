const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authenticateBotToken = require('../middleware/authenticateBotToken');
const authenticateAgent = require('../middleware/authenticateAgent');
const resolveTenant = require('../middleware/resolveTenant');
const botController = require('../controllers/botController');
const botScrapeController = require('../controllers/botScrapeController');
const userController = require('../controllers/userController');
const { validateBotRun } = require('../middleware/validate');
const { botLimiter } = require('../middleware/rateLimiter');

// Middleware to accept either user auth or agent auth
const authOrAgent = (req, res, next) => {
  // Try user auth first
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      error: 'No authorization header provided',
      message: 'Please provide a valid authentication token'
    });
  }

  // Check token and decode to determine type
  const jwt = require('jsonwebtoken');
  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    // Check if it's an agent token or user token
    if (decoded.agentId) {
      // Agent token - use agent middleware
      return authenticateAgent(req, res, next);
    } else {
      // User token - use regular auth
      return auth(req, res, next);
    }
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Authentication failed'
    });
  }
};

/**
 * @route   POST /api/bot/run
 * @desc    Run the RAG bot with user's query
 * @access  Protected (requires bot API token)
 * @body    { botId: string, message: string }
 * @returns { answer: string } - The bot's response
 * @security Rate limited to prevent API abuse
 */
router.post('/run', authenticateBotToken, botLimiter, validateBotRun, botController.runBot);

/**
 * @route   GET /api/bot
 * @desc    Get all bots for the current user
 * @access  Protected (requires JWT, user role only)
 * @returns { bots: Array, count: number } - List of user's bots
 */
router.get('/', auth, botController.getBots);

/**
 * @route   POST /api/bot
 * @desc    Create a new bot for the current user
 * @access  Protected (requires JWT, user role only)
 * @body    { scrapedWebsites: string[], name?: string }
 * @returns { success: boolean, bot: Object } - The created bot
 */
router.post('/', auth, botController.createBot);

/**
 * @route   GET /api/bot/:botId/api-token
 * @desc    Get API token for a specific bot
 * @access  Protected (requires JWT)
 */
router.get('/:botId/api-token', auth, userController.getBotApiToken);

/**
 * @route   GET /api/bot/:botId
 * @desc    Get a specific bot by ID
 * @access  Protected (requires JWT or agent token)
 * @returns { bot: Object } - The bot details
 * @note    Must be placed AFTER more specific routes like /:botId/api-token
 */
router.get('/:botId', authOrAgent, botController.getBot);

/**
 * @route   PUT /api/bot/:botId
 * @desc    Update a bot's configuration (e.g., scrapedWebsites)
 * @access  Protected (requires JWT)
 * @body    { scrapedWebsites: string[] }
 */
router.put('/:botId', auth, botController.updateBot);

// ============================================================================
// BOT-SCOPED SCRAPER & SCHEDULER ROUTES
// ============================================================================
// These routes wrap existing scraper/scheduler logic with bot-specific context
// They delegate to botScrapeController which translates bot context → tenant context
// and then calls the existing scrapeController methods
// ============================================================================

/**
 * @route   POST /api/bot/:botId/scrape
 * @desc    Start a scrape job for this bot
 * @access  Protected (requires JWT, validates bot ownership)
 * @body    { startUrl?: string, sitemapUrl?: string, domain?: string, ... }
 * @note    If startUrl not provided, uses bot.scrapedWebsites[0]
 */
router.post('/:botId/scrape', auth, botScrapeController.startBotScrape);

/**
 * @route   GET /api/bot/:botId/scrape/status
 * @desc    Get current scrape status for this bot (lightweight polling endpoint)
 * @access  Protected (requires JWT, validates bot ownership)
 * @returns { success: boolean, status: 'running'|'completed'|'failed', lastScrapeAt: Date|null }
 */
router.get('/:botId/scrape/status', auth, botScrapeController.getBotScrapeStatus);

/**
 * @route   POST /api/bot/:botId/scrape/complete
 * @desc    Mark scrape as completed for this bot (called by Python scraper)
 * @access  Internal (requires service secret or JWT)
 * @returns { success: boolean, message: string }
 */
router.post('/:botId/scrape/complete', botScrapeController.markBotScrapeComplete);

/**
 * @route   POST /api/bot/:botId/scheduler/start
 * @desc    Start the periodic scheduler for this bot
 * @access  Protected (requires JWT, validates bot ownership)
 * @body    { startUrl?: string, sitemapUrl?: string, domain?: string, ... }
 * @note    If startUrl not provided, uses bot.scrapedWebsites[0]
 */
router.post('/:botId/scheduler/start', auth, botScrapeController.startBotScheduler);

/**
 * @route   POST /api/bot/:botId/scheduler/stop
 * @desc    Stop the periodic scheduler for this bot
 * @access  Protected (requires JWT, validates bot ownership)
 * @returns { success: boolean, message: string }
 */
router.post('/:botId/scheduler/stop', auth, botScrapeController.stopBotScheduler);

/**
 * @route   GET /api/bot/:botId/scheduler/status
 * @desc    Get scheduler status for this bot
 * @access  Protected (requires JWT, validates bot ownership)
 * @returns { success: boolean, schedulerStatus: 'active'|'inactive', schedulerPid: number, schedulerConfig: object }
 */
router.get('/:botId/scheduler/status', auth, botScrapeController.getBotSchedulerStatus);

/**
 * @route   GET /api/bot/:botId/scrape-history
 * @desc    Get scrape history for this bot
 * @access  Protected (requires JWT, validates bot ownership)
 * @returns { success: boolean, history: Array }
 */
router.get('/:botId/scrape-history', auth, botController.getScrapeHistory);

/**
 * @route   GET /api/bot/:botId/leads
 * @desc    Get all leads for this bot
 * @access  Protected (requires JWT, validates bot ownership)
 * @returns { success: boolean, leads: Array, count: number }
 */
router.get('/:botId/leads', auth, botController.getLeadsByBot);

/**
 * @route   POST /api/bot/:botId/manual-knowledge
 * @desc    Add manual knowledge to bot without crawling
 * @access  Protected (requires JWT, validates bot ownership)
 * @body    { content: string }
 * @returns { success: boolean, message: string }
 */
router.post('/:botId/manual-knowledge', auth, botController.addManualKnowledge);

module.exports = router;
