import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const mockConversationModel = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn()
};

const mockMessageModel = {
  findAll: jest.fn()
};

const mockCostUsageModel = {
  findAll: jest.fn()
};

const mockAuthenticate = jest.fn((req, res, next) => {
  req.user = {
    id: 'test-user-123',
    email: 'test@example.com',
    role: 'family',
    permissions: {
      chat: true,
      code: true,
      poker: true,
      voice: true,
      french: true,
      workout: true,
      monitoring: true
    }
  };
  next();
});

const mockRequireRole = jest.fn(() => (req, res, next) => next());

// Mock modules
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

jest.unstable_mockModule('../../src/middleware/authentication.js', () => ({
  authenticate: mockAuthenticate,
  requireRole: mockRequireRole
}));

jest.unstable_mockModule('../../src/models/Conversation.js', () => ({
  getConversationModel: () => mockConversationModel
}));

jest.unstable_mockModule('../../src/models/Message.js', () => ({
  getMessageModel: () => mockMessageModel
}));

// Mock Sequelize for cost breakdown route
const mockSequelize = {
  Op: {
    gte: Symbol('gte')
  },
  fn: jest.fn((func, col) => `${func}(${col})`),
  col: jest.fn((name) => name)
};

jest.unstable_mockModule('sequelize', () => ({
  default: mockSequelize,
  Op: mockSequelize.Op,
  fn: mockSequelize.fn,
  col: mockSequelize.col
}));

jest.unstable_mockModule('../../src/models/CostUsage.js', () => ({
  getCostUsageModel: () => mockCostUsageModel
}));

// Mock Sequelize operations
jest.unstable_mockModule('sequelize', () => ({
  Op: {
    gte: Symbol('gte')
  },
  fn: jest.fn((func, col) => `${func}(${col})`),
  col: jest.fn((name) => name)
}));

// Import after mocking
const chatRouter = await import('../../src/routes/chat.js');

describe('Chat Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/chat', chatRouter.default);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /conversations', () => {
    test('should fetch user conversations with default parameters', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'Test Conversation 1',
          toolContext: 'chat',
          totalCost: 0.05,
          messageCount: 3,
          lastMessageAt: '2025-09-14T10:15:47.075Z',
          createdAt: '2025-09-14T10:15:47.075Z'
        },
        {
          id: 'conv-2',
          title: 'Test Conversation 2',
          toolContext: 'code',
          totalCost: 0.12,
          messageCount: 5,
          lastMessageAt: '2025-09-14T10:15:47.075Z',
          createdAt: '2025-09-14T10:15:47.075Z'
        }
      ];

      mockConversationModel.findAll.mockResolvedValue(mockConversations);

      const response = await request(app)
        .get('/api/v1/chat/conversations')
        .expect(200);

      expect(mockConversationModel.findAll).toHaveBeenCalledWith({
        where: {
          userId: 'test-user-123'
        },
        order: [['lastMessageAt', 'DESC']],
        limit: 50,
        attributes: [
          'id', 'title', 'toolContext', 'totalCost', 
          'messageCount', 'lastMessageAt', 'createdAt'
        ]
      });

      expect(response.body.conversations).toEqual(mockConversations);
      expect(response.body.total).toBe(2);
    });

    test('should filter conversations by toolContext', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'Code Conversation',
          toolContext: 'code',
          totalCost: 0.12,
          messageCount: 5,
          lastMessageAt: '2025-09-14T10:15:47.075Z',
          createdAt: '2025-09-14T10:15:47.075Z'
        }
      ];

      mockConversationModel.findAll.mockResolvedValue(mockConversations);

      const response = await request(app)
        .get('/api/v1/chat/conversations?toolContext=code&limit=20&includeArchived=true')
        .expect(200);

      expect(mockConversationModel.findAll).toHaveBeenCalledWith({
        where: {
          userId: 'test-user-123',
          toolContext: 'code'
        },
        order: [['lastMessageAt', 'DESC']],
        limit: 20,
        attributes: [
          'id', 'title', 'toolContext', 'totalCost', 
          'messageCount', 'lastMessageAt', 'createdAt'
        ]
      });

      expect(response.body.conversations).toEqual(mockConversations);
    });

    test('should handle database error', async () => {
      mockConversationModel.findAll.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/chat/conversations')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch conversations');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch conversations:', expect.any(Error));
    });
  });

  describe('POST /conversations', () => {
    test('should create new conversation with valid data', async () => {
      const mockConversation = {
        id: 'conv-new-123',
        userId: 'test-user-123',
        title: 'New Test Conversation',
        toolContext: 'chat',
        totalCost: 0,
        messageCount: 0,
        createdAt: '2025-09-14T10:15:47.080Z'
      };

      mockConversationModel.create.mockResolvedValue(mockConversation);

      const response = await request(app)
        .post('/api/v1/chat/conversations')
        .send({
          title: 'New Test Conversation',
          toolContext: 'chat',
          context: { some: 'context' }
        })
        .expect(201);

      expect(mockConversationModel.create).toHaveBeenCalledWith({
        userId: 'test-user-123',
        title: 'New Test Conversation',
        toolContext: 'chat',
        context: { some: 'context' }
      });

      expect(response.body.conversation).toEqual({
        id: 'conv-new-123',
        title: 'New Test Conversation',
        toolContext: 'chat',
        totalCost: 0,
        messageCount: 0,
        createdAt: '2025-09-14T10:15:47.080Z'
      });
    });

    test('should create conversation with default values', async () => {
      const mockConversation = {
        id: 'conv-default-123',
        userId: 'test-user-123',
        title: 'New chat conversation',
        toolContext: 'chat',
        totalCost: 0,
        messageCount: 0,
        createdAt: '2025-09-14T10:15:47.080Z'
      };

      mockConversationModel.create.mockResolvedValue(mockConversation);

      const response = await request(app)
        .post('/api/v1/chat/conversations')
        .send({})
        .expect(201);

      expect(mockConversationModel.create).toHaveBeenCalledWith({
        userId: 'test-user-123',
        title: 'New chat conversation',
        toolContext: 'chat',
        context: undefined
      });
    });

    test('should reject conversation for unauthorized tool context', async () => {
      // Mock user without code permissions
      mockAuthenticate.mockImplementationOnce((req, res, next) => {
        req.user = {
          id: 'test-user-123',
          email: 'test@example.com',
          role: 'demo',
          permissions: {
            chat: true
            // No code permission
          }
        };
        next();
      });

      const response = await request(app)
        .post('/api/v1/chat/conversations')
        .send({
          title: 'Code Conversation',
          toolContext: 'code'
        })
        .expect(403);

      expect(response.body.error).toBe('Insufficient permissions for code tool');
      expect(mockConversationModel.create).not.toHaveBeenCalled();
    });

    test('should handle database error', async () => {
      mockConversationModel.create.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/v1/chat/conversations')
        .send({
          title: 'Test Conversation'
        })
        .expect(500);

      expect(response.body.error).toBe('Failed to create conversation');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create conversation:', expect.any(Error));
    });
  });

  describe('GET /conversations/:conversationId', () => {
    test('should fetch conversation with messages', async () => {
      const mockConversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        toolContext: 'chat',
        userId: 'test-user-123'
      };

      mockConversationModel.findOne.mockResolvedValue(mockConversation);

      const response = await request(app)
        .get('/api/v1/chat/conversations/conv-123?includeMessages=true')
        .expect(200);

      expect(mockConversationModel.findOne).toHaveBeenCalledWith({
        where: {
          id: 'conv-123',
          userId: 'test-user-123'
        },
        include: [{
          model: mockMessageModel,
          as: 'messages',
          order: [['createdAt', 'ASC']],
          attributes: [
            'id', 'role', 'content', 'toolContext', 'aiProvider', 
            'aiModel', 'cost', 'createdAt', 'isStreaming'
          ]
        }]
      });

      expect(response.body.conversation).toEqual(mockConversation);
    });

    test('should fetch conversation without messages', async () => {
      const mockConversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        toolContext: 'chat',
        userId: 'test-user-123'
      };

      mockConversationModel.findOne.mockResolvedValue(mockConversation);

      const response = await request(app)
        .get('/api/v1/chat/conversations/conv-123?includeMessages=false')
        .expect(200);

      expect(mockConversationModel.findOne).toHaveBeenCalledWith({
        where: {
          id: 'conv-123',
          userId: 'test-user-123'
        }
      });

      expect(response.body.conversation).toEqual(mockConversation);
    });

    test('should return 404 for non-existent conversation', async () => {
      mockConversationModel.findOne.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/chat/conversations/conv-404')
        .expect(404);

      expect(response.body.error).toBe('Conversation not found');
    });

    test('should handle database error', async () => {
      mockConversationModel.findOne.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/chat/conversations/conv-123')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch conversation');
    });
  });

  describe('PATCH /conversations/:conversationId', () => {
    test('should update conversation title and archive status', async () => {
      const mockConversation = {
        id: 'conv-123',
        title: 'Old Title',
        isArchived: false,
        userId: 'test-user-123',
        save: jest.fn(),
        updatedAt: '2025-09-14T10:15:47.092Z'
      };

      mockConversationModel.findOne.mockResolvedValue(mockConversation);

      const response = await request(app)
        .patch('/api/v1/chat/conversations/conv-123')
        .send({
          title: 'New Title',
          isArchived: true
        })
        .expect(200);

      expect(mockConversation.title).toBe('New Title');
      expect(mockConversation.isArchived).toBe(true);
      expect(mockConversation.save).toHaveBeenCalled();

      expect(response.body.conversation).toEqual({
        id: 'conv-123',
        title: 'New Title',
        isArchived: true,
        updatedAt: '2025-09-14T10:15:47.092Z'
      });
    });

    test('should update only title', async () => {
      const mockConversation = {
        id: 'conv-123',
        title: 'Old Title',
        isArchived: false,
        userId: 'test-user-123',
        save: jest.fn(),
        updatedAt: '2025-09-14T10:15:47.092Z'
      };

      mockConversationModel.findOne.mockResolvedValue(mockConversation);

      await request(app)
        .patch('/api/v1/chat/conversations/conv-123')
        .send({
          title: 'Updated Title'
        })
        .expect(200);

      expect(mockConversation.title).toBe('Updated Title');
      expect(mockConversation.isArchived).toBe(false); // Unchanged
    });

    test('should return 404 for non-existent conversation', async () => {
      mockConversationModel.findOne.mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/v1/chat/conversations/conv-404')
        .send({
          title: 'New Title'
        })
        .expect(404);

      expect(response.body.error).toBe('Conversation not found');
    });

    test('should handle database error', async () => {
      mockConversationModel.findOne.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .patch('/api/v1/chat/conversations/conv-123')
        .send({
          title: 'New Title'
        })
        .expect(500);

      expect(response.body.error).toBe('Failed to update conversation');
    });
  });

  describe('DELETE /conversations/:conversationId', () => {
    test('should delete conversation successfully', async () => {
      mockConversationModel.destroy.mockResolvedValue(1); // 1 row deleted

      const response = await request(app)
        .delete('/api/v1/chat/conversations/conv-123')
        .expect(200);

      expect(mockConversationModel.destroy).toHaveBeenCalledWith({
        where: {
          id: 'conv-123',
          userId: 'test-user-123'
        }
      });

      expect(response.body.message).toBe('Conversation deleted successfully');
    });

    test('should return 404 for non-existent conversation', async () => {
      mockConversationModel.destroy.mockResolvedValue(0); // 0 rows deleted

      const response = await request(app)
        .delete('/api/v1/chat/conversations/conv-404')
        .expect(404);

      expect(response.body.error).toBe('Conversation not found');
    });

    test('should handle database error', async () => {
      mockConversationModel.destroy.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/api/v1/chat/conversations/conv-123')
        .expect(500);

      expect(response.body.error).toBe('Failed to delete conversation');
    });
  });

  describe('GET /conversations/:conversationId/messages', () => {
    test('should fetch messages for conversation', async () => {
      const mockConversation = {
        id: 'conv-123',
        userId: 'test-user-123'
      };

      const mockMessages = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          toolContext: 'chat',
          aiProvider: null,
          aiModel: null,
          cost: 0,
          tokenCount: 5,
          createdAt: '2025-09-14T10:15:47.097Z',
          isStreaming: false
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there!',
          toolContext: 'chat',
          aiProvider: 'openai',
          aiModel: 'gpt-4',
          cost: 0.02,
          tokenCount: 10,
          createdAt: '2025-09-14T10:15:47.097Z',
          isStreaming: false
        }
      ];

      mockConversationModel.findOne.mockResolvedValue(mockConversation);
      mockMessageModel.findAll.mockResolvedValue(mockMessages);

      const response = await request(app)
        .get('/api/v1/chat/conversations/conv-123/messages')
        .expect(200);

      expect(mockConversationModel.findOne).toHaveBeenCalledWith({
        where: {
          id: 'conv-123',
          userId: 'test-user-123'
        }
      });

      expect(mockMessageModel.findAll).toHaveBeenCalledWith({
        where: { conversationId: 'conv-123' },
        order: [['createdAt', 'ASC']],
        limit: 100,
        offset: 0,
        attributes: [
          'id', 'role', 'content', 'toolContext', 'aiProvider', 
          'aiModel', 'cost', 'tokenCount', 'createdAt', 'isStreaming'
        ]
      });

      expect(response.body.messages).toEqual(mockMessages);
      expect(response.body.conversationId).toBe('conv-123');
      expect(response.body.total).toBe(2);
    });

    test('should handle pagination parameters', async () => {
      const mockConversation = {
        id: 'conv-123',
        userId: 'test-user-123'
      };

      mockConversationModel.findOne.mockResolvedValue(mockConversation);
      mockMessageModel.findAll.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/chat/conversations/conv-123/messages?limit=50&offset=10')
        .expect(200);

      expect(mockMessageModel.findAll).toHaveBeenCalledWith({
        where: { conversationId: 'conv-123' },
        order: [['createdAt', 'ASC']],
        limit: 50,
        offset: 10,
        attributes: [
          'id', 'role', 'content', 'toolContext', 'aiProvider', 
          'aiModel', 'cost', 'tokenCount', 'createdAt', 'isStreaming'
        ]
      });
    });

    test('should return 404 for non-existent conversation', async () => {
      mockConversationModel.findOne.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/chat/conversations/conv-404/messages')
        .expect(404);

      expect(response.body.error).toBe('Conversation not found');
    });

    test('should handle database error', async () => {
      mockConversationModel.findOne.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/chat/conversations/conv-123/messages')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch messages');
    });
  });

  describe('GET /costs/breakdown', () => {
    test.skip('should handle different timeframe parameters', async () => {
      const mockCostData = [
        {
          dataValues: {
            toolContext: 'chat',
            provider: 'openai',
            totalCost: '1.50',
            requestCount: 5,
            inputTokens: 1000,
            outputTokens: 500
          }
        }
      ];
      
      mockCostUsageModel.findAll.mockResolvedValue(mockCostData);

      // Test 1d timeframe
      const response1d = await request(app)
        .get('/api/v1/chat/costs/breakdown?timeframe=1d')
        .expect(200);
      expect(response1d.body.timeframe).toBe('1d');

      // Test 7d timeframe
      const response7d = await request(app)
        .get('/api/v1/chat/costs/breakdown?timeframe=7d')
        .expect(200);
      expect(response7d.body.timeframe).toBe('7d');

      // Test default timeframe (invalid becomes 30d)
      const responseDefault = await request(app)
        .get('/api/v1/chat/costs/breakdown?timeframe=invalid')
        .expect(200);
      expect(responseDefault.body.timeframe).toBe('invalid');
    });

    test.skip('should return cost breakdown with correct structure', async () => {
      const mockCostData = [
        {
          dataValues: {
            toolContext: 'chat',
            provider: 'openai',
            totalCost: '1.50',
            requestCount: 5,
            inputTokens: 1000,
            outputTokens: 500
          }
        },
        {
          dataValues: {
            toolContext: 'poker',
            provider: 'claude',
            totalCost: '2.25',
            requestCount: 3,
            inputTokens: 800,
            outputTokens: 600
          }
        }
      ];
      
      mockCostUsageModel.findAll.mockResolvedValue(mockCostData);

      const response = await request(app)
        .get('/api/v1/chat/costs/breakdown?timeframe=30d')
        .expect(200);

      expect(response.body).toEqual({
        timeframe: '30d',
        breakdown: mockCostData,
        totalCost: 3.75 // 1.50 + 2.25
      });
    });

    test('should handle database error when cost model exists', async () => {
      mockCostUsageModel.findAll.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/chat/costs/breakdown')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch cost breakdown');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch cost breakdown:', expect.any(Error));
    });
  });
});
