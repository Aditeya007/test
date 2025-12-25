// admin-backend/utils/db.js

const mongoose = require('mongoose');

/**
 * Database Connection Utility
 * 
 * Establishes connection to MongoDB with error handling,
 * reconnection logic, and graceful shutdown handling.
 * 
 * Environment Variables:
 * - MONGO_URI: MongoDB connection string (required)
 */

// Read MongoDB URI from environment variables
const MONGO_URI = process.env.MONGO_URI;

// Validate that MONGO_URI is set
if (!MONGO_URI) {
  throw new Error('❌ MONGO_URI not found in environment variables! Cannot connect to database.');
}

/**
 * Connect to MongoDB with retry logic
 * Mongoose handles reconnection automatically, but we log connection events
 */
const dbConnect = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    
    // Connection options
    const options = {
      // Connection pooling (adjust based on your load)
      maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE) || 20,
      minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE) || 5,
      
      // Timeouts
      serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_TIMEOUT) || 10000, // 10 seconds
      socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT) || 45000, // 45 seconds
      
      // Buffering (false = throw error if not connected)
      bufferCommands: false,
      
      // Automatic index creation (disable in production for performance)
      autoIndex: process.env.NODE_ENV !== 'production',
    };
    
    await mongoose.connect(MONGO_URI, options);
    
    console.log('✅ MongoDB connection established!');
    console.log(`   Database: ${mongoose.connection.name}`);
    console.log(`   Host: ${mongoose.connection.host}`);
    
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', {
      message: err.message,
      code: err.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    
    // Provide helpful error messages for common issues
    if (err.message.includes('authentication failed')) {
      console.error('   💡 Check your MongoDB username and password in MONGO_URI');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('ETIMEDOUT')) {
      console.error('   💡 Check your MongoDB host/connection string and network connectivity');
    } else if (err.message.includes('IP') || err.message.includes('whitelist')) {
      console.error('   💡 Add your server IP to MongoDB IP whitelist (if using Atlas)');
    }
    
    // Fatal exit - cannot run without database
    process.exit(1);
  }
};

// Connection event listeners for monitoring
mongoose.connection.on('connected', () => {
  console.log('📊 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  Mongoose disconnected from MongoDB');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 Mongoose reconnected to MongoDB');
});

// NOTE: Graceful shutdown and signal handlers are managed in server.js
// This utility is responsible ONLY for establishing the MongoDB connection

module.exports = dbConnect;
