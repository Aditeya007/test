// admin-backend/models/Conversation.js

const mongoose = require('mongoose');

/**
 * Conversation Schema
 * Represents a chat conversation between a user and bot
 * Supports both AI and human agent modes for live chat handoff
 * 
 * Each conversation is uniquely identified by botId + sessionId
 */
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
      enum: ['ai', 'human'],
      default: 'ai',
      required: true
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
  {
    timestamps: false // We manage timestamps manually for better control
  }
);

// Compound index for unique conversation lookup
ConversationSchema.index({ botId: 1, sessionId: 1 }, { unique: true });

// Index for querying conversations by status
ConversationSchema.index({ status: 1, lastActiveAt: -1 });

// Update lastActiveAt before saving
ConversationSchema.pre('save', function(next) {
  this.lastActiveAt = new Date();
  next();
});

// Instance method to update activity timestamp
ConversationSchema.methods.updateActivity = function() {
  this.lastActiveAt = new Date();
  return this.save();
};

// Static method to find or create conversation
ConversationSchema.statics.findOrCreate = async function(botId, sessionId) {
  let conversation = await this.findOne({ botId, sessionId });
  
  if (!conversation) {
    conversation = new this({
      botId,
      sessionId,
      status: 'ai',
      createdAt: new Date(),
      lastActiveAt: new Date()
    });
    await conversation.save();
  } else {
    // Update activity timestamp
    await conversation.updateActivity();
  }
  
  return conversation;
};

module.exports = mongoose.model('Conversation', ConversationSchema);
