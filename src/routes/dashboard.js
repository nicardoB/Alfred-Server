import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authenticate, requireFriend } from '../middleware/authentication.js';
import { CostTracker } from '../monitoring/CostTracker.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize cost tracker
const costTracker = new CostTracker();

/**
 * Serve dashboard HTML
 * GET /api/v1/dashboard
 */
router.get('/', authenticate, requireFriend, (req, res) => {
  const dashboardPath = path.join(__dirname, '../dashboard/index.html');
  res.sendFile(dashboardPath);
});

/**
 * Get enhanced cost data for dashboard
 * GET /api/v1/dashboard/data
 */
router.get('/data', authenticate, requireFriend, async (req, res) => {
  try {
    const stats = await costTracker.getUsageStats();
    
    // Transform data for dashboard consumption
    const dashboardData = {
      summary: {
        totalCost: stats.summary.totalCost,
        totalRequests: stats.summary.totalRequests,
        totalTokens: stats.summary.totalTokens || 0,
        avgCostPerRequest: stats.summary.totalRequests > 0 
          ? parseFloat((stats.summary.totalCost / stats.summary.totalRequests).toFixed(4))
          : 0,
        avgTokensPerRequest: stats.summary.avgTokensPerRequest || 0,
        avgCostPerToken: stats.summary.avgCostPerToken || 0,
        currency: stats.summary.currency || 'USD'
      },
      providers: Object.entries(stats.providers || {}).map(([name, data]) => ({
        name,
        requests: data.requests || 0,
        totalCost: data.totalCost || 0,
        inputTokens: data.inputTokens || 0,
        outputTokens: data.outputTokens || 0,
        totalTokens: data.totalTokens || 0,
        avgCostPerRequest: data.avgCostPerRequest || 0,
        avgCostPerToken: data.avgCostPerToken || 0,
        avgTokensPerRequest: data.avgTokensPerRequest || 0,
        lastReset: data.lastReset
      })),
      projections: {
        daily: stats.summary.totalCost, // Current daily rate
        weekly: stats.summary.totalCost * 7,
        monthly: stats.summary.totalCost * 30,
        yearly: stats.summary.totalCost * 365
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      message: error.message
    });
  }
});

export default router;
