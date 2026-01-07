const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const widgetAuth = require('../middleware/widgetAuth');
const resolveTenant = require('../middleware/resolveTenant');
const botController = require('../controllers/botController');
const userController = require('../controllers/userController');
const { validateBotRun } = require('../middleware/validate');
const { botLimiter } = require('../middleware/rateLimiter');

/**
 * @route   POST /api/bot/run
 * @desc    Run the RAG bot with user's query
 * @access  Protected (requires JWT or API token for widgets)
 * @body    { input: string }
 * @returns { answer: string } - The bot's response
 * @security Rate limited to prevent API abuse
 */
router.post('/run', widgetAuth, resolveTenant, botLimiter, validateBotRun, botController.runBot);

/**
 * @route   GET /api/bot/:botId/api-token
 * @desc    Get API token for a specific bot
 * @access  Protected (requires JWT)
 */
router.get('/:botId/api-token', auth, userController.getBotApiToken);

module.exports = router;
