// admin-backend/middleware/authenticateAgent.js

const jwt = require('jsonwebtoken');

/**
 * Agent authentication middleware
 * Verifies agent JWT token and attaches agent info to request object
 * This is separate from regular user/admin auth
 * 
 * Token payload structure:
 * {
 *   role: "agent",
 *   agentId: <agent_id>,
 *   tenantId: <user_id>,
 *   username: <agent_username>
 * }
 * 
 * Usage: router.get('/agent-protected', authenticateAgent, controller.method)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateAgent = (req, res, next) => {
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
    
    // Verify this is an agent token (not admin/user)
    if (decoded.role !== 'agent') {
      return res.status(403).json({ 
        error: 'Invalid token type',
        message: 'This endpoint requires agent authentication'
      });
    }
    
    // Attach agent info to request object for use in controllers
    req.agent = {
      id: decoded.agentId,
      username: decoded.username,
      tenantId: decoded.tenantId,
      role: decoded.role
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
