// admin-backend/controllers/chatController.js

const mongoose = require('mongoose');
const Bot = require('../models/Bot');
const botJob = require('../jobs/botJob');
const { getUserTenantContext } = require('../services/userContextService');

// Cache for tenant database connections
const tenantConnections = new Map();

/**
 * Get or create a connection to the tenant's database
 * Each tenant has their own MongoDB database for data isolation
 */
async function getTenantConnection(databaseUri) {
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
}

/**
 * Get Agent model for a specific tenant database
 */
async function getAgentModel(databaseUri) {
  const connection = await getTenantConnection(databaseUri);
  const AgentSchema = require('../models/Agent');
  
  // Return model from tenant connection
  return connection.models.Agent || connection.model('Agent', AgentSchema);
}

/**
 * Get Conversation and Message models for a specific tenant database
 */
async function getTenantModels(databaseUri) {
  const connection = await getTenantConnection(databaseUri);

  // Load Conversation schema
  const ConversationSchema = new mongoose.Schema(
    {
      botId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bot',
        required: true,
        index: true
      },
      sessionId: {
        type: String,
        required: true,
        index: true,
        trim: true
      },
      status: {
        type: String,
        enum: ['bot', 'waiting', 'active', 'queued', 'assigned', 'closed', 'ai', 'human'],
        default: 'bot',
        required: true
      },
      assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        default: null
      },
      agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        default: null
      },
      requestedAt: {
        type: Date,
        default: null
      },
      endedAt: {
        type: Date,
        default: null
      },
      createdAt: {
        type: Date,
        default: Date.now,
        index: true
      },
      lastActiveAt: {
        type: Date,
        default: Date.now,
        index: true
      }
    },
    { timestamps: false }
  );

  ConversationSchema.index({ botId: 1, sessionId: 1 }, { unique: true });
  ConversationSchema.index({ status: 1, lastActiveAt: -1 });

  ConversationSchema.pre('save', function(next) {
    this.lastActiveAt = new Date();
    next();
  });

  ConversationSchema.methods.updateActivity = function() {
    this.lastActiveAt = new Date();
    return this.save();
  };

  ConversationSchema.statics.findOrCreate = async function(botId, sessionId) {
    let conversation = await this.findOne({ botId, sessionId });
    
    if (!conversation) {
      conversation = new this({
        botId,
        sessionId,
        status: 'bot',
        createdAt: new Date(),
        lastActiveAt: new Date()
      });
      await conversation.save();
    } else {
      await conversation.updateActivity();
    }
    
    return conversation;
  };

  // Load Message schema
  const MessageSchema = new mongoose.Schema(
    {
      conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
      },
      sender: {
        type: String,
        enum: ['user', 'bot', 'agent'],
        required: true
      },
      text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 10000
      },
      createdAt: {
        type: Date,
        default: Date.now,
        index: true
      },
      sources: {
        type: [String],
        default: undefined
      },
      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: undefined
      }
    },
    { timestamps: false }
  );

  MessageSchema.index({ conversationId: 1, createdAt: 1 });

  MessageSchema.statics.getConversationMessages = async function(conversationId, limit = 100) {
    return this.find({ conversationId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .select('sender text createdAt sources metadata')
      .lean();
  };

  MessageSchema.statics.createMessage = async function(conversationId, sender, text, options = {}) {
    const message = new this({
      conversationId,
      sender,
      text,
      createdAt: new Date(),
      sources: options.sources,
      metadata: options.metadata
    });
    
    await message.save();
    return message;
  };

  // Return models from tenant connection
  const Conversation = connection.models.Conversation || connection.model('Conversation', ConversationSchema);
  const Message = connection.models.Message || connection.model('Message', MessageSchema);

  return { Conversation, Message };
}

/**
 * POST /api/conversation/start
 * Find or create a conversation for a given botId and sessionId
 * 
 * @body { botId: string, sessionId: string }
 * @returns { success: boolean, conversation: Object }
 */
exports.startConversation = async (req, res) => {
  try {
    const { botId, sessionId } = req.body;

    // Validate input
    if (!botId || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'botId and sessionId are required'
      });
    }

    // Validate bot exists and is active
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    if (!bot.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Bot is inactive'
      });
    }

    // Get tenant context to load tenant database
    const tenantContext = await getUserTenantContext(bot.userId);
    if (!tenantContext.databaseUri) {
      return res.status(503).json({
        success: false,
        error: 'Tenant database not provisioned'
      });
    }

    // Load models from tenant database
    const { Conversation } = await getTenantModels(tenantContext.databaseUri);

    // Find or create conversation in tenant database
    const conversation = await Conversation.findOrCreate(botId, sessionId);

    console.log(`✅ Conversation ${conversation.status === 'ai' ? 'resumed' : 'started'}: ${conversation._id} (session: ${sessionId})`);

    res.json({
      success: true,
      conversation: {
        _id: conversation._id,  // MongoDB _id (used for Socket.IO rooms)
        id: conversation._id,   // Alias for compatibility
        botId: conversation.botId,
        sessionId: conversation.sessionId,
        status: conversation.status,
        createdAt: conversation.createdAt,
        lastActiveAt: conversation.lastActiveAt
      }
    });
  } catch (err) {
    console.error('❌ Failed to start conversation:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to start conversation',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * GET /api/conversation/:sessionId/messages
 * Get all messages for a conversation by sessionId
 * 
 * @param sessionId - The session ID
 * @query botId - The bot ID (required to find conversation)
 * @returns { success: boolean, messages: Array }
 */
exports.getMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { botId } = req.query;

    // Validate input
    if (!sessionId || !botId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and botId are required'
      });
    }

    // Validate bot exists
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Get tenant context to load tenant database
    const tenantContext = await getUserTenantContext(bot.userId);
    if (!tenantContext.databaseUri) {
      return res.status(503).json({
        success: false,
        error: 'Tenant database not provisioned'
      });
    }

    // Load models from tenant database
    const { Conversation, Message } = await getTenantModels(tenantContext.databaseUri);

    // Find conversation in tenant database
    const conversation = await Conversation.findOne({ botId, sessionId });

    if (!conversation) {
      // No conversation yet - return empty messages
      return res.json({
        success: true,
        messages: [],
        conversationId: null
      });
    }

    // Get messages for this conversation from tenant database
    const messages = await Message.getConversationMessages(conversation._id);

    console.log(`✅ Retrieved ${messages.length} messages for conversation ${conversation._id}`);

    res.json({
      success: true,
      messages: messages.map(msg => ({
        id: msg._id,
        sender: msg.sender,
        text: msg.text,
        createdAt: msg.createdAt,
        sources: msg.sources,
        metadata: msg.metadata
      })),
      conversationId: conversation._id,
      conversationStatus: conversation.status
    });
  } catch (err) {
    console.error('❌ Failed to get messages:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve messages',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * POST /api/chat/message
 * Send a message in a conversation
 * Handles both AI and human agent modes
 * 
 * @body { botId: string, sessionId: string, message: string }
 * @returns { success: boolean, reply: Object, conversation: Object }
 */
exports.sendMessage = async (req, res) => {
  try {
    const { botId, sessionId, message } = req.body;

    // Validate input
    if (!botId || !sessionId || !message) {
      return res.status(400).json({
        success: false,
        error: 'botId, sessionId, and message are required'
      });
    }

    // Sanitize input
    const sanitizedMessage = message.trim();
    if (!sanitizedMessage) {
      return res.status(400).json({
        success: false,
        error: 'Message cannot be empty'
      });
    }

    if (sanitizedMessage.length > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Message is too long (max 10000 characters)'
      });
    }

    // Validate bot exists and is active
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    if (!bot.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Bot is inactive'
      });
    }

    // Get tenant context to load tenant database
    const tenantContext = await getUserTenantContext(bot.userId);
    if (!tenantContext.databaseUri) {
      return res.status(503).json({
        success: false,
        error: 'Tenant database not provisioned'
      });
    }

    // Load models from tenant database
    const { Conversation, Message } = await getTenantModels(tenantContext.databaseUri);

    // Find or create conversation in tenant database
    const conversation = await Conversation.findOrCreate(botId, sessionId);

    // Save user message to tenant database
    const userMessage = await Message.createMessage(conversation._id, 'user', sanitizedMessage);

    // Update conversation activity after user message
    await conversation.updateActivity();

    console.log(`💬 User message saved for conversation ${conversation._id}`);

    // Emit real-time message to all clients in this conversation room
    const io = req.app.locals.io;
    if (io) {
      io.to(conversation._id).emit('message:new', {
        _id: userMessage._id,
        conversationId: conversation._id,
        sender: 'user',
        text: sanitizedMessage,
        createdAt: userMessage.createdAt
      });
      console.log(`📡 Emitted user message to conversation:${conversation._id}`);
    }

    // CHECK FOR ACTIVE AGENT TAKEOVER - Disable LLM completely
    if (conversation.status === 'active' && conversation.assignedAgent) {
      // Human agent is actively handling this conversation
      // Save message but DO NOT call LLM - agent will respond manually
      console.log(`👤 Conversation ${conversation._id} in active agent mode - message forwarded to agent ${conversation.assignedAgent}`);

      // Return empty response - widget should remain silent while waiting for agent
      return res.json({
        success: true,
        reply: null, // No automated reply - widget will not render anything
        conversation: {
          _id: conversation._id,  // MongoDB _id (used for Socket.IO rooms)
          id: conversation._id,
          status: conversation.status,
          assignedAgent: conversation.assignedAgent
        },
        agentActive: true
      });
    }

    // Handle based on conversation status
    if (conversation.status === 'human') {
      // Human agent mode - save message but don't call bot
      const agentMessage = 'A human agent will join shortly.';
      
      // Save agent placeholder message to tenant database
      const placeholderMessage = await Message.createMessage(conversation._id, 'agent', agentMessage);

      // Update conversation activity after agent message
      await conversation.updateActivity();

      console.log(`👤 Conversation ${conversation._id} in human mode - agent notified`);

      // Emit real-time placeholder message to all clients in this conversation room
      const io = req.app.locals.io;
      if (io) {
        io.to(conversation._id).emit('message:new', {
          _id: placeholderMessage._id,
          conversationId: conversation._id,
          sender: 'agent',
          text: agentMessage,
          createdAt: placeholderMessage.createdAt
        });
        console.log(`📡 Emitted placeholder message to conversation:${conversation._id}`);
      }

      return res.json({
        success: true,
        reply: {
          _id: placeholderMessage._id,
          id: placeholderMessage._id,
          sender: 'agent',
          text: agentMessage,
          createdAt: new Date()
        },
        conversation: {
          _id: conversation._id,  // MongoDB _id (used for Socket.IO rooms)
          id: conversation._id,
          status: conversation.status
        }
      });
    }

    // AI mode - forward to RAG bot service
    try {
      // Validate bot has vector store
      if (!bot.vectorStorePath) {
        return res.status(503).json({
          success: false,
          error: 'Bot vector store not initialized. Please scrape websites first.',
          errorType: 'SERVICE_UNAVAILABLE',
          widgetError: true
        });
      }

      console.log(`🧠 Forwarding message to RAG bot for conversation ${conversation._id}`);

      // Call bot service
      const botResult = await botJob.runBotForUser(
        {
          userId: bot.userId,
          username: `bot_${bot._id}`,
          botEndpoint: tenantContext.botEndpoint,
          resourceId: tenantContext.resourceId,
          vectorStorePath: bot.vectorStorePath,
          databaseUri: tenantContext.databaseUri
        },
        sanitizedMessage,
        { sessionId }
      );

      // Save bot response to tenant database
      const botMessage = await Message.createMessage(
        conversation._id,
        'bot',
        botResult.answer,
        {
          sources: botResult.sources,
          metadata: {
            bot_session_id: botResult.session_id,
            confidence: botResult.confidence,
            resource_id: tenantContext.resourceId
          }
        }
      );

      // Update conversation activity after bot message
      await conversation.updateActivity();

      console.log(`🤖 Bot response saved for conversation ${conversation._id}`);

      // Emit real-time bot message to all clients in this conversation room
      const io = req.app.locals.io;
      if (io) {
        io.to(conversation._id).emit('message:new', {
          _id: botMessage._id,
          conversationId: conversation._id,
          sender: 'bot',
          text: botResult.answer,
          createdAt: botMessage.createdAt,
          sources: botResult.sources
        });
        console.log(`📡 Emitted bot message to conversation:${conversation._id}`);
      }

      return res.json({
        success: true,
        reply: {
          _id: botMessage._id,
          id: botMessage._id,
          sender: 'bot',
          text: botResult.answer,
          createdAt: botMessage.createdAt,
          sources: botResult.sources
        },
        conversation: {
          _id: conversation._id,  // MongoDB _id (used for Socket.IO rooms)
          id: conversation._id,
          status: conversation.status
        }
      });
    } catch (botError) {
      console.error(`❌ Bot error for conversation ${conversation._id}:`, botError.message);

      // Save error message to tenant database
      const errorMessage = 'I apologize, but I encountered an error processing your request. Please try again.';
      const errorMsg = await Message.createMessage(
        conversation._id,
        'bot',
        errorMessage,
        { metadata: { error: true, errorMessage: botError.message } }
      );

      // Update conversation activity after error message
      await conversation.updateActivity();

      // Emit error message to conversation room
      const io = req.app.locals.io;
      if (io) {
        io.to(conversation._id).emit('message:new', {
          _id: errorMsg._id,
          conversationId: conversation._id,
          sender: 'bot',
          text: errorMessage,
          createdAt: errorMsg.createdAt,
          isError: true
        });
        console.log(`📡 Emitted error message to conversation:${conversation._id}`);
      }

      // Determine appropriate status and error message
      let statusCode = botError.statusCode || 500;
      let userMessage = errorMessage;

      if (botError.message.includes('Cannot connect') || botError.code === 'ECONNREFUSED') {
        statusCode = 503;
        userMessage = 'Bot service is currently unavailable. Please try again later.';
      }

      return res.status(statusCode).json({
        success: false,
        error: userMessage,
        errorType: 'BOT_ERROR',
        widgetError: true,
        conversation: {
          _id: conversation._id,  // MongoDB _id (used for Socket.IO rooms)
          id: conversation._id,
          status: conversation.status
        }
      });
    }
  } catch (err) {
    console.error('❌ Failed to send message:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * PUT /api/conversation/:conversationId/status
 * Update conversation status (AI <-> Human handoff)
 * 
 * @param conversationId - The conversation ID
 * @body { status: 'ai' | 'human' }
 * @returns { success: boolean, conversation: Object }
 */
exports.updateConversationStatus = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { status, botId } = req.body;

    // Validate input
    if (!conversationId || !botId) {
      return res.status(400).json({
        success: false,
        error: 'conversationId and botId are required'
      });
    }

    if (!status || !['ai', 'human'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'status must be either "ai" or "human"'
      });
    }

    // Validate bot exists
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Get tenant context to load tenant database
    const tenantContext = await getUserTenantContext(bot.userId);
    if (!tenantContext.databaseUri) {
      return res.status(503).json({
        success: false,
        error: 'Tenant database not provisioned'
      });
    }

    // Load models from tenant database
    const { Conversation } = await getTenantModels(tenantContext.databaseUri);

    // Find conversation in tenant database
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    // Update status
    conversation.status = status;
    await conversation.save();

    console.log(`✅ Conversation ${conversationId} status updated to: ${status}`);

    res.json({
      success: true,
      conversation: {
        id: conversation._id,
        botId: conversation.botId,
        sessionId: conversation.sessionId,
        status: conversation.status,
        lastActiveAt: conversation.lastActiveAt
      }
    });
  } catch (err) {
    console.error('❌ Failed to update conversation status:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update conversation status',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * POST /api/conversations/:id/request-agent
 * Request a human agent for a conversation
 * Sets conversation status to 'queued' and clears any assigned agent
 * This is triggered when a user requests to talk to a human
 */
exports.requestAgentByConversationId = async (req, res) => {
  try {
    const { id } = req.params;
    const { botId } = req.body;

    // Validate input
    if (!id || !botId) {
      return res.status(400).json({
        success: false,
        error: 'conversationId and botId are required'
      });
    }

    // Validate bot exists
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Get tenant context to load tenant database
    const tenantContext = await getUserTenantContext(bot.userId);
    if (!tenantContext.databaseUri) {
      return res.status(503).json({
        success: false,
        error: 'Tenant database not provisioned'
      });
    }

    // Load models from tenant database
    const { Conversation } = await getTenantModels(tenantContext.databaseUri);

    // Find conversation in tenant database
    const conversation = await Conversation.findById(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    // Set conversation to queued status and clear assigned agent
    conversation.status = 'queued';
    conversation.assignedAgent = null;
    await conversation.save();

    console.log(`📞 Conversation ${id} queued for human agent`);

    // =========================================================================
    // EMIT conversation:queued EVENT TO ALL AGENTS IN TENANT
    // =========================================================================
    const io = req.app.locals.io;
    if (io) {
      const agentRoomName = `agents:${bot.userId}`;  // tenantId is bot.userId
      const lightweightSummary = {
        _id: conversation._id,
        conversationId: conversation._id,
        botId: conversation.botId,
        sessionId: conversation.sessionId,
        status: conversation.status,
        createdAt: conversation.createdAt
      };
      
      io.to(agentRoomName).emit('conversation:queued', lightweightSummary);
      console.log(`📡 Emitted conversation:queued to ${agentRoomName}:`, lightweightSummary);
    }

    res.json({
      success: true,
      message: 'Your request has been queued. An agent will be with you shortly.',
      conversation: {
        id: conversation._id,
        botId: conversation.botId,
        sessionId: conversation.sessionId,
        status: conversation.status,
        lastActiveAt: conversation.lastActiveAt
      }
    });
  } catch (err) {
    console.error('❌ Failed to request agent:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to request agent',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * POST /api/chat/request-agent
 * Request a human agent for the current session
 * Checks agent availability before queueing conversation
 */
exports.requestAgent = async (req, res) => {
  try {
    const { sessionId, botId } = req.body;

    // Validate input
    if (!sessionId || !botId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and botId are required'
      });
    }

    // Validate bot exists and is active
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    if (!bot.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Bot is not active'
      });
    }

    // Get tenant context to load tenant database
    const tenantContext = await getUserTenantContext(bot.userId);
    if (!tenantContext.databaseUri) {
      return res.status(503).json({
        success: false,
        error: 'Tenant database not provisioned'
      });
    }

    // Load Agent model to check availability
    const Agent = await getAgentModel(tenantContext.databaseUri);
    
    // Check agent availability
    const availableCount = await Agent.countDocuments({ status: 'available' });
    const busyCount = await Agent.countDocuments({ status: 'busy' });
    
    // If no agents are online at all (neither available nor busy)
    if (availableCount === 0 && busyCount === 0) {
      console.log(`📞 Agent request denied - no agents online (session: ${sessionId})`);
      return res.json({
        ok: false,
        state: 'offline',
        message: 'No agents are currently available.'
      });
    }

    // Load conversation model from tenant database
    const { Conversation } = await getTenantModels(tenantContext.databaseUri);

    // Find conversation by sessionId and botId
    const conversation = await Conversation.findOne({ botId, sessionId });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    // Update conversation to waiting status
    conversation.status = 'waiting';
    conversation.requestedAt = new Date();
    conversation.assignedAgent = null;
    await conversation.save();

    console.log(`📞 Agent requested for conversation ${conversation._id} (session: ${sessionId})`);

    // =========================================================================
    // EMIT conversation:queued EVENT TO ALL AGENTS IN TENANT
    // =========================================================================
    const io = req.app.locals.io;
    if (io) {
      const agentRoomName = `agents:${bot.userId}`;  // tenantId is bot.userId
      const lightweightSummary = {
        _id: conversation._id,
        conversationId: conversation._id,
        botId: conversation.botId,
        sessionId: conversation.sessionId,
        status: conversation.status,
        createdAt: conversation.createdAt,
        requestedAt: conversation.requestedAt
      };
      
      io.to(agentRoomName).emit('conversation:queued', lightweightSummary);
      console.log(`📡 Emitted conversation:queued to ${agentRoomName}:`, lightweightSummary);
    }

    // If all agents are busy
    if (availableCount === 0 && busyCount > 0) {
      return res.json({
        ok: true,
        state: 'busy',
        message: 'All agents are busy. Please wait while we connect you.'
      });
    }

    // If at least one agent is available
    return res.json({
      ok: true,
      state: 'available',
      message: 'Connecting you to a human agent…'
    });
  } catch (err) {
    console.error('❌ Failed to request agent:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to request agent',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * POST /api/chat/end-session
 * End a chat session when user leaves
 * Sets conversation status to 'closed'
 */
exports.endSession = async (req, res) => {
  try {
    const { sessionId, botId } = req.body;

    // Validate input
    if (!sessionId || !botId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and botId are required'
      });
    }

    // Validate bot exists
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Get tenant context to load tenant database
    const tenantContext = await getUserTenantContext(bot.userId);
    if (!tenantContext.databaseUri) {
      return res.status(503).json({
        success: false,
        error: 'Tenant database not provisioned'
      });
    }

    // Load models from tenant database
    const { Conversation } = await getTenantModels(tenantContext.databaseUri);

    // Find conversation by sessionId and botId
    const conversation = await Conversation.findOne({ botId, sessionId });

    if (!conversation) {
      // No conversation found - this is ok, just return success
      return res.json({
        success: true,
        message: 'No active conversation to close'
      });
    }

    // Only close if not already closed
    if (conversation.status !== 'closed') {
      conversation.status = 'closed';
      conversation.endedAt = new Date();
      await conversation.save();

      console.log(`🔒 Session ended for conversation ${conversation._id} (session: ${sessionId})`);
    }

    res.json({
      success: true,
      message: 'Session ended successfully',
      conversation: {
        id: conversation._id,
        status: conversation.status,
        endedAt: conversation.endedAt
      }
    });
  } catch (err) {
    console.error('❌ Failed to end session:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to end session',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Export tenant connection helpers for use in other modules (e.g., server.js Socket.IO handlers)
// These are exported in addition to the main route handlers
exports.getTenantConnection = getTenantConnection;
exports.getTenantModels = getTenantModels;