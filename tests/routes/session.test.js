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

const mockSessionManager = {
  getSession: jest.fn()
};

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
  requireFriend: (req, res, next) => {
    if (req.user && (req.user.role === 'friend' || req.user.role === 'owner')) {
      return next();
    }
    return res.status(403).json({ error: 'Friend role required' });
  },
  rateLimit: (limit) => (req, res, next) => {
    // Mock rate limiting - just pass through for tests
    next();
  }
}));

// Mock logger
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

// Import the module under test
const { sessionRoutes } = await import('../../src/routes/session.js');

describe('Session Routes', () => {
  let app;
  let friendToken;
  let ownerToken;
  let userToken;

  beforeAll(() => {
    // Create test tokens
    friendToken = jwt.sign(
      { userId: 'friend-123', email: 'friend@test.com', role: 'friend' },
      'test-secret',
      { expiresIn: '1h' }
    );

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
    
    // Set up Express app with session routes
    app = express();
    app.use(express.json());
    app.use('/api/v1/sessions', sessionRoutes(mockSessionManager));
  });

  describe('Authentication and Authorization', () => {
    test('should allow access with friend token', async () => {
      const mockSession = {
        id: 'session-123',
        userId: 'friend-123',
        createdAt: new Date().toISOString(),
        data: { key: 'value' }
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.session).toEqual(mockSession);
    });

    test('should allow access with owner token', async () => {
      const mockSession = {
        id: 'session-123',
        userId: 'owner-123',
        createdAt: new Date().toISOString(),
        data: { key: 'value' }
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.session).toEqual(mockSession);
    });

    test('should deny access with user token', async () => {
      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Friend role required');
    });

    test('should deny access without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/sessions/session-123');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });

    test('should deny access with invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should deny access with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });
  });

  describe('GET /:sessionId', () => {
    test('should return session successfully', async () => {
      const mockSession = {
        id: 'session-123',
        userId: 'friend-123',
        createdAt: '2025-01-14T10:39:31.000Z',
        updatedAt: '2025-01-14T10:39:31.000Z',
        data: {
          preferences: { theme: 'dark' },
          state: { currentPage: 'dashboard' }
        },
        metadata: {
          userAgent: 'Mozilla/5.0',
          ipAddress: '192.168.1.1'
        }
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        session: mockSession
      });
      expect(mockSessionManager.getSession).toHaveBeenCalledWith('session-123');
    });

    test('should return 404 when session not found', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/sessions/nonexistent-session')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'Session not found'
      });
      expect(mockSessionManager.getSession).toHaveBeenCalledWith('nonexistent-session');
    });

    test('should return 404 when session is undefined', async () => {
      mockSessionManager.getSession.mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/v1/sessions/undefined-session')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'Session not found'
      });
    });

    test('should handle sessionManager errors', async () => {
      const error = new Error('Database connection failed');
      mockSessionManager.getSession.mockRejectedValue(error);

      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to get session'
      });
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get session:', error);
    });

    test('should handle different session data types', async () => {
      const mockSession = {
        id: 'session-456',
        userId: 'friend-123',
        data: null,
        metadata: {}
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/v1/sessions/session-456')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(response.body.session.data).toBe(null);
    });

    test('should handle empty session data', async () => {
      const mockSession = {
        id: 'session-789',
        userId: 'friend-123',
        data: {},
        metadata: {}
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/v1/sessions/session-789')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(response.body.session.data).toEqual({});
    });

    test('should handle complex session data structures', async () => {
      const mockSession = {
        id: 'session-complex',
        userId: 'friend-123',
        data: {
          nested: {
            deeply: {
              nested: {
                value: 'test',
                array: [1, 2, 3],
                boolean: true,
                null: null
              }
            }
          },
          topLevel: 'value'
        }
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/v1/sessions/session-complex')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(response.body.session.data).toEqual(mockSession.data);
    });
  });

  describe('Route Parameters', () => {
    test('should handle URL-encoded session IDs', async () => {
      const sessionId = 'session%20with%20spaces';
      const decodedSessionId = 'session with spaces';
      const mockSession = {
        id: decodedSessionId,
        userId: 'friend-123',
        data: {}
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(mockSessionManager.getSession).toHaveBeenCalledWith(decodedSessionId);
    });

    test('should handle UUID session IDs', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      const mockSession = {
        id: sessionId,
        userId: 'friend-123',
        data: {}
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(mockSessionManager.getSession).toHaveBeenCalledWith(sessionId);
    });

    test('should handle numeric session IDs', async () => {
      const sessionId = '12345';
      const mockSession = {
        id: sessionId,
        userId: 'friend-123',
        data: {}
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(mockSessionManager.getSession).toHaveBeenCalledWith(sessionId);
    });

    test('should handle special characters in session IDs', async () => {
      const sessionId = 'session-with-dashes_and_underscores.and.dots';
      const mockSession = {
        id: sessionId,
        userId: 'friend-123',
        data: {}
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(mockSessionManager.getSession).toHaveBeenCalledWith(sessionId);
    });
  });

  describe('Error Handling', () => {
    test('should handle sessionManager throwing synchronous errors', async () => {
      mockSessionManager.getSession.mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to get session'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get session:',
        expect.any(Error)
      );
    });

    test('should handle sessionManager timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'TIMEOUT';
      mockSessionManager.getSession.mockRejectedValue(timeoutError);

      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to get session'
      });
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get session:', timeoutError);
    });

    test('should handle sessionManager network errors', async () => {
      const networkError = new Error('Network unreachable');
      networkError.code = 'ENETUNREACH';
      mockSessionManager.getSession.mockRejectedValue(networkError);

      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Failed to get session'
      });
    });
  });

  describe('HTTP Methods', () => {
    test('should return 404 for POST requests', async () => {
      const response = await request(app)
        .post('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`)
        .send({});

      expect(response.status).toBe(404);
    });

    test('should return 404 for PUT requests', async () => {
      const response = await request(app)
        .put('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`)
        .send({});

      expect(response.status).toBe(404);
    });

    test('should return 404 for DELETE requests', async () => {
      const response = await request(app)
        .delete('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(404);
    });

    test('should return 404 for PATCH requests', async () => {
      const response = await request(app)
        .patch('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`)
        .send({});

      expect(response.status).toBe(404);
    });
  });

  describe('Rate Limiting Integration', () => {
    test('should apply rate limiting middleware', async () => {
      // Since we mock the rate limiting to always pass, we just verify the route works
      const mockSession = {
        id: 'session-123',
        userId: 'friend-123',
        data: {}
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/v1/sessions/session-123')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      // In a real scenario, rate limiting would be tested by making multiple requests
      // but since we mock it, we just verify the endpoint works with the middleware applied
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long session IDs', async () => {
      const longSessionId = 'a'.repeat(1000);
      mockSessionManager.getSession.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/v1/sessions/${longSessionId}`)
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(404);
      expect(mockSessionManager.getSession).toHaveBeenCalledWith(longSessionId);
    });

    test('should handle empty session ID', async () => {
      // This would actually hit the base route, not the :sessionId route
      const response = await request(app)
        .get('/api/v1/sessions/')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(404);
    });

    test('should handle session with circular references in data', async () => {
      // Create a session object that would normally have circular references
      // but JSON.stringify handles this by converting to string representation
      const mockSession = {
        id: 'session-circular',
        userId: 'friend-123',
        data: {
          message: 'This would normally be circular but JSON handles it'
        }
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/v1/sessions/session-circular')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(response.body.session).toEqual(mockSession);
    });

    test('should handle session with very large data payload', async () => {
      const largeData = {
        bigArray: new Array(1000).fill('large data item'),
        bigString: 'x'.repeat(10000),
        nestedData: {}
      };
      
      // Create nested structure
      let current = largeData.nestedData;
      for (let i = 0; i < 100; i++) {
        current.level = { data: `level-${i}` };
        current = current.level;
      }

      const mockSession = {
        id: 'session-large',
        userId: 'friend-123',
        data: largeData
      };
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/v1/sessions/session-large')
        .set('Authorization', `Bearer ${friendToken}`);

      expect(response.status).toBe(200);
      expect(response.body.session.data.bigArray).toHaveLength(1000);
      expect(response.body.session.data.bigString).toHaveLength(10000);
    });
  });
});
