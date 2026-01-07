// admin-backend/middleware/authenticateBotToken.js

const Bot = require('../models/Bot');

/**
 * Bot API Token authentication middleware
 * Validates bot API tokens for public widget embedding
 * Attaches authenticated bot to req.bot
 * 
 * This middleware is specifically for widget requests that use bot-scoped API tokens.
 * DO NOT use this for dashboard routes - use auth.js (JWT) instead.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateBotToken = async (req, res, next) => {
  try {
    // Extract token from 'Authorization: Bearer <token>' header
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'No authorization header provided',
        message: 'Bot API token is required for widget access',
        widgetError: true
      });
    }
    
    // Check if header follows 'Bearer <token>' format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ 
        error: 'Invalid authorization header format',
        message: 'Authorization header must be in format: Bearer <bot_api_token>',
        widgetError: true
      });
    }
    
    const token = parts[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: 'No token provided',
        message: 'Bot API token is missing',
        widgetError: true
      });
    }

    // Find bot by API token
    const bot = await Bot.findOne({ apiToken: token, isActive: true });
    
    if (!bot) {
      return res.status(401).json({ 
        error: 'Invalid bot token',
        message: 'Bot API token is invalid or bot is inactive',
        widgetError: true
      });
    }

    // Attach bot to request for use in controller
    req.bot = bot;
    req.authType = 'botToken';
    
    // Log bot-based authentication (production)
    if (process.env.NODE_ENV === 'production') {
      console.log(`🤖 Bot token authenticated: ${bot._id} (${req.method} ${req.path})`);
    }
    
    next();
  } catch (err) {
    console.error('❌ Bot token authentication error:', {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    
    return res.status(401).json({ 
      error: 'Authentication failed',
      message: 'Unable to authenticate bot token',
      widgetError: true
    });
  }
};

module.exports = authenticateBotToken;
