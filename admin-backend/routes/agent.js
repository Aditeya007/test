// admin-backend/routes/agent.js

const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const auth = require('../middleware/auth');
const authenticateAgent = require('../middleware/authenticateAgent');

/**
 * Agent Routes - PHASE-1
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
 * PHASE-2:
 * - GET /api/agent/conversations - List conversations (agent inbox)
 * - Agent replies (coming soon)
 * - Status handoff (coming soon)
 */

// Public routes
router.post('/login', agentController.agentLogin);

// Agent-protected routes (agent actions)
router.post('/logout', authenticateAgent, agentController.agentLogout);
router.get('/conversations', authenticateAgent, agentController.getConversations);
router.get('/conversations/:conversationId/messages', authenticateAgent, agentController.getMessages);
router.post('/conversations/:id/accept', authenticateAgent, agentController.acceptConversation);
router.post('/conversations/:id/close', authenticateAgent, agentController.closeConversation);

// Tenant-protected routes (user creates/manages their agents)
router.post('/create', auth, agentController.createAgent);
router.get('/list', auth, agentController.listAgents);
router.patch('/:agentId', auth, agentController.updateAgent);
router.delete('/:agentId', auth, agentController.deleteAgent);

module.exports = router;
