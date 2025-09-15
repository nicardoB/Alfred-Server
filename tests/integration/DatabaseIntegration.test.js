import { jest } from '@jest/globals';
import { setupDatabase } from '../../src/config/database.js';
import { CostTracker } from '../../src/monitoring/CostTracker.js';
import { SmartAIRouter } from '../../src/ai/SmartAIRouter.js';
import { getCostUsageModel } from '../../src/models/CostUsage.js';

describe('Database Integration Tests', () => {
  let sequelize;
  let costTracker;
  let router;
  let CostUsage;

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'sqlite:./data/integration-test.db';
    
    // Clean up any existing database file
    try {
      const fs = await import('fs');
      if (fs.existsSync('./data/integration-test.db')) {
        fs.unlinkSync('./data/integration-test.db');
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Initialize database
    sequelize = await setupDatabase();
    await sequelize.sync({ force: true });
    
    // Get models
    CostUsage = getCostUsageModel();
    const { getUserModel } = await import('../../src/models/User.js');
    const User = getUserModel();
    
    // Create test users
    await User.create({
      id: 'test-user-123',
      username: 'testuser123',
      email: 'test123@example.com',
      hashedPassword: 'dummy-hash',
      role: 'owner',
      isActive: true,
      permissions: { 'ai.chat': true }
    });
    
    // Create additional test users for performance tests
    for (let i = 1; i <= 6; i++) {
      await User.create({
        id: `user-${i}`,
        username: `user${i}`,
        email: `user${i}@example.com`,
        hashedPassword: 'dummy-hash',
        role: 'owner',
        isActive: true,
        permissions: { 'ai.chat': true }
      });
    }
    
    await User.create({
      id: 'test-user',
      username: 'testuser',
      email: 'testuser@example.com',
      hashedPassword: 'dummy-hash',
      role: 'owner',
      isActive: true,
      permissions: { 'ai.chat': true }
    });
    
    // Initialize components
    costTracker = new CostTracker();
    await costTracker.ensureInitialized();
    
    router = new SmartAIRouter();
  });

  afterAll(async () => {
    if (sequelize) {
      await sequelize.close();
    }
  });

  beforeEach(async () => {
    // Clean up data between tests
    if (CostUsage) {
      await CostUsage.destroy({ where: {}, force: true });
    }
  });

  describe('Database Setup', () => {
    test('should initialize database successfully', () => {
      expect(sequelize).toBeDefined();
      expect(sequelize.isDefined('CostUsage')).toBe(true);
      expect(sequelize.isDefined('User')).toBe(true);
      expect(sequelize.isDefined('Conversation')).toBe(true);
      expect(sequelize.isDefined('Message')).toBe(true);
    });

    test('should have proper database connection', async () => {
      await expect(sequelize.authenticate()).resolves.not.toThrow();
    });
  });

  describe('CostTracker Database Integration', () => {
    test('should initialize CostTracker with database models', () => {
      expect(costTracker.isInitialized).toBe(true);
      expect(CostUsage).toBeDefined();
    });

    test('should track usage and persist to database', async () => {
      const result = await costTracker.trackUsage({
        userId: 'test-user-123',
        toolContext: 'chat',
        provider: 'openai',
        inputTokens: 100,
        outputTokens: 50,
        sessionId: 'test-session'
      });

      expect(result).toBeDefined();

      // Verify data was persisted directly in database
      const records = await CostUsage.findAll();
      expect(records).toHaveLength(1);
      expect(records[0].provider).toBe('openai');
      expect(records[0].inputTokens).toBe(100);
      expect(records[0].outputTokens).toBe(50);

      // Verify stats aggregation
      const stats = await costTracker.getUsageStats();
      expect(stats.summary.totalRequests).toBe(1);
      expect(stats.summary.totalTokens).toBe(150);
      expect(stats.summary.totalCost).toBeGreaterThan(0);
    });

    test('should handle multiple provider tracking', async () => {
      // Track usage for different providers
      await costTracker.trackUsage({
        userId: 'test-user-123',
        toolContext: 'chat',
        provider: 'openai',
        inputTokens: 100,
        outputTokens: 50
      });
      
      await costTracker.trackUsage({
        userId: 'test-user-123',
        toolContext: 'chat',
        provider: 'claude',
        inputTokens: 200,
        outputTokens: 75
      });

      const records = await CostUsage.findAll();
      expect(records).toHaveLength(2);

      const stats = await costTracker.getUsageStats();
      expect(stats.summary.totalRequests).toBe(2);
      expect(stats.byProvider).toHaveProperty('openai');
      expect(stats.byProvider).toHaveProperty('claude');
    });

    test('should aggregate costs correctly with findOrCreate', async () => {
      // Track usage for same user/provider combination multiple times
      await costTracker.trackUsage({
        userId: 'user-1',
        toolContext: 'chat',
        provider: 'openai',
        inputTokens: 100,
        outputTokens: 50
      });
      
      await costTracker.trackUsage({
        userId: 'user-1',
        toolContext: 'chat',
        provider: 'openai',
        inputTokens: 150,
        outputTokens: 75
      });

      const records = await CostUsage.findAll();
      expect(records).toHaveLength(1); // Should be aggregated into one record

      const record = records[0];
      expect(record.requests).toBe(2);
      expect(record.inputTokens).toBe(250);
      expect(record.outputTokens).toBe(125);
    });

    test('should handle different tool contexts separately', async () => {
      await costTracker.trackUsage({
        userId: 'user-2',
        toolContext: 'chat',
        provider: 'openai',
        inputTokens: 100,
        outputTokens: 50
      });
      
      await costTracker.trackUsage({
        userId: 'user-2',
        toolContext: 'code',
        provider: 'openai',
        inputTokens: 100,
        outputTokens: 50
      });

      const records = await CostUsage.findAll();
      expect(records).toHaveLength(2); // Different tool contexts = separate records

      const chatRecord = records.find(r => r.toolContext === 'chat');
      const codeRecord = records.find(r => r.toolContext === 'code');
      
      expect(chatRecord).toBeDefined();
      expect(codeRecord).toBeDefined();
    });
  });

  describe('SmartAIRouter Cost Tracking Integration', () => {
    test('should track costs when processing AI requests', async () => {
      // Mock the AI provider to return usage data
      const mockProvider = {
        processText: jest.fn().mockResolvedValue({
          content: 'Test response',
          confidence: 0.9,
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            totalCost: 0.002
          }
        })
      };

      // Override the provider selection to use our mock
      jest.spyOn(router, 'selectProvider').mockResolvedValue('openai');
      
      // Mock the provider's processText method to return usage data
      const mockProcessText = jest.fn().mockResolvedValue({
        content: 'Test AI response',
        confidence: 0.9,
        provider: 'openai',
        usage: {
          inputTokens: 100,
          outputTokens: 50
        }
      });
      
      // Override the provider in the router
      router.providers.openai = { processText: mockProcessText };

      const initialRecords = await CostUsage.findAll();
      const initialCount = initialRecords.length;

      // Process a request through SmartAIRouter
      const result = await router.processTextCommand('Test message for cost tracking', {
        sessionId: 'test-session',
        requestId: 'test-request',
        metadata: {
          userId: 'test-user-123',
          toolContext: 'chat'
        }
      });

      expect(result).toBeDefined();
      expect(result.provider).toBe('openai');

      // Check if cost was tracked in database
      const finalRecords = await CostUsage.findAll();
      expect(finalRecords.length).toBeGreaterThan(initialCount);

      // Verify the record has correct data
      const newRecord = finalRecords.find(r => r.userId === 'test-user-123');
      expect(newRecord).toBeDefined();
      expect(newRecord.provider).toBe('openai');
      expect(newRecord.toolContext).toBe('chat');
      expect(newRecord.inputTokens).toBe(100);
      expect(newRecord.outputTokens).toBe(50);
    });

    test('should handle cost tracking gracefully when database unavailable', async () => {
      // Mock provider for this test
      const mockProvider = {
        processText: jest.fn().mockResolvedValue({
          content: 'Test response',
          confidence: 0.9
        })
      };

      jest.spyOn(router, 'selectProvider').mockResolvedValue('openai');
      jest.spyOn(router, 'executeWithFallback').mockResolvedValue({
        response: 'Test AI response',
        metadata: {
          tokenCount: 150,
          cost: 0.000045,
          provider: 'openai'
        }
      });

      const result = await router.processTextCommand('Test message', {
        sessionId: 'test-session',
        requestId: 'test-request',
        metadata: {
          userId: 'test-user',
          toolContext: 'chat'
        }
      });

      // AI processing should still work
      expect(result).toBeDefined();
      expect(result.response).toBeDefined();
    });
  });

  describe('Database Performance', () => {
    test('should handle concurrent cost tracking requests', async () => {
      const promises = [];
      
      for (let i = 1; i <= 5; i++) {
        promises.push(
          costTracker.trackUsage({
            userId: `user-${i}`,
            toolContext: 'chat',
            provider: 'openai',
            inputTokens: 100,
            outputTokens: 50,
            sessionId: `session-${i}`
          })
        );
      }

      const results = await Promise.all(promises);
      expect(results.filter(r => r !== undefined)).toHaveLength(5);

      const records = await CostUsage.findAll();
      expect(records).toHaveLength(5);

      const stats = await costTracker.getUsageStats();
      expect(stats.summary.totalRequests).toBe(5);
    });

    test('should handle large token counts', async () => {
      const result = await costTracker.trackUsage({
        userId: 'test-user',
        toolContext: 'chat',
        provider: 'openai',
        inputTokens: 100000,
        outputTokens: 50000
      });

      expect(result).toBeDefined();

      const records = await CostUsage.findAll();
      expect(records).toHaveLength(1);
      expect(records[0].inputTokens).toBe(100000);
      expect(records[0].outputTokens).toBe(50000);

      const stats = await costTracker.getUsageStats();
      expect(stats.summary.totalTokens).toBe(150000);
    });
  });
});
