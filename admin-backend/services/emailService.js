// admin-backend/services/emailService.js

const nodemailer = require('nodemailer');

/**
 * Email Service for sending lead notifications
 * Supports SMTP configuration via environment variables
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter from environment configuration
   */
  initializeTransporter() {
    // Check if SMTP is configured
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    const smtpFromEmail = process.env.SMTP_FROM_EMAIL;

    // If no SMTP configured, log warning but don't fail
    if (!smtpHost || !smtpPort) {
      console.warn('⚠️ Email Service: SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL');
      return;
    }

    try {
      const config = {
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: smtpPort == 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPassword
        }
      };

      this.transporter = nodemailer.createTransport(config);
      this.fromEmail = smtpFromEmail || smtpUser;
      console.log(`✅ Email Service initialized: ${smtpHost}:${smtpPort}`);
    } catch (err) {
      console.error('❌ Failed to initialize email transporter:', err.message);
    }
  }

  /**
   * Send a lead notification email
   * @param {Object} leadData - Lead information { name, phone, email, original_question, session_id, created_at, website_url }
   * @param {string} recipientEmail - Recipient email address
   * @returns {Promise<boolean>} - True if email sent, false otherwise
   */
  async sendLeadEmail(leadData, recipientEmail) {
    // If SMTP not configured, silently skip (as per requirements)
    if (!this.transporter) {
      console.log(`ℹ️ Email Service disabled - skipping lead delivery for session ${leadData.session_id}`);
      return false;
    }

    // Validate recipient email
    if (!recipientEmail || !this.isValidEmail(recipientEmail)) {
      console.warn(`⚠️ Invalid recipient email: ${recipientEmail}`);
      return false;
    }

    try {
      // Build email subject
      const websiteUrl = leadData.website_url || 'Your Website';
      const subject = `New Lead from ${websiteUrl}`;

      // Format lead data
      const name = leadData.name || '(Not provided)';
      const phone = leadData.phone || '(Not provided)';
      const email = leadData.email || '(Not provided)';
      const question = leadData.original_question || '(No question recorded)';
      const sessionId = leadData.session_id || '(Unknown)';
      const timestamp = leadData.created_at 
        ? new Date(leadData.created_at).toLocaleString()
        : new Date().toLocaleString();

      // Build email body
      const htmlBody = `
        <h2>New Lead Submission</h2>
        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr style="border: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold; width: 150px; background-color: #f5f5f5;">Name:</td>
            <td style="padding: 8px;">${this.escapeHtml(name)}</td>
          </tr>
          <tr style="border: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold; background-color: #f5f5f5;">Phone:</td>
            <td style="padding: 8px;">${this.escapeHtml(phone)}</td>
          </tr>
          <tr style="border: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold; background-color: #f5f5f5;">Email:</td>
            <td style="padding: 8px;">${this.escapeHtml(email)}</td>
          </tr>
          <tr style="border: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold; background-color: #f5f5f5;">Original Question:</td>
            <td style="padding: 8px;">${this.escapeHtml(question)}</td>
          </tr>
          <tr style="border: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold; background-color: #f5f5f5;">Session ID:</td>
            <td style="padding: 8px; font-family: monospace;">${this.escapeHtml(sessionId)}</td>
          </tr>
          <tr style="border: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold; background-color: #f5f5f5;">Time:</td>
            <td style="padding: 8px;">${timestamp}</td>
          </tr>
        </table>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          This lead was submitted through your RAG chatbot widget.
        </p>
      `;

      const textBody = `
New Lead Submission

Name: ${name}
Phone: ${phone}
Email: ${email}
Original Question: ${question}
Session ID: ${sessionId}
Time: ${timestamp}

This lead was submitted through your RAG chatbot widget.
      `;

      // Send email
      const mailOptions = {
        from: this.fromEmail,
        to: recipientEmail,
        subject: subject,
        html: htmlBody,
        text: textBody
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Lead email sent successfully to ${recipientEmail} (Message ID: ${info.messageId})`);
      return true;

    } catch (err) {
      console.error(`❌ Failed to send lead email to ${recipientEmail}:`, err.message);
      return false;
    }
  }

  /**
   * Send a batch lead notification email (used by cron job)
   * @param {Object} emailContent - Email content { subject, htmlBody, textBody }
   * @param {string} recipientEmail - Recipient email address
   * @param {string} websiteName - Website name for display
   * @returns {Promise<boolean>} - True if email sent, false otherwise
   */
  async sendBatchLeadEmail(emailContent, recipientEmail, websiteName) {
    // If SMTP not configured, silently skip
    if (!this.transporter) {
      console.log(`ℹ️ Email Service disabled - skipping batch lead delivery to ${recipientEmail}`);
      return false;
    }

    // Validate recipient email
    if (!recipientEmail || !this.isValidEmail(recipientEmail)) {
      console.warn(`⚠️ Invalid recipient email: ${recipientEmail}`);
      return false;
    }

    try {
      // Send email
      const mailOptions = {
        from: this.fromEmail,
        to: recipientEmail,
        subject: emailContent.subject,
        html: emailContent.htmlBody,
        text: emailContent.textBody
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Batch lead email sent successfully to ${recipientEmail} (Message ID: ${info.messageId})`);
      return true;

    } catch (err) {
      console.error(`❌ Failed to send batch lead email to ${recipientEmail}:`, err.message);
      return false;
    }
  }

  /**
   * Validate email format
   * @param {string} email - Email address to validate
   * @returns {boolean} - True if valid email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Escape HTML special characters to prevent injection
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
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
    return text.replace(/[&<>"']/g, char => map[char]);
  }

  /**
   * Send password reset email
   * @param {string} recipientEmail - Recipient email address
   * @param {string} resetToken - Password reset token
   * @param {string} userName - User's name for personalization
   * @returns {Promise<boolean>} - True if email sent, false otherwise
   */
  async sendPasswordResetEmail(recipientEmail, resetToken, userName) {
    // If SMTP not configured, silently skip
    if (!this.transporter) {
      console.log(`ℹ️ Email Service disabled - skipping password reset email to ${recipientEmail}`);
      return false;
    }

    // Validate recipient email
    if (!recipientEmail || !this.isValidEmail(recipientEmail)) {
      console.warn(`⚠️ Invalid recipient email: ${recipientEmail}`);
      return false;
    }

    try {
      // Get frontend URL from environment or use default
      const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000';
      const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

      const subject = 'Password Reset Request';
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hello ${this.escapeHtml(userName || 'User')},</p>
          <p>You have requested to reset your password. Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666; font-size: 12px;">${resetUrl}</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
          </p>
        </div>
      `;

      const textBody = `
Password Reset Request

Hello ${userName || 'User'},

You have requested to reset your password. Click the link below to reset your password:

${resetUrl}

This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
      `;

      const mailOptions = {
        from: this.fromEmail,
        to: recipientEmail,
        subject: subject,
        html: htmlBody,
        text: textBody
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Password reset email sent successfully to ${recipientEmail} (Message ID: ${info.messageId})`);
      return true;

    } catch (err) {
      console.error(`❌ Failed to send password reset email to ${recipientEmail}:`, err.message);
      return false;
    }
  }

  /**
   * Verify SMTP connection
   * @returns {Promise<boolean>} - True if connection successful
   */
  async verifyConnection() {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ SMTP connection verified');
      return true;
    } catch (err) {
      console.error('❌ SMTP connection failed:', err.message);
      return false;
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;
