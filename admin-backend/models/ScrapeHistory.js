// admin-backend/models/ScrapeHistory.js

const mongoose = require('mongoose');

const scrapeHistorySchema = new mongoose.Schema({
  botId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bot',
    required: true,
    index: true
  },
  trigger: {
    type: String,
    enum: ['manual', 'scheduler'],
    required: true
  },
  success: {
    type: Boolean,
    required: true
  },
  completedAt: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: false // We manually manage completedAt
});

// Compound index for efficient queries
scrapeHistorySchema.index({ botId: 1, completedAt: -1 });

module.exports = mongoose.model('ScrapeHistory', scrapeHistorySchema);
