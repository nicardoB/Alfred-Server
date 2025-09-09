import request from 'supertest';
import { jest } from '@jest/globals';
import express from 'express';
import { audioRoutes } from '../../src/routes/audio.js';

describe('Audio Routes', () => {
  let app;
  let mockSessionManager;
  let mockSmartAIRouter;

  beforeEach(() => {
    // Mock dependencies
    mockSessionManager = {
      getSession: jest.fn()
    };

    mockSmartAIRouter = {
      processAudioChunk: jest.fn(),
      getProcessingStatus: jest.fn()
    };

    // Setup test app
    app = express();
    app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));
    app.use(express.raw({ type: '*/*', limit: '10mb' }));
    app.use('/audio', audioRoutes(mockSessionManager, mockSmartAIRouter));
  });

  describe('POST /audio/stream', () => {
    it('should process audio chunk successfully', async () => {
      const mockSession = { id: 'test-session-123' };
      const mockResult = {
        status: 'processing',
        chunksReceived: 1,
        bytesReceived: 1024
      };

      mockSessionManager.getSession.mockResolvedValue(mockSession);
      mockSmartAIRouter.processAudioChunk.mockResolvedValue(mockResult);

      const audioData = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);

      const response = await request(app)
        .post('/audio/stream')
        .set('x-session-id', 'test-session-123')
        .set('x-is-last-chunk', 'false')
        .set('x-sample-rate', '16000')
        .set('x-channels', '1')
        .set('x-bits-per-sample', '16')
        .set('x-encoding', 'PCM_16BIT')
        .send(audioData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.requestId).toBeDefined();
      expect(response.body.bytesReceived).toBe(8);
      expect(response.body.isLastChunk).toBe(false);
      expect(response.body.result).toEqual(mockResult);

      expect(mockSmartAIRouter.processAudioChunk).toHaveBeenCalledWith(
        audioData,
        expect.objectContaining({
          sessionId: 'test-session-123',
          requestId: expect.any(String),
          isLastChunk: false,
          audioFormat: {
            sampleRate: 16000,
            channels: 1,
            bitsPerSample: 16,
            encoding: 'PCM_16BIT'
          }
        })
      );
    });

    it('should handle last chunk with transcription', async () => {
      const mockSession = { id: 'test-session-123' };
      const mockResult = {
        transcription: { text: 'Hello Alfred', confidence: 0.9 },
        aiResponse: { provider: 'claude', response: { content: 'Hi there!' } },
        totalChunks: 3,
        totalBytes: 3072
      };

      mockSessionManager.getSession.mockResolvedValue(mockSession);
      mockSmartAIRouter.processAudioChunk.mockResolvedValue(mockResult);

      const audioData = Buffer.from([1, 2, 3, 4]);

      const response = await request(app)
        .post('/audio/stream')
        .set('x-session-id', 'test-session-123')
        .set('x-is-last-chunk', 'true')
        .set('x-request-id', 'test-request-456')
        .send(audioData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.requestId).toBe('test-request-456');
      expect(response.body.isLastChunk).toBe(true);
      expect(response.body.result.transcription.text).toBe('Hello Alfred');
      expect(response.body.result.aiResponse.provider).toBe('claude');
    });

    it('should require session ID header', async () => {
      const audioData = Buffer.from([1, 2, 3, 4]);

      const response = await request(app)
        .post('/audio/stream')
        .send(audioData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Session ID required in x-session-id header');
    });

    it('should handle invalid session', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      const audioData = Buffer.from([1, 2, 3, 4]);

      const response = await request(app)
        .post('/audio/stream')
        .set('x-session-id', 'invalid-session')
        .send(audioData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Session not found');
    });

    it('should use default audio format values', async () => {
      const mockSession = { id: 'test-session-123' };
      const mockResult = { status: 'processing' };

      mockSessionManager.getSession.mockResolvedValue(mockSession);
      mockSmartAIRouter.processAudioChunk.mockResolvedValue(mockResult);

      const audioData = Buffer.from([1, 2, 3, 4]);

      await request(app)
        .post('/audio/stream')
        .set('x-session-id', 'test-session-123')
        .send(audioData);

      expect(mockSmartAIRouter.processAudioChunk).toHaveBeenCalledWith(
        audioData,
        expect.objectContaining({
          audioFormat: {
            sampleRate: 16000,
            channels: 1,
            bitsPerSample: 16,
            encoding: 'PCM_16BIT'
          }
        })
      );
    });

    it('should handle processing errors', async () => {
      const mockSession = { id: 'test-session-123' };
      mockSessionManager.getSession.mockResolvedValue(mockSession);
      mockSmartAIRouter.processAudioChunk.mockRejectedValue(new Error('Processing failed'));

      const audioData = Buffer.from([1, 2, 3, 4]);

      const response = await request(app)
        .post('/audio/stream')
        .set('x-session-id', 'test-session-123')
        .send(audioData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to process audio stream');
    });
  });

  describe('GET /audio/status/:requestId', () => {
    it('should return processing status successfully', async () => {
      const mockStatus = {
        status: 'processing',
        provider: 'claude',
        type: 'audio',
        processingTimeMs: 5000,
        chunksReceived: 3,
        sessionId: 'test-session-123'
      };

      mockSmartAIRouter.getProcessingStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/audio/status/test-request-456')
        .set('x-session-id', 'test-session-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.requestId).toBe('test-request-456');
      expect(response.body.status).toEqual(mockStatus);

      expect(mockSmartAIRouter.getProcessingStatus).toHaveBeenCalledWith(
        'test-request-456',
        'test-session-123'
      );
    });

    it('should require session ID header', async () => {
      const response = await request(app)
        .get('/audio/status/test-request-456');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Session ID required in x-session-id header');
    });

    it('should handle status retrieval errors', async () => {
      mockSmartAIRouter.getProcessingStatus.mockRejectedValue(new Error('Status error'));

      const response = await request(app)
        .get('/audio/status/test-request-456')
        .set('x-session-id', 'test-session-123');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to get processing status');
    });

    it('should handle request not found', async () => {
      const mockStatus = {
        status: 'not_found',
        message: 'Request not found or completed'
      };

      mockSmartAIRouter.getProcessingStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/audio/status/non-existent-request')
        .set('x-session-id', 'test-session-123');

      expect(response.status).toBe(200);
      expect(response.body.status.status).toBe('not_found');
    });
  });
});
