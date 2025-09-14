import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock authentication middleware
jest.unstable_mockModule('../../src/middleware/authentication.js', () => ({
  authenticate: (req, res, next) => {
    req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'friend',
      permissions: {
        chat: true,
        poker: true,
        code: true,
        voice: true
      }
    };
    next();
  },
  requireFriend: (req, res, next) => next(),
  rateLimit: (limit) => (req, res, next) => next()
}));

// Mock session manager
const mockSessionManager = {
  sessions: new Map(),
  createSession: async (sessionId, data) => {
    mockSessionManager.sessions.set(sessionId, { ...data, id: sessionId });
    return mockSessionManager.sessions.get(sessionId);
  },
  getSession: async (sessionId) => {
    return mockSessionManager.sessions.get(sessionId);
  },
  endSession: async (sessionId) => {
    mockSessionManager.sessions.delete(sessionId);
  },
  updateSessionMetadata: async (sessionId, metadata) => {
    const session = mockSessionManager.sessions.get(sessionId);
    if (session) {
      session.metadata = { ...session.metadata, ...metadata };
    }
  }
};

// Mock smart AI router
const mockSmartAIRouter = {
  processTextCommand: async (text, context) => {
    return {
      response: {
        content: `AI response to: ${text}`
      },
      confidence: 0.95,
      provider: 'claude-haiku'
    };
  },
  cancelRequest: async (sessionId, requestId) => {
    return { success: true };
  }
};

describe('MCP Flow Integration - Simple Test', () => {
  let app;
  let sessionId;

  beforeAll(async () => {
    // Import MCP routes after mocking
    const { mcpRoutes } = await import('../../src/routes/mcp.js');
    
    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api/v1/mcp', mcpRoutes(mockSessionManager, mockSmartAIRouter));
  });

  describe('Basic MCP Flow', () => {
    it('should complete connect -> text -> disconnect flow', async () => {
      // Step 1: Connect to MCP server
      const connectResponse = await request(app)
        .post('/api/v1/mcp/connect')
        .send({ 
          clientInfo: { 
            version: '1.0.0', 
            platform: 'android' 
          } 
        })
        .expect(200);

      expect(connectResponse.body.success).toBe(true);
      expect(connectResponse.body.sessionId).toBeDefined();
      sessionId = connectResponse.body.sessionId;

      // Step 2: Send metadata
      const metadataResponse = await request(app)
        .post('/api/v1/mcp/metadata')
        .send({
          sessionId,
          metadata: {
            userPreference: 'concise',
            language: 'en',
            source: 'text'
          }
        })
        .expect(200);

      expect(metadataResponse.body.success).toBe(true);

      // Step 3: Send text command
      const textResponse = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId,
          text: 'What time is it?',
          metadata: { source: 'text', priority: 'normal' }
        })
        .expect(200);

      expect(textResponse.body.success).toBe(true);
      expect(textResponse.body.content).toBe('AI response to: What time is it?');
      expect(textResponse.body.provider).toBe('claude-haiku');
      expect(textResponse.body.sessionId).toBe(sessionId);

      // Step 4: Disconnect
      const disconnectResponse = await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({ sessionId })
        .expect(200);

      expect(disconnectResponse.body.success).toBe(true);
    });

    it('should handle concurrent sessions', async () => {
      // Create multiple sessions
      const session1Response = await request(app)
        .post('/api/v1/mcp/connect')
        .send({ clientInfo: { device: 'android-1' } })
        .expect(200);

      const session2Response = await request(app)
        .post('/api/v1/mcp/connect')
        .send({ clientInfo: { device: 'android-2' } })
        .expect(200);

      expect(session1Response.body.sessionId).not.toBe(session2Response.body.sessionId);

      // Send commands to both sessions
      const text1Response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId: session1Response.body.sessionId,
          text: 'Hello from session 1'
        })
        .expect(200);

      const text2Response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId: session2Response.body.sessionId,
          text: 'Hello from session 2'
        })
        .expect(200);

      expect(text1Response.body.content).toBe('AI response to: Hello from session 1');
      expect(text2Response.body.content).toBe('AI response to: Hello from session 2');

      // Clean up sessions
      await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({ sessionId: session1Response.body.sessionId });

      await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({ sessionId: session2Response.body.sessionId });
    });

    it('should handle request cancellation', async () => {
      // Connect
      const connectResponse = await request(app)
        .post('/api/v1/mcp/connect')
        .send({ clientInfo: { device: 'test-device' } })
        .expect(200);

      const sessionId = connectResponse.body.sessionId;

      // Cancel request
      const cancelResponse = await request(app)
        .post('/api/v1/mcp/cancel')
        .send({
          sessionId,
          requestId: 'test-request-id'
        })
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);

      // Clean up
      await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({ sessionId });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId: 'invalid-session-id',
          text: 'Hello'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session not found');
    });

    it('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          // Missing sessionId and text
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session ID and text required');
    });

    it('should require session ID for disconnect', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session ID required');
    });

    it('should require session ID for metadata', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/metadata')
        .send({
          metadata: { test: 'data' }
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session ID and metadata required');
    });

    it('should require session ID for cancel', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/cancel')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session ID required');
    });
  });
});
