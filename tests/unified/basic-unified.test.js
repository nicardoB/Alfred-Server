import { setupDatabase } from '../../src/config/database.js';
import { getUserModel } from '../../src/models/User.js';
import { getConversationModel } from '../../src/models/Conversation.js';
import { getMessageModel } from '../../src/models/Message.js';
import { getCostUsageModel } from '../../src/models/CostUsage.js';
import { SmartAIRouter } from '../../src/ai/SmartAIRouter.js';

describe('Basic Unified Alfred System', () => {
  let User, Conversation, Message, CostUsage;
  let testUser;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Setup database and get models
    await setupDatabase();
    User = getUserModel();
    Conversation = getConversationModel();
    Message = getMessageModel();
    CostUsage = getCostUsageModel();

    // Create test user
    testUser = await User.create({
      email: 'test@unified.com',
      hashedPassword: 'hashedpass',
      role: 'owner',
      permissions: {
        chat: true,
        poker: true,
        code: true,
        voice: true
      },
      isActive: true,
      approved: true
    });
  });

  afterAll(async () => {
    if (testUser) {
      await testUser.destroy();
    }
  });

  test('Database models are unified with toolContext', async () => {
    // Test Conversation with toolContext
    const conversation = await Conversation.create({
      userId: testUser.id,
      title: 'Test Chat',
      toolContext: 'chat'
    });

    expect(conversation.toolContext).toBe('chat');
    expect(conversation.userId).toBe(testUser.id);

    // Test Message with toolContext
    const message = await Message.create({
      conversationId: conversation.id,
      role: 'user',
      content: 'Hello Alfred',
      toolContext: 'chat'
    });

    expect(message.toolContext).toBe('chat');
    expect(message.conversationId).toBe(conversation.id);

    // Test CostUsage with toolContext and userId
    if (CostUsage) {
      const costUsage = await CostUsage.create({
        userId: testUser.id,
        conversationId: conversation.id,
        messageId: message.id,
        toolContext: 'chat',
        provider: 'claude',
        inputTokens: 10,
        outputTokens: 20,
        totalCost: 0.001
      });

      expect(costUsage.toolContext).toBe('chat');
      expect(costUsage.userId).toBe(testUser.id);
    }

    await conversation.destroy();
  });

  test('Smart AI Router handles unified tool routing', () => {
    const router = new SmartAIRouter();

    // Test tool context routing
    const chatProvider = router.selectProvider('Hello', {
      toolContext: 'chat',
      user: testUser
    });
    expect(chatProvider).toBeDefined();

    const pokerProvider = router.selectProvider('What should I do with pocket aces?', {
      toolContext: 'poker',
      user: testUser
    });
    expect(pokerProvider).toBeDefined();

    const codeProvider = router.selectProvider('Fix this JavaScript bug', {
      toolContext: 'code',
      user: testUser
    });
    expect(codeProvider).toBeDefined();
  });

  test('System supports multiple Alfred tools', async () => {
    const tools = ['chat', 'poker', 'code', 'voice', 'french', 'workout'];
    
    for (const tool of tools) {
      // Create conversation for each tool
      const conversation = await Conversation.create({
        userId: testUser.id,
        title: `Test ${tool}`,
        toolContext: tool
      });

      expect(conversation.toolContext).toBe(tool);
      
      // Test Smart AI Router for each tool
      const router = new SmartAIRouter();
      const provider = router.selectProvider('Test message', {
        toolContext: tool,
        user: testUser
      });
      
      expect(provider).toBeDefined();
      
      await conversation.destroy();
    }
  });

  test('Cost tracking is unified across all tools', async () => {
    if (!CostUsage) {
      console.log('CostUsage model not available, skipping cost tracking test');
      return;
    }

    const tools = ['chat', 'poker', 'code'];
    const costs = [];

    for (const tool of tools) {
      const conversation = await Conversation.create({
        userId: testUser.id,
        title: `Cost test ${tool}`,
        toolContext: tool
      });

      const cost = await CostUsage.create({
        userId: testUser.id,
        conversationId: conversation.id,
        toolContext: tool,
        provider: 'claude',
        inputTokens: 100,
        outputTokens: 200,
        totalCost: 0.01
      });

      costs.push(cost);
      await conversation.destroy();
    }

    // Verify all costs are tracked with proper tool context
    expect(costs).toHaveLength(3);
    costs.forEach((cost, index) => {
      expect(cost.toolContext).toBe(['chat', 'poker', 'code'][index]);
      expect(cost.userId).toBe(testUser.id);
    });
  });
});
