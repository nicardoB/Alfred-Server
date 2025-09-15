import { jest } from '@jest/globals';
import request from 'supertest';
import { setupDatabase } from '../../src/config/database.js';
import { getCostUsageModel } from '../../src/models/CostUsage.js';
import { CostTracker } from '../../src/monitoring/CostTracker.js';

// Mock the app setup
const mockApp = {
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  listen: jest.fn()
};

// Mock the server setup
jest.mock('../../src/server.js', () => ({
  app: mockApp
}));

describe('End-to-End Cost Tracking Tests', () => {
  let sequelize;
  let CostUsage;
  let costTracker;
  let authToken;

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    
    // Initialize database
    sequelize = await setupDatabase();
    await sequelize.sync({ force: true });
    
    // Get models
    CostUsage = getCostUsageModel();
    
    // Initialize cost tracker
    costTracker = new CostTracker();
    await costTracker.ensureInitialized();
    
    // Mock auth token
    authToken = 'Bearer test-jwt-token';
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

  describe('MCP Text Processing with Cost Tracking', () => {
    test('should track costs for MCP text requests end-to-end', async () => {
      // Simulate the complete flow from MCP request to cost tracking
      const userId = 'test-user-123';
      const sessionId = 'test-session-456';
      const toolContext = 'chat';
      
      // 1. Simulate MCP session creation
      const sessionData = {
        id: sessionId,
        userId: userId,
        toolContext: toolContext,
        isActive: true
      };

      // 2. Track initial cost state
      const initialRecords = await CostUsage.findAll();
      const initialCount = initialRecords.length;

      // 3. Simulate AI request processing with usage data
      const usageData = {
        inputTokens: 150,
        outputTokens: 75,
        totalCost: 0.003
      };

      const result = await costTracker.trackUsage({
        provider: 'openai',
        inputTokens: usageData.inputTokens,
        outputTokens: usageData.outputTokens,
        userId: userId,
        toolContext: toolContext,
        sessionId: sessionId,
        model: 'gpt-4',
        conversationId: 'conv-123',
        messageId: 'msg-456'
      });

      // 4. Verify cost tracking result
      expect(result).toBeDefined();
      expect(result.userId).toBe(userId);
      expect(result.provider).toBe('openai');

      // 5. Verify database persistence
      const finalRecords = await CostUsage.findAll();
      expect(finalRecords.length).toBe(initialCount + 1);

      const newRecord = finalRecords.find(r => r.userId === userId);
      expect(newRecord).toBeDefined();
      expect(newRecord.provider).toBe('openai');
      expect(newRecord.toolContext).toBe(toolContext);
      expect(newRecord.inputTokens).toBe(usageData.inputTokens);
      expect(newRecord.outputTokens).toBe(usageData.outputTokens);
      expect(newRecord.requests).toBe(1);
      expect(parseFloat(newRecord.totalCost)).toBeGreaterThan(0);

      // 6. Verify aggregated stats
      const stats = await costTracker.getUsageStats();
      expect(stats.summary.totalRequests).toBe(1);
      expect(stats.summary.totalTokens).toBe(usageData.inputTokens + usageData.outputTokens);
      expect(stats.summary.totalCost).toBeGreaterThan(0);
      expect(stats.byProvider.openai).toBeDefined();
      expect(stats.byProvider.openai.requests).toBe(1);
    });

    test('should handle multiple requests and aggregate costs correctly', async () => {
      const userId = 'test-user-multi';
      const sessionId = 'test-session-multi';
      
      // Track multiple requests for same user/context
      for (let i = 0; i < 2; i++) {
        await costTracker.trackUsage({
          provider: 'openai',
          inputTokens: 100,
          outputTokens: 50,
          userId: `user-${i}`,
          toolContext: 'chat',
          sessionId: sessionId
        });
      }

      await costTracker.trackUsage({
        provider: 'openai',
        inputTokens: 200,
        outputTokens: 100,
        userId: userId,
        toolContext: 'chat',
        sessionId: sessionId
      });

      await costTracker.trackUsage({
        provider: 'claude',
        inputTokens: 150,
        outputTokens: 75,
        userId: userId,
        toolContext: 'poker',
        sessionId: sessionId
      });

      // Verify aggregation
      const records = await CostUsage.findAll();
      expect(records).toHaveLength(2); // One for chat/openai, one for poker/claude

      const chatRecord = records.find(r => r.toolContext === 'chat');
      const pokerRecord = records.find(r => r.toolContext === 'poker');

      expect(chatRecord.requests).toBe(2);
      expect(chatRecord.inputTokens).toBe(300);
      expect(chatRecord.outputTokens).toBe(150);

      expect(pokerRecord.requests).toBe(1);
      expect(pokerRecord.inputTokens).toBe(150);
      expect(pokerRecord.outputTokens).toBe(75);

      const stats = await costTracker.getUsageStats();
      expect(stats.summary.totalRequests).toBe(3);
      expect(stats.byProvider.openai.requests).toBe(2);
      expect(stats.byProvider.claude.requests).toBe(1);
    });

    test('should handle different tool contexts separately', async () => {
      const userId = 'test-user-contexts';
      
      // Track usage across different tool contexts
      const contexts = ['chat', 'poker', 'code', 'voice', 'french', 'workout'];
      
      for (const context of contexts) {
        await costTracker.trackUsage({
          provider: 'openai',
          inputTokens: 100,
          outputTokens: 50,
          userId: userId,
          toolContext: context,
          sessionId: `session-${context}`
        });
      }

      const records = await CostUsage.findAll();
      expect(records).toHaveLength(contexts.length);

      // Verify each context has its own record
      for (const context of contexts) {
        const record = records.find(r => r.toolContext === context);
        expect(record).toBeDefined();
        expect(record.userId).toBe(userId);
        expect(record.provider).toBe('openai');
      }

      const stats = await costTracker.getUsageStats();
      expect(stats.summary.totalRequests).toBe(contexts.length);
    });
  });

  describe('Cost Monitoring API Integration', () => {
    test('should retrieve cost stats through monitoring API', async () => {
      // Track some usage
      await costTracker.trackUsage({
        provider: 'openai',
        inputTokens: 200,
        outputTokens: 100,
        userId: 'test-user-api',
        toolContext: 'chat'
      });
      
      await costTracker.trackUsage({
        provider: 'claude',
        inputTokens: 150,
        outputTokens: 75,
        userId: 'test-user-api',
        toolContext: 'chat'
      });

      // Get stats directly from costTracker (simulating API call)
      const stats = await costTracker.getUsageStats();
      
      expect(stats).toBeDefined();
      expect(stats.summary).toBeDefined();
      expect(stats.summary.totalRequests).toBe(2);
      expect(stats.summary.totalTokens).toBe(525); // 200+100+150+75
      expect(stats.summary.totalCost).toBeGreaterThan(0);
      
      expect(stats.byProvider).toBeDefined();
      expect(stats.byProvider.openai).toBeDefined();
      expect(stats.byProvider.claude).toBeDefined();
      
      expect(stats.byUser).toBeDefined();
      expect(stats.byUser['test-user-api']).toBeDefined();
    });

    test('should handle cost breakdown by time periods', async () => {
      // Track usage over time
      await costTracker.trackUsage({
        provider: 'openai',
        inputTokens: 100,
        outputTokens: 50,
        userId: 'time-test-user',
        toolContext: 'chat'
      });

      // Get stats with time filtering (simulating API query parameters)
      const stats = await costTracker.getUsageStats({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        endDate: new Date()
      });

      expect(stats.summary.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle database connection errors gracefully', async () => {
      // Close database to simulate error
      await sequelize.close();

      // Cost tracking should not throw but return undefined
      const result = await costTracker.trackUsage({
        provider: 'openai',
        inputTokens: 100,
        outputTokens: 50,
        userId: 'error-test-user',
        toolContext: 'chat'
      });

      expect(result).toBeUndefined();

      // Reconnect for cleanup
      sequelize = await setupDatabase();
      await costTracker.ensureInitialized();
    });

    test('should validate input parameters', async () => {
      // Test invalid provider
      const result1 = await costTracker.trackUsage({
        provider: 'invalid-provider',
        inputTokens: 100,
        outputTokens: 50,
        userId: 'validation-test',
        toolContext: 'chat'
      });
      expect(result1).toBeUndefined();

      // Test missing required fields
      const result2 = await costTracker.trackUsage({
        provider: 'openai',
        inputTokens: 100,
        outputTokens: 50,
        // Missing userId
        toolContext: 'chat'
      });
      expect(result2).toBeUndefined();
    });

    test('should handle concurrent requests without data corruption', async () => {
      const userId = 'concurrent-test-user';
      const promises = [];

      // Create 10 concurrent cost tracking requests
      for (let i = 0; i < 10; i++) {
        promises.push(
          costTracker.trackUsage({
            provider: 'openai',
            inputTokens: 100,
            outputTokens: 50,
            userId: userId,
            toolContext: 'chat',
            sessionId: `session-${i}`
          })
        );
      }

      const results = await Promise.all(promises);
      const successfulResults = results.filter(r => r !== undefined);
      expect(successfulResults.length).toBe(10);

      // Verify data integrity
      const records = await CostUsage.findAll({ where: { userId: userId } });
      expect(records).toHaveLength(1); // Should be aggregated into one record
      expect(records[0].requests).toBe(10);
      expect(records[0].inputTokens).toBe(1000);
      expect(records[0].outputTokens).toBe(500);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large token counts efficiently', async () => {
      const startTime = Date.now();
      
      await costTracker.trackUsage({
        provider: 'openai',
        inputTokens: 1000000,
        outputTokens: 500000,
        userId: 'test-user-large',
        toolContext: 'chat'
      });

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete within reasonable time (< 1 second)
      expect(processingTime).toBeLessThan(1000);

      const records = await CostUsage.findAll();
      expect(records[0].inputTokens).toBe(1000000);
      expect(records[0].outputTokens).toBe(500000);
    });

    test('should efficiently query aggregated statistics', async () => {
      // Create test data across multiple users and providers
      const users = ['user1', 'user2', 'user3'];
      const providers = ['openai', 'claude'];
      
      for (const user of users) {
        for (const provider of providers) {
          await costTracker.trackUsage(provider, 100, 50, {
            userId: user,
            toolContext: 'chat'
          });
        }
      }

      const startTime = Date.now();
      const stats = await costTracker.getUsageStats();
      const endTime = Date.now();
      const queryTime = endTime - startTime;

      // Statistics query should be fast (< 500ms)
      expect(queryTime).toBeLessThan(500);
      
      expect(stats.summary.totalRequests).toBe(6); // 3 users × 2 providers
      expect(Object.keys(stats.byUser)).toHaveLength(3);
      expect(Object.keys(stats.byProvider)).toHaveLength(2);
    });
  });
});
