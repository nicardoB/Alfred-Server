import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../src/app.js';

describe('MCP End-to-End Integration Tests', () => {
  let sessionId;

  beforeEach(async () => {
    // Create a fresh session for each test
    const connectResponse = await request(app)
      .post('/api/v1/mcp/connect')
      .send({});
    
    expect(connectResponse.status).toBe(200);
    sessionId = connectResponse.body.sessionId;
  });

  afterEach(async () => {
    // Clean up session
    if (sessionId) {
      await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({ sessionId });
    }
  });

  describe('Complete MCP Flow', () => {
    it('should handle complete connect -> text -> disconnect flow', async () => {
      // 1. Connect (already done in beforeEach)
      expect(sessionId).toBeDefined();

      // 2. Send text command
      const textResponse = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId,
          text: 'Hello Alfred, how are you?',
          metadata: { source: 'integration-test' }
        });

      expect(textResponse.status).toBe(200);
      expect(textResponse.body.success).toBe(true);
      expect(textResponse.body.sessionId).toBe(sessionId);
      expect(textResponse.body.requestId).toBeDefined();
      expect(textResponse.body.content).toBeDefined();
      expect(textResponse.body.confidence).toBeGreaterThanOrEqual(0);
      expect(textResponse.body.confidence).toBeLessThanOrEqual(1);
      expect(textResponse.body.provider).toBeDefined();
      expect(textResponse.body.timestamp).toBeDefined();

      // 3. Disconnect
      const disconnectResponse = await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({ sessionId });

      expect(disconnectResponse.status).toBe(200);
      expect(disconnectResponse.body.success).toBe(true);
    });

    it('should handle multiple text commands in same session', async () => {
      const commands = [
        'What is the weather like?',
        'Tell me a joke',
        'What time is it?'
      ];

      const responses = [];
      for (const command of commands) {
        const response = await request(app)
          .post('/api/v1/mcp/text')
          .send({
            sessionId,
            text: command,
            metadata: { source: 'multi-command-test' }
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        responses.push(response.body);
      }

      // Verify all responses have unique request IDs
      const requestIds = responses.map(r => r.requestId);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(requestIds.length);

      // Verify all responses belong to same session
      responses.forEach(response => {
        expect(response.sessionId).toBe(sessionId);
      });
    });

    it('should handle session metadata updates', async () => {
      // Update session metadata
      const metadataResponse = await request(app)
        .post('/api/v1/mcp/metadata')
        .send({
          sessionId,
          metadata: {
            userPreference: 'concise',
            language: 'en',
            responseStyle: 'professional'
          }
        });

      expect(metadataResponse.status).toBe(200);
      expect(metadataResponse.body.success).toBe(true);

      // Send text command after metadata update
      const textResponse = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId,
          text: 'Explain quantum computing',
          metadata: { source: 'metadata-test' }
        });

      expect(textResponse.status).toBe(200);
      expect(textResponse.body.success).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should handle invalid session gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId: 'invalid-session-id',
          text: 'Hello Alfred'
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session not found');
    });

    it('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId,
          // Missing text field
          metadata: { source: 'malformed-test' }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session ID and text required');
    });

    it('should handle double disconnect gracefully', async () => {
      // First disconnect
      const firstDisconnect = await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({ sessionId });

      expect(firstDisconnect.status).toBe(200);

      // Second disconnect should not fail
      const secondDisconnect = await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({ sessionId });

      expect(secondDisconnect.status).toBe(200);
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle concurrent requests to same session', async () => {
      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/v1/mcp/text')
          .send({
            sessionId,
            text: `Concurrent request ${i + 1}`,
            metadata: { source: 'concurrent-test', requestIndex: i }
          })
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.sessionId).toBe(sessionId);
      });

      // Verify unique request IDs
      const requestIds = responses.map(r => r.body.requestId);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(requestIds.length);
    });

    it('should handle large text inputs', async () => {
      const largeText = 'A'.repeat(5000); // 5KB text
      
      const response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId,
          text: largeText,
          metadata: { source: 'large-text-test' }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should maintain session state across requests', async () => {
      // First request
      const firstResponse = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId,
          text: 'Remember that my name is John',
          metadata: { source: 'state-test-1' }
        });

      expect(firstResponse.status).toBe(200);

      // Second request referencing previous context
      const secondResponse = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId,
          text: 'What is my name?',
          metadata: { source: 'state-test-2' }
        });

      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.sessionId).toBe(sessionId);
    });
  });

  describe('Response Format Validation', () => {
    it('should always return simplified flat JSON structure', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId,
          text: 'Test response format',
          metadata: { source: 'format-test' }
        });

      expect(response.status).toBe(200);
      
      const body = response.body;
      
      // Required fields
      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('sessionId');
      expect(body).toHaveProperty('requestId');
      expect(body).toHaveProperty('content');
      expect(body).toHaveProperty('confidence');
      expect(body).toHaveProperty('provider');
      expect(body).toHaveProperty('timestamp');

      // Type validation
      expect(typeof body.success).toBe('boolean');
      expect(typeof body.sessionId).toBe('string');
      expect(typeof body.requestId).toBe('string');
      expect(typeof body.content).toBe('string');
      expect(typeof body.confidence).toBe('number');
      expect(typeof body.provider).toBe('string');
      expect(typeof body.timestamp).toBe('string');

      // No nested objects in main response
      expect(body.response).toBeUndefined();
      expect(body.data).toBeUndefined();
      expect(body.result).toBeUndefined();

      // Confidence range validation
      expect(body.confidence).toBeGreaterThanOrEqual(0);
      expect(body.confidence).toBeLessThanOrEqual(1);

      // Timestamp format validation
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it('should handle various AI provider response formats consistently', async () => {
      const testCases = [
        'Simple question',
        'Complex multi-part question with details',
        'Question with special characters: !@#$%^&*()',
        'Question with unicode: 🤖 Hello 世界'
      ];

      for (const testText of testCases) {
        const response = await request(app)
          .post('/api/v1/mcp/text')
          .send({
            sessionId,
            text: testText,
            metadata: { source: 'format-consistency-test' }
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(typeof response.body.content).toBe('string');
        expect(typeof response.body.confidence).toBe('number');
        expect(typeof response.body.provider).toBe('string');
      }
    });
  });

  describe('Health and Monitoring', () => {
    it('should provide health endpoint', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.version).toBeDefined();
    });

    it('should handle health check during active sessions', async () => {
      // Create multiple active sessions
      const sessions = await Promise.all([
        request(app).post('/api/v1/mcp/connect').send({}),
        request(app).post('/api/v1/mcp/connect').send({}),
        request(app).post('/api/v1/mcp/connect').send({})
      ]);

      // Health check should still work
      const healthResponse = await request(app).get('/health');
      expect(healthResponse.status).toBe(200);

      // Clean up sessions
      await Promise.all(
        sessions.map(s => 
          request(app)
            .post('/api/v1/mcp/disconnect')
            .send({ sessionId: s.body.sessionId })
        )
      );
    });
  });
});
