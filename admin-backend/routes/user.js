// admin-backend/routes/user.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const userController = require('../controllers/userController');
const { validateProfileUpdate } = require('../middleware/validate');
const { userLimiter } = require('../middleware/rateLimiter');

/**
 * @route   GET /api/user/me
 * @desc    Get current user's profile
 * @access  Protected (requires JWT)
 */
router.get('/me', auth, userLimiter, userController.getMe);

/**
 * @route   PUT /api/user/me
 * @desc    Update current user's profile
 * @access  Protected (requires JWT)
 * @body    { name?, email?, username?, password? }
 */
router.put('/me', auth, userLimiter, validateProfileUpdate, userController.updateMe);

/**
 * @route   GET /api/user/api-token
 * @desc    Get or generate API token for widget authentication
 * @access  Protected (requires JWT)
 * @query   { regenerate?: boolean }
 */
router.get('/api-token', auth, userLimiter, userController.getApiToken);

/**
 * @route   GET /api/user/conversations
 * @desc    Get all conversations for the current user's tenant (read-only supervisor view)
 * @access  Protected (requires JWT)
 * @returns { success: boolean, conversations: Array }
 */
router.get('/conversations', auth, userLimiter, userController.getConversations);

/**
 * @route   GET /api/user/conversations/:conversationId/messages
 * @desc    Get all messages for a specific conversation (read-only supervisor view)
 * @access  Protected (requires JWT)
 * @param   conversationId - The conversation ID
 * @returns { success: boolean, messages: Array }
 */
router.get('/conversations/:conversationId/messages', auth, userLimiter, userController.getConversationMessages);

/**
 * @route   GET /api/user/agents/:agentId/conversations
 * @desc    Get all conversations for a specific agent (per-agent supervisor view)
 * @access  Protected (requires JWT)
 * @param   agentId - The agent ID
 * @returns { success: boolean, conversations: Array }
 */
router.get('/agents/:agentId/conversations', auth, userLimiter, userController.getAgentConversations);

module.exports = router;
