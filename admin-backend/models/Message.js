// admin-backend/models/Message.js

const mongoose = require('mongoose');

/**
 * Message Schema
 * Represents individual messages within a conversation
 * Supports messages from users, bots, and human agents
 */
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
      maxlength: 10000 // Limit message length
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    // Optional: Store sources for bot responses
    sources: {
      type: [String],
      default: undefined
    },
    // Optional: Store metadata (e.g., agent name, error info)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined
    }
  },
  {
    timestamps: false // We manage createdAt manually
  }
);

// Compound index for efficient conversation message retrieval
MessageSchema.index({ conversationId: 1, createdAt: 1 });

// Static method to get messages for a conversation
MessageSchema.statics.getConversationMessages = async function(conversationId, limit = 100) {
  return this.find({ conversationId })
    .sort({ createdAt: 1 }) // Oldest first
    .limit(limit)
    .select('sender text createdAt sources metadata')
    .lean();
};

// Static method to create and save a message
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

module.exports = mongoose.model('Message', MessageSchema);
