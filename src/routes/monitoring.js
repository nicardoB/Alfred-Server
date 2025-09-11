import { Router } from 'express';
import { costTracker } from '../monitoring/CostTracker.js';
import { logger } from '../utils/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function monitoringRoutes(emailNotifier = null) {
  const router = Router();

  /**
   * GET /api/v1/monitoring/dashboard
   * Serve the cost dashboard HTML page
   */
  router.get('/dashboard', (req, res) => {
    try {
      const dashboardPath = join(__dirname, '../dashboard/index.html');
      const dashboardHtml = readFileSync(dashboardPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.send(dashboardHtml);
    } catch (error) {
      logger.error('Failed to serve dashboard:', error);
      res.status(500).send('Dashboard not available');
    }
  });

  /**
   * GET /api/v1/monitoring/costs
   * Get current cost statistics for all providers
   */
  router.get('/costs', (req, res) => {
    try {
      const stats = costTracker.getUsageStats();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Failed to get cost statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve cost statistics'
      });
    }
  });

  /**
   * GET /api/v1/monitoring/costs/projection
   * Get cost projections for different time periods
   */
  router.get('/costs/projection', (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const projection = costTracker.getCostProjection(days);
      
      res.json({
        success: true,
        data: projection
      });
    } catch (error) {
      logger.error('Failed to get cost projection:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate cost projection'
      });
    }
  });

  /**
   * POST /api/v1/monitoring/costs/reset
   * Reset cost statistics (optional provider filter)
   */
  router.post('/costs/reset', async (req, res) => {
    try {
      const { provider } = req.body;
      
      await costTracker.resetUsage(provider);
      
      res.json({
        success: true,
        message: provider 
          ? `Cost statistics reset for ${provider}` 
          : 'Cost statistics reset for all providers'
      });
    } catch (error) {
      logger.error('Failed to reset cost statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset cost statistics'
      });
    }
  });

  /**
   * GET /api/v1/monitoring/health
   * Get server health and monitoring status
   */
  router.get('/health', (req, res) => {
    try {
      const stats = costTracker.getUsageStats();
      
      res.json({
        success: true,
        data: {
          server: {
            status: 'healthy',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
          },
          costs: {
            totalCost: stats.summary.totalCost,
            totalRequests: stats.summary.totalRequests,
            providers: Object.keys(stats.providers).map(provider => ({
              name: provider,
              requests: stats.providers[provider].requests,
              cost: stats.providers[provider].totalCost
            }))
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get monitoring health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve monitoring health'
      });
    }
  });

  /**
   * GET /api/v1/monitoring/email/status
   * Get email system status
   */
  router.get('/email/status', (req, res) => {
    const isEnabled = emailNotifier && emailNotifier.isInitialized;
    res.json({
      success: true,
      data: {
        status: isEnabled ? 'enabled' : 'disabled',
        message: isEnabled 
          ? 'Email notifications are active and monitoring cost thresholds'
          : 'Email notifications disabled - check SendGrid API key and recipient email configuration',
        thresholds: emailNotifier ? emailNotifier.thresholds : null,
        debug: {
          hasApiKey: !!(emailNotifier && emailNotifier.sendGridApiKey),
          hasToEmail: !!(emailNotifier && emailNotifier.toEmail),
          fromEmail: emailNotifier ? emailNotifier.fromEmail : null
        }
      }
    });
  });


  /**
   * POST /api/v1/monitoring/email/test
   * Send a test email to verify the system is working
   */
  router.post('/email/test', async (req, res) => {
    try {
      console.log('=== EMAIL TEST DIAGNOSTICS ===');
      console.log('Environment variables check:');
      console.log('SENDGRID_API_KEY exists:', !!process.env.SENDGRID_API_KEY);
      console.log('EMAIL_TO exists:', !!process.env.EMAIL_TO);
      console.log('EMAIL_TO value:', process.env.EMAIL_TO);
      
      const success = await emailNotifier.sendTestEmail();
      if (success) {
        res.json({ success: true, message: 'Test email sent successfully' });
      } else {
        res.json({ 
          success: false, 
          error: 'Failed to send test email - check configuration',
          debug: {
            hasApiKey: !!process.env.SENDGRID_API_KEY,
            hasToEmail: !!process.env.EMAIL_TO,
            toEmail: process.env.EMAIL_TO
          }
        });
      }
    } catch (error) {
      console.error('Email test error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        stack: error.stack
      });
    }
  });

  /**
   * POST /api/v1/monitoring/email/monthly-report
   * Send monthly cost report immediately (for testing)
   */
  router.post('/email/monthly-report', async (req, res) => {
    try {
      if (!emailNotifier || !emailNotifier.isInitialized) {
        return res.status(400).json({
          success: false,
          error: 'Email notifier not initialized'
        });
      }

      const costData = await costTracker.getUsageStats();
      const result = await emailNotifier.sendMonthlyReport(costData);
      
      if (result) {
        res.json({
          success: true,
          message: 'Monthly report sent successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to send monthly report'
        });
      }
    } catch (error) {
      logger.error('Failed to send monthly report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send monthly report'
      });
    }
  });

  return router;
}
