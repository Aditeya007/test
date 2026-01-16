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

/**
 * @route   POST /api/conversations/:id/request-agent
 * @desc    Request a human agent for a conversation
 * @access  Public (widget authentication via bot token)
 * @param   id - The conversation ID
 * @body    { botId: string }
 * @returns { success: boolean, conversation: Object }
 * 
 * Sets conversation status to 'queued' for agent pickup.
 * Triggered when user requests to talk to a human.
 */
router.post('/conversations/:id/request-agent', chatController.requestAgentByConversationId);

/**
 * @route   POST /api/chat/request-agent
 * @desc    Request a human agent for the current session
 * @access  Public (widget authentication via bot token)
 * @body    { sessionId: string, botId: string }
 * @returns { success: boolean, conversation: Object }
 * 
 * Sets conversation status to 'waiting' for agent pickup.
 * Triggered when user clicks "Talk to Human" button in widget.
 */
router.post('/chat/request-agent', chatController.requestAgent);

/**
 * @route   POST /api/chat/end-session
 * @desc    End a chat session when user closes widget
 * @access  Public (widget authentication via bot token)
 * @body    { sessionId: string, botId: string }
 * @returns { success: boolean, conversation: Object }
 * 
 * Sets conversation status to 'closed' when user leaves.
 */
router.post('/chat/end-session', chatController.endSession);

/**
 * @route   POST /api/chat/session/close
 * @desc    Close a chat session
 * @access  Public (widget API access)
 * @body    { session_id: string, resource_id: string }
 * @returns { success: boolean, message: string }
 * 
 * Triggered when user closes the widget.
 * NOTE: Lead email delivery has been removed. Leads are now viewed
 * only in the admin dashboard per website.
 */
router.post('/chat/session/close', chatController.closeSessionAndDeliverLead);

module.exports = router;
