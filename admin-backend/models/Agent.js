// admin-backend/models/Agent.js

const mongoose = require('mongoose');

/**
 * Agent Schema
 * Represents a human agent in a tenant's database
 * 
 * Security notes:
 * - Agents only exist in tenant databases (rag_<username>_<id>)
 * - Agents are NOT stored in the admin database
 * - Passwords are hashed with bcrypt
 * - Each tenant can have multiple agents (limited by maxAgents)
 */
const AgentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true, // Unique per tenant database
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required']
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      match: [/^[+]?[\d\s()-]*$/, 'Please provide a valid phone number']
    },
    isActive: {
      type: Boolean,
      default: true
    },
    status: {
      type: String,
      enum: ['offline', 'available', 'busy'],
      default: 'offline'
    }
  },
  {
    timestamps: true, // Auto-manages createdAt/updatedAt fields
    collection: 'agents' // Explicit collection name
  }
);

// Indexes for performance
AgentSchema.index({ username: 1 }, { unique: true });
AgentSchema.index({ email: 1 });
AgentSchema.index({ isActive: 1 });
AgentSchema.index({ createdAt: -1 });

// Instance method to get public profile (exclude passwordHash)
AgentSchema.methods.toPublicProfile = function() {
  return {
    id: this._id,
    username: this.username,
    name: this.name,
    email: this.email,
    phone: this.phone,
    isActive: this.isActive,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Static method to find active agents
AgentSchema.statics.findActiveAgents = function() {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

// Export for use in controllers
module.exports = AgentSchema;
