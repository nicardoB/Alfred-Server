import { jest } from '@jest/globals';

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const mockAuthenticateSocket = jest.fn((socket, next) => {
  socket.user = { id: 1, email: 'test@example.com' };
  next();
});

const mockConversationModel = {
  findOne: jest.fn(),
  create: jest.fn()
};

const mockMessageModel = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  getConversationContext: jest.fn()
};

const mockSessionManager = {
  createSession: jest.fn(),
  getSession: jest.fn(),
  updateSession: jest.fn()
};

const mockSmartAIRouter = {
  processRequest: jest.fn(),
  processStreamingChat: jest.fn()
};

// Mock socket.io
const mockSocket = {
  id: 'socket-123',
  user: { id: 1, email: 'test@example.com' },
  join: jest.fn(),
  emit: jest.fn(),
  on: jest.fn(),
  to: jest.fn().mockReturnThis(),
  disconnect: jest.fn(),
  handshake: {
    headers: {
      'user-agent': 'test-browser'
    }
  }
};

const mockIo = {
  use: jest.fn(),
  on: jest.fn(),
  to: jest.fn().mockReturnThis(),
  emit: jest.fn()
};

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

jest.unstable_mockModule('../../src/middleware/socketAuth.js', () => ({
  authenticateSocket: mockAuthenticateSocket
}));

jest.unstable_mockModule('../../src/models/Conversation.js', () => ({
  initializeConversationModel: jest.fn(),
  getConversationModel: () => mockConversationModel
}));

jest.unstable_mockModule('../../src/models/Message.js', () => ({
  initializeMessageModel: jest.fn(),
  getMessageModel: () => mockMessageModel
}));

// Import after mocking
const { setupWebSocket } = await import('../../src/websocket/handler.js');

describe('WebSocket Handler', () => {
  let dependencies;
  let connectionHandler;
  let eventHandlers;

  beforeAll(() => {
    dependencies = {
      sessionManager: mockSessionManager,
      smartAIRouter: mockSmartAIRouter
    };

    // Capture the connection handler
    mockIo.on.mockImplementation((event, handler) => {
      if (event === 'connection') {
        connectionHandler = handler;
      }
    });

    // Capture socket event handlers
    mockSocket.on.mockImplementation((event, handler) => {
      if (!eventHandlers) eventHandlers = {};
      eventHandlers[event] = handler;
    });

    setupWebSocket(mockIo, dependencies);

    // Test setup immediately after calling setupWebSocket
    expect(mockIo.use).toHaveBeenCalledWith(mockAuthenticateSocket);
    expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  beforeEach(() => {
    // Don't clear all mocks as it would reset the setup calls
    // Only clear the mocks we use in individual tests
    mockSocket.join.mockClear();
    mockSocket.emit.mockClear();
    mockIo.to.mockClear();
    mockIo.emit.mockClear();
    mockConversationModel.findOne.mockClear();
    mockMessageModel.create.mockClear();
    mockMessageModel.findOne.mockClear();
    mockMessageModel.getConversationContext.mockClear();
    mockSmartAIRouter.processStreamingChat.mockClear();
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
    eventHandlers = {};
  });

  describe('connection handler', () => {
    beforeEach(() => {
      // Simulate connection
      connectionHandler(mockSocket);
    });

    test('should log connection', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'WebSocket client connected: socket-123, user: test@example.com'
      );
    });

    test('should register socket event handlers', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('join-conversation', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('chat-message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('regenerate-message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('typing-start', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('typing-stop', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  describe('join-conversation handler', () => {
    beforeEach(() => {
      connectionHandler(mockSocket);
    });

    test('should join conversation when user owns it', async () => {
      const conversationId = 'conv-123';
      const mockConversation = {
        id: conversationId,
        title: 'Test Conversation',
        totalCost: 0.5,
        messageCount: 5
      };

      mockConversationModel.findOne.mockResolvedValue(mockConversation);

      await eventHandlers['join-conversation']({ conversationId });

      expect(mockSocket.join).toHaveBeenCalledWith(conversationId);
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation-joined', {
        conversationId,
        status: 'connected',
        conversation: {
          id: conversationId,
          title: 'Test Conversation',
          totalCost: 0.5,
          messageCount: 5
        }
      });
    });

    test('should emit error when conversation not found', async () => {
      mockConversationModel.findOne.mockResolvedValue(null);

      await eventHandlers['join-conversation']({ conversationId: 'conv-404' });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Conversation not found or access denied'
      });
    });

    test('should handle database error gracefully', async () => {
      mockConversationModel.findOne.mockRejectedValue(new Error('Database error'));

      await eventHandlers['join-conversation']({ conversationId: 'conv-error' });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to join conversation'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'WebSocket join conversation error:',
        expect.any(Error)
      );
    });
  });

  describe('chat-message handler', () => {
    beforeEach(() => {
      connectionHandler(mockSocket);
      // Mock conversation verification
      mockConversationModel.findOne.mockResolvedValue({
        id: 'conv-123',
        userId: 1,
        title: 'Test Conversation'
      });
    });

    test.skip('should process and save chat message', async () => {
      const messageData = {
        conversationId: 'conv-123',
        content: 'Hello AI',
        requestId: 'req-123'
      };

      const mockUserMessage = {
        id: 'msg-user-123',
        content: 'Hello AI',
        role: 'user',
        conversationId: 'conv-123',
        createdAt: new Date()
      };

      const mockAssistantMessage = {
        id: 'msg-assistant-123',
        content: '',
        role: 'assistant',
        conversationId: 'conv-123',
        isStreaming: true,
        createdAt: new Date(),
        updateContent: jest.fn(),
        markComplete: jest.fn()
      };

      mockMessageModel.create
        .mockResolvedValueOnce(mockUserMessage)
        .mockResolvedValueOnce(mockAssistantMessage);
      
      mockMessageModel.getConversationContext = jest.fn().mockResolvedValue([]);
      
      // Mock processStreamingChat to call the streaming callbacks
      mockSmartAIRouter.processStreamingChat = jest.fn().mockImplementation(async (options) => {
        // Simulate streaming by calling the callbacks
        if (options.onStream) {
          options.onStream('Hello ');
        }
        
        // Test onComplete callback
        if (options.onComplete) {
          await options.onComplete('Hello there!', { tokens: 10 });
        }
      });

      await eventHandlers['chat-message'](messageData);

      expect(mockSmartAIRouter.processStreamingChat).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        messageId: 'msg-assistant-123',
        context: [],
        userMessage: 'Hello AI',
        user: mockSocket.user,
        onStream: expect.any(Function),
        onComplete: expect.any(Function),
        onError: expect.any(Function)
      });
      
      // Verify streaming callbacks were called
      expect(mockIo.to).toHaveBeenCalledWith('conv-123');
      expect(mockIo.to().emit).toHaveBeenCalledWith('message-stream', {
        messageId: 'msg-assistant-123',
        chunk: 'Hello ',
        requestId: 'req-123'
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('message-complete', {
        messageId: 'msg-assistant-123',
        content: 'Hello there!',
        metadata: { tokens: 10 },
        requestId: 'req-123'
      });
      
      expect(mockAssistantMessage.updateContent).toHaveBeenCalledWith('Hello there!', { tokens: 10 });
      expect(mockAssistantMessage.markComplete).toHaveBeenCalled();
    });

    test('should handle streaming error callback', async () => {
      const messageData = {
        conversationId: 'conv-123',
        content: 'Hello AI',
        requestId: 'req-123'
      };

      const mockAssistantMessage = {
        id: 'msg-assistant-123',
        updateContent: jest.fn(),
        markComplete: jest.fn()
      };

      mockMessageModel.create
        .mockResolvedValueOnce({ id: 'msg-user-123' })
        .mockResolvedValueOnce(mockAssistantMessage);
      
      mockMessageModel.getConversationContext = jest.fn().mockResolvedValue([]);
      
      // Mock processStreamingChat to call onError callback
      mockSmartAIRouter.processStreamingChat = jest.fn().mockImplementation(async (options) => {
        if (options.onError) {
          options.onError(new Error('Processing failed'));
        }
      });

      await eventHandlers['chat-message'](messageData);

      expect(mockIo.to().emit).toHaveBeenCalledWith('message-error', {
        messageId: 'msg-assistant-123',
        error: 'Failed to generate response',
        requestId: 'req-123'
      });
    });

    test('should handle chat message processing error', async () => {
      const messageData = {
        conversationId: 'conv-123',
        content: 'Hello AI',
        requestId: 'req-123'
      };

      mockMessageModel.create.mockRejectedValue(new Error('Save failed'));

      await eventHandlers['chat-message'](messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to process message',
        requestId: 'req-123'
      });
    });

    test('should reject message for non-owned conversation', async () => {
      mockConversationModel.findOne.mockResolvedValue(null);

      const messageData = {
        conversationId: 'conv-404',
        content: 'Hello AI',
        requestId: 'req-123'
      };

      await eventHandlers['chat-message'](messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Conversation not found'
      });
    });
  });

  describe('regenerate-message handler', () => {
    beforeEach(() => {
      connectionHandler(mockSocket);
    });

    test.skip('should handle regeneration streaming callbacks', async () => {
      const regenerateData = {
        messageId: 'msg-123',
        requestId: 'req-456'
      };

      const mockMessage = {
        id: 'msg-123',
        role: 'assistant',
        conversationId: 'conv-123',
        userId: 1,
        updateContent: jest.fn(),
        markComplete: jest.fn()
      };

      mockMessageModel.findOne.mockResolvedValue(mockMessage);
      mockMessageModel.getConversationContext = jest.fn().mockResolvedValue([]);
      
      // Mock processStreamingChat to call the streaming callbacks for regeneration
      mockSmartAIRouter.processStreamingChat = jest.fn().mockImplementation(async (options) => {
        // Test onStream callback for regeneration
        if (options.onStream) {
          options.onStream('Regenerated ');
        }
        
        // Test onComplete callback
        if (options.onComplete) {
          await options.onComplete('Regenerated response!', { tokens: 15 });
        }
      });

      await eventHandlers['regenerate-message'](regenerateData);

      // Verify streaming callbacks were called for regeneration
      expect(mockIo.to).toHaveBeenCalledWith('conv-123');
      expect(mockIo.to().emit).toHaveBeenCalledWith('message-stream', {
        messageId: 'msg-123',
        chunk: 'Regenerated ',
        requestId: 'req-456'
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('message-complete', {
        messageId: 'msg-123',
        content: 'Regenerated response!',
        metadata: { tokens: 15 },
        requestId: 'req-456'
      });
      
      expect(mockMessage.updateContent).toHaveBeenCalledWith('Regenerated response!', { tokens: 15 });
      expect(mockMessage.markComplete).toHaveBeenCalled();
    });

    test.skip('should handle regeneration error callback', async () => {
      const regenerateData = {
        messageId: 'msg-123',
        requestId: 'req-456'
      };

      const mockMessage = {
        id: 'msg-123',
        role: 'assistant',
        conversationId: 'conv-123',
        userId: 1,
        updateContent: jest.fn(),
        markComplete: jest.fn()
      };

      mockMessageModel.findOne.mockResolvedValue(mockMessage);
      mockMessageModel.getConversationContext = jest.fn().mockResolvedValue([]);
      
      // Mock processStreamingChat to call onError callback for regeneration
      mockSmartAIRouter.processStreamingChat = jest.fn().mockImplementation(async (options) => {
        // Test onError callback
        if (options.onError) {
          await options.onError(new Error('Failed to generate response'));
        }
      });

      await eventHandlers['regenerate-message'](regenerateData);

      expect(mockIo.to().emit).toHaveBeenCalledWith('message-error', {
        messageId: 'msg-123',
        error: 'Failed to regenerate response',
        requestId: 'req-456'
      });
    });

    test('should regenerate assistant message', async () => {
      const messageData = {
        messageId: 'msg-123',
        requestId: 'req-123'
      };

      const mockMessage = {
        id: 'msg-123',
        role: 'assistant',
        conversationId: 'conv-123',
        isStreaming: false,
        isComplete: true,
        content: 'Old response',
        save: jest.fn(),
        updateContent: jest.fn(),
        markComplete: jest.fn()
      };

      mockMessageModel.findOne.mockResolvedValue(mockMessage);
      mockMessageModel.getConversationContext.mockResolvedValue([]);
      mockSmartAIRouter.processStreamingChat.mockResolvedValue();

      await eventHandlers['regenerate-message'](messageData);

      expect(mockMessage.isStreaming).toBe(true);
      expect(mockMessage.isComplete).toBe(false);
      expect(mockMessage.content).toBe('');
      expect(mockMessage.save).toHaveBeenCalled();

      expect(mockIo.to).toHaveBeenCalledWith('conv-123');
      expect(mockIo.emit).toHaveBeenCalledWith('message-regenerating', {
        messageId: 'msg-123',
        requestId: 'req-123'
      });
    });

    test('should handle regeneration error', async () => {
      const messageData = {
        messageId: 'msg-123',
        requestId: 'req-123'
      };

      mockMessageModel.findOne.mockRejectedValue(new Error('Find failed'));

      await eventHandlers['regenerate-message'](messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to regenerate message',
        requestId: 'req-123'
      });
    });

    test('should reject regeneration for non-assistant message', async () => {
      const messageData = {
        messageId: 'msg-123',
        requestId: 'req-123'
      };

      const mockMessage = {
        id: 'msg-123',
        role: 'user', // Not assistant
        conversationId: 'conv-123'
      };

      mockMessageModel.findOne.mockResolvedValue(mockMessage);

      await eventHandlers['regenerate-message'](messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Message not found or cannot regenerate'
      });
    });
  });

  describe('typing handlers', () => {
    beforeEach(() => {
      connectionHandler(mockSocket);
    });

    test('should broadcast typing-start event', () => {
      const data = { conversationId: 'conv-123' };

      eventHandlers['typing-start'](data);

      expect(mockSocket.to).toHaveBeenCalledWith('conv-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('user-typing', {
        userId: 1,
        userEmail: 'test@example.com'
      });
    });

    test('should broadcast typing-stop event', () => {
      const data = { conversationId: 'conv-123' };

      eventHandlers['typing-stop'](data);

      expect(mockSocket.to).toHaveBeenCalledWith('conv-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('user-stopped-typing', {
        userId: 1
      });
    });
  });

  describe('disconnect handler', () => {
    beforeEach(() => {
      connectionHandler(mockSocket);
    });

    test('should log disconnection', () => {
      eventHandlers['disconnect']();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'WebSocket client disconnected: socket-123'
      );
    });
  });
});
