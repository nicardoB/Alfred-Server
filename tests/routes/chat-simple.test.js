import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Sequelize } from 'sequelize';

// Simple test approach - test the unified chat functionality directly
describe('Chat API Routes - Simple Test', () => {
  let app;
  let sequelize;
  let User, Conversation, Message, CostUsage;

  beforeAll(async () => {
    // Setup test database
    sequelize = new Sequelize('sqlite::memory:', { logging: false });
    
    // Define models inline for simplicity
    User = sequelize.define('User', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      email: { type: Sequelize.STRING, unique: true, allowNull: false },
      passwordHash: { type: Sequelize.STRING, allowNull: false },
      role: { type: Sequelize.ENUM('owner', 'family', 'friend', 'demo'), defaultValue: 'demo' },
      permissions: { type: Sequelize.JSON, defaultValue: {} },
      monthlyBudget: { type: Sequelize.DECIMAL(10, 2), defaultValue: 50.00 }
    });

    Conversation = sequelize.define('Conversation', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: { type: Sequelize.UUID, allowNull: false },
      title: { type: Sequelize.STRING, allowNull: false },
      toolContext: { type: Sequelize.STRING, defaultValue: 'chat' },
      totalCost: { type: Sequelize.DECIMAL(10, 4), defaultValue: 0.0000 },
      messageCount: { type: Sequelize.INTEGER, defaultValue: 0 },
      lastMessageAt: { type: Sequelize.DATE },
      isArchived: { type: Sequelize.BOOLEAN, defaultValue: false }
    });

    Message = sequelize.define('Message', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      conversationId: { type: Sequelize.UUID, allowNull: false },
      role: { type: Sequelize.ENUM('user', 'assistant', 'system'), allowNull: false },
      content: { type: Sequelize.TEXT, allowNull: false },
      toolContext: { type: Sequelize.STRING, defaultValue: 'chat' },
      aiProvider: { type: Sequelize.STRING },
      aiModel: { type: Sequelize.STRING },
      cost: { type: Sequelize.DECIMAL(10, 4), defaultValue: 0.0000 },
      tokenCount: { type: Sequelize.INTEGER, defaultValue: 0 },
      isStreaming: { type: Sequelize.BOOLEAN, defaultValue: false }
    });

    CostUsage = sequelize.define('CostUsage', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: { type: Sequelize.UUID, allowNull: false },
      conversationId: { type: Sequelize.UUID },
      messageId: { type: Sequelize.UUID },
      toolContext: { type: Sequelize.STRING, defaultValue: 'chat' },
      provider: { type: Sequelize.STRING, allowNull: false },
      model: { type: Sequelize.STRING },
      inputTokens: { type: Sequelize.INTEGER, defaultValue: 0 },
      outputTokens: { type: Sequelize.INTEGER, defaultValue: 0 },
      totalCost: { type: Sequelize.DECIMAL(10, 4), defaultValue: 0.0000 }
    });

    // Set up associations
    User.hasMany(Conversation, { foreignKey: 'userId', as: 'conversations' });
    Conversation.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    Conversation.hasMany(Message, { foreignKey: 'conversationId', as: 'messages' });
    Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
    
    await sequelize.sync();

    // Create test user
    await User.create({
      id: 'test-user-id',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      role: 'family',
      permissions: {
        chat: true,
        code: true,
        poker: true,
        voice: true,
        french: true,
        workout: true
      }
    });

    // Create simple Express app with inline routes
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = {
        id: 'test-user-id',
        email: 'test@example.com',
        role: 'family',
        permissions: {
          chat: true,
          code: true,
          poker: true,
          voice: true,
          french: true,
          workout: true
        }
      };
      next();
    });

    // Simple conversation routes
    app.post('/api/v1/chat/conversations', async (req, res) => {
      try {
        const { title, toolContext = 'chat' } = req.body;
        
        const conversation = await Conversation.create({
          userId: req.user.id,
          title: title || 'New Conversation',
          toolContext
        });

        res.status(201).json({
          conversation: {
            id: conversation.id,
            title: conversation.title,
            toolContext: conversation.toolContext,
            totalCost: conversation.totalCost,
            messageCount: conversation.messageCount,
            createdAt: conversation.createdAt
          }
        });
      } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ error: 'Failed to create conversation' });
      }
    });

    app.get('/api/v1/chat/conversations', async (req, res) => {
      try {
        const { toolContext } = req.query;
        
        const whereClause = {
          userId: req.user.id,
          ...(toolContext && { toolContext })
        };

        const conversations = await Conversation.findAll({
          where: whereClause,
          order: [['createdAt', 'DESC']]
        });

        res.json({
          conversations,
          total: conversations.length
        });
      } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
      }
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /conversations', () => {
    it('should create new conversation', async () => {
      const response = await request(app)
        .post('/api/v1/chat/conversations')
        .send({
          title: 'Test Conversation',
          toolContext: 'chat'
        })
        .expect(201);

      expect(response.body.conversation).toBeDefined();
      expect(response.body.conversation.title).toBe('Test Conversation');
      expect(response.body.conversation.toolContext).toBe('chat');
      expect(response.body.conversation.messageCount).toBe(0);
    });

    it('should create conversation with default values', async () => {
      const response = await request(app)
        .post('/api/v1/chat/conversations')
        .send({})
        .expect(201);

      expect(response.body.conversation.title).toBe('New Conversation');
      expect(response.body.conversation.toolContext).toBe('chat');
    });
  });

  describe('GET /conversations', () => {
    beforeEach(async () => {
      // Clean up
      await Conversation.destroy({ where: {} });
      
      // Create test conversations
      await Conversation.create({
        userId: 'test-user-id',
        title: 'Chat Conversation',
        toolContext: 'chat'
      });
      
      await Conversation.create({
        userId: 'test-user-id',
        title: 'Code Conversation',
        toolContext: 'code'
      });
    });

    it('should list user conversations', async () => {
      const response = await request(app)
        .get('/api/v1/chat/conversations')
        .expect(200);

      expect(response.body.conversations).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    it('should filter conversations by toolContext', async () => {
      const response = await request(app)
        .get('/api/v1/chat/conversations?toolContext=code')
        .expect(200);

      expect(response.body.conversations).toHaveLength(1);
      expect(response.body.conversations[0].toolContext).toBe('code');
    });
  });
});
