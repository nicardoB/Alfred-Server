import request from 'supertest';
import express from 'express';
import { setupDatabase } from '../../src/config/database.js';
import { setupRoutes } from '../../src/routes/index.js';
import { getUserModel } from '../../src/models/User.js';
import { getConversationModel } from '../../src/models/Conversation.js';
import { getMessageModel } from '../../src/models/Message.js';
import { getCostUsageModel } from '../../src/models/CostUsage.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock authentication middleware for testing
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/middleware/authentication.js', () => ({
  authenticate: (req, res, next) => {
    // Mock authenticated user based on Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          permissions: {
            chat: true,
            poker: true,
            code: true,
            voice: true,
            monitoring: true
          }
        };
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    } else {
      return res.status(401).json({ error: 'No token provided' });
    }
  },
  requireRole: (roles) => (req, res, next) => next(),
  requireOwner: (req, res, next) => next(),
  requirePermission: (permission) => (req, res, next) => next()
}));

// Create test app without top-level await
const createTestApp = async () => {
  const app = express();
  app.use(express.json());
  await setupDatabase();
  
  // Create mock dependencies for testing
  const mockDependencies = {
    sessionManager: {
      createSession: () => Promise.resolve(),
      getSession: () => Promise.resolve(),
      destroySession: () => Promise.resolve()
    },
    smartAIRouter: {
      selectProvider: () => 'claude-3-haiku',
      processStreamingChat: () => Promise.resolve()
    },
    emailNotifier: {
      sendAlert: () => Promise.resolve()
    }
  };
  
  setupRoutes(app, mockDependencies);
  return app;
};

describe('Unified Alfred System', () => {
  let testUser;
  let authToken;
  let testConversation;
  let app;

  beforeAll(async () => {
    // Create test app
    app = await createTestApp();
    
    // Get User model after database setup
    const User = getUserModel();
    if (!User) {
      throw new Error('User model not initialized');
    }
    
    const hashedPassword = await bcrypt.hash('testpass123', 12);
    
    testUser = await User.create({
      email: 'test@unified.com',
      hashedPassword: hashedPassword,
      role: 'owner',
      permissions: {
        chat: true,
        poker: true,
        code: true,
        voice: true,
        monitoring: true
      },
      isActive: true,
      approved: true
    });

    // Generate auth token
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create initial test conversation to ensure testConversation is available
    const Conversation = getConversationModel();
    testConversation = await Conversation.create({
      userId: testUser.id,
      title: 'Initial Test Conversation',
      toolContext: 'poker'
    });
  });

  afterAll(async () => {
    // Cleanup test data
    if (testUser) {
      await testUser.destroy();
    }
  });

  describe('Tool Context Integration', () => {
    test('should create conversation with tool context', async () => {
      const response = await request(app)
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Poker Analysis',
          toolContext: 'poker',
          context: 'Analyzing hand ranges for 6-max cash games'
        });

      expect(response.status).toBe(201);
      expect(response.body.conversation.toolContext).toBe('poker');
      expect(response.body.conversation.title).toBe('Test Poker Analysis');
      
      testConversation = response.body.conversation;
    });

    test('should reject conversation creation for unauthorized tool', async () => {
      // Create demo user without poker permissions
      const User = getUserModel();
      const demoUser = await User.create({
        email: 'demo@test.com',
        hashedPassword: await bcrypt.hash('demo123', 12),
        role: 'demo',
        permissions: { chat: true },
        isActive: true,
        approved: true
      });

      const demoToken = jwt.sign(
        { userId: demoUser.id, email: demoUser.email, role: demoUser.role },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${demoToken}`)
        .send({
          title: 'Unauthorized Poker',
          toolContext: 'poker'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Insufficient permissions');

      await demoUser.destroy();
    });

    test('should filter conversations by tool context', async () => {
      // Create chat conversation
      await request(app)
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'General Chat',
          toolContext: 'chat'
        });

      // Get only poker conversations
      const response = await request(app)
        .get('/api/v1/chat/conversations?toolContext=poker')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.conversations).toHaveLength(1);
      expect(response.body.conversations[0].toolContext).toBe('poker');
    });
  });

  describe('Cost Tracking Integration', () => {
    test('should track costs with tool context', async () => {
      const CostUsage = getCostUsageModel();
      
      // Simulate cost usage - fix provider names to match validation
      await CostUsage.create({
        userId: testUser.id,
        toolContext: 'poker',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        conversationId: testConversation.id,
        requests: 1,
        inputTokens: 150,
        outputTokens: 300,
        totalCost: 0.025
      });

      await CostUsage.create({
        userId: testUser.id,
        toolContext: 'chat',
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
        requests: 1,
        inputTokens: 100,
        outputTokens: 200,
        totalCost: 0.008
      });

      // Get cost breakdown
      const response = await request(app)
        .get('/api/v1/chat/costs/breakdown?timeframe=1d')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.breakdown).toHaveLength(2);
      expect(response.body.totalCost).toBeCloseTo(0.033, 3);
      
      const pokerCost = response.body.breakdown.find(b => b.toolContext === 'poker');
      const chatCost = response.body.breakdown.find(b => b.toolContext === 'chat');
      
      expect(pokerCost).toBeDefined();
      expect(chatCost).toBeDefined();
      expect(parseFloat(pokerCost.totalCost)).toBeCloseTo(0.025, 3);
      expect(parseFloat(chatCost.totalCost)).toBeCloseTo(0.008, 3);
    });
  });

  describe('Smart AI Router Integration', () => {
    test('should route based on tool context and user permissions', async () => {
      const { SmartAIRouter } = await import('../../src/ai/SmartAIRouter.js');
      const router = new SmartAIRouter();

      // Test poker routing for owner
      const pokerProvider = router.selectProvider('Analyze this hand: AA vs KK preflop', {
        toolContext: 'poker',
        user: { role: 'owner', permissions: { poker: true } }
      });
      expect(pokerProvider).toBe('claude'); // Complex poker analysis

      // Test chat routing for demo user
      const chatProvider = router.selectProvider('Hello, how are you?', {
        toolContext: 'chat',
        user: { role: 'demo', permissions: { chat: true } }
      });
      expect(chatProvider).toBe('claude-haiku'); // Simple query

      // Test permission denial
      expect(() => {
        router.selectProvider('Analyze this code', {
          toolContext: 'code',
          user: { role: 'demo', permissions: { chat: true } }
        });
      }).toThrow('does not have access to');
    });

    test('should enforce cost constraints by user role', async () => {
      const { SmartAIRouter } = await import('../../src/ai/SmartAIRouter.js');
      const router = new SmartAIRouter();

      // Test cost constraint for family user
      expect(() => {
        router.selectProvider('Complex analysis task', {
          toolContext: 'chat',
          user: { role: 'family', permissions: { chat: true } },
          estimatedCost: 0.5 // Exceeds family limit of 0.1
        });
      }).toThrow('exceeds cost limit');

      // Should work within limits
      const provider = router.selectProvider('Simple question', {
        toolContext: 'chat',
        user: { role: 'family', permissions: { chat: true } },
        estimatedCost: 0.05
      });
      expect(provider).toBe('claude-haiku'); // Cost-optimized
    });
  });

  describe('Database Model Relationships', () => {
    test('should maintain proper model associations', async () => {
      const Conversation = getConversationModel();
      const Message = getMessageModel();
      const CostUsage = getCostUsageModel();

      // Create message in conversation
      const message = await Message.create({
        conversationId: testConversation.id,
        role: 'user',
        content: 'Test message',
        toolContext: 'poker'
      });

      // Create associated cost usage
      const cost = await CostUsage.create({
        userId: testUser.id,
        toolContext: 'poker',
        provider: 'anthropic',
        conversationId: testConversation.id,
        messageId: message.id,
        totalCost: 0.01
      });

      // Test associations
      const conversationWithMessages = await Conversation.findByPk(testConversation.id, {
        include: [
          { model: Message, as: 'messages' },
          { model: CostUsage, as: 'costs' }
        ]
      });

      expect(conversationWithMessages.messages).toHaveLength(1);
      expect(conversationWithMessages.costs).toHaveLength(1);
      expect(conversationWithMessages.messages[0].toolContext).toBe('poker');
      expect(conversationWithMessages.costs[0].toolContext).toBe('poker');
    });

    test('should update conversation metadata on message creation', async () => {
      const Conversation = getConversationModel();
      const Message = getMessageModel();

      const initialConversation = await Conversation.findByPk(testConversation.id);
      const initialMessageCount = initialConversation.messageCount;

      // Create new message
      await Message.create({
        conversationId: testConversation.id,
        role: 'assistant',
        content: 'AI response',
        toolContext: 'poker',
        cost: 0.015
      });

      // Check updated conversation
      const updatedConversation = await Conversation.findByPk(testConversation.id);
      expect(updatedConversation.messageCount).toBe(initialMessageCount + 1);
      expect(parseFloat(updatedConversation.totalCost)).toBeGreaterThan(parseFloat(initialConversation.totalCost));
    });
  });

  describe('API Endpoint Integration', () => {
    test('should provide unified conversation management', async () => {
      // Get all conversations
      const allResponse = await request(app)
        .get('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(allResponse.status).toBe(200);
      expect(allResponse.body.conversations.length).toBeGreaterThan(0);

      // Get specific conversation with messages
      const specificResponse = await request(app)
        .get(`/api/v1/chat/conversations/${testConversation.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(specificResponse.status).toBe(200);
      expect(specificResponse.body.conversation.id).toBe(testConversation.id);
      expect(specificResponse.body.conversation.messages).toBeDefined();
    });

    test('should enforce user data isolation', async () => {
      // Create another user
      const User = getUserModel();
      const otherUser = await User.create({
        email: 'other@test.com',
        hashedPassword: await bcrypt.hash('other123', 12),
        role: 'owner',
        permissions: { chat: true, poker: true },
        isActive: true,
        approved: true
      });

      const otherToken = jwt.sign(
        { userId: otherUser.id, email: otherUser.email, role: otherUser.role },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      // Try to access first user's conversation
      const response = await request(app)
        .get(`/api/v1/chat/conversations/${testConversation.id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404); // Should not find other user's conversation

      await otherUser.destroy();
    });
  });
});
