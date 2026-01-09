// admin-backend/routes/agent.js

const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const auth = require('../middleware/auth');
const authenticateAgent = require('../middleware/authenticateAgent');

/**
 * Agent Routes
 * 
 * Public routes:
 * - POST /api/agent/login - Agent login
 * 
 * Protected routes (require user/tenant auth):
 * - POST /api/agent/create - Create agent (tenant only)
 * - GET /api/agent/list - List agents (tenant only)
 * - PATCH /api/agent/:agentId - Update agent (tenant only)
 * - DELETE /api/agent/:agentId - Delete agent (tenant only)
 * 
 * Agent-protected routes (require agent auth):
 * - GET /api/agent/conversations - Get conversations
 * - POST /api/agent/conversation/:conversationId/reply - Reply to conversation
 * - PATCH /api/agent/conversation/:conversationId/status - Update conversation status
 */

// Public routes
router.post('/login', agentController.agentLogin);

// Tenant-protected routes (user creates/manages their agents)
router.post('/create', auth, agentController.createAgent);
router.get('/list', auth, agentController.listAgents);
router.patch('/:agentId', auth, agentController.updateAgent);
router.delete('/:agentId', auth, agentController.deleteAgent);

// Agent-protected routes (agent accesses conversations)
router.get('/conversations', authenticateAgent, agentController.getConversations);
router.post('/conversation/:conversationId/reply', authenticateAgent, agentController.replyToConversation);
router.patch('/conversation/:conversationId/status', authenticateAgent, agentController.updateConversationStatus);

module.exports = router;
