const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authenticateBotToken = require('../middleware/authenticateBotToken');
const resolveTenant = require('../middleware/resolveTenant');
const botController = require('../controllers/botController');
const botScrapeController = require('../controllers/botScrapeController');
const userController = require('../controllers/userController');
const { validateBotRun } = require('../middleware/validate');
const { botLimiter } = require('../middleware/rateLimiter');

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
 * @desc    Get current scrape status for this bot
 * @access  Protected (requires JWT, validates bot ownership)
 * @returns { success: boolean, status: 'running'|'completed', lastCompleted: Date, botReady: boolean }
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
 * @route   POST /api/bot/:botId/manual-knowledge
 * @desc    Add manual knowledge to bot without crawling
 * @access  Protected (requires JWT, validates bot ownership)
 * @body    { content: string }
 * @returns { success: boolean, message: string }
 */
router.post('/:botId/manual-knowledge', auth, botController.addManualKnowledge);

module.exports = router;
