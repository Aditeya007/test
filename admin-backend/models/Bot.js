// admin-backend/models/Bot.js

const mongoose = require('mongoose');
const crypto = require('crypto');

const botSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  vectorStorePath: {
    type: String,
    required: true
  },
  apiToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  scrapedWebsites: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Scheduler state (per-bot)
  schedulerPid: {
    type: Number,
    default: null
  },
  schedulerStatus: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'inactive'
  },
  schedulerConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Generate API token before saving
botSchema.pre('save', function(next) {
  if (!this.apiToken) {
    this.apiToken = crypto.randomBytes(32).toString('hex');
  }
  this.updatedAt = Date.now();
  next();
});

// Method to regenerate API token
botSchema.methods.regenerateApiToken = function() {
  this.apiToken = crypto.randomBytes(32).toString('hex');
  return this.save();
};

module.exports = mongoose.model('Bot', botSchema);
