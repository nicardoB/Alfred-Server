import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const mockCostTracker = {
  getUsageStats: jest.fn(),
  getCostProjection: jest.fn(),
  resetUsage: jest.fn(),
  trackUsage: jest.fn()
};

const mockEmailNotifier = {
  isInitialized: true,
  sendGridApiKey: 'test-key',
  toEmail: 'test@example.com',
  fromEmail: 'alfred@example.com',
  thresholds: { daily: 10, monthly: 100 },
  sendTestEmail: jest.fn(),
  sendMonthlyReport: jest.fn()
};

const mockReadFileSync = jest.fn();

// Mock modules
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

jest.unstable_mockModule('../../src/monitoring/CostTracker.js', () => ({
  costTracker: mockCostTracker
}));

jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync
}));

// Mock authentication middleware
jest.unstable_mockModule('../../src/middleware/authentication.js', () => ({
  authenticate: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, 'test-secret');
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          permissions: decoded.permissions || {}
        };
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    } else {
      return res.status(401).json({ error: 'No token provided' });
    }
  },
  requireOwner: (req, res, next) => {
    if (req.user && req.user.role === 'owner') {
      return next();
    }
    return res.status(403).json({ error: 'Owner role required' });
  }
}));

// Import the module under test
const { monitoringRoutes } = await import('../../src/routes/monitoring.js');

describe('Monitoring Routes', () => {
  let app;
  let ownerToken;
  let userToken;

  beforeAll(() => {
    // Create test tokens
    ownerToken = jwt.sign(
      { userId: 'owner-123', email: 'owner@test.com', role: 'owner' },
      'test-secret',
      { expiresIn: '1h' }
    );

    userToken = jwt.sign(
      { userId: 'user-123', email: 'user@test.com', role: 'user' },
      'test-secret',
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up Express app with monitoring routes
    app = express();
    app.use(express.json());
    app.use('/api/v1/monitoring', monitoringRoutes(mockEmailNotifier));

    // Set environment variables
    process.env.MONITORING_API_KEY = 'legacy-key';
    process.env.SENDGRID_API_KEY = 'test-sendgrid-key';
    process.env.EMAIL_TO = 'test@example.com';
  });

  afterEach(() => {
    delete process.env.MONITORING_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.EMAIL_TO;
  });

  describe('Authentication Middleware', () => {
    test('should allow access with legacy API key', async () => {
      mockCostTracker.getUsageStats.mockResolvedValue({
        summary: { totalCost: 10.50, totalRequests: 100 },
        providers: {}
      });

      const response = await request(app)
        .get('/api/v1/monitoring/costs')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should allow access with owner JWT token', async () => {
      mockCostTracker.getUsageStats.mockResolvedValue({
        summary: { totalCost: 10.50, totalRequests: 100 },
        providers: {}
      });

      const response = await request(app)
        .get('/api/v1/monitoring/costs')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should deny access with user JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/costs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Insufficient permissions for monitoring access',
        expect.objectContaining({
          userId: 'user-123',
          role: 'user'
        })
      );
    });

    test('should deny access without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/costs');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
      // Note: The logger.warn is called by the legacy middleware, but since authenticate() 
      // is called first and returns early, the warning may not be logged in this specific case
    });

    test('should deny access with invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/costs')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should handle authorization header format', async () => {
      mockCostTracker.getUsageStats.mockResolvedValue({
        summary: { totalCost: 10.50, totalRequests: 100 },
        providers: {}
      });

      const response = await request(app)
        .get('/api/v1/monitoring/costs')
        .set('authorization', 'legacy-key');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /dashboard', () => {
    test('should serve dashboard HTML successfully', async () => {
      const mockHtml = '<html><body>Dashboard</body></html>';
      mockReadFileSync.mockReturnValue(mockHtml);

      const response = await request(app)
        .get('/api/v1/monitoring/dashboard')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockHtml);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('dashboard/index.html'),
        'utf8'
      );
    });

    test('should handle dashboard file read errors', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const response = await request(app)
        .get('/api/v1/monitoring/dashboard')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(500);
      expect(response.text).toBe('Dashboard not available');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to serve dashboard:',
        expect.any(Error)
      );
    });
  });

  describe('GET /costs', () => {
    test('should return cost statistics successfully', async () => {
      const mockStats = {
        summary: { totalCost: 15.75, totalRequests: 250 },
        providers: {
          openai: { totalCost: 10.25, requests: 150 },
          claude: { totalCost: 5.50, requests: 100 }
        }
      };
      mockCostTracker.getUsageStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/v1/monitoring/costs')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockStats
      });
      expect(mockCostTracker.getUsageStats).toHaveBeenCalled();
    });

    test('should handle cost statistics errors', async () => {
      mockCostTracker.getUsageStats.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/monitoring/costs')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to retrieve cost statistics'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get cost statistics:',
        expect.any(Error)
      );
    });
  });

  describe('GET /costs/projection', () => {
    test('should return cost projection with default days', async () => {
      const mockProjection = {
        period: 30,
        currentCost: 15.75,
        projectedCost: 47.25,
        dailyAverage: 1.575
      };
      mockCostTracker.getCostProjection.mockReturnValue(mockProjection);

      const response = await request(app)
        .get('/api/v1/monitoring/costs/projection')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockProjection
      });
      expect(mockCostTracker.getCostProjection).toHaveBeenCalledWith(30);
    });

    test('should return cost projection with custom days', async () => {
      const mockProjection = {
        period: 7,
        currentCost: 15.75,
        projectedCost: 11.025,
        dailyAverage: 1.575
      };
      mockCostTracker.getCostProjection.mockReturnValue(mockProjection);

      const response = await request(app)
        .get('/api/v1/monitoring/costs/projection?days=7')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockProjection
      });
      expect(mockCostTracker.getCostProjection).toHaveBeenCalledWith(7);
    });

    test('should handle invalid days parameter', async () => {
      const mockProjection = {
        period: 30,
        currentCost: 15.75,
        projectedCost: 47.25,
        dailyAverage: 1.575
      };
      mockCostTracker.getCostProjection.mockReturnValue(mockProjection);

      const response = await request(app)
        .get('/api/v1/monitoring/costs/projection?days=invalid')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(mockCostTracker.getCostProjection).toHaveBeenCalledWith(30);
    });

    test('should handle cost projection errors', async () => {
      mockCostTracker.getCostProjection.mockImplementation(() => {
        throw new Error('Projection calculation failed');
      });

      const response = await request(app)
        .get('/api/v1/monitoring/costs/projection')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to calculate cost projection'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get cost projection:',
        expect.any(Error)
      );
    });
  });

  describe('POST /costs/reset', () => {
    test('should reset all provider costs', async () => {
      mockCostTracker.resetUsage.mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/monitoring/costs/reset')
        .set('x-api-key', 'legacy-key')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Cost statistics reset for all providers'
      });
      expect(mockCostTracker.resetUsage).toHaveBeenCalledWith(undefined);
    });

    test('should reset specific provider costs', async () => {
      mockCostTracker.resetUsage.mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/monitoring/costs/reset')
        .set('x-api-key', 'legacy-key')
        .send({ provider: 'openai' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Cost statistics reset for openai'
      });
      expect(mockCostTracker.resetUsage).toHaveBeenCalledWith('openai');
    });

    test('should handle reset errors', async () => {
      mockCostTracker.resetUsage.mockRejectedValue(new Error('Reset failed'));

      const response = await request(app)
        .post('/api/v1/monitoring/costs/reset')
        .set('x-api-key', 'legacy-key')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to reset cost statistics'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to reset cost statistics:',
        expect.any(Error)
      );
    });
  });

  describe('GET /health', () => {
    test('should return health status successfully', async () => {
      const mockStats = {
        summary: { totalCost: 15.75, totalRequests: 250 },
        providers: {
          openai: { totalCost: 10.25, requests: 150 },
          claude: { totalCost: 5.50, requests: 100 }
        }
      };
      mockCostTracker.getUsageStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/api/v1/monitoring/health')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.server.status).toBe('healthy');
      expect(response.body.data.server.uptime).toBeGreaterThan(0);
      expect(response.body.data.server.memory).toBeDefined();
      expect(response.body.data.server.timestamp).toBeDefined();
      expect(response.body.data.costs.totalCost).toBe(15.75);
      expect(response.body.data.costs.totalRequests).toBe(250);
      expect(response.body.data.costs.providers).toHaveLength(2);
    });

    test('should handle health check errors', async () => {
      mockCostTracker.getUsageStats.mockImplementation(() => {
        throw new Error('Stats unavailable');
      });

      const response = await request(app)
        .get('/api/v1/monitoring/health')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to retrieve monitoring health'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get monitoring health:',
        expect.any(Error)
      );
    });
  });

  describe('GET /email/status', () => {
    test('should return enabled email status', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/email/status')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          status: 'enabled',
          message: 'Email notifications are active and monitoring cost thresholds',
          thresholds: { daily: 10, monthly: 100 },
          debug: {
            hasApiKey: true,
            hasToEmail: true,
            fromEmail: 'alfred@example.com'
          }
        }
      });
    });

    test('should return disabled email status when notifier not initialized', async () => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/monitoring', monitoringRoutes(null));

      const response = await request(app)
        .get('/api/v1/monitoring/email/status')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('disabled');
      expect(response.body.data.message).toContain('Email notifications disabled');
    });

    test('should return disabled email status when notifier not initialized properly', async () => {
      const uninitializedNotifier = {
        isInitialized: false,
        sendGridApiKey: null,
        toEmail: null,
        fromEmail: null,
        thresholds: null
      };

      app = express();
      app.use(express.json());
      app.use('/api/v1/monitoring', monitoringRoutes(uninitializedNotifier));

      const response = await request(app)
        .get('/api/v1/monitoring/email/status')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('disabled');
      expect(response.body.data.debug.hasApiKey).toBe(false);
      expect(response.body.data.debug.hasToEmail).toBe(false);
    });
  });

  describe('POST /email/test', () => {
    test('should send test email successfully', async () => {
      mockEmailNotifier.sendTestEmail.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/v1/monitoring/email/test')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Test email sent successfully'
      });
      expect(mockEmailNotifier.sendTestEmail).toHaveBeenCalled();
    });

    test('should handle test email failure', async () => {
      mockEmailNotifier.sendTestEmail.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/v1/monitoring/email/test')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to send test email');
      expect(response.body.debug).toBeDefined();
    });

    test('should handle test email errors', async () => {
      mockEmailNotifier.sendTestEmail.mockRejectedValue(new Error('SendGrid error'));

      const response = await request(app)
        .post('/api/v1/monitoring/email/test')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('SendGrid error');
      expect(response.body.stack).toBeDefined();
    });
  });

  describe('POST /email/monthly-report', () => {
    test('should send monthly report successfully', async () => {
      const mockCostData = {
        summary: { totalCost: 15.75, totalRequests: 250 },
        providers: {}
      };
      mockCostTracker.getUsageStats.mockResolvedValue(mockCostData);
      mockEmailNotifier.sendMonthlyReport.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/v1/monitoring/email/monthly-report')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Monthly report sent successfully'
      });
      expect(mockCostTracker.getUsageStats).toHaveBeenCalled();
      expect(mockEmailNotifier.sendMonthlyReport).toHaveBeenCalledWith(mockCostData);
    });

    test('should handle uninitialized email notifier', async () => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/monitoring', monitoringRoutes(null));

      const response = await request(app)
        .post('/api/v1/monitoring/email/monthly-report')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Email notifier not initialized'
      });
    });

    test('should handle monthly report send failure', async () => {
      const mockCostData = {
        summary: { totalCost: 15.75, totalRequests: 250 },
        providers: {}
      };
      mockCostTracker.getUsageStats.mockResolvedValue(mockCostData);
      mockEmailNotifier.sendMonthlyReport.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/v1/monitoring/email/monthly-report')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to send monthly report'
      });
    });

    test('should handle monthly report errors', async () => {
      mockCostTracker.getUsageStats.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/v1/monitoring/email/monthly-report')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to send monthly report'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send monthly report:',
        expect.any(Error)
      );
    });
  });

  describe('POST /costs/populate-test-data', () => {
    test('should populate test data successfully', async () => {
      const mockStats = {
        summary: { totalCost: 0.0702, totalRequests: 8 },
        providers: {
          claude: { totalCost: 0.0495, requests: 3 },
          openai: { totalCost: 0.0017, requests: 3 },
          copilot: { totalCost: 0.015, requests: 2 }
        }
      };
      mockCostTracker.trackUsage.mockResolvedValue();
      mockCostTracker.getUsageStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .post('/api/v1/monitoring/costs/populate-test-data')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Test cost data populated successfully');
      expect(response.body.data.totalCost).toBe(0.0702);
      expect(response.body.data.totalRequests).toBe(8);
      expect(response.body.data.providers).toHaveLength(3);

      // Verify all trackUsage calls were made
      expect(mockCostTracker.trackUsage).toHaveBeenCalledTimes(8);
      expect(mockCostTracker.trackUsage).toHaveBeenCalledWith({
        provider: 'claude',
        inputTokens: 1500,
        outputTokens: 800,
        userId: expect.any(String),
        toolContext: 'chat'
      });
      expect(mockCostTracker.trackUsage).toHaveBeenCalledWith({
        provider: 'openai',
        inputTokens: 1200,
        outputTokens: 600,
        userId: expect.any(String),
        toolContext: 'chat'
      });
      expect(mockCostTracker.trackUsage).toHaveBeenCalledWith({
        provider: 'copilot',
        inputTokens: 1000,
        outputTokens: 500,
        userId: expect.any(String),
        toolContext: 'chat'
      });
    });

    test('should handle populate test data errors', async () => {
      mockCostTracker.trackUsage.mockRejectedValue(new Error('Tracking failed'));

      const response = await request(app)
        .post('/api/v1/monitoring/costs/populate-test-data')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to populate test data'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to populate test data:',
        expect.any(Error)
      );
    });
  });

  describe('Route Configuration', () => {
    test('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/non-existent')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(404);
    });

    test('should handle different HTTP methods appropriately', async () => {
      // GET endpoint should not accept POST
      const response = await request(app)
        .post('/api/v1/monitoring/costs')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(404);
    });

    test('should require authentication for all routes', async () => {
      const routes = [
        '/api/v1/monitoring/dashboard',
        '/api/v1/monitoring/costs',
        '/api/v1/monitoring/costs/projection',
        '/api/v1/monitoring/health',
        '/api/v1/monitoring/email/status'
      ];

      for (const route of routes) {
        const response = await request(app).get(route);
        expect(response.status).toBe(401);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle malformed JSON in POST requests', async () => {
      const response = await request(app)
        .post('/api/v1/monitoring/costs/reset')
        .set('x-api-key', 'legacy-key')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
    });

    test('should handle very large cost values', async () => {
      const mockStats = {
        summary: { totalCost: 999999.999999, totalRequests: 1000000 },
        providers: {
          openai: { totalCost: 999999.999999, requests: 1000000 }
        }
      };
      mockCostTracker.getUsageStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/v1/monitoring/costs')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body.data.summary.totalCost).toBe(999999.999999);
    });

    test('should handle empty provider data', async () => {
      const mockStats = {
        summary: { totalCost: 0, totalRequests: 0 },
        providers: {}
      };
      mockCostTracker.getUsageStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/api/v1/monitoring/health')
        .set('x-api-key', 'legacy-key');

      expect(response.status).toBe(200);
      expect(response.body.data.costs.providers).toHaveLength(0);
    });
  });
});
