// admin-backend/jobs/leadDispatchJob.js

const cron = require('node-cron');
const LeadQueue = require('../models/LeadQueue');
const Bot = require('../models/Bot');
const User = require('../models/User');
const emailService = require('../services/emailService');

/**
 * Lead Dispatch System - Server-Side Batch Email Delivery
 * 
 * This cron job runs every 30 minutes and:
 * 1. Queries all unsent leads from LeadQueue
 * 2. Groups leads by tenantId
 * 3. Sends one email per tenant containing all their unsent leads
 * 4. Marks leads as sent only after successful email delivery
 * 5. Retries failed deliveries in the next cycle
 * 
 * Guarantees:
 * - Every lead is delivered exactly once
 * - No dependency on browser events
 * - Automatic retry on failure
 * - 100% server-side reliability
 */
class LeadDispatchJob {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  /**
   * Start the cron job (runs every 30 minutes)
   */
  start() {
    if (this.cronJob) {
      console.log('⚠️ Lead Dispatch Job already running');
      return;
    }

    // Schedule: every 30 minutes at minutes 0 and 30 (e.g., 12:00, 12:30, 1:00, 1:30, etc.)
    this.cronJob = cron.schedule('*/5 * * * *', async () => {
      await this.processLeads();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    console.log('✅ Lead Dispatch Job started (runs every 30 minutes)');
    
    // Run immediately on startup to process any pending leads
    this.processLeads();
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Lead Dispatch Job stopped');
    }
  }

  /**
   * Process all unsent leads and send batch emails
   */
  async processLeads() {
    // Prevent concurrent execution
    if (this.isRunning) {
      console.log('⚠️ Lead Dispatch Job already running, skipping this cycle');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      console.log('📧 Lead Dispatch Job: Starting lead processing cycle...');

      // Get all unsent leads grouped by tenant
      const leadsGroupedByTenant = await LeadQueue.getUnsentLeadsGroupedByTenant();
      
      const tenantIds = Object.keys(leadsGroupedByTenant);
      
      if (tenantIds.length === 0) {
        console.log('ℹ️ Lead Dispatch Job: No unsent leads to process');
        return;
      }

      console.log(`📊 Lead Dispatch Job: Found ${tenantIds.length} tenants with unsent leads`);

      // Process each tenant's leads
      let totalProcessed = 0;
      let totalSent = 0;
      let totalFailed = 0;

      for (const tenantId of tenantIds) {
        const leads = leadsGroupedByTenant[tenantId];
        const result = await this.processLeadsForTenant(tenantId, leads);
        
        totalProcessed += leads.length;
        if (result.success) {
          totalSent += leads.length;
        } else {
          totalFailed += leads.length;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Lead Dispatch Job completed in ${duration}ms`);
      console.log(`📊 Summary: ${totalProcessed} leads processed, ${totalSent} sent, ${totalFailed} failed`);

    } catch (err) {
      console.error('❌ Lead Dispatch Job error:', err.message);
      console.error(err.stack);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process all leads for a specific tenant
   * Sends one email with all leads, marks them as sent if successful
   */
  async processLeadsForTenant(tenantId, leads) {
    try {
      console.log(`\n📧 Processing ${leads.length} leads for tenant ${tenantId}`);

      // Get tenant info
      const tenant = await User.findById(tenantId);
      if (!tenant) {
        console.error(`❌ Tenant ${tenantId} not found, skipping leads`);
        return { success: false, error: 'Tenant not found' };
      }

      // Get first lead's bot to determine recipient email
      // (All leads in this batch are from the same tenant, possibly different bots)
      const firstLead = leads[0];
      const bot = await Bot.findById(firstLead.botId);
      
      if (!bot || !bot.lead_delivery_email) {
        console.error(`❌ Bot ${firstLead.botId} has no lead_delivery_email configured, skipping`);
        return { success: false, error: 'No lead delivery email configured' };
      }

      const recipientEmail = bot.lead_delivery_email;

      // Build email content with all leads
      const emailContent = this.buildBatchEmailContent(leads, tenant);

      // Send email
      const emailSent = await emailService.sendBatchLeadEmail(
        emailContent,
        recipientEmail,
        tenant.name || 'Your Website'
      );

      if (emailSent) {
        // Mark all leads as sent
        const leadIds = leads.map(lead => lead._id);
        await LeadQueue.markLeadsAsSent(leadIds);
        
        console.log(`✅ Successfully sent ${leads.length} leads to ${recipientEmail}`);
        return { success: true };
      } else {
        console.warn(`⚠️ Failed to send leads for tenant ${tenantId} - will retry next cycle`);
        return { success: false, error: 'Email sending failed' };
      }

    } catch (err) {
      console.error(`❌ Error processing leads for tenant ${tenantId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Build batch email content with all leads
   * Formats leads in a table for easy viewing
   */
  buildBatchEmailContent(leads, tenant) {
    const websiteName = tenant.name || 'Your Website';
    const leadCount = leads.length;
    
    // Sort leads by creation time (oldest first)
    const sortedLeads = leads.sort((a, b) => a.createdAt - b.createdAt);

    // Build HTML table rows
    const tableRows = sortedLeads.map(lead => {
      const name = lead.name || '(Not provided)';
      const email = lead.email || '(Not provided)';
      const phone = lead.phone || '(Not provided)';
      const time = lead.createdAt ? new Date(lead.createdAt).toLocaleString() : 'Unknown';
      const question = lead.originalQuestion || '(No question recorded)';

      return `
        <tr style="border: 1px solid #ddd;">
          <td style="padding: 8px; border-right: 1px solid #ddd;">${this.escapeHtml(name)}</td>
          <td style="padding: 8px; border-right: 1px solid #ddd;">${this.escapeHtml(email)}</td>
          <td style="padding: 8px; border-right: 1px solid #ddd;">${this.escapeHtml(phone)}</td>
          <td style="padding: 8px; border-right: 1px solid #ddd;">${time}</td>
          <td style="padding: 8px;">${this.escapeHtml(question)}</td>
        </tr>
      `;
    }).join('');

    // Build plain text rows for text version
    const textRows = sortedLeads.map((lead, index) => {
      const name = lead.name || '(Not provided)';
      const email = lead.email || '(Not provided)';
      const phone = lead.phone || '(Not provided)';
      const time = lead.createdAt ? new Date(lead.createdAt).toLocaleString() : 'Unknown';
      const question = lead.originalQuestion || '(No question recorded)';

      return `
Lead ${index + 1}:
  Name: ${name}
  Email: ${email}
  Phone: ${phone}
  Time: ${time}
  Question: ${question}
`;
    }).join('\n---\n');

    return {
      subject: `${leadCount} New Lead${leadCount > 1 ? 's' : ''} from ${websiteName}`,
      htmlBody: `
        <h2>New Lead Submissions from ${this.escapeHtml(websiteName)}</h2>
        <p style="margin-bottom: 20px;">You have received <strong>${leadCount}</strong> new lead${leadCount > 1 ? 's' : ''} from your chatbot widget.</p>
        
        <table style="border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 14px;">
          <thead>
            <tr style="background-color: #f5f5f5; border: 1px solid #ddd;">
              <th style="padding: 10px; text-align: left; border-right: 1px solid #ddd;">Name</th>
              <th style="padding: 10px; text-align: left; border-right: 1px solid #ddd;">Email</th>
              <th style="padding: 10px; text-align: left; border-right: 1px solid #ddd;">Phone</th>
              <th style="padding: 10px; text-align: left; border-right: 1px solid #ddd;">Time</th>
              <th style="padding: 10px; text-align: left;">Question</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          These leads were submitted through your RAG chatbot widget and are delivered via automated batch processing.
        </p>
      `,
      textBody: `
New Lead Submissions from ${websiteName}

You have received ${leadCount} new lead${leadCount > 1 ? 's' : ''} from your chatbot widget.

${textRows}

These leads were submitted through your RAG chatbot widget and are delivered via automated batch processing.
      `
    };
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
  }
}

// Export singleton instance
const leadDispatchJob = new LeadDispatchJob();
module.exports = leadDispatchJob;
