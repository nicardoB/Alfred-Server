import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export function mcpRoutes(sessionManager, smartAIRouter) {
  const router = Router();

  // Connect to MCP server - matches MCPClient.connect()
  router.post('/connect', async (req, res) => {
    try {
      const sessionId = uuidv4();
      const session = await sessionManager.createSession(sessionId, {
        clientInfo: req.body.clientInfo || {},
        timestamp: new Date().toISOString()
      });

      logger.info(`New MCP session created: ${sessionId}`);
      
      res.json({
        success: true,
        sessionId: sessionId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to create MCP session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create session',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Disconnect from MCP server - matches MCPClient.disconnect()
  router.post('/disconnect', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID required'
        });
      }

      await sessionManager.endSession(sessionId);
      logger.info(`MCP session ended: ${sessionId}`);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to end MCP session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to end session'
      });
    }
  });

  // Send text command - matches MCPClient.sendTextCommand()
  router.post('/text', async (req, res) => {
    try {
      const { sessionId, text, metadata = {} } = req.body;
      
      if (!sessionId || !text) {
        return res.status(400).json({
          success: false,
          error: 'Session ID and text required'
        });
      }

      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      const requestId = uuidv4();
      
      // Process text command through Smart AI Router
      const aiResult = await smartAIRouter.processTextCommand(text, {
        sessionId,
        requestId,
        metadata
      });

      // Flatten the response structure for easier parsing - no nested objects
      res.json({
        success: true,
        sessionId,
        requestId,
        content: aiResult.response?.content || "No response",
        confidence: aiResult.confidence || 0.9,
        provider: aiResult.provider || "unknown",
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to process text command:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process text command'
      });
    }
  });

  // Send metadata - matches MCPClient.sendMetadata()
  router.post('/metadata', async (req, res) => {
    try {
      const { sessionId, metadata } = req.body;
      
      if (!sessionId || !metadata) {
        return res.status(400).json({
          success: false,
          error: 'Session ID and metadata required'
        });
      }

      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      await sessionManager.updateSessionMetadata(sessionId, metadata);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to update metadata:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update metadata'
      });
    }
  });

  // Cancel request - matches MCPClient.cancelRequest()
  router.post('/cancel', async (req, res) => {
    try {
      const { sessionId, requestId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID required'
        });
      }

      // Cancel any ongoing processing for this session/request
      await smartAIRouter.cancelRequest(sessionId, requestId);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to cancel request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel request'
      });
    }
  });

  return router;
}
