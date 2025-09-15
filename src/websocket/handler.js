import { logger } from '../utils/logger.js';
import { authenticateSocket } from '../middleware/socketAuth.js';
import { getConversationModel } from '../models/Conversation.js';
import { getMessageModel } from '../models/Message.js';
import { CostTracker } from '../monitoring/CostTracker.js';

/**
 * WebSocket handler for real-time chat communication
 */
export function setupWebSocket(io, dependencies) {
  const { sessionManager, smartAIRouter } = dependencies;
  const costTracker = new CostTracker();

  // Authentication middleware for WebSocket
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    logger.info(`WebSocket client connected: ${socket.id}, user: ${socket.user?.email}`);
    
    // Join user-specific room for cost updates
    socket.join(`user-${socket.user.id}`);
    
    // Send initial cost data
    costTracker.getUsageStats().then(costData => {
      socket.emit('cost-update', {
        summary: costData.summary,
        providers: costData.providers,
        timestamp: new Date().toISOString()
      });
    }).catch(error => {
      logger.error('Failed to send initial cost data:', error);
    });

    // Handle conversation join
    socket.on('join-conversation', async (data) => {
      try {
        const { conversationId } = data;
        const Conversation = getConversationModel();
        
        // Verify user owns this conversation
        const conversation = await Conversation.findOne({
          where: { 
            id: conversationId, 
            userId: socket.user.id 
          }
        });
        
        if (conversation) {
          socket.join(conversationId);
          socket.emit('conversation-joined', { 
            conversationId, 
            status: 'connected',
            conversation: {
              id: conversation.id,
              title: conversation.title,
              totalCost: conversation.totalCost,
              messageCount: conversation.messageCount
            }
          });
          logger.info(`Client ${socket.id} joined conversation ${conversationId}`);
        } else {
          socket.emit('error', { message: 'Conversation not found or access denied' });
        }
      } catch (error) {
        logger.error('WebSocket join conversation error:', error);
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Handle chat message
    socket.on('chat-message', async (data) => {
      try {
        const { conversationId, content, requestId } = data;
        const Message = getMessageModel();
        const Conversation = getConversationModel();
        
        // Verify conversation ownership
        const conversation = await Conversation.findOne({
          where: { 
            id: conversationId, 
            userId: socket.user.id 
          }
        });
        
        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        // Create user message
        const userMessage = await Message.create({
          conversationId,
          role: 'user',
          content,
          metadata: { 
            requestId,
            source: 'websocket',
            userAgent: socket.handshake.headers['user-agent']
          }
        });

        // Emit user message to conversation
        io.to(conversationId).emit('message-created', {
          message: {
            id: userMessage.id,
            role: userMessage.role,
            content: userMessage.content,
            createdAt: userMessage.createdAt
          }
        });

        // Create assistant message placeholder for streaming
        const assistantMessage = await Message.create({
          conversationId,
          role: 'assistant',
          content: '',
          isStreaming: true,
          isComplete: false,
          metadata: { requestId }
        });

        // Emit assistant message placeholder
        io.to(conversationId).emit('message-created', {
          message: {
            id: assistantMessage.id,
            role: assistantMessage.role,
            content: '',
            isStreaming: true,
            createdAt: assistantMessage.createdAt
          }
        });

        // Get conversation context for AI
        const context = await Message.getConversationContext(conversationId);
        
        // Process through Smart AI Router with streaming
        await smartAIRouter.processStreamingChat({
          conversationId,
          messageId: assistantMessage.id,
          context,
          userMessage: content,
          user: socket.user,
          onStream: (chunk) => {
            // Emit streaming chunk
            io.to(conversationId).emit('message-stream', {
              messageId: assistantMessage.id,
              chunk,
              requestId
            });
          },
          onComplete: async (finalContent, metadata) => {
            // Update message as complete
            await assistantMessage.updateContent(finalContent, metadata);
            await assistantMessage.markComplete();
            
            // Track cost and emit cost update
            if (metadata?.usage) {
              const { inputTokens, outputTokens, provider, model } = metadata.usage;
              await costTracker.trackUsage({
                provider,
                inputTokens,
                outputTokens,
                userId: socket.user?.id,
                toolContext: 'chat',
                model,
                conversationId: conversationId,
                sessionId: socket.id
              });
              
              // Get updated cost data and emit to user
              const costData = await costTracker.getUsageStats();
              io.to(`user-${socket.user.id}`).emit('cost-update', {
                summary: costData.summary,
                providers: costData.providers,
                timestamp: new Date().toISOString()
              });
            }
            
            // Emit completion
            io.to(conversationId).emit('message-complete', {
              messageId: assistantMessage.id,
              content: finalContent,
              metadata,
              requestId
            });
          },
          onError: (error) => {
            logger.error('Streaming chat error:', error);
            io.to(conversationId).emit('message-error', {
              messageId: assistantMessage.id,
              error: 'Failed to generate response',
              requestId
            });
          }
        });

      } catch (error) {
        logger.error('WebSocket chat message error:', error);
        socket.emit('error', { 
          message: 'Failed to process message',
          requestId: data.requestId 
        });
      }
    });

    // Handle message regeneration
    socket.on('regenerate-message', async (data) => {
      try {
        const { messageId, requestId } = data;
        const Message = getMessageModel();
        
        // Find the message and verify ownership
        const message = await Message.findOne({
          where: { id: messageId },
          include: [{
            model: getConversationModel(),
            as: 'conversation',
            where: { userId: socket.user.id }
          }]
        });
        
        if (!message || message.role !== 'assistant') {
          socket.emit('error', { message: 'Message not found or cannot regenerate' });
          return;
        }

        // Mark message as streaming again
        message.isStreaming = true;
        message.isComplete = false;
        message.content = '';
        await message.save();

        // Emit regeneration start
        io.to(message.conversationId).emit('message-regenerating', {
          messageId,
          requestId
        });

        // Get fresh context
        const context = await Message.getConversationContext(message.conversationId);
        
        // Process regeneration
        await smartAIRouter.processStreamingChat({
          conversationId: message.conversationId,
          messageId,
          context,
          user: socket.user,
          isRegeneration: true,
          onStream: (chunk) => {
            io.to(message.conversationId).emit('message-stream', {
              messageId,
              chunk,
              requestId
            });
          },
          onComplete: async (finalContent, metadata) => {
            await message.updateContent(finalContent, metadata);
            await message.markComplete();
            
            // Track cost and emit cost update for regeneration
            if (metadata?.usage) {
              const { inputTokens, outputTokens, provider, model } = metadata.usage;
              await costTracker.trackUsage({
                provider,
                inputTokens,
                outputTokens,
                userId: socket.user?.id,
                toolContext: 'chat',
                model,
                conversationId: conversationId,
                sessionId: socket.id
              });
              
              // Get updated cost data and emit to user
              const costData = await costTracker.getUsageStats();
              io.to(`user-${socket.user.id}`).emit('cost-update', {
                summary: costData.summary,
                providers: costData.providers,
                timestamp: new Date().toISOString()
              });
            }
            
            io.to(message.conversationId).emit('message-complete', {
              messageId,
              content: finalContent,
              metadata,
              requestId
            });
          },
          onError: (error) => {
            logger.error('Message regeneration error:', error);
            io.to(message.conversationId).emit('message-error', {
              messageId,
              error: 'Failed to regenerate response',
              requestId
            });
          }
        });

      } catch (error) {
        logger.error('WebSocket regenerate message error:', error);
        socket.emit('error', { 
          message: 'Failed to regenerate message',
          requestId: data.requestId 
        });
      }
    });

    // Handle typing indicators
    socket.on('typing-start', (data) => {
      const { conversationId } = data;
      socket.to(conversationId).emit('user-typing', {
        userId: socket.user.id,
        userEmail: socket.user.email
      });
    });

    socket.on('typing-stop', (data) => {
      const { conversationId } = data;
      socket.to(conversationId).emit('user-stopped-typing', {
        userId: socket.user.id
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });
  });
}
