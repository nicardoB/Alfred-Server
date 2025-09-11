import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';
import { costTracker } from './CostTracker.js';

/**
 * Email notification system for cost monitoring
 * Sends monthly reports and threshold alerts
 */
export class EmailNotifier {
  constructor() {
    this.transporter = null;
    this.setupTransporter();
    
    // Cost thresholds (USD)
    this.thresholds = {
      daily: parseFloat(process.env.DAILY_COST_THRESHOLD) || 1.00,    // $1/day
      weekly: parseFloat(process.env.WEEKLY_COST_THRESHOLD) || 5.00,   // $5/week  
      monthly: parseFloat(process.env.MONTHLY_COST_THRESHOLD) || 20.00, // $20/month
      total: parseFloat(process.env.TOTAL_COST_THRESHOLD) || 50.00     // $50 total
    };
    
    this.emailConfig = {
      to: process.env.NOTIFICATION_EMAIL || 'your-email@example.com',
      from: process.env.FROM_EMAIL || 'alfred-mcp@noreply.com'
    };
    
    // Track last alert times to prevent spam
    this.lastAlerts = {
      daily: null,
      weekly: null,
      monthly: null,
      total: null
    };
  }

  setupTransporter() {
    try {
      // Support multiple email providers
      if (process.env.SMTP_HOST) {
        // Custom SMTP
        this.transporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
      } else if (process.env.SENDGRID_API_KEY) {
        // SendGrid
        this.transporter = nodemailer.createTransporter({
          service: 'SendGrid',
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY
          }
        });
      } else {
        logger.warn('No email configuration found. Email notifications disabled.');
        return;
      }
      
      logger.info('Email transporter configured successfully');
    } catch (error) {
      logger.error('Failed to setup email transporter:', error);
    }
  }

  async sendEmail(subject, htmlContent, textContent = null) {
    if (!this.transporter) {
      logger.warn('Email transporter not configured. Skipping email.');
      return false;
    }

    try {
      const mailOptions = {
        from: this.emailConfig.from,
        to: this.emailConfig.to,
        subject: `[Alfred MCP] ${subject}`,
        html: htmlContent,
        text: textContent || htmlContent.replace(/<[^>]*>/g, '')
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully: ${subject}`);
      return true;
    } catch (error) {
      logger.error('Failed to send email:', error);
      return false;
    }
  }

  async checkThresholds() {
    const stats = costTracker.getUsageStats();
    const projections = costTracker.getCostProjection();
    const now = new Date();

    // Check daily threshold
    if (projections.daily >= this.thresholds.daily) {
      if (!this.lastAlerts.daily || this.shouldSendAlert('daily', now)) {
        await this.sendThresholdAlert('daily', projections.daily, this.thresholds.daily, stats);
        this.lastAlerts.daily = now;
      }
    }

    // Check weekly threshold
    if (projections.weekly >= this.thresholds.weekly) {
      if (!this.lastAlerts.weekly || this.shouldSendAlert('weekly', now)) {
        await this.sendThresholdAlert('weekly', projections.weekly, this.thresholds.weekly, stats);
        this.lastAlerts.weekly = now;
      }
    }

    // Check monthly threshold
    if (projections.monthly >= this.thresholds.monthly) {
      if (!this.lastAlerts.monthly || this.shouldSendAlert('monthly', now)) {
        await this.sendThresholdAlert('monthly', projections.monthly, this.thresholds.monthly, stats);
        this.lastAlerts.monthly = now;
      }
    }

    // Check total cost threshold
    if (stats.summary.totalCost >= this.thresholds.total) {
      if (!this.lastAlerts.total || this.shouldSendAlert('total', now)) {
        await this.sendThresholdAlert('total', stats.summary.totalCost, this.thresholds.total, stats);
        this.lastAlerts.total = now;
      }
    }
  }

  shouldSendAlert(type, now) {
    const lastAlert = this.lastAlerts[type];
    if (!lastAlert) return true;

    // Prevent spam - minimum time between alerts
    const minIntervals = {
      daily: 6 * 60 * 60 * 1000,    // 6 hours
      weekly: 24 * 60 * 60 * 1000,  // 24 hours
      monthly: 24 * 60 * 60 * 1000, // 24 hours
      total: 12 * 60 * 60 * 1000    // 12 hours
    };

    return (now - lastAlert) >= minIntervals[type];
  }

  async sendThresholdAlert(type, currentValue, threshold, stats) {
    const subject = `🚨 Cost Threshold Alert - ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
          <h1>🚨 Alfred MCP Cost Alert</h1>
          <p>Cost threshold exceeded for ${type} usage</p>
        </div>
        
        <div style="padding: 20px; background: #f8f9fa;">
          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #e74c3c; margin-top: 0;">⚠️ Threshold Exceeded</h2>
            <p><strong>${type.charAt(0).toUpperCase() + type.slice(1)} Cost:</strong> $${currentValue.toFixed(4)}</p>
            <p><strong>Threshold:</strong> $${threshold.toFixed(2)}</p>
            <p><strong>Overage:</strong> $${(currentValue - threshold).toFixed(4)}</p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin-top: 0;">📊 Current Usage Summary</h3>
            <p><strong>Total Cost:</strong> $${stats.summary.totalCost.toFixed(4)}</p>
            <p><strong>Total Requests:</strong> ${stats.summary.totalRequests}</p>
            <p><strong>Average Cost/Request:</strong> $${stats.summary.totalRequests > 0 ? (stats.summary.totalCost / stats.summary.totalRequests).toFixed(4) : '0.0000'}</p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px;">
            <h3 style="margin-top: 0;">🔧 Provider Breakdown</h3>
            ${Object.entries(stats.providers).map(([name, provider]) => `
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                <span><strong>${name.charAt(0).toUpperCase() + name.slice(1)}:</strong></span>
                <span>$${provider.totalCost.toFixed(4)} (${provider.requests} requests)</span>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div style="background: #333; color: white; padding: 15px; text-align: center;">
          <p style="margin: 0;">View detailed dashboard: <a href="https://alfred-server-production.up.railway.app/api/v1/monitoring/dashboard" style="color: #667eea;">Cost Dashboard</a></p>
        </div>
      </div>
    `;

    await this.sendEmail(subject, htmlContent);
  }

  async sendMonthlyReport() {
    const stats = costTracker.getUsageStats();
    const projections = costTracker.getCostProjection();
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const subject = `📊 Monthly Cost Report - ${monthName}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
          <h1>📊 Alfred MCP Monthly Report</h1>
          <p>${monthName}</p>
        </div>
        
        <div style="padding: 20px; background: #f8f9fa;">
          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
            <h2 style="color: #667eea; margin-top: 0;">💰 Total Monthly Cost</h2>
            <div style="font-size: 3rem; font-weight: bold; color: #667eea;">$${stats.summary.totalCost.toFixed(4)}</div>
            <p style="color: #666;">Based on ${stats.summary.totalRequests} total requests</p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin-top: 0;">🔧 Provider Performance</h3>
            ${Object.entries(stats.providers).map(([name, provider]) => `
              <div style="margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #333;">${name.charAt(0).toUpperCase() + name.slice(1)}</h4>
                <div style="display: flex; justify-content: space-between;">
                  <span>Cost: $${provider.totalCost.toFixed(4)}</span>
                  <span>Requests: ${provider.requests}</span>
                  <span>Avg: $${provider.avgCostPerRequest.toFixed(4)}</span>
                </div>
              </div>
            `).join('')}
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px;">
            <h3 style="margin-top: 0;">📈 Projections</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="font-size: 1.4rem; font-weight: bold; color: #667eea;">$${projections.daily.toFixed(2)}</div>
                <div style="color: #666;">Daily</div>
              </div>
              <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="font-size: 1.4rem; font-weight: bold; color: #667eea;">$${projections.weekly.toFixed(2)}</div>
                <div style="color: #666;">Weekly</div>
              </div>
              <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="font-size: 1.4rem; font-weight: bold; color: #667eea;">$${projections.monthly.toFixed(2)}</div>
                <div style="color: #666;">Monthly</div>
              </div>
            </div>
          </div>
        </div>
        
        <div style="background: #333; color: white; padding: 15px; text-align: center;">
          <p style="margin: 0;">View detailed dashboard: <a href="https://alfred-server-production.up.railway.app/api/v1/monitoring/dashboard" style="color: #667eea;">Cost Dashboard</a></p>
        </div>
      </div>
    `;

    await this.sendEmail(subject, htmlContent);
  }

  // Schedule monthly reports (call this from a cron job or scheduler)
  scheduleMonthlyReport() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const timeUntilNextMonth = nextMonth - now;

    setTimeout(() => {
      this.sendMonthlyReport();
      // Schedule next month
      setInterval(() => this.sendMonthlyReport(), 30 * 24 * 60 * 60 * 1000); // 30 days
    }, timeUntilNextMonth);

    logger.info(`Monthly report scheduled for: ${nextMonth.toISOString()}`);
  }

  // Check thresholds every hour
  startThresholdMonitoring() {
    // Check immediately
    this.checkThresholds();
    
    // Then check every hour
    setInterval(() => this.checkThresholds(), 60 * 60 * 1000);
    
    logger.info('Cost threshold monitoring started');
  }
}

// Singleton instance
export const emailNotifier = new EmailNotifier();
