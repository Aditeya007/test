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
const PORT = process.env.PORT || 5000;

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

// API Routes
app.use('/api/auth', authRoutes);          // Register, login
app.use('/api/user', userRoutes);          // Current user info
app.use('/api/users', usersRoutes);        // Authenticated user management
app.use('/api/bot', botRoutes);            // Bot interaction endpoints
app.use('/api/scrape', scrapeRoutes);      // Scraper + updater triggers

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
// SERVER STARTUP
// =============================================================================
const server = app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log(`🚀 Admin Backend Server Started`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '⏳ Connecting...'}`);
  console.log(`🤖 FastAPI Bot URL: ${process.env.FASTAPI_BOT_URL || 'NOT SET'}`);
  console.log(`🛡️  CORS: ⚠️  OPEN TO ALL ORIGINS (*) - Widget embedding enabled`);
  console.log(`🔒 Security: Helmet enabled, Rate limiting active`);
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM signal received: closing HTTP server');
  
  // Wait for active jobs to complete
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
  
  server.close(async () => {
    console.log('✅ HTTP server closed');
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error closing MongoDB:', err.message);
      process.exit(1);
    }
  });
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT signal received: closing HTTP server');
  
  // Wait for active jobs to complete
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
  
  server.close(async () => {
    console.log('✅ HTTP server closed');
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error closing MongoDB:', err.message);
      process.exit(1);
    }
  });
});


