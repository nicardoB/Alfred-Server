import { Router } from 'express';
import { costTracker } from '../monitoring/CostTracker.js';
import { emailNotifier } from '../monitoring/EmailNotifier.js';
import { logger } from '../utils/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function monitoringRoutes() {
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
  router.post('/costs/reset', (req, res) => {
    try {
      const { provider } = req.body;
      
      costTracker.resetUsage(provider);
      
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
   * POST /api/v1/monitoring/email/test
   * Send a test email to verify email configuration
   */
  router.post('/email/test', async (req, res) => {
    try {
      const success = await emailNotifier.sendEmail(
        'Test Email - Configuration Check',
        '<h1>✅ Email Configuration Working</h1><p>Your Alfred MCP email notifications are properly configured!</p>'
      );
      
      res.json({
        success,
        message: success ? 'Test email sent successfully' : 'Failed to send test email'
      });
    } catch (error) {
      logger.error('Test email failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send test email'
      });
    }
  });

  /**
   * POST /api/v1/monitoring/email/monthly-report
   * Manually trigger monthly report email
   */
  router.post('/email/monthly-report', async (req, res) => {
    try {
      await emailNotifier.sendMonthlyReport();
      res.json({
        success: true,
        message: 'Monthly report sent successfully'
      });
    } catch (error) {
      logger.error('Monthly report failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send monthly report'
      });
    }
  });

  /**
   * GET /api/v1/monitoring/email/thresholds
   * Get current cost thresholds
   */
  router.get('/email/thresholds', (req, res) => {
    res.json({
      success: true,
      data: {
        thresholds: emailNotifier.thresholds,
        emailConfig: {
          to: emailNotifier.emailConfig.to,
          from: emailNotifier.emailConfig.from
        },
        lastAlerts: emailNotifier.lastAlerts
      }
    });
  });

  /**
   * POST /api/v1/monitoring/email/check-thresholds
   * Manually check and send threshold alerts if needed
   */
  router.post('/email/check-thresholds', async (req, res) => {
    try {
      await emailNotifier.checkThresholds();
      res.json({
        success: true,
        message: 'Threshold check completed'
      });
    } catch (error) {
      logger.error('Threshold check failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check thresholds'
      });
    }
  });

  return router;
}
