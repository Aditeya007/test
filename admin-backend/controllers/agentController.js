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
 * IMPORTANT: 
 * - User models are in the ADMIN database (default mongoose connection)
 * - Agent models are in TENANT databases (separate connections)
 */

// Cache for tenant database connections
const tenantConnections = new Map();

/**
 * Get or create a connection to the tenant's database
 * Uses separate connection to avoid interfering with admin DB
 */
const getTenantConnection = async (databaseUri) => {
  if (!databaseUri) {
    throw new Error('databaseUri is required for tenant database connection');
  }

  // Return cached connection if exists
  if (tenantConnections.has(databaseUri)) {
    return tenantConnections.get(databaseUri);
  }

  // Create new connection and await it
  const conn = await mongoose.createConnection(databaseUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  }).asPromise();

  tenantConnections.set(databaseUri, conn);
  return conn;
};

/**
 * Get Agent model for a specific tenant database
 */
const getAgentModel = async (databaseUri) => {
  const tenantDB = await getTenantConnection(databaseUri);
  
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
 * Searches across all tenants to find agent by username
 * 
 * Body: { username, password }
 */
const agentLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Username and password are required'
      });
    }

    // Search for agent across all tenants with agents enabled
    const tenants = await User.find({ maxAgents: { $gt: 0 }, role: 'user' });
    
    let foundAgent = null;
    let foundTenant = null;

    // Search each tenant's database for the agent
    for (const tenant of tenants) {
      if (!tenant.databaseUri) continue;

      try {
        const Agent = await getAgentModel(tenant.databaseUri);
        const agent = await Agent.findOne({ username });

        if (agent) {
          foundAgent = agent;
          foundTenant = tenant;
          break;
        }
      } catch (err) {
        console.error(`Error checking tenant ${tenant._id}:`, err.message);
        continue;
      }
    }

    if (!foundAgent) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect'
      });
    }

    // Check if agent is active
    if (!foundAgent.isActive) {
      return res.status(403).json({
        error: 'Account disabled',
        message: 'Your agent account has been deactivated'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, foundAgent.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect'
      });
    }

    // Generate JWT token as the owning user (impersonate tenant)
    const token = jwt.sign(
      {
        userId: foundTenant._id.toString(),
        username: foundTenant.username,
        role: 'user'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Include tenant data in response
    const tenantData = foundTenant.toObject();
    delete tenantData.password;

    res.json({
      message: 'Login successful',
      token,
      agent: foundAgent.toPublicProfile(),
      tenant: {
        ...tenantData,
        id: tenantData._id
      }
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

    // Get tenant (user) info from ADMIN database to check maxAgents limit
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: 'Invalid tenant'
      });
    }

    // Get agent count from TENANT database
    const Agent = await getAgentModel(tenant.databaseUri);
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

    console.log(`✅ Agent created successfully:`, {
      agentId: agent._id,
      username: agent.username,
      name: agent.name,
      tenantId: tenantId,
      tenantUsername: tenant.username,
      database: tenant.databaseUri,
      collection: 'agents'
    });

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

    // Get tenant info from ADMIN database
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: 'Invalid tenant'
      });
    }

    // Get agents from TENANT database
    const Agent = await getAgentModel(tenant.databaseUri);
    const agents = await Agent.find().sort({ createdAt: -1 });

    console.log(`📋 Retrieved agents for tenant ${tenant.username}:`, {
      tenantId: tenantId,
      database: tenant.databaseUri,
      agentCount: agents.length,
      maxAgents: tenant.maxAgents
    });

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

    // Get tenant info from ADMIN database
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: 'Invalid tenant'
      });
    }

    // Get agent from TENANT database
    const Agent = await getAgentModel(tenant.databaseUri);
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

    // Get tenant info from ADMIN database
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: 'Invalid tenant'
      });
    }

    // Get agent from TENANT database
    const Agent = await getAgentModel(tenant.databaseUri);
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

// ============================================================================
// PHASE-2: Conversation & Message Handling (NOT YET IMPLEMENTED)
// ============================================================================
// The following endpoints will be implemented in Phase-2:
// - getConversations - View tenant conversations
// - replyToConversation - Send agent replies
// - updateConversationStatus - Toggle AI/human mode
// ============================================================================

module.exports = {
  agentLogin,
  createAgent,
  listAgents,
  updateAgent,
  deleteAgent
};
