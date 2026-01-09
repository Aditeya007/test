// admin-backend/controllers/agentController.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const AgentSchema = require('../models/Agent');

/**
 * Agent Controller
 * Handles agent authentication and management
 * 
 * IMPORTANT: Agents exist ONLY in tenant databases, NOT in admin database
 */

/**
 * Get tenant database connection
 * Each tenant has their own database: rag_<username>_<id>
 */
const getTenantDB = (tenantId) => {
  const dbName = `rag_tenant_${tenantId}`;
  const connection = mongoose.connection.useDb(dbName);
  return connection;
};

/**
 * Get Agent model for a specific tenant
 */
const getAgentModel = (tenantId) => {
  const tenantDB = getTenantDB(tenantId);
  
  // Check if model already exists for this connection
  if (tenantDB.models.Agent) {
    return tenantDB.models.Agent;
  }
  
  // Create model for this tenant's database
  return tenantDB.model('Agent', AgentSchema);
};

/**
 * POST /api/agent/login
 * Agent login endpoint - validates credentials and returns JWT
 * 
 * Body: { username, password, tenantId }
 */
const agentLogin = async (req, res) => {
  try {
    const { username, password, tenantId } = req.body;

    // Validation
    if (!username || !password || !tenantId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Username, password, and tenantId are required'
      });
    }

    // Verify tenant exists
    const tenant = await User.findById(tenantId);
    if (!tenant || tenant.role !== 'user') {
      return res.status(404).json({
        error: 'Tenant not found',
        message: 'Invalid tenant identifier'
      });
    }

    // Get agent from tenant database
    const Agent = getAgentModel(tenantId);
    const agent = await Agent.findOne({ username });

    if (!agent) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect'
      });
    }

    // Check if agent is active
    if (!agent.isActive) {
      return res.status(403).json({
        error: 'Account disabled',
        message: 'Your agent account has been deactivated'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, agent.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect'
      });
    }

    // Generate JWT token with agent role
    const token = jwt.sign(
      {
        role: 'agent',
        agentId: agent._id.toString(),
        tenantId: tenantId,
        username: agent.username
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      agent: agent.toPublicProfile()
    });
  } catch (error) {
    console.error('Agent login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
};

/**
 * POST /api/agent/create
 * Create a new agent for a tenant
 * Requires user authentication (tenant creates their own agents)
 * 
 * Body: { username, password, name, email, phone }
 */
const createAgent = async (req, res) => {
  try {
    const { username, password, name, email, phone } = req.body;
    const tenantId = req.user.id; // From auth middleware

    // Validation
    if (!username || !password || !name || !email) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Username, password, name, and email are required'
      });
    }

    // Get tenant (user) info to check maxAgents limit
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: 'Invalid tenant'
      });
    }

    // Get agent count from tenant database
    const Agent = getAgentModel(tenantId);
    const agentCount = await Agent.countDocuments();

    // Check if limit reached
    if (agentCount >= tenant.maxAgents) {
      return res.status(403).json({
        error: 'Agent limit reached',
        message: `You have reached the maximum number of agents (${tenant.maxAgents}). Please contact support to increase your limit.`,
        currentCount: agentCount,
        maxAgents: tenant.maxAgents
      });
    }

    // Check if username already exists in this tenant's database
    const existingAgent = await Agent.findOne({ username });
    if (existingAgent) {
      return res.status(409).json({
        error: 'Username taken',
        message: 'An agent with this username already exists'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create agent
    const agent = new Agent({
      username,
      passwordHash,
      name,
      email,
      phone: phone || null,
      isActive: true
    });

    await agent.save();

    res.status(201).json({
      message: 'Agent created successfully',
      agent: agent.toPublicProfile()
    });
  } catch (error) {
    console.error('Create agent error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to create agent',
      message: 'An error occurred while creating the agent'
    });
  }
};

/**
 * GET /api/agent/list
 * List all agents for the authenticated tenant
 */
const listAgents = async (req, res) => {
  try {
    const tenantId = req.user.id; // From auth middleware

    // Get agents from tenant database
    const Agent = getAgentModel(tenantId);
    const agents = await Agent.find().sort({ createdAt: -1 });

    // Get tenant info for maxAgents
    const tenant = await User.findById(tenantId);

    res.json({
      agents: agents.map(agent => agent.toPublicProfile()),
      count: agents.length,
      maxAgents: tenant.maxAgents
    });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({
      error: 'Failed to retrieve agents',
      message: 'An error occurred while fetching agents'
    });
  }
};

/**
 * PATCH /api/agent/:agentId
 * Update an agent (name, email, phone, isActive)
 * Requires user authentication
 */
const updateAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { name, email, phone, isActive } = req.body;
    const tenantId = req.user.id;

    // Get agent from tenant database
    const Agent = getAgentModel(tenantId);
    const agent = await Agent.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found',
        message: 'Agent does not exist'
      });
    }

    // Update allowed fields
    if (name !== undefined) agent.name = name;
    if (email !== undefined) agent.email = email;
    if (phone !== undefined) agent.phone = phone;
    if (isActive !== undefined) agent.isActive = isActive;

    await agent.save();

    res.json({
      message: 'Agent updated successfully',
      agent: agent.toPublicProfile()
    });
  } catch (error) {
    console.error('Update agent error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to update agent',
      message: 'An error occurred while updating the agent'
    });
  }
};

/**
 * DELETE /api/agent/:agentId
 * Delete an agent from the tenant database
 * Requires user authentication
 */
const deleteAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    const tenantId = req.user.id;

    // Get agent from tenant database
    const Agent = getAgentModel(tenantId);
    const agent = await Agent.findByIdAndDelete(agentId);

    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found',
        message: 'Agent does not exist'
      });
    }

    res.json({
      message: 'Agent deleted successfully',
      agent: agent.toPublicProfile()
    });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({
      error: 'Failed to delete agent',
      message: 'An error occurred while deleting the agent'
    });
  }
};

/**
 * GET /api/agent/conversations
 * Get all conversations for the agent's tenant
 * Requires agent authentication
 */
const getConversations = async (req, res) => {
  try {
    const { tenantId } = req.agent; // From authenticateAgent middleware

    // Get tenant's conversation model
    const tenantDB = getTenantDB(tenantId);
    const Conversation = tenantDB.model('Conversation', require('../models/Conversation').schema);

    const conversations = await Conversation.find()
      .sort({ updatedAt: -1 })
      .limit(100);

    res.json({
      conversations
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversations',
      message: 'An error occurred while fetching conversations'
    });
  }
};

/**
 * POST /api/agent/conversation/:conversationId/reply
 * Agent replies to a conversation
 * Requires agent authentication
 */
const replyToConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message } = req.body;
    const { tenantId, username } = req.agent;

    if (!message) {
      return res.status(400).json({
        error: 'Missing message',
        message: 'Message is required'
      });
    }

    // Get tenant's models
    const tenantDB = getTenantDB(tenantId);
    const Conversation = tenantDB.model('Conversation', require('../models/Conversation').schema);
    const Message = tenantDB.model('Message', require('../models/Message').schema);

    // Find conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
        message: 'Conversation does not exist'
      });
    }

    // Create agent message
    const newMessage = new Message({
      conversationId: conversation._id,
      role: 'agent',
      content: message,
      agentUsername: username,
      timestamp: new Date()
    });

    await newMessage.save();

    // Update conversation
    conversation.updatedAt = new Date();
    await conversation.save();

    res.json({
      message: 'Reply sent successfully',
      messageData: newMessage
    });
  } catch (error) {
    console.error('Reply to conversation error:', error);
    res.status(500).json({
      error: 'Failed to send reply',
      message: 'An error occurred while sending the reply'
    });
  }
};

/**
 * PATCH /api/agent/conversation/:conversationId/status
 * Change conversation status (ai <-> human)
 * Requires agent authentication
 */
const updateConversationStatus = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { status } = req.body;
    const { tenantId } = req.agent;

    if (!status || !['ai', 'human'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: 'Status must be "ai" or "human"'
      });
    }

    // Get tenant's conversation model
    const tenantDB = getTenantDB(tenantId);
    const Conversation = tenantDB.model('Conversation', require('../models/Conversation').schema);

    // Update conversation
    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
        message: 'Conversation does not exist'
      });
    }

    res.json({
      message: 'Conversation status updated',
      conversation
    });
  } catch (error) {
    console.error('Update conversation status error:', error);
    res.status(500).json({
      error: 'Failed to update status',
      message: 'An error occurred while updating the conversation status'
    });
  }
};

module.exports = {
  agentLogin,
  createAgent,
  listAgents,
  updateAgent,
  deleteAgent,
  getConversations,
  replyToConversation,
  updateConversationStatus
};
