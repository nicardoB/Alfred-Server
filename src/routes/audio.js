import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export function audioRoutes(sessionManager, smartAIRouter) {
  const router = Router();

  // Stream audio data - matches MCPClient.streamAudioData()
  router.post('/stream', async (req, res) => {
    try {
      const sessionId = req.headers['x-session-id'];
      const isLastChunk = req.headers['x-is-last-chunk'] === 'true';
      const audioData = req.body; // Raw audio bytes
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID required in x-session-id header'
        });
      }

      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      const requestId = req.headers['x-request-id'] || uuidv4();
      
      // Process audio chunk through Smart AI Router
      const result = await smartAIRouter.processAudioChunk(audioData, {
        sessionId,
        requestId,
        isLastChunk,
        audioFormat: {
          sampleRate: parseInt(req.headers['x-sample-rate']) || 16000,
          channels: parseInt(req.headers['x-channels']) || 1,
          bitsPerSample: parseInt(req.headers['x-bits-per-sample']) || 16,
          encoding: req.headers['x-encoding'] || 'PCM_16BIT'
        }
      });

      res.json({
        success: true,
        requestId,
        bytesReceived: audioData ? audioData.length : 0,
        isLastChunk,
        result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to process audio stream:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process audio stream'
      });
    }
  });

  // Get audio processing status
  router.get('/status/:requestId', async (req, res) => {
    try {
      const { requestId } = req.params;
      const sessionId = req.headers['x-session-id'];
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID required in x-session-id header'
        });
      }

      const status = await smartAIRouter.getProcessingStatus(requestId, sessionId);
      
      res.json({
        success: true,
        requestId,
        status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get audio processing status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get processing status'
      });
    }
  });

  return router;
}
