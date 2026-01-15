// admin-backend/models/LeadQueue.js

const mongoose = require('mongoose');

/**
 * LeadQueue Schema - Server-side lead dispatch queue
 * 
 * This collection stores all lead submissions from users.
 * A cron job processes unsent leads periodically and sends batch emails to tenants.
 * 
 * Design guarantees:
 * - Every lead is persisted immediately when submitted
 * - No dependency on browser events (tab close, unload, etc.)
 * - Leads are delivered exactly once via server-side cron job
 * - Failed deliveries are automatically retried
 */
const LeadQueueSchema = new mongoose.Schema(
  {
    // Tenant identification
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    
    // Bot identification
    botId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bot',
      required: true,
      index: true
    },
    
    // Conversation tracking
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null
    },
    
    // Session identification (from Python bot)
    sessionId: {
      type: String,
      required: true,
      index: true
    },
    
    // Lead information
    name: {
      type: String,
      default: null,
      trim: true
    },
    
    email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true
    },
    
    phone: {
      type: String,
      default: null,
      trim: true
    },
    
    // Original question/context
    originalQuestion: {
      type: String,
      default: null,
      trim: true
    },
    
    // Delivery tracking
    sent: {
      type: Boolean,
      default: false,
      index: true
    },
    
    sentAt: {
      type: Date,
      default: null
    },
    
    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false, // We manage createdAt manually
    collection: 'leadqueues'
  }
);

// Indexes for efficient querying
LeadQueueSchema.index({ sent: 1, createdAt: -1 }); // For cron job queries
LeadQueueSchema.index({ tenantId: 1, sent: 1 }); // For grouping by tenant
LeadQueueSchema.index({ sessionId: 1 }, { unique: true }); // Prevent duplicate submissions

// Static method: Create or update a lead in the queue
LeadQueueSchema.statics.queueLead = async function(leadData) {
  const { tenantId, botId, conversationId, sessionId, name, email, phone, originalQuestion } = leadData;
  
  // Use findOneAndUpdate with upsert to prevent duplicates
  const lead = await this.findOneAndUpdate(
    { sessionId }, // Find by sessionId
    {
      $set: {
        tenantId,
        botId,
        conversationId,
        name,
        email,
        phone,
        originalQuestion,
        createdAt: new Date()
      },
      $setOnInsert: {
        sent: false,
        sentAt: null
      }
    },
    {
      upsert: true, // Create if doesn't exist
      new: true, // Return updated document
      setDefaultsOnInsert: true
    }
  );
  
  console.log(`✅ Lead queued for session ${sessionId} (tenantId: ${tenantId})`);
  return lead;
};

// Static method: Get all unsent leads grouped by tenant
LeadQueueSchema.statics.getUnsentLeadsGroupedByTenant = async function() {
  const unsentLeads = await this.find({ sent: false }).sort({ createdAt: 1 });
  
  // Group by tenantId
  const groupedByTenant = {};
  for (const lead of unsentLeads) {
    const tenantIdStr = lead.tenantId.toString();
    if (!groupedByTenant[tenantIdStr]) {
      groupedByTenant[tenantIdStr] = [];
    }
    groupedByTenant[tenantIdStr].push(lead);
  }
  
  return groupedByTenant;
};

// Static method: Mark leads as sent
LeadQueueSchema.statics.markLeadsAsSent = async function(leadIds) {
  const result = await this.updateMany(
    { _id: { $in: leadIds } },
    {
      $set: {
        sent: true,
        sentAt: new Date()
      }
    }
  );
  
  console.log(`✅ Marked ${result.modifiedCount} leads as sent`);
  return result;
};

const LeadQueue = mongoose.model('LeadQueue', LeadQueueSchema);

module.exports = LeadQueue;
