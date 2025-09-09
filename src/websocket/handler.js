import { logger } from '../utils/logger.js';

/**
 * WebSocket handler for real-time communication
 */
export function setupWebSocket(io, dependencies) {
  const { sessionManager, smartAIRouter } = dependencies;

  io.on('connection', (socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`);

    // Handle session join
    socket.on('join-session', async (data) => {
      const { sessionId } = data;
      const session = await sessionManager.getSession(sessionId);
      
      if (session) {
        socket.join(sessionId);
        socket.emit('session-joined', { sessionId, status: 'connected' });
        logger.info(`Client ${socket.id} joined session ${sessionId}`);
      } else {
        socket.emit('error', { message: 'Session not found' });
      }
    });

    // Handle real-time text commands
    socket.on('text-command', async (data) => {
      try {
        const { sessionId, text, requestId } = data;
        
        // Process through Smart AI Router
        const response = await smartAIRouter.processTextCommand(text, {
          sessionId,
          requestId,
          metadata: { source: 'websocket' }
        });

        // Send response back to client
        socket.to(sessionId).emit('text-response', {
          requestId,
          response
        });

      } catch (error) {
        logger.error('WebSocket text command error:', error);
        socket.emit('error', { message: 'Failed to process command' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });
  });
}
