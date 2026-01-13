// admin-backend/middleware/authenticateAgent.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const mongoose = require('mongoose');
const AgentSchema = require('../models/Agent');

// Cache for tenant database connections
const tenantConnections = new Map();

/**
 * Get or create a connection to the tenant's database
 */
const getTenantConnection = async (databaseUri) => {
  if (!databaseUri) {
    throw new Error('databaseUri is required for tenant database connection');
  }

  if (tenantConnections.has(databaseUri)) {
    return tenantConnections.get(databaseUri);
  }

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
  
  if (tenantDB.models.Agent) {
    return tenantDB.models.Agent;
  }
  
  return tenantDB.model('Agent', AgentSchema);
};

/**
 * Agent authentication middleware
 * Verifies agent JWT token and attaches agent info to request object
 * This is separate from regular user/admin auth
 * 
 * Token payload structure:
 * {
 *   agentId: <agent_id>,
 *   username: <agent_username>,
 *   tenantId: <user_id>
 * }
 * 
 * Usage: router.get('/agent-protected', authenticateAgent, controller.method)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateAgent = async (req, res, next) => {
  try {
    // Extract token from 'Authorization: Bearer <token>' header
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'No authorization header provided',
        message: 'Please provide a valid authentication token'
      });
    }
    
    // Check if header follows 'Bearer <token>' format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ 
        error: 'Invalid authorization header format',
        message: 'Authorization header must be in format: Bearer <token>'
      });
    }
    
    const token = parts[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: 'No token provided',
        message: 'Authentication token is missing'
      });
    }

    // Verify token with explicit algorithm specification
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'] // Prevent algorithm confusion attacks
    });
    
    // Validate required JWT fields
    if (!decoded.agentId || !decoded.tenantId) {
      return res.status(403).json({ 
        error: 'Invalid token payload',
        message: 'Token is missing required agent information'
      });
    }
    
    // Resolve tenant directly from JWT tenantId
    const tenant = await User.findById(decoded.tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: 'Unable to resolve tenant for this agent'
      });
    }
    
    // Get agent from tenant database
    const Agent = await getAgentModel(tenant.databaseUri);
    const agent = await Agent.findById(decoded.agentId);
    
    if (!agent) {
      return res.status(401).json({
        error: 'Agent not found',
        message: 'Invalid agent credentials'
      });
    }
    
    // Attach agent info to request object for use in controllers
    req.agent = {
      agentId: decoded.agentId,
      tenantId: decoded.tenantId,
      username: decoded.username
    };
    
    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Authentication token is invalid or malformed'
      });
    }
    
    // Generic error
    console.error('Agent authentication error:', error);
    return res.status(500).json({ 
      error: 'Authentication failed',
      message: 'An error occurred during authentication'
    });
  }
};

module.exports = authenticateAgent;
