import request from 'supertest';
import { jest } from '@jest/globals';
import { app } from '../../src/server.js';

describe('MCP Integration Flow', () => {
  let sessionId;
  let requestId;

  beforeAll(async () => {
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('Complete MCP Flow', () => {
    it('should complete full voice-to-response flow', async () => {
      // Step 1: Connect to MCP server
      const connectResponse = await request(app)
        .post('/api/v1/mcp/connect')
        .send({ clientInfo: { version: '1.0.0', platform: 'android' } });

      expect(connectResponse.status).toBe(200);
      expect(connectResponse.body.success).toBe(true);
      sessionId = connectResponse.body.sessionId;
      expect(sessionId).toBeDefined();

      // Step 2: Send metadata
      const metadataResponse = await request(app)
        .post('/api/v1/mcp/metadata')
        .send({
          sessionId,
          metadata: {
            userPreference: 'concise',
            language: 'en',
            source: 'voice'
          }
        });

      expect(metadataResponse.status).toBe(200);
      expect(metadataResponse.body.success).toBe(true);

      // Step 3: Stream audio data (simulating "Hey Alfred, what's the weather?")
      const audioChunk1 = Buffer.from(Array(1024).fill(0).map(() => Math.floor(Math.random() * 256)));
      const audioChunk2 = Buffer.from(Array(1024).fill(0).map(() => Math.floor(Math.random() * 256)));
      const audioChunk3 = Buffer.from(Array(512).fill(0).map(() => Math.floor(Math.random() * 256)));

      // First chunk
      const stream1Response = await request(app)
        .post('/api/v1/audio/stream')
        .set('x-session-id', sessionId)
        .set('x-is-last-chunk', 'false')
        .set('x-sample-rate', '16000')
        .set('x-channels', '1')
        .set('x-encoding', 'PCM_16BIT')
        .send(audioChunk1);

      expect(stream1Response.status).toBe(200);
      expect(stream1Response.body.success).toBe(true);
      requestId = stream1Response.body.requestId;

      // Second chunk
      const stream2Response = await request(app)
        .post('/api/v1/audio/stream')
        .set('x-session-id', sessionId)
        .set('x-request-id', requestId)
        .set('x-is-last-chunk', 'false')
        .send(audioChunk2);

      expect(stream2Response.status).toBe(200);
      expect(stream2Response.body.requestId).toBe(requestId);

      // Final chunk - should trigger transcription and AI processing
      const stream3Response = await request(app)
        .post('/api/v1/audio/stream')
        .set('x-session-id', sessionId)
        .set('x-request-id', requestId)
        .set('x-is-last-chunk', 'true')
        .send(audioChunk3);

      expect(stream3Response.status).toBe(200);
      expect(stream3Response.body.isLastChunk).toBe(true);
      
      // Should have transcription and AI response
      if (stream3Response.body.result.transcription) {
        expect(stream3Response.body.result.transcription.text).toBeDefined();
        expect(stream3Response.body.result.aiResponse).toBeDefined();
        expect(stream3Response.body.result.totalChunks).toBe(3);
      }

      // Step 4: Check processing status
      const statusResponse = await request(app)
        .get(`/api/v1/audio/status/${requestId}`)
        .set('x-session-id', sessionId);

      expect(statusResponse.status).toBe(200);

      // Step 5: Send direct text command
      const textResponse = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId,
          text: 'What time is it?',
          metadata: { source: 'text', priority: 'normal' }
        });

      expect(textResponse.status).toBe(200);
      expect(textResponse.body.success).toBe(true);
      expect(textResponse.body.response).toBeDefined();

      // Step 6: Disconnect
      const disconnectResponse = await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({ sessionId });

      expect(disconnectResponse.status).toBe(200);
      expect(disconnectResponse.body.success).toBe(true);
    });

    it('should handle concurrent sessions', async () => {
      // Create multiple sessions
      const session1Response = await request(app)
        .post('/api/v1/mcp/connect')
        .send({ clientInfo: { device: 'android-1' } });

      const session2Response = await request(app)
        .post('/api/v1/mcp/connect')
        .send({ clientInfo: { device: 'android-2' } });

      expect(session1Response.body.sessionId).not.toBe(session2Response.body.sessionId);

      // Send commands to both sessions
      const text1Response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId: session1Response.body.sessionId,
          text: 'Hello from session 1'
        });

      const text2Response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId: session2Response.body.sessionId,
          text: 'Hello from session 2'
        });

      expect(text1Response.status).toBe(200);
      expect(text2Response.status).toBe(200);

      // Clean up
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
        .send({});

      const testSessionId = connectResponse.body.sessionId;

      // Start a text command
      const textPromise = request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId: testSessionId,
          text: 'This is a long processing request that should be cancelled'
        });

      // Immediately cancel
      const cancelResponse = await request(app)
        .post('/api/v1/mcp/cancel')
        .send({ sessionId: testSessionId });

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.success).toBe(true);

      // Clean up
      await request(app)
        .post('/api/v1/mcp/disconnect')
        .send({ sessionId: testSessionId });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          sessionId: 'invalid-session-id',
          text: 'This should fail'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Session not found');
    });

    it('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/text')
        .send({
          // Missing required fields
          invalidField: 'test'
        });

      expect(response.status).toBe(400);
    });

    it('should handle audio streaming without session', async () => {
      const audioData = Buffer.from([1, 2, 3, 4]);

      const response = await request(app)
        .post('/api/v1/audio/stream')
        .send(audioData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Session ID required in x-session-id header');
    });
  });

  describe('Health and Status', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.version).toBeDefined();
    });

    it('should return API information', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Alfred MCP Server');
      expect(response.body.endpoints).toBeDefined();
    });
  });
});
