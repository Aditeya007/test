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

// Tenant-protected routes (user creates/manages their agents)
router.post('/create', auth, agentController.createAgent);
router.get('/list', auth, agentController.listAgents);
router.patch('/:agentId', auth, agentController.updateAgent);
router.delete('/:agentId', auth, agentController.deleteAgent);

// Agent-protected routes (agent views conversations)
router.get('/conversations', auth, agentController.getConversations);

module.exports = router;
