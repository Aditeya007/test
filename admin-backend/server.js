// admin-backend/server.js

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') }); // Loads secrets from .env in R2 root

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');              // Allow frontend calls (React dev server)
const helmet = require('helmet');          // Security headers
const rateLimit = require('express-rate-limit'); // Rate limiting
const dbConnect = require('./utils/db');   // Your MongoDB connection utility

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const usersRoutes = require('./routes/users');
const botRoutes = require('./routes/bot');
const scrapeRoutes = require('./routes/scrape');
const chatRoutes = require('./routes/chat');
const agentRoutes = require('./routes/agent');

// =============================================================================
// ENVIRONMENT VALIDATION - Ensure all critical variables are set
// =============================================================================
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'CORS_ORIGIN', 'FASTAPI_BOT_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ FATAL ERROR: Missing required environment variables:');
  missingEnvVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nPlease set the required values in your .env file.');
  process.exit(1);
}

const sharedSecret = process.env.FASTAPI_SHARED_SECRET;
if (!sharedSecret || sharedSecret.trim().toLowerCase() === 'change-me') {
  console.warn('⚠️  FASTAPI_SHARED_SECRET is not yet configured. Update it in .env to enforce secure bot communication.');
}

// Validate CORS_ORIGIN in production
if (process.env.NODE_ENV === 'production' && process.env.CORS_ORIGIN === '*') {
  const enableWidget = process.env.ENABLE_WIDGET === 'true';
  if (enableWidget) {
    console.warn('⚠️  WARNING: CORS_ORIGIN="*" in production with widget embedding enabled!');
    console.warn('   This allows ANY website to embed your widget.');
    console.warn('   Consider implementing per-user domain whitelisting for production.');
  } else {
    console.error('❌ FATAL ERROR: CORS_ORIGIN cannot be "*" in production without ENABLE_WIDGET=true!');
    console.error('   Set ENABLE_WIDGET=true to allow widget embedding, or set specific origins.');
    process.exit(1);
  }
}

const app = express();
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5000;

// Create single HTTP server for both Express and Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO on the same HTTP server
const io = new Server(server, {
  cors: {
    origin: '*', // Match Express CORS policy for widget embedding
    methods: ['GET', 'POST'],
    credentials: false
  },
  transports: ['websocket', 'polling'] // Support both for compatibility
});

console.log('🔌 Socket.IO server initialized on same HTTP server as Express');

// =============================================================================
// SOCKET.IO JWT AUTHENTICATION MIDDLEWARE
// =============================================================================
const jwt = require('jsonwebtoken');

// Add JWT authentication middleware to Socket.IO
// This middleware verifies the token in the handshake auth object
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.warn(`⚠️  Socket ${socket.id} attempted connection without token`);
      return next(new Error('Authentication error: No token provided'));
    }
    
    // Verify token with explicit algorithm specification
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'] // Prevent algorithm confusion attacks
    });
    
    // Attach decoded token info to socket object for later use
    socket.user = decoded;
    
    console.log(`✅ Socket ${socket.id} authenticated as user ${decoded.username || decoded._id}`);
    next();
  } catch (error) {
    console.error(`❌ Socket authentication error:`, error.message);
    next(new Error(`Authentication error: ${error.message}`));
  }
});

// =============================================================================
// TRUST PROXY CONFIGURATION
// =============================================================================
// Enable trust proxy when behind Nginx/reverse proxy
// This fixes express-rate-limit ERR_ERL_UNEXPECTED_X_FORWARDED_FOR error
// and allows proper IP detection from X-Forwarded-For header
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
  console.log('🔧 Trust proxy enabled for reverse proxy support');
}

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// Helmet: Set security-related HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding if needed for widgets
}));

// CORS: Allow all origins for embeddable widget
// ⚠️ SECURITY NOTE: This allows ANY website to embed your widget
// Recommended mitigations:
// - Implement per-user domain whitelisting in database
// - Require API key/token authentication in widget
// - Monitor usage and implement anomaly detection
// - Use rate limiting (already enabled)

app.use(cors({
  origin: '*', // Allow all origins for widget embedding
  credentials: false, // Must be false when origin is '*'
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-service-secret'],
  optionsSuccessStatus: 200
}));

// Log origins for monitoring (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    if (req.headers.origin) {
      console.log(`📡 Request from origin: ${req.headers.origin}`);
    }
    next();
  });
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));                   // Parse JSON requests with size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// General rate limiter for all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Much higher limit in development
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

app.use(generalLimiter);

// =============================================================================
// REQUEST LOGGING
// =============================================================================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${req.method} ${req.path}`;
  
  // Log different levels based on environment
  if (process.env.NODE_ENV === 'development') {
    console.log(`${logMessage} - IP: ${req.ip}`);
  } else {
    // Production: Log only to stdout (captured by logging services)
    console.log(logMessage);
  }
  next();
});

// =============================================================================
// DATABASE CONNECTION
// =============================================================================
dbConnect();

// API Routes (order matters: specific before chat)
app.use('/api/auth', authRoutes);          // Register, login
app.use('/api/user', userRoutes);          // Current user info
app.use('/api/users', usersRoutes);        // Authenticated user management
app.use('/api/bot', botRoutes);            // Bot interaction endpoints
app.use('/api/scrape', scrapeRoutes);      // Scraper + updater triggers
app.use('/api/agent', agentRoutes);        // Agent authentication and management
app.use('/api', chatRoutes);               // Chat conversation and message endpoints (mounted last)

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'admin-backend',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Admin Backend API',
    version: '1.0.0',
    endpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/user/me',
      'PUT /api/user/me',
  'GET /api/users',
  'POST /api/users',
  'PUT /api/users/:id',
  'DELETE /api/users/:id',
      'POST /api/bot/run',
      'POST /api/scrape/run',
      'POST /api/scrape/update',
      'GET /api/health'
    ]
  });
});

// =============================================================================
// ERROR HANDLERS
// =============================================================================

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Log error details server-side
  console.error('❌ Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  
  // Prepare error response
  const errorResponse = {
    error: process.env.NODE_ENV === 'production' 
      ? (statusCode === 500 ? 'Internal server error' : err.message)
      : err.message,
    status: statusCode
  };
  
  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details;
  }
  
  res.status(statusCode).json(errorResponse);
});

// =============================================================================
// SOCKET.IO EVENT HANDLERS
// =============================================================================
const Bot = require('./models/Bot');
const { getUserTenantContext } = require('./services/userContextService');
const botJob = require('./jobs/botJob');

// Import tenant models helper
async function getTenantConnection(databaseUri) {
  if (!databaseUri) {
    throw new Error('databaseUri is required for tenant database connection');
  }

  // Create new connection
  const conn = await mongoose.createConnection(databaseUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  }).asPromise();

  return conn;
}

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
      lastActiveAt: {
        type: Date,
        default: Date.now
      }
    },
    { timestamps: true }
  );

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
        required: true
      },
      sources: [{ type: String }],
      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      }
    },
    { timestamps: true }
  );

  // Add method to create message
  MessageSchema.statics.createMessage = async function(conversationId, sender, text, options = {}) {
    const message = new this({
      conversationId,
      sender,
      text,
      sources: options.sources || [],
      metadata: options.metadata || {},
      createdAt: options.createdAt || new Date()
    });
    await message.save();
    return message;
  };

  // Add method to update activity
  ConversationSchema.methods.updateActivity = async function() {
    this.lastActiveAt = new Date();
    await this.save();
  };

  const Conversation =
    connection.models.Conversation ||
    connection.model('Conversation', ConversationSchema);
  const Message =
    connection.models.Message ||
    connection.model('Message', MessageSchema);

  return { Conversation, Message };
}

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Handle joining a conversation room
  socket.on('join:conversation', (conversationId) => {
    if (!conversationId) {
      console.warn(`⚠️  Socket ${socket.id} attempted to join without conversationId`);
      return;
    }
    
    socket.join(conversationId);
    console.log(`📥 Socket ${socket.id} joined room: ${conversationId}`);
  });

  // Handle leaving a conversation room
  socket.on('leave:conversation', (conversationId) => {
    if (!conversationId) return;
    
    socket.leave(conversationId);
    console.log(`📤 Socket ${socket.id} left room: ${conversationId}`);
  });

  // Handle sending messages via Socket.IO (NEW)
  socket.on('message:send', async (payload) => {
    try {
      console.log(`📨 Received message:send from ${socket.id}:`, payload);

      const { conversationId, message, sender, botId, sessionId } = payload;

      // Validate required fields
      if (!conversationId || !message || !sender) {
        console.error('❌ Invalid message:send payload - missing required fields');
        socket.emit('message:error', { error: 'Missing required fields: conversationId, message, sender' });
        return;
      }

      // Validate sender type
      if (!['user', 'agent'].includes(sender)) {
        console.error('❌ Invalid sender type:', sender);
        socket.emit('message:error', { error: 'Invalid sender type. Must be "user" or "agent"' });
        return;
      }

      // Sanitize message
      const sanitizedMessage = message.trim();
      if (!sanitizedMessage) {
        console.error('❌ Empty message after sanitization');
        socket.emit('message:error', { error: 'Message cannot be empty' });
        return;
      }

      // For user messages, we need botId
      if (sender === 'user' && !botId) {
        console.error('❌ Missing botId for user message');
        socket.emit('message:error', { error: 'botId is required for user messages' });
        return;
      }

      // Load bot and tenant context
      const bot = await Bot.findById(botId);
      if (!bot) {
        console.error('❌ Bot not found:', botId);
        socket.emit('message:error', { error: 'Bot not found' });
        return;
      }

      if (!bot.isActive) {
        console.error('❌ Bot is inactive:', botId);
        socket.emit('message:error', { error: 'Bot is inactive' });
        return;
      }

      // Get tenant context
      const tenantContext = await getUserTenantContext(bot.userId);
      if (!tenantContext.databaseUri) {
        console.error('❌ Tenant database not provisioned');
        socket.emit('message:error', { error: 'Tenant database not provisioned' });
        return;
      }

      // Load tenant models
      const { Conversation, Message } = await getTenantModels(tenantContext.databaseUri);

      // Find conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        console.error('❌ Conversation not found:', conversationId);
        socket.emit('message:error', { error: 'Conversation not found' });
        return;
      }

      // Save the incoming message (user or agent)
      const savedMessage = await Message.createMessage(
        conversationId,
        sender,
        sanitizedMessage
      );

      // Update conversation activity
      await conversation.updateActivity();

      console.log(`💬 ${sender} message saved for conversation ${conversationId}`);

      // Emit the saved message to all clients in the conversation room
      io.to(conversationId).emit('message:new', {
        _id: savedMessage._id,
        conversationId: conversationId,
        sender: sender,
        text: sanitizedMessage,
        createdAt: savedMessage.createdAt
      });

      console.log(`📡 Emitted ${sender} message to conversation:${conversationId}`);

      // Handle bot response for user messages
      if (sender === 'user') {
        // Check if agent is actively handling this conversation
        if (conversation.status === 'active' && conversation.assignedAgent) {
          console.log(`👤 Conversation ${conversationId} in active agent mode - no bot response`);
          // Agent will respond manually - no bot action needed
          return;
        }

        // Check if in human-only mode
        if (conversation.status === 'human') {
          console.log(`👤 Conversation ${conversationId} in human mode - sending placeholder`);
          
          const agentMessage = 'A human agent will join shortly.';
          const placeholderMessage = await Message.createMessage(
            conversationId,
            'agent',
            agentMessage
          );

          await conversation.updateActivity();

          io.to(conversationId).emit('message:new', {
            _id: placeholderMessage._id,
            conversationId: conversationId,
            sender: 'agent',
            text: agentMessage,
            createdAt: placeholderMessage.createdAt
          });

          console.log(`📡 Emitted placeholder message to conversation:${conversationId}`);
          return;
        }

        // AI mode - forward to bot
        try {
          if (!bot.vectorStorePath) {
            throw new Error('Bot vector store not initialized');
          }

          console.log(`🧠 Forwarding message to RAG bot for conversation ${conversationId}`);

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
            { sessionId: sessionId || conversation.sessionId }
          );

          // Save bot response
          const botMessage = await Message.createMessage(
            conversationId,
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

          await conversation.updateActivity();

          console.log(`🤖 Bot response saved for conversation ${conversationId}`);

          // Emit bot response to conversation room
          io.to(conversationId).emit('message:new', {
            _id: botMessage._id,
            conversationId: conversationId,
            sender: 'bot',
            text: botResult.answer,
            createdAt: botMessage.createdAt,
            sources: botResult.sources
          });

          console.log(`📡 Emitted bot message to conversation:${conversationId}`);

        } catch (botError) {
          console.error(`❌ Bot error for conversation ${conversationId}:`, botError.message);

          // Save and emit error message
          const errorMessage = 'I apologize, but I encountered an error processing your request. Please try again.';
          const errorMsg = await Message.createMessage(
            conversationId,
            'bot',
            errorMessage,
            { metadata: { error: true, errorMessage: botError.message } }
          );

          await conversation.updateActivity();

          io.to(conversationId).emit('message:new', {
            _id: errorMsg._id,
            conversationId: conversationId,
            sender: 'bot',
            text: errorMessage,
            createdAt: errorMsg.createdAt,
            isError: true
          });

          console.log(`📡 Emitted error message to conversation:${conversationId}`);
        }
      }

    } catch (error) {
      console.error('❌ Error handling message:send:', error);
      socket.emit('message:error', { 
        error: 'Failed to process message',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// Export io instance for use in controllers
app.locals.io = io;

// =============================================================================
// SERVER STARTUP - Single server for Express + Socket.IO
// =============================================================================
server.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log(`🚀 Admin Backend Server Started`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '⏳ Connecting...'}`);
  console.log(`🤖 FastAPI Bot URL: ${process.env.FASTAPI_BOT_URL || 'NOT SET'}`);
  console.log(`🛡️  CORS: ⚠️  OPEN TO ALL ORIGINS (*) - Widget embedding enabled`);
  console.log(`🔒 Security: Helmet enabled, Rate limiting active`);
  console.log(`💬 Socket.IO: Real-time messaging enabled on same port`);
  console.log('='.repeat(70));
  
  // Warn if critical optional configs are missing
  if (!process.env.FASTAPI_BOT_URL) {
    console.warn('⚠️  WARNING: FASTAPI_BOT_URL not set. Bot endpoints will fail.');
  }
});

// Track active Python jobs to prevent shutdown during execution
let activeJobCount = 0;

const incrementActiveJobs = () => {
  activeJobCount++;
  console.log(`📊 Active jobs: ${activeJobCount}`);
};

const decrementActiveJobs = () => {
  activeJobCount = Math.max(0, activeJobCount - 1);
  console.log(`📊 Active jobs: ${activeJobCount}`);
};

const getActiveJobCount = () => activeJobCount;

// Export for use in controllers
app.locals.jobTracking = {
  incrementActiveJobs,
  decrementActiveJobs,
  getActiveJobCount
};

// =============================================================================
// GRACEFUL SHUTDOWN HANDLER
// =============================================================================
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    console.log(`⚠️  Shutdown already in progress, ignoring ${signal}`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n🛑 ${signal} signal received: initiating graceful shutdown`);
  
  // Step 1: Wait for active jobs to complete
  if (activeJobCount > 0) {
    console.log(`⏳ Waiting for ${activeJobCount} active job(s) to complete...`);
    const maxWaitTime = 60000; // 60 seconds
    const startTime = Date.now();
    
    while (activeJobCount > 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (activeJobCount > 0) {
      console.warn(`⚠️  Forcing shutdown with ${activeJobCount} job(s) still running`);
    } else {
      console.log('✅ All jobs completed');
    }
  }
  
  // Step 2: Close HTTP server (stop accepting new connections)
  await new Promise((resolve) => {
    server.close(() => {
      console.log('✅ HTTP server closed');
      resolve();
    });
  });
  
  // Step 3: Close MongoDB connection (outside server.close callback)
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error closing MongoDB:', err.message);
    process.exit(1);
  }
};

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));


