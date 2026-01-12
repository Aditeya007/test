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

  console.log(`🔌 New tenant database connection established:`, {
    database: databaseUri,
    readyState: conn.readyState, // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    host: conn.host,
    port: conn.port,
    name: conn.name
  });

  tenantConnections.set(databaseUri, conn);
  return conn;
};

/**
 * Get Agent model for a specific tenant database
 */
const getAgentModel = async (databaseUri) => {
  const tenantDB = await getTenantConnection(databaseUri);
  
  console.log(`📦 Getting Agent model for database:`, {
    database: databaseUri,
    connectionState: tenantDB.readyState,
    existingModel: !!tenantDB.models.Agent
  });
  
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

    // Generate JWT token for agent
    const token = jwt.sign(
      {
        role: 'agent',
        userId: foundTenant._id.toString(),
        agentId: foundAgent._id.toString()
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

    // Check if agents are disabled (maxAgents = 0)
    if (tenant.maxAgents === 0) {
      return res.status(403).json({
        error: 'Agents disabled',
        message: 'Agent creation is disabled for this account. Please contact your administrator to enable agents.',
        currentCount: agentCount,
        maxAgents: tenant.maxAgents
      });
    }

    // Check if limit reached (only if maxAgents > 0)
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

    // Save to database with explicit error handling
    try {
      const savedAgent = await agent.save();
      
      // Verify it was actually saved by re-querying
      const verifyAgent = await Agent.findById(savedAgent._id);
      
      if (!verifyAgent) {
        throw new Error('Agent save verification failed - agent not found in database after save');
      }

      console.log(`✅ Agent created and verified in MongoDB:`, {
        agentId: savedAgent._id,
        username: savedAgent.username,
        name: savedAgent.name,
        tenantId: tenantId,
        tenantUsername: tenant.username,
        database: tenant.databaseUri,
        collection: 'agents',
        verified: true
      });

      res.status(201).json({
        message: 'Agent created successfully',
        agent: savedAgent.toPublicProfile()
      });
    } catch (saveError) {
      console.error('❌ Failed to save agent to database:', {
        error: saveError.message,
        stack: saveError.stack,
        database: tenant.databaseUri,
        agentData: { username, name, email }
      });
      throw saveError; // Re-throw to be caught by outer catch
    }
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
// PHASE-2: Conversation & Message Handling
// ============================================================================

/**
 * GET /api/agent/conversations
 * List all conversations for the tenant (agent inbox)
 * Requires agent authentication
 */
const getConversations = async (req, res) => {
  try {
    const tenantId = req.user.userId; // userId contains tenant ID

    // Get tenant info from ADMIN database
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: 'Invalid tenant'
      });
    }

    // Connect to tenant database
    const tenantConnection = await getTenantConnection(tenant.databaseUri);

    // Define Conversation schema for tenant DB
    const ConversationSchema = new mongoose.Schema({
      botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
      sessionId: { type: String, required: true },
      status: { type: String, enum: ['ai', 'human'], default: 'ai' },
      createdAt: { type: Date, default: Date.now },
      lastActiveAt: { type: Date, default: Date.now }
    });

    // Define Message schema for tenant DB
    const MessageSchema = new mongoose.Schema({
      conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
      sender: { type: String, enum: ['user', 'bot', 'agent'], required: true },
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    });

    // Get or create models
    const Conversation = tenantConnection.models.Conversation || 
                         tenantConnection.model('Conversation', ConversationSchema);
    const Message = tenantConnection.models.Message || 
                    tenantConnection.model('Message', MessageSchema);

    // Query all conversations, sorted by lastActiveAt
    const conversations = await Conversation.find()
      .sort({ lastActiveAt: -1 })
      .lean();

    // Get bot IDs to fetch bot details from admin DB
    const botIds = [...new Set(conversations.map(c => c.botId))];
    const bots = await Bot.find({ _id: { $in: botIds } }).select('_id name scrapedWebsites').lean();
    const botMap = Object.fromEntries(bots.map(b => [b._id.toString(), b]));

    // For each conversation, get the last message
    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conv) => {
        // Get last message for this conversation
        const lastMessage = await Message.findOne({ conversationId: conv._id })
          .sort({ createdAt: -1 })
          .select('text sender createdAt')
          .lean();

        const bot = botMap[conv.botId.toString()];
        const websiteUrl = bot?.scrapedWebsites?.[0] || 'N/A';

        return {
          conversationId: conv._id,
          botId: conv.botId,
          botName: bot?.name || 'Unknown Bot',
          websiteUrl,
          sessionId: conv.sessionId,
          status: conv.status,
          lastActiveAt: conv.lastActiveAt,
          createdAt: conv.createdAt,
          lastMessage: lastMessage ? {
            text: lastMessage.text,
            sender: lastMessage.sender,
            createdAt: lastMessage.createdAt
          } : null
        };
      })
    );

    res.json({
      conversations: conversationsWithDetails,
      count: conversationsWithDetails.length
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversations',
      message: 'An error occurred while fetching conversations'
    });
  }
};

// ============================================================================
// TODO: Additional Phase-2 endpoints
// - replyToConversation - Send agent replies
// - updateConversationStatus - Toggle AI/human mode
// ============================================================================

module.exports = {
  agentLogin,
  createAgent,
  listAgents,
  updateAgent,
  deleteAgent,
  getConversations
};
