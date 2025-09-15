import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { authenticate, requireFriend, rateLimit } from '../middleware/authentication.js';

export function mcpRoutes(sessionManager, smartAIRouter) {
  const router = Router();

  // Apply authentication and rate limiting to all MCP routes
  router.use(authenticate);
  router.use(requireFriend);
  router.use(rateLimit(200)); // 200 requests per hour for MCP operations

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
    logger.info(`MCP DEBUG - /text route called with body:`, { 
      hasSessionId: !!req.body?.sessionId, 
      hasText: !!req.body?.text,
      userId: req.user?.id 
    });
    
    try {
      const { sessionId, text, metadata = {} } = req.body;
      
      logger.info(`MCP DEBUG - Extracted sessionId: ${sessionId}, text length: ${text?.length}`);
      
      if (!sessionId || !text) {
        logger.warn(`MCP DEBUG - Missing required fields: sessionId=${!!sessionId}, text=${!!text}`);
        return res.status(400).json({
          success: false,
          error: 'Session ID and text required'
        });
      }

      logger.info(`MCP DEBUG - Looking for session: ${sessionId}`);
      const session = await sessionManager.getSession(sessionId);
      logger.info(`MCP DEBUG - Session found:`, !!session);
      if (!session) {
        logger.warn(`MCP DEBUG - Session ${sessionId} not found, returning 404`);
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      const requestId = uuidv4();
      
      logger.info(`MCP DEBUG - About to call SmartAIRouter with userId: ${req.user?.id}`);
      
      // Process text command through Smart AI Router
      const aiResult = await smartAIRouter.processTextCommand(text, {
        sessionId,
        requestId,
        metadata: {
          ...metadata,
          userId: req.user?.id, // Add user ID for cost tracking
          toolContext: metadata.toolContext || 'chat'
        }
      });
      
      logger.info(`MCP DEBUG - SmartAIRouter returned:`, { 
        provider: aiResult.provider, 
        hasResponse: !!aiResult.response,
        responseKeys: aiResult.response ? Object.keys(aiResult.response) : []
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
