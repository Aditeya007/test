// admin-backend/routes/chat.js

const express = require('express');
const router = express.Router();
const authenticateBotToken = require('../middleware/authenticateBotToken');
const { botLimiter } = require('../middleware/rateLimiter');
const chatController = require('../controllers/chatController');

/**
 * @route   POST /api/conversation/start
 * @desc    Start or resume a conversation for a given botId and sessionId
 * @access  Public (widget authentication via bot token)
 * @body    { botId: string, sessionId: string }
 * @returns { success: boolean, conversation: Object }
 * 
 * If conversation exists, returns existing conversation.
 * Otherwise, creates a new conversation.
 */
router.post('/conversation/start', chatController.startConversation);

/**
 * @route   GET /api/conversation/:sessionId/messages
 * @desc    Get all messages for a conversation by sessionId
 * @access  Public (widget authentication via bot token)
 * @param   sessionId - The session ID
 * @query   botId - The bot ID (required)
 * @returns { success: boolean, messages: Array, conversationId: string }
 * 
 * Returns full message history for the conversation.
 * Messages are ordered chronologically (oldest first).
 */
router.get('/conversation/:sessionId/messages', chatController.getMessages);

/**
 * @route   POST /api/chat/message
 * @desc    Send a message in a conversation
 * @access  Public (widget authentication via bot token)
 * @body    { botId: string, sessionId: string, message: string }
 * @returns { success: boolean, reply: Object, conversation: Object }
 * @security Rate limited to prevent abuse
 * 
 * Behavior depends on conversation status:
 * - status === "ai": Forward to RAG bot, save and return bot response
 * - status === "human": Save message, return agent placeholder
 */
router.post('/chat/message', botLimiter, chatController.sendMessage);

/**
 * @route   PUT /api/conversation/:conversationId/status
 * @desc    Update conversation status (AI <-> Human handoff)
 * @access  Protected (requires bot token authentication)
 * @param   conversationId - The conversation ID
 * @body    { status: 'ai' | 'human' }
 * @returns { success: boolean, conversation: Object }
 * 
 * Used for live chat handoff between AI and human agents.
 */
router.put('/conversation/:conversationId/status', authenticateBotToken, chatController.updateConversationStatus);

module.exports = router;
