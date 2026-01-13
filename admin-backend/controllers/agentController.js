// admin-backend/controllers/agentController.js

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const AgentSchema = require("../models/Agent");
const Bot = require("../models/Bot");

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
    throw new Error("databaseUri is required for tenant database connection");
  }

  // Return cached connection if exists
  if (tenantConnections.has(databaseUri)) {
    return tenantConnections.get(databaseUri);
  }

  // Create new connection and await it
  const conn = await mongoose
    .createConnection(databaseUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
    .asPromise();

  console.log(`🔌 New tenant database connection established:`, {
    database: databaseUri,
    readyState: conn.readyState, // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    host: conn.host,
    port: conn.port,
    name: conn.name,
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
    existingModel: !!tenantDB.models.Agent,
  });

  // Check if model already exists for this connection
  if (tenantDB.models.Agent) {
    return tenantDB.models.Agent;
  }

  // Create model for this tenant's database
  return tenantDB.model("Agent", AgentSchema);
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
        error: "Missing required fields",
        message: "Username and password are required",
      });
    }

    // Normalize username (trim whitespace)
    const normalizedUsername = username.trim();

    // Check JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET is not configured");
      return res.status(500).json({
        error: "Server configuration error",
        message: "Authentication service is not properly configured",
      });
    }

    console.log(`🔍 Agent login attempt for username: "${normalizedUsername}"`);

    // Search for agent across all tenants with agents enabled
    const tenants = await User.find({ maxAgents: { $gt: 0 }, role: "user" });

    console.log(`📋 Found ${tenants.length} tenant(s) with agents enabled`);

    if (tenants.length === 0) {
      console.warn("⚠️  No tenants found with agents enabled");
      return res.status(401).json({
        error: "Invalid credentials",
        message: "Username or password is incorrect",
      });
    }

    let foundAgent = null;
    let foundTenant = null;
    let tenantsChecked = 0;
    let tenantsWithDbUri = 0;

    // Search each tenant's database for the agent
    for (const tenant of tenants) {
      if (!tenant.databaseUri) {
        console.warn(
          `⚠️  Tenant ${tenant._id} (${tenant.username}) has no databaseUri`
        );
        continue;
      }

      tenantsWithDbUri++;

      try {
        const Agent = await getAgentModel(tenant.databaseUri);
        const agent = await Agent.findOne({ username: normalizedUsername });

        tenantsChecked++;

        if (agent) {
          console.log(
            `✅ Found agent "${normalizedUsername}" in tenant ${tenant._id} (${tenant.username})`
          );
          foundAgent = agent;
          foundTenant = tenant;
          break;
        }
      } catch (err) {
        console.error(
          `❌ Error checking tenant ${tenant._id} (${tenant.username}):`,
          {
            error: err.message,
            stack:
              process.env.NODE_ENV === "development" ? err.stack : undefined,
          }
        );
        continue;
      }
    }

    console.log(
      `📊 Search complete: Checked ${tenantsChecked}/${tenantsWithDbUri} tenant databases`
    );

    if (!foundAgent) {
      console.warn(
        `⚠️  Agent "${normalizedUsername}" not found in any tenant database`
      );
      return res.status(401).json({
        error: "Invalid credentials",
        message: "Username or password is incorrect",
      });
    }

    // Check if agent is active
    if (!foundAgent.isActive) {
      console.warn(
        `⚠️  Agent "${normalizedUsername}" attempted login but account is disabled`
      );
      return res.status(403).json({
        error: "Account disabled",
        message: "Your agent account has been deactivated",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      password,
      foundAgent.passwordHash
    );
    if (!isPasswordValid) {
      console.warn(
        `⚠️  Agent "${normalizedUsername}" attempted login with incorrect password`
      );
      return res.status(401).json({
        error: "Invalid credentials",
        message: "Username or password is incorrect",
      });
    }

    // Mark agent as available
    foundAgent.status = "available";
    await foundAgent.save();

    // Generate JWT token for agent
    const token = jwt.sign(
      {
        agentId: foundAgent._id.toString(),
        username: foundAgent.username,
        tenantId: foundTenant._id.toString(),
        role: "agent", // Required for AuthContext to recognize agent token
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Include tenant data in response
    const tenantData = foundTenant.toObject();
    delete tenantData.password;

    console.log(`✅ Agent "${normalizedUsername}" logged in successfully`);

    res.json({
      message: "Login successful",
      token,
      agent: foundAgent.toPublicProfile(),
      tenant: {
        ...tenantData,
        id: tenantData._id,
      },
    });
  } catch (error) {
    console.error("❌ Agent login error:", {
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
    res.status(500).json({
      error: "Login failed",
      message: "An error occurred during login",
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
        error: "Missing required fields",
        message: "Username, password, name, and email are required",
      });
    }

    // Get tenant (user) info from ADMIN database to check maxAgents limit
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
        message: "Invalid tenant",
      });
    }

    // Get agent count from TENANT database
    const Agent = await getAgentModel(tenant.databaseUri);
    const agentCount = await Agent.countDocuments();

    // Check if agents are disabled (maxAgents = 0)
    if (tenant.maxAgents === 0) {
      return res.status(403).json({
        error: "Agents disabled",
        message:
          "Agent creation is disabled for this account. Please contact your administrator to enable agents.",
        currentCount: agentCount,
        maxAgents: tenant.maxAgents,
      });
    }

    // Check if limit reached (only if maxAgents > 0)
    if (agentCount >= tenant.maxAgents) {
      return res.status(403).json({
        error: "Agent limit reached",
        message: `You have reached the maximum number of agents (${tenant.maxAgents}). Please contact support to increase your limit.`,
        currentCount: agentCount,
        maxAgents: tenant.maxAgents,
      });
    }

    // Check if username already exists in this tenant's database
    const existingAgent = await Agent.findOne({ username });
    if (existingAgent) {
      return res.status(409).json({
        error: "Username taken",
        message: "An agent with this username already exists",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create agent
    const agent = new Agent({
      tenantId: tenantId,
      username,
      passwordHash,
      name,
      email,
      phone: phone || null,
      isActive: true,
    });

    // Save to database with explicit error handling
    try {
      const savedAgent = await agent.save();

      // Verify it was actually saved by re-querying
      const verifyAgent = await Agent.findById(savedAgent._id);

      if (!verifyAgent) {
        throw new Error(
          "Agent save verification failed - agent not found in database after save"
        );
      }

      console.log(`✅ Agent created and verified in MongoDB:`, {
        agentId: savedAgent._id,
        username: savedAgent.username,
        name: savedAgent.name,
        tenantId: tenantId,
        tenantUsername: tenant.username,
        database: tenant.databaseUri,
        collection: "agents",
        verified: true,
      });

      res.status(201).json({
        message: "Agent created successfully",
        agent: savedAgent.toPublicProfile(),
      });
    } catch (saveError) {
      console.error("❌ Failed to save agent to database:", {
        error: saveError.message,
        stack: saveError.stack,
        database: tenant.databaseUri,
        agentData: { username, name, email },
      });
      throw saveError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    console.error("Create agent error:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation error",
        message: error.message,
      });
    }

    res.status(500).json({
      error: "Failed to create agent",
      message: "An error occurred while creating the agent",
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
        error: "Tenant not found",
        message: "Invalid tenant",
      });
    }

    // Get agents from TENANT database
    const Agent = await getAgentModel(tenant.databaseUri);
    const agents = await Agent.find().sort({ createdAt: -1 });

    console.log(`📋 Retrieved agents for tenant ${tenant.username}:`, {
      tenantId: tenantId,
      database: tenant.databaseUri,
      agentCount: agents.length,
      maxAgents: tenant.maxAgents,
    });

    res.json({
      agents: agents.map((agent) => agent.toPublicProfile()),
      count: agents.length,
      maxAgents: tenant.maxAgents,
    });
  } catch (error) {
    console.error("List agents error:", error);
    res.status(500).json({
      error: "Failed to retrieve agents",
      message: "An error occurred while fetching agents",
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
        error: "Tenant not found",
        message: "Invalid tenant",
      });
    }

    // Get agent from TENANT database
    const Agent = await getAgentModel(tenant.databaseUri);
    const agent = await Agent.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        error: "Agent not found",
        message: "Agent does not exist",
      });
    }

    // Update allowed fields
    if (name !== undefined) agent.name = name;
    if (email !== undefined) agent.email = email;
    if (phone !== undefined) agent.phone = phone;
    if (isActive !== undefined) agent.isActive = isActive;

    await agent.save();

    res.json({
      message: "Agent updated successfully",
      agent: agent.toPublicProfile(),
    });
  } catch (error) {
    console.error("Update agent error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation error",
        message: error.message,
      });
    }

    res.status(500).json({
      error: "Failed to update agent",
      message: "An error occurred while updating the agent",
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
        error: "Tenant not found",
        message: "Invalid tenant",
      });
    }

    // Get agent from TENANT database
    const Agent = await getAgentModel(tenant.databaseUri);
    const agent = await Agent.findByIdAndDelete(agentId);

    if (!agent) {
      return res.status(404).json({
        error: "Agent not found",
        message: "Agent does not exist",
      });
    }

    res.json({
      message: "Agent deleted successfully",
      agent: agent.toPublicProfile(),
    });
  } catch (error) {
    console.error("Delete agent error:", error);
    res.status(500).json({
      error: "Failed to delete agent",
      message: "An error occurred while deleting the agent",
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
 * Shows ALL conversations regardless of status
 */
const getConversations = async (req, res) => {
  try {
    const tenantId = req.agent.tenantId; // Agent's tenant ID

    // Get tenant info from ADMIN database
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
        message: "Invalid tenant",
      });
    }

    // Connect to tenant database
    const tenantConnection = await getTenantConnection(tenant.databaseUri);

    // Define Conversation schema for tenant DB
    const ConversationSchema = new mongoose.Schema({
      botId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bot",
        required: true,
      },
      sessionId: { type: String, required: true },
      status: {
        type: String,
        enum: [
          "bot",
          "waiting",
          "active",
          "queued",
          "assigned",
          "closed",
          "ai",
          "human",
        ],
        default: "bot",
      },
      assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null,
      },
      agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null,
      },
      requestedAt: { type: Date, default: null },
      endedAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now },
      lastActiveAt: { type: Date, default: Date.now },
    });

    // Get or create models
    const Conversation =
      tenantConnection.models.Conversation ||
      tenantConnection.model("Conversation", ConversationSchema);

    // Query conversations: show WAITING chats OR chats assigned to this agent
    // Do NOT show chats taken by other agents
    const agentId = req.agent.agentId;
    const conversations = await Conversation.find({
      $or: [
        { status: "waiting" },
        { status: "queued" },
        { assignedAgent: agentId },
        { agentId: agentId },
      ],
    })
      .sort({ lastActiveAt: -1 })
      .lean();

    console.log(
      `📋 Retrieved ${conversations.length} conversations for agent ${agentId}`
    );

    // Get bot IDs to fetch bot details from admin DB
    const botIds = [...new Set(conversations.map((c) => c.botId?.toString()))]
      .filter(Boolean)
      .map((id) => new mongoose.Types.ObjectId(id));
    const bots = await Bot.find({ _id: { $in: botIds } })
      .select("_id name scrapedWebsites")
      .lean();
    const botMap = Object.fromEntries(bots.map((b) => [b._id.toString(), b]));

    // Format conversations with details
    const conversationsWithDetails = conversations.map((conv) => {
      const bot = botMap[conv.botId.toString()];
      const websiteUrl = bot?.scrapedWebsites?.[0] || "N/A";

      return {
        _id: conv._id, // Use _id for frontend compatibility
        conversationId: conv._id,
        botId: conv.botId,
        botName: bot?.name || "Unknown Bot",
        websiteUrl,
        sessionId: conv.sessionId,
        status: conv.status,
        assignedAgent: conv.assignedAgent,
        lastActiveAt: conv.lastActiveAt,
        createdAt: conv.createdAt,
      };
    });

    res.json({
      conversations: conversationsWithDetails,
      count: conversationsWithDetails.length,
    });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({
      error: "Failed to retrieve conversations",
      message: "An error occurred while fetching conversations",
    });
  }
};

/**
 * GET /api/agent/conversations/:conversationId/messages
 * Get all messages for a specific conversation
 * Requires agent authentication
 */
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const tenantId = req.agent.tenantId; // Agent's tenant ID

    // Get tenant info from ADMIN database
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
        message: "Invalid tenant",
      });
    }

    // Connect to tenant database
    const tenantConnection = await getTenantConnection(tenant.databaseUri);

    // Define Message schema for tenant DB
    const MessageSchema = new mongoose.Schema({
      conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        required: true,
      },
      sender: { type: String, enum: ["user", "bot", "agent"], required: true },
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    });

    // Get or create models
    const Message =
      tenantConnection.models.Message ||
      tenantConnection.model("Message", MessageSchema);

    // Validate conversationId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        error: "Invalid conversation ID",
        message: "The provided conversation ID is not valid",
      });
    }

    // Get all messages for this conversation, sorted by createdAt
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .lean();

    console.log(
      `💬 Retrieved ${messages.length} messages for conversation ${conversationId}`
    );

    res.json({
      messages: messages,
      count: messages.length,
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({
      error: "Failed to retrieve messages",
      message: "An error occurred while fetching messages",
    });
  }
};

// ============================================================================
// TODO: Additional Phase-2 endpoints
// - updateConversationStatus - Toggle AI/human mode
// ============================================================================

/**
 * POST /api/agent/conversations/:id/reply
 * Agent replies to a conversation
 * Requires agent authentication and conversation must be assigned to this agent
 */
const replyToConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const agentId = req.agent.agentId;
    const tenantId = req.agent.tenantId;

    // Validation
    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required",
        message: "Please provide a message to send",
      });
    }

    // Get tenant info
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
        message: "Invalid tenant",
      });
    }

    // Connect to tenant database
    const tenantConnection = await getTenantConnection(tenant.databaseUri);

    // Define schemas
    const ConversationSchema = new mongoose.Schema({
      botId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bot",
        required: true,
      },
      sessionId: { type: String, required: true },
      status: {
        type: String,
        enum: [
          "bot",
          "waiting",
          "active",
          "queued",
          "assigned",
          "closed",
          "ai",
          "human",
        ],
        default: "bot",
      },
      assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null,
      },
      agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null,
      },
      requestedAt: { type: Date, default: null },
      endedAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now },
      lastActiveAt: { type: Date, default: Date.now },
    });

    const MessageSchema = new mongoose.Schema({
      conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        required: true,
      },
      sender: { type: String, enum: ["user", "bot", "agent"], required: true },
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    });

    const Conversation =
      tenantConnection.models.Conversation ||
      tenantConnection.model("Conversation", ConversationSchema);
    const Message =
      tenantConnection.models.Message ||
      tenantConnection.model("Message", MessageSchema);

    // Find conversation and verify agent is assigned
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        error: "Conversation not found",
        message: "The specified conversation does not exist",
      });
    }

    // Verify this agent is assigned to this conversation
    const assignedAgentId = conversation.assignedAgent || conversation.agentId;
    if (!assignedAgentId || assignedAgentId.toString() !== agentId.toString()) {
      return res.status(403).json({
        error: "Unauthorized",
        message: "You are not assigned to this conversation",
      });
    }

    // Create and save message with sender='agent'
    const newMessage = new Message({
      conversationId: conversation._id,
      sender: "agent",
      text: message.trim(),
      createdAt: new Date(),
    });

    await newMessage.save();

    // Update conversation's lastActiveAt
    conversation.lastActiveAt = new Date();
    await conversation.save();

    console.log(`💬 Agent ${agentId} sent message to conversation ${id}`);

    // Emit real-time agent message to all clients in this conversation room
    // Access io from the Express app via req.app.locals
    const io = req.app.locals.io;
    if (io) {
      const conversationIdStr = String(conversation._id);
      io.to(`conversation:${conversationIdStr}`).emit("message:new", {
        _id: newMessage._id,
        conversationId: conversationIdStr,
        sender: "agent",
        text: newMessage.text,
        createdAt: newMessage.createdAt,
      });
      console.log(
        `📡 Emitted agent message to conversation:${conversationIdStr}`
      );
    }

    res.json({
      message: "Message sent successfully",
      data: {
        _id: newMessage._id,
        conversationId: newMessage.conversationId,
        sender: newMessage.sender,
        text: newMessage.text,
        createdAt: newMessage.createdAt,
      },
    });
  } catch (error) {
    console.error("Reply to conversation error:", error);
    res.status(500).json({
      error: "Failed to send message",
      message: "An error occurred while sending your message",
    });
  }
};

/**
 * POST /api/agent/logout
 * Agent logout - mark agent as offline
 * Requires agent authentication
 */
const agentLogout = async (req, res) => {
  try {
    const agentId = req.agent.agentId;
    const tenantId = req.agent.tenantId;

    // Get tenant info
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
        message: "Invalid tenant",
      });
    }

    // Get Agent model and update status
    const Agent = await getAgentModel(tenant.databaseUri);
    const agent = await Agent.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        error: "Agent not found",
        message: "Agent does not exist",
      });
    }

    agent.status = "offline";
    await agent.save();

    console.log(`🚪 Agent ${agent.username} logged out and marked offline`);

    res.json({
      message: "Logout successful",
      status: "offline",
    });
  } catch (error) {
    console.error("Agent logout error:", error);
    res.status(500).json({
      error: "Logout failed",
      message: "An error occurred during logout",
    });
  }
};

/**
 * POST /api/agent/conversations/:id/accept
 * Agent accepts a waiting conversation
 * Atomically assigns conversation to agent and marks agent as busy
 * Returns 409 if conversation is not waiting
 */
const acceptConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const agentId = req.agent.agentId;
    const tenantId = req.agent.tenantId;

    // Get tenant info
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
        message: "Invalid tenant",
      });
    }

    // Connect to tenant database
    const tenantConnection = await getTenantConnection(tenant.databaseUri);

    // Define Conversation schema
    const ConversationSchema = new mongoose.Schema({
      botId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bot",
        required: true,
      },
      sessionId: { type: String, required: true },
      status: {
        type: String,
        enum: [
          "bot",
          "waiting",
          "active",
          "queued",
          "assigned",
          "closed",
          "ai",
          "human",
        ],
        default: "bot",
      },
      assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null,
      },
      agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null,
      },
      requestedAt: { type: Date, default: null },
      endedAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now },
      lastActiveAt: { type: Date, default: Date.now },
    });

    const Conversation =
      tenantConnection.models.Conversation ||
      tenantConnection.model("Conversation", ConversationSchema);

    // Atomically find and update conversation if it's in waiting/queued status
    // This prevents race conditions when multiple agents try to accept at the same time
    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: id,
        $or: [{ status: "waiting" }, { status: "queued" }],
      },
      {
        $set: {
          status: "active",
          agentId: agentId,
          assignedAgent: agentId,
          lastActiveAt: new Date(),
        },
      },
      {
        new: true, // Return the updated document
      }
    );

    if (!conversation) {
      // Either conversation doesn't exist or it's not in waiting/queued status
      const checkConv = await Conversation.findById(id);
      if (!checkConv) {
        return res.status(404).json({
          error: "Conversation not found",
          message: "The specified conversation does not exist",
        });
      }

      return res.status(409).json({
        error: "Conversation not available",
        message:
          "This conversation has already been accepted by another agent or is not in waiting status",
        currentStatus: checkConv.status,
      });
    }

    // Mark agent as busy
    const Agent = await getAgentModel(tenant.databaseUri);
    const agent = await Agent.findById(agentId);
    if (agent) {
      agent.status = "busy";
      await agent.save();
    }

    console.log(`✅ Agent ${agentId} accepted conversation ${id}`);

    res.json({
      message: "Conversation accepted",
      conversation: {
        _id: conversation._id,
        status: conversation.status,
        agentId: conversation.agentId,
        assignedAgent: conversation.assignedAgent,
      },
    });
  } catch (error) {
    console.error("Accept conversation error:", error);
    res.status(500).json({
      error: "Failed to accept conversation",
      message: "An error occurred while accepting the conversation",
    });
  }
};

/**
 * POST /api/agent/conversations/:id/close
 * Close a conversation and mark agent as available
 * Can be called by agent or when user closes chat
 */
const closeConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const agentId = req.agent?.agentId; // Optional - can be called without agent auth
    const tenantId = req.agent?.tenantId;

    // If no agent context, get tenant from conversation
    let tenant;
    if (tenantId) {
      tenant = await User.findById(tenantId);
    } else {
      // Need to find tenant from conversation - get botId first
      // For now, require agent auth
      return res.status(401).json({
        error: "Authentication required",
        message: "Agent authentication is required to close conversations",
      });
    }

    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
        message: "Invalid tenant",
      });
    }

    // Connect to tenant database
    const tenantConnection = await getTenantConnection(tenant.databaseUri);

    // Define Conversation schema
    const ConversationSchema = new mongoose.Schema({
      botId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bot",
        required: true,
      },
      sessionId: { type: String, required: true },
      status: {
        type: String,
        enum: [
          "bot",
          "waiting",
          "active",
          "queued",
          "assigned",
          "closed",
          "ai",
          "human",
        ],
        default: "bot",
      },
      assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null,
      },
      agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null,
      },
      requestedAt: { type: Date, default: null },
      endedAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now },
      lastActiveAt: { type: Date, default: Date.now },
    });

    const Conversation =
      tenantConnection.models.Conversation ||
      tenantConnection.model("Conversation", ConversationSchema);

    // Find conversation
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        error: "Conversation not found",
        message: "The specified conversation does not exist",
      });
    }

    // Get the assigned agent (if any)
    const assignedAgentId = conversation.assignedAgent;

    // Close conversation and return to bot mode
    // Set status to 'bot' so LLM becomes active again
    conversation.status = "bot";
    conversation.assignedAgent = null;
    conversation.agentId = null;
    conversation.lastActiveAt = new Date();
    conversation.endedAt = new Date();
    await conversation.save();

    // If there was an assigned agent, mark them as available
    if (assignedAgentId) {
      const Agent = await getAgentModel(tenant.databaseUri);
      const agent = await Agent.findById(assignedAgentId);
      if (agent && agent.status === "busy") {
        agent.status = "available";
        await agent.save();
        console.log(
          `🟢 Agent ${assignedAgentId} marked as available after closing conversation ${id}`
        );
      }
    }

    console.log(`🔒 Conversation ${id} closed`);

    res.json({
      message: "Conversation closed",
      conversation: {
        _id: conversation._id,
        status: conversation.status,
      },
    });
  } catch (error) {
    console.error("Close conversation error:", error);
    res.status(500).json({
      error: "Failed to close conversation",
      message: "An error occurred while closing the conversation",
    });
  }
};

module.exports = {
  agentLogin,
  agentLogout,
  createAgent,
  listAgents,
  updateAgent,
  deleteAgent,
  getConversations,
  getMessages,
  replyToConversation,
  acceptConversation,
  closeConversation,
};
