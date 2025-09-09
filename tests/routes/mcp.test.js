import request from 'supertest';
import { jest } from '@jest/globals';
import express from 'express';
import { mcpRoutes } from '../../src/routes/mcp.js';

describe('MCP Routes', () => {
  let app;
  let mockSessionManager;
  let mockSmartAIRouter;

  beforeEach(() => {
    // Mock dependencies
    mockSessionManager = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      endSession: jest.fn(),
      updateSessionMetadata: jest.fn()
    };

    mockSmartAIRouter = {
      processTextCommand: jest.fn(),
      cancelRequest: jest.fn()
    };

    // Setup test app
    app = express();
    app.use(express.json());
    app.use('/mcp', mcpRoutes(mockSessionManager, mockSmartAIRouter));
  });

  describe('POST /mcp/connect', () => {
    it('should create new MCP session successfully', async () => {
      const mockSession = { id: 'test-session-123', timestamp: new Date().toISOString() };
      mockSessionManager.createSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .post('/mcp/connect')
        .send({ clientInfo: { version: '1.0.0' } });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.sessionId).toBeDefined();
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          clientInfo: { version: '1.0.0' },
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle session creation failure', async () => {
      mockSessionManager.createSession.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/mcp/connect')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to create session');
    });
  });

  describe('POST /mcp/disconnect', () => {
    it('should disconnect session successfully', async () => {
      mockSessionManager.endSession.mockResolvedValue(true);

      const response = await request(app)
        .post('/mcp/disconnect')
        .send({ sessionId: 'test-session-123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSessionManager.endSession).toHaveBeenCalledWith('test-session-123');
    });

    it('should require session ID', async () => {
      const response = await request(app)
        .post('/mcp/disconnect')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Session ID required');
    });
  });

  describe('POST /mcp/text', () => {
    it('should process text command successfully', async () => {
      const mockSession = { id: 'test-session-123' };
      const mockResponse = {
        provider: 'claude',
        response: { content: 'Test response', confidence: 0.9 },
        confidence: 0.9
      };

      mockSessionManager.getSession.mockResolvedValue(mockSession);
      mockSmartAIRouter.processTextCommand.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp/text')
        .send({
          sessionId: 'test-session-123',
          text: 'Hello Alfred',
          metadata: { source: 'voice' }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.requestId).toBeDefined();
      expect(response.body.response).toEqual(mockResponse);
      expect(mockSmartAIRouter.processTextCommand).toHaveBeenCalledWith(
        'Hello Alfred',
        expect.objectContaining({
          sessionId: 'test-session-123',
          requestId: expect.any(String),
          metadata: { source: 'voice' }
        })
      );
    });

    it('should require session ID and text', async () => {
      const response = await request(app)
        .post('/mcp/text')
        .send({ sessionId: 'test-session-123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Session ID and text required');
    });

    it('should handle invalid session', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      const response = await request(app)
        .post('/mcp/text')
        .send({
          sessionId: 'invalid-session',
          text: 'Hello Alfred'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Session not found');
    });
  });

  describe('POST /mcp/metadata', () => {
    it('should update session metadata successfully', async () => {
      const mockSession = { id: 'test-session-123' };
      mockSessionManager.getSession.mockResolvedValue(mockSession);
      mockSessionManager.updateSessionMetadata.mockResolvedValue(true);

      const response = await request(app)
        .post('/mcp/metadata')
        .send({
          sessionId: 'test-session-123',
          metadata: { userPreference: 'concise' }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSessionManager.updateSessionMetadata).toHaveBeenCalledWith(
        'test-session-123',
        { userPreference: 'concise' }
      );
    });

    it('should require session ID and metadata', async () => {
      const response = await request(app)
        .post('/mcp/metadata')
        .send({ sessionId: 'test-session-123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Session ID and metadata required');
    });
  });

  describe('POST /mcp/cancel', () => {
    it('should cancel request successfully', async () => {
      mockSmartAIRouter.cancelRequest.mockResolvedValue(true);

      const response = await request(app)
        .post('/mcp/cancel')
        .send({
          sessionId: 'test-session-123',
          requestId: 'test-request-456'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSmartAIRouter.cancelRequest).toHaveBeenCalledWith(
        'test-session-123',
        'test-request-456'
      );
    });

    it('should require session ID', async () => {
      const response = await request(app)
        .post('/mcp/cancel')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Session ID required');
    });
  });
});
