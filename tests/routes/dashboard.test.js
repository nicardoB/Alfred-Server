import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock authentication middleware before importing dashboard routes
jest.unstable_mockModule('../../src/middleware/authentication.js', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 'test-user', role: 'friend' };
    next();
  },
  requireFriend: (req, res, next) => next()
}));

// Create a test app with mocked dependencies
const createTestApp = async () => {
  const app = express();
  app.use(express.json());
  
  // Import dashboard routes after mocking
  const { default: dashboardRoutes } = await import('../../src/routes/dashboard.js');
  app.use('/api/v1/dashboard', dashboardRoutes);
  return app;
};

// Mock CostTracker
const mockCostTracker = {
  getUsageStats: jest.fn().mockResolvedValue({
    summary: {
      totalCost: 0.0015,
      totalRequests: 5,
      totalTokens: 1250,
      avgCostPerRequest: 0.0003,
      avgTokensPerRequest: 250,
      avgCostPerToken: 0.0000012,
      currency: 'USD'
    },
    providers: {
      openai: {
        requests: 2,
        inputTokens: 300,
        outputTokens: 200,
        totalTokens: 500,
        totalCost: 0.0006,
        avgCostPerRequest: 0.0003,
        avgCostPerToken: 0.0000012,
        avgTokensPerRequest: 250,
        lastReset: new Date().toISOString()
      },
      claude: {
        requests: 2,
        inputTokens: 400,
        outputTokens: 350,
        totalTokens: 750,
        totalCost: 0.0009,
        avgCostPerRequest: 0.00045,
        avgCostPerToken: 0.0000012,
        avgTokensPerRequest: 375,
        lastReset: new Date().toISOString()
      },
      ollama: {
        requests: 1,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        avgCostPerRequest: 0,
        avgCostPerToken: 0,
        avgTokensPerRequest: 0,
        lastReset: new Date().toISOString()
      }
    }
  })
};

jest.unstable_mockModule('../../src/monitoring/CostTracker.js', () => ({
  CostTracker: jest.fn().mockImplementation(() => mockCostTracker)
}));

describe('Dashboard Routes', () => {
  let app;

  beforeEach(async () => {
    app = await createTestApp();
  });

  describe('GET /api/v1/dashboard', () => {
    it('should serve dashboard HTML file', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text).toContain('Alfred MCP Server - Cost Dashboard');
      expect(response.text).toContain('AI Provider Cost Dashboard');
    });
  });

  describe('GET /api/v1/dashboard/data', () => {
    it('should return enhanced cost tracking data', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/data')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          summary: {
            totalCost: 0.0015,
            totalRequests: 5,
            totalTokens: 1250,
            avgCostPerRequest: 0.0003,
            avgTokensPerRequest: 250,
            avgCostPerToken: 0.0000012,
            currency: 'USD'
          },
          providers: [
            {
              name: 'openai',
              requests: 2,
              totalCost: 0.0006,
              inputTokens: 300,
              outputTokens: 200,
              totalTokens: 500,
              avgCostPerRequest: 0.0003,
              avgCostPerToken: 0.0000012,
              avgTokensPerRequest: 250,
              lastReset: expect.any(String)
            },
            {
              name: 'claude',
              requests: 2,
              totalCost: 0.0009,
              inputTokens: 400,
              outputTokens: 350,
              totalTokens: 750,
              avgCostPerRequest: 0.00045,
              avgCostPerToken: 0.0000012,
              avgTokensPerRequest: 375,
              lastReset: expect.any(String)
            },
            {
              name: 'ollama',
              requests: 1,
              totalCost: 0,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              avgCostPerRequest: 0,
              avgCostPerToken: 0,
              avgTokensPerRequest: 0,
              lastReset: expect.any(String)
            }
          ],
          projections: {
            daily: 0.0015,
            weekly: 0.0105,
            monthly: 0.045,
            yearly: 0.5475
          },
          timestamp: expect.any(String)
        }
      });
    });

    it('should include token analytics in response', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/data')
        .expect(200);

      const { data } = response.body;
      
      // Verify summary includes token analytics
      expect(data.summary.totalTokens).toBe(1250);
      expect(data.summary.avgTokensPerRequest).toBe(250);
      expect(data.summary.avgCostPerToken).toBe(0.0000012);

      // Verify providers include token analytics
      data.providers.forEach(provider => {
        expect(provider).toHaveProperty('inputTokens');
        expect(provider).toHaveProperty('outputTokens');
        expect(provider).toHaveProperty('totalTokens');
        expect(provider).toHaveProperty('avgCostPerToken');
        expect(provider).toHaveProperty('avgTokensPerRequest');
      });
    });

    it('should handle cost tracker errors gracefully', async () => {
      // Mock error for this specific test
      mockCostTracker.getUsageStats.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/v1/dashboard/data')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch dashboard data',
        message: 'Database connection failed'
      });

      // Reset mock for other tests
      mockCostTracker.getUsageStats.mockResolvedValue({
        summary: {
          totalCost: 0.0015,
          totalRequests: 5,
          totalTokens: 1250,
          avgCostPerRequest: 0.0003,
          avgTokensPerRequest: 250,
          avgCostPerToken: 0.0000012,
          currency: 'USD'
        },
        providers: {
          openai: {
            requests: 2,
            inputTokens: 300,
            outputTokens: 200,
            totalTokens: 500,
            totalCost: 0.0006,
            avgCostPerRequest: 0.0003,
            avgCostPerToken: 0.0000012,
            avgTokensPerRequest: 250,
            lastReset: new Date().toISOString()
          },
          claude: {
            requests: 2,
            inputTokens: 400,
            outputTokens: 350,
            totalTokens: 750,
            totalCost: 0.0009,
            avgCostPerRequest: 0.00045,
            avgCostPerToken: 0.0000012,
            avgTokensPerRequest: 375,
            lastReset: new Date().toISOString()
          },
          ollama: {
            requests: 1,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            totalCost: 0,
            avgCostPerRequest: 0,
            avgCostPerToken: 0,
            avgTokensPerRequest: 0,
            lastReset: new Date().toISOString()
          }
        }
      });
    });

    it('should provide cost projections', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/data')
        .expect(200);

      const { projections } = response.body.data;
      
      expect(projections).toEqual({
        daily: 0.0015,
        weekly: 0.0105,   // 0.0015 * 7
        monthly: 0.045,   // 0.0015 * 30
        yearly: 0.5475    // 0.0015 * 365
      });
    });

    it('should format provider data correctly', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/data')
        .expect(200);

      const { providers } = response.body.data;
      
      expect(providers).toHaveLength(3);
      
      const openaiProvider = providers.find(p => p.name === 'openai');
      expect(openaiProvider).toEqual({
        name: 'openai',
        requests: 2,
        totalCost: 0.0006,
        inputTokens: 300,
        outputTokens: 200,
        totalTokens: 500,
        avgCostPerRequest: 0.0003,
        avgCostPerToken: 0.0000012,
        avgTokensPerRequest: 250,
        lastReset: expect.any(String)
      });
    });
  });
});
