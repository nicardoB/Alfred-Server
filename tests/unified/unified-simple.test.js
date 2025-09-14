import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Sequelize } from 'sequelize';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Simple unified system test - validates core unified functionality
describe('Unified Alfred System - Simple Test', () => {
  let app;
  let sequelize;
  let User, Conversation, Message, CostUsage;
  let testUser, authToken;

  beforeAll(async () => {
    // Setup test database
    sequelize = new Sequelize('sqlite::memory:', { logging: false });
    
    // Define models inline for simplicity
    User = sequelize.define('User', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      email: { type: Sequelize.STRING, unique: true, allowNull: false },
      hashedPassword: { type: Sequelize.STRING, allowNull: false },
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
    Conversation.hasMany(CostUsage, { foreignKey: 'conversationId', as: 'costs' });
    Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
    Message.hasMany(CostUsage, { foreignKey: 'messageId', as: 'costs' });
    CostUsage.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    CostUsage.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
    CostUsage.belongsTo(Message, { foreignKey: 'messageId', as: 'message' });
    
    await sequelize.sync();

    // Create test user
    testUser = await User.create({
      id: 'test-user-id',
      email: 'test@unified.com',
      hashedPassword: await bcrypt.hash('testpass123', 12),
      role: 'owner',
      permissions: {
        chat: true,
        poker: true,
        code: true,
        voice: true,
        monitoring: true
      }
    });

    // Generate auth token
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role },
      'test-secret',
      { expiresIn: '1h' }
    );

    // Create Express app with unified routes
    app = express();
    app.use(express.json());

    // Mock authentication middleware - get actual user permissions
    app.use(async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const decoded = jwt.verify(token, 'test-secret');
          const user = await User.findByPk(decoded.userId);
          if (user) {
            req.user = {
              id: user.id,
              email: user.email,
              role: user.role,
              permissions: user.permissions
            };
            next();
          } else {
            return res.status(401).json({ error: 'User not found' });
          }
        } catch (error) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      } else {
        return res.status(401).json({ error: 'No token provided' });
      }
    });

    // Unified conversation routes
    app.post('/api/v1/chat/conversations', async (req, res) => {
      try {
        const { title, toolContext = 'chat', context } = req.body;
        
        // Validate tool context permission
        const hasPermission = req.user.permissions?.[toolContext] || 
                             (toolContext === 'chat' && req.user.permissions?.chat);
        
        if (!hasPermission) {
          return res.status(403).json({ 
            error: `Insufficient permissions for ${toolContext} tool` 
          });
        }

        const conversation = await Conversation.create({
          userId: req.user.id,
          title: title || `New ${toolContext} conversation`,
          toolContext,
          context
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
        const { toolContext, limit = 50 } = req.query;
        
        const whereClause = {
          userId: req.user.id,
          ...(toolContext && { toolContext })
        };

        const conversations = await Conversation.findAll({
          where: whereClause,
          order: [['createdAt', 'DESC']],
          limit: parseInt(limit)
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

    app.post('/api/v1/chat/conversations/:conversationId/messages', async (req, res) => {
      try {
        const { conversationId } = req.params;
        const { content, role = 'user', toolContext = 'chat' } = req.body;

        // Verify conversation ownership
        const conversation = await Conversation.findOne({
          where: { 
            id: conversationId, 
            userId: req.user.id 
          }
        });

        if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found' });
        }

        const message = await Message.create({
          conversationId,
          role,
          content,
          toolContext
        });

        // Update conversation metadata
        await conversation.update({
          messageCount: conversation.messageCount + 1,
          lastMessageAt: new Date()
        });

        res.status(201).json({
          message: {
            id: message.id,
            role: message.role,
            content: message.content,
            toolContext: message.toolContext,
            createdAt: message.createdAt
          }
        });
      } catch (error) {
        console.error('Error creating message:', error);
        res.status(500).json({ error: 'Failed to create message' });
      }
    });

    // Cost tracking route
    app.get('/api/v1/chat/costs/breakdown', async (req, res) => {
      try {
        const { timeframe = '30d' } = req.query;
        
        // Calculate date range
        const now = new Date();
        const startDate = new Date();
        startDate.setDate(now.getDate() - 30);

        const costBreakdown = await CostUsage.findAll({
          where: {
            userId: req.user.id,
            createdAt: {
              [Sequelize.Op.gte]: startDate
            }
          },
          attributes: [
            'toolContext',
            'provider',
            [Sequelize.fn('SUM', Sequelize.col('totalCost')), 'totalCost'],
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'requestCount']
          ],
          group: ['toolContext', 'provider'],
          order: [[Sequelize.fn('SUM', Sequelize.col('totalCost')), 'DESC']]
        });

        res.json({
          timeframe,
          breakdown: costBreakdown,
          totalCost: costBreakdown.reduce((sum, item) => sum + parseFloat(item.dataValues.totalCost || 0), 0)
        });
      } catch (error) {
        console.error('Error fetching cost breakdown:', error);
        res.status(500).json({ error: 'Failed to fetch cost breakdown' });
      }
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('Tool Context Integration', () => {
    it('should create conversation with different tool contexts', async () => {
      // Create poker conversation
      const pokerResponse = await request(app)
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Poker Analysis',
          toolContext: 'poker'
        })
        .expect(201);

      expect(pokerResponse.body.conversation.toolContext).toBe('poker');
      expect(pokerResponse.body.conversation.title).toBe('Poker Analysis');

      // Create code conversation
      const codeResponse = await request(app)
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Code Review',
          toolContext: 'code'
        })
        .expect(201);

      expect(codeResponse.body.conversation.toolContext).toBe('code');
      expect(codeResponse.body.conversation.title).toBe('Code Review');
    });

    it('should filter conversations by tool context', async () => {
      // Get only poker conversations
      const response = await request(app)
        .get('/api/v1/chat/conversations?toolContext=poker')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.conversations).toHaveLength(1);
      expect(response.body.conversations[0].toolContext).toBe('poker');
    });

    it('should reject conversation creation for unauthorized tool', async () => {
      // Create demo user without poker permissions
      const demoUser = await User.create({
        email: 'demo@test.com',
        hashedPassword: await bcrypt.hash('demo123', 12),
        role: 'demo',
        permissions: { chat: true }
      });

      const demoToken = jwt.sign(
        { userId: demoUser.id, email: demoUser.email, role: demoUser.role },
        'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          title: 'Unauthorized Poker',
          toolContext: 'poker'
        })
        .expect(403);

      expect(response.body.error).toContain('Insufficient permissions');

      await demoUser.destroy();
    });
  });

  describe('Unified Data Management', () => {
    it('should manage messages across tool contexts', async () => {
      // Get poker conversation
      const conversations = await request(app)
        .get('/api/v1/chat/conversations?toolContext=poker')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const pokerConversation = conversations.body.conversations[0];

      // Add message to poker conversation
      const messageResponse = await request(app)
        .post(`/api/v1/chat/conversations/${pokerConversation.id}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Analyze this hand: AA vs KK preflop',
          role: 'user',
          toolContext: 'poker'
        })
        .expect(201);

      expect(messageResponse.body.message.content).toBe('Analyze this hand: AA vs KK preflop');
      expect(messageResponse.body.message.toolContext).toBe('poker');
    });

    it('should track costs with tool context', async () => {
      // Create cost usage entries
      await CostUsage.create({
        userId: testUser.id,
        toolContext: 'poker',
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        inputTokens: 150,
        outputTokens: 300,
        totalCost: 0.025
      });

      await CostUsage.create({
        userId: testUser.id,
        toolContext: 'chat',
        provider: 'claude',
        model: 'claude-3-haiku',
        inputTokens: 100,
        outputTokens: 200,
        totalCost: 0.008
      });

      // Get cost breakdown
      const response = await request(app)
        .get('/api/v1/chat/costs/breakdown')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.breakdown).toHaveLength(2);
      expect(response.body.totalCost).toBeCloseTo(0.033, 3);
      
      const pokerCost = response.body.breakdown.find(b => b.toolContext === 'poker');
      const chatCost = response.body.breakdown.find(b => b.toolContext === 'chat');
      
      expect(pokerCost).toBeDefined();
      expect(chatCost).toBeDefined();
    });
  });

  describe('Database Model Relationships', () => {
    it('should maintain proper associations between models', async () => {
      // Get a conversation with messages and costs
      const conversation = await Conversation.findOne({
        where: { toolContext: 'poker' },
        include: [
          { model: Message, as: 'messages' },
          { model: CostUsage, as: 'costs' }
        ]
      });

      expect(conversation).toBeDefined();
      expect(conversation.toolContext).toBe('poker');
      expect(conversation.messages).toBeDefined();
      expect(conversation.costs).toBeDefined();
    });
  });
});
