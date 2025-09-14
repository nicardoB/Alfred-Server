import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Sequelize, DataTypes } from 'sequelize';

// Define models inline for testing
function defineModels(sequelize) {
  const User = sequelize.define('User', {
    id: { type: DataTypes.STRING, primaryKey: true },
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    hashedPassword: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: 'demo' }
  });

  const Conversation = sequelize.define('Conversation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, defaultValue: 'New Conversation' },
    toolContext: { type: DataTypes.STRING, defaultValue: 'chat' }
  });

  const Message = sequelize.define('Message', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false }
  });

  const CostUsage = sequelize.define('CostUsage', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING, allowNull: false },
    conversationId: { type: DataTypes.UUID },
    messageId: { type: DataTypes.UUID },
    toolContext: { type: DataTypes.STRING, defaultValue: 'chat' },
    cost: { type: DataTypes.DECIMAL(10, 6), defaultValue: 0 }
  });

  return { User, Conversation, Message, CostUsage };
}

// Mock authentication middleware
jest.unstable_mockModule('../../src/middleware/authentication.js', () => ({
  authenticate: (req, res, next) => {
    req.user = { 
      id: 'test-user-id', 
      role: 'owner',
      email: 'test@example.com',
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
  },
  requireRole: (roles) => (req, res, next) => next(),
  requireOwner: (req, res, next) => next(),
  requirePermission: (permission) => (req, res, next) => next()
}));

// Mock model getters - these need to return the actual models
let testModels = {};

jest.unstable_mockModule('../../src/models/Conversation.js', () => ({
  getConversationModel: () => testModels.Conversation
}));

jest.unstable_mockModule('../../src/models/Message.js', () => ({
  getMessageModel: () => testModels.Message
}));

jest.unstable_mockModule('../../src/models/CostUsage.js', () => ({
  getCostUsageModel: () => testModels.CostUsage
}));

const { default: chatRoutes } = await import('../../src/routes/chat.js');

describe('Chat API Routes', () => {
  let app;
  let sequelize;
  let User, Conversation, Message, CostUsage;

  beforeAll(async () => {
    // Setup test database
    sequelize = new Sequelize('sqlite::memory:', { logging: false });
    
    // Initialize models
    const models = defineModels(sequelize);
    User = models.User;
    Conversation = models.Conversation;
    Message = models.Message;
    CostUsage = models.CostUsage;
    
    // Set up associations
    User.hasMany(Conversation, { foreignKey: 'userId', as: 'conversations' });
    User.hasMany(CostUsage, { foreignKey: 'userId', as: 'costUsage' });
    Conversation.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    Conversation.hasMany(Message, { foreignKey: 'conversationId', as: 'messages' });
    Conversation.hasMany(CostUsage, { foreignKey: 'conversationId', as: 'costs' });
    Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
    Message.hasMany(CostUsage, { foreignKey: 'messageId', as: 'costs' });
    CostUsage.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    CostUsage.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
    CostUsage.belongsTo(Message, { foreignKey: 'messageId', as: 'message' });
    
    await sequelize.sync();

    // Set up model references for mocks
    testModels = {
      User,
      Conversation,
      Message,
      CostUsage
    };
    
    global.testModels = testModels;

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/v1/chat', chatRoutes);
  });

  afterAll(async () => {
    await sequelize.close();
  });

  afterEach(async () => {
    await User.destroy({ where: {} });
    await Conversation.destroy({ where: {} });
    await Message.destroy({ where: {} });
    await CostUsage.destroy({ where: {} });
  });

  describe('POST /conversations', () => {
    test('should create new conversation', async () => {
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
      expect(response.body.conversation.userId).toBe('test-user-id');
    });

    test('should create conversation with default values', async () => {
      const response = await request(app)
        .post('/api/v1/chat/conversations')
        .send({})
        .expect(201);

      expect(response.body.conversation.title).toBe('New Conversation');
      expect(response.body.conversation.toolContext).toBe('chat');
    });
  });

  describe('GET /conversations', () => {
    test('should list user conversations', async () => {
      // Create test user and conversations
      const testUser = await User.create({
        id: 'test-user-id',
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner'
      });

      await Conversation.create({
        userId: testUser.id,
        title: 'Chat Conversation',
        toolContext: 'chat'
      });

      await Conversation.create({
        userId: testUser.id,
        title: 'Code Conversation',
        toolContext: 'code'
      });

      const response = await request(app)
        .get('/api/v1/chat/conversations')
        .expect(200);

      expect(response.body.conversations).toHaveLength(2);
      expect(response.body.conversations[0].title).toBe('Chat Conversation');
      expect(response.body.conversations[1].title).toBe('Code Conversation');
    });

    test('should filter conversations by toolContext', async () => {
      const testUser = await User.create({
        id: 'test-user-id',
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner'
      });

      await Conversation.create({
        userId: testUser.id,
        title: 'Chat Conversation',
        toolContext: 'chat'
      });

      await Conversation.create({
        userId: testUser.id,
        title: 'Code Conversation',
        toolContext: 'code'
      });

      const response = await request(app)
        .get('/api/v1/chat/conversations?toolContext=code')
        .expect(200);

      expect(response.body.conversations).toHaveLength(1);
      expect(response.body.conversations[0].toolContext).toBe('code');
    });
  });

  describe('POST /conversations/:id/messages', () => {
    test('should add message to conversation', async () => {
      const testUser = await User.create({
        id: 'test-user-id',
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner'
      });

      const conversation = await Conversation.create({
        userId: testUser.id,
        title: 'Test Conversation',
        toolContext: 'chat'
      });

      const response = await request(app)
        .post(`/api/v1/chat/conversations/${conversation.id}/messages`)
        .send({
          content: 'Hello, Alfred!',
          role: 'user'
        })
        .expect(201);

      expect(response.body.message).toBeDefined();
      expect(response.body.message.content).toBe('Hello, Alfred!');
      expect(response.body.message.role).toBe('user');
      expect(response.body.message.conversationId).toBe(conversation.id);
    });

    test('should reject message for non-existent conversation', async () => {
      await request(app)
        .post('/api/v1/chat/conversations/non-existent-id/messages')
        .send({
          content: 'Hello, Alfred!',
          role: 'user'
        })
        .expect(404);
    });
  });

  describe('GET /conversations/:id/messages', () => {
    test('should get messages for conversation', async () => {
      const testUser = await User.create({
        id: 'test-user-id',
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner'
      });

      const conversation = await Conversation.create({
        userId: testUser.id,
        title: 'Test Conversation',
        toolContext: 'chat'
      });

      await Message.create({
        conversationId: conversation.id,
        content: 'Hello!',
        role: 'user'
      });

      await Message.create({
        conversationId: conversation.id,
        content: 'Hi there!',
        role: 'assistant'
      });

      const response = await request(app)
        .get(`/api/v1/chat/conversations/${conversation.id}/messages`)
        .expect(200);

      expect(response.body.messages).toHaveLength(2);
      expect(response.body.messages[0].content).toBe('Hello!');
      expect(response.body.messages[1].content).toBe('Hi there!');
    });
  });
});
