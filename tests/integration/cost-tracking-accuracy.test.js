import { jest } from '@jest/globals';
import request from 'supertest';

// Mock the database models
const mockCostUsage = {
  findAll: jest.fn(),
  findOrCreate: jest.fn(),
  create: jest.fn(),
  update: jest.fn()
};

const mockConversation = {
  create: jest.fn(),
  findByPk: jest.fn()
};

const mockMessage = {
  create: jest.fn(),
  findAll: jest.fn()
};

jest.unstable_mockModule('../../src/models/CostUsage.js', () => ({
  getCostUsageModel: () => mockCostUsage,
  initializeCostUsageModel: jest.fn()
}));

jest.unstable_mockModule('../../src/models/Conversation.js', () => ({
  getConversationModel: () => mockConversation,
  initializeConversationModel: jest.fn()
}));

jest.unstable_mockModule('../../src/models/Message.js', () => ({
  getMessageModel: () => mockMessage,
  initializeMessageModel: jest.fn()
}));

// Focus on cost tracking accuracy without mocking AI providers
const { CostTracker } = await import('../../src/monitoring/CostTracker.js');

describe('Cost Tracking Accuracy Integration Tests', () => {
  let costTracker;
  let authToken;

  beforeAll(async () => {
    costTracker = new CostTracker();
    
    // Mock authentication token
    authToken = 'mock-jwt-token';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockCostUsage.findOrCreate.mockResolvedValue([{
      provider: 'openai',
      model: 'gpt-4o-mini',
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      update: jest.fn().mockResolvedValue(true)
    }]);

    mockConversation.create.mockResolvedValue({
      id: 'test-conversation-id',
      title: 'Test Conversation'
    });

    mockMessage.create.mockResolvedValue({
      id: 'test-message-id'
    });
  });

  describe('Single Request Cost Tracking', () => {
    it('should accurately track OpenAI GPT-4o Mini costs', async () => {
      mockCostUsage.findAll.mockResolvedValue([{
        provider: 'openai',
        model: 'gpt-4o-mini',
        requests: 1,
        inputTokens: 50,
        outputTokens: 25,
        totalCost: 0.0001,
        lastReset: new Date()
      }]);

      const stats = await costTracker.getUsageStats();

      expect(stats.summary.totalCost).toBe(0.0001);
      expect(stats.providers.openai.totalCost).toBe(0.0001);
      expect(stats.providers.openai.avgCostPerToken).toBeCloseTo(0.00000133, 6);
    });

    it('should accurately track Claude 3.5 Haiku costs', async () => {
      mockCostUsage.findAll.mockResolvedValue([{
        provider: 'claude',
        model: 'claude-3-5-haiku-20241022',
        requests: 1,
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.0001,
        lastReset: new Date()
      }]);

      const stats = await costTracker.getUsageStats();

      expect(stats.summary.totalCost).toBe(0.0001);
      expect(stats.providers.claude.totalCost).toBe(0.0001);
      expect(stats.providers.claude.avgCostPerToken).toBeCloseTo(0.00000067, 6);
    });

    it('should accurately track GitHub Copilot costs', async () => {
      mockCostUsage.findAll.mockResolvedValue([{
        provider: 'copilot',
        model: 'github-copilot',
        requests: 1,
        inputTokens: 75,
        outputTokens: 35,
        totalCost: 0.0004, // Rounded by CostTracker
        lastReset: new Date()
      }]);

      const stats = await costTracker.getUsageStats();

      expect(stats.summary.totalCost).toBe(0.0004);
      expect(stats.providers.copilot.totalCost).toBe(0.0004);
      expect(stats.providers.copilot.avgCostPerToken).toBeCloseTo(0.00000364, 6);
    });

    it('should track GPT Routing Provider costs', async () => {
      mockCostUsage.findAll.mockResolvedValue([{
        provider: 'openai',
        model: 'gpt-4o-mini',
        requests: 1,
        inputTokens: 30, // Small routing decision
        outputTokens: 5,
        totalCost: 0, // Rounded to 0 by CostTracker for very small amounts
        lastReset: new Date()
      }]);

      const stats = await costTracker.getUsageStats();

      expect(stats.summary.totalCost).toBe(0);
      expect(stats.providers.openai.totalCost).toBe(0);
      expect(stats.providers.openai.avgCostPerToken).toBe(0);
    });

    it('should track Ollama as free', async () => {
      mockCostUsage.findAll.mockResolvedValue([{
        provider: 'ollama',
        model: 'llama3.1:8b',
        requests: 1,
        inputTokens: 80,
        outputTokens: 40,
        totalCost: 0,
        lastReset: new Date()
      }]);

      const stats = await costTracker.getUsageStats();

      expect(stats.summary.totalCost).toBe(0);
      expect(stats.providers.ollama.totalCost).toBe(0);
      expect(stats.providers.ollama.avgCostPerToken).toBe(0);
    });
  });

  describe('Multi-Request Cost Aggregation', () => {
    it('should accurately aggregate costs across all 5 providers', async () => {
      mockCostUsage.findAll.mockResolvedValue([
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          requests: 3,
          inputTokens: 150,
          outputTokens: 75,
          totalCost: 0.0003,
          lastReset: new Date()
        },
        {
          provider: 'claude',
          model: 'claude-3-5-haiku-20241022',
          requests: 2,
          inputTokens: 200,
          outputTokens: 100,
          totalCost: 0.0002,
          lastReset: new Date()
        },
        {
          provider: 'copilot',
          model: 'github-copilot',
          requests: 1,
          inputTokens: 75,
          outputTokens: 35,
          totalCost: 0.0004,
          lastReset: new Date()
        },
        {
          provider: 'ollama',
          model: 'llama3.1:8b',
          requests: 5,
          inputTokens: 400,
          outputTokens: 200,
          totalCost: 0,
          lastReset: new Date()
        }
      ]);

      const stats = await costTracker.getUsageStats();

      expect(stats.summary.totalCost).toBe(0.0009); // 0.0003 + 0.0002 + 0.0004 + 0
      expect(stats.summary.totalRequests).toBe(11); // 3 + 2 + 1 + 5
      expect(stats.summary.totalTokens).toBe(1235); // 225 + 300 + 110 + 600
      expect(stats.summary.avgTokensPerRequest).toBe(112); // 1235 / 11
      
      // Verify each provider
      expect(stats.providers.openai.totalCost).toBe(0.0003);
      expect(stats.providers.claude.totalCost).toBe(0.0002);
      expect(stats.providers.copilot.totalCost).toBe(0.0004);
      expect(stats.providers.ollama.totalCost).toBe(0);
    });
  });

  describe('Cost Calculation Accuracy', () => {
    it('should calculate exact costs for different token amounts', () => {
      const testCases = [
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          input: 1000,
          output: 500,
          expected: 0.00045 // (1000 * 0.15 + 500 * 0.60) / 1000000
        },
        {
          provider: 'openai',
          model: 'gpt-4o',
          input: 1000,
          output: 500,
          expected: 0.0075 // (1000 * 2.50 + 500 * 10) / 1000000
        },
        {
          provider: 'claude',
          model: 'claude-3-5-haiku-20241022',
          input: 2000,
          output: 1000,
          expected: 0.00175 // (2000 * 0.25 + 1000 * 1.25) / 1000000
        },
        {
          provider: 'claude',
          model: 'claude-3-5-sonnet-20241022',
          input: 1000,
          output: 500,
          expected: 0.0105 // (1000 * 3 + 500 * 15) / 1000000
        },
        {
          provider: 'copilot',
          input: 1000,
          output: 500,
          expected: 0.006 // (1000 * 2 + 500 * 8) / 1000000
        },
        {
          provider: 'ollama',
          model: 'llama3.1:8b',
          input: 5000,
          output: 2500,
          expected: 0 // Free
        }
      ];

      testCases.forEach(({ provider, model, input, output, expected }) => {
        const cost = costTracker.calculateCost(provider, input, output, model);
        expect(cost).toBeCloseTo(expected, 6);
      });
    });
  });

  describe('Real-time Cost Updates', () => {
    it('should provide consistent cost data structure for WebSocket updates', async () => {
      mockCostUsage.findAll.mockResolvedValue([{
        provider: 'openai',
        model: 'gpt-4o-mini',
        requests: 1,
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.00015,
        lastReset: new Date()
      }]);

      const stats = await costTracker.getUsageStats();

      // Verify structure for WebSocket compatibility
      expect(stats).toHaveProperty('summary');
      expect(stats).toHaveProperty('providers');
      expect(stats).toHaveProperty('timestamp');

      expect(stats.summary).toHaveProperty('totalCost');
      expect(stats.summary).toHaveProperty('totalRequests');
      expect(stats.summary).toHaveProperty('totalInputTokens');
      expect(stats.summary).toHaveProperty('totalOutputTokens');
      expect(stats.summary).toHaveProperty('totalTokens');
      expect(stats.summary).toHaveProperty('avgCostPerToken');
      expect(stats.summary).toHaveProperty('avgTokensPerRequest');
      expect(stats.summary).toHaveProperty('currency');

      expect(stats.providers.openai).toHaveProperty('totalCost');
      expect(stats.providers.openai).toHaveProperty('totalTokens');
      expect(stats.providers.openai).toHaveProperty('avgCostPerToken');
      expect(stats.providers.openai).toHaveProperty('avgTokensPerRequest');
    });
  });

  describe('Cost Efficiency Analytics', () => {
    it('should provide cost efficiency metrics for optimization', async () => {
      mockCostUsage.findAll.mockResolvedValue([
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          requests: 10,
          inputTokens: 5000,
          outputTokens: 2500,
          totalCost: 0.0075,
          lastReset: new Date()
        },
        {
          provider: 'claude',
          model: 'claude-3-5-haiku-20241022',
          requests: 5,
          inputTokens: 10000,
          outputTokens: 5000,
          totalCost: 0.00875,
          lastReset: new Date()
        },
        {
          provider: 'ollama',
          model: 'llama3.1:8b',
          requests: 20,
          inputTokens: 15000,
          outputTokens: 8000,
          totalCost: 0,
          lastReset: new Date()
        }
      ]);

      const stats = await costTracker.getUsageStats();

      // OpenAI efficiency
      expect(stats.providers.openai.avgCostPerToken).toBe(0.000001); // Most efficient paid option
      expect(stats.providers.openai.avgTokensPerRequest).toBe(750);

      // Claude efficiency
      expect(stats.providers.claude.avgCostPerToken).toBeCloseTo(0.00000058, 8);
      expect(stats.providers.claude.avgTokensPerRequest).toBe(3000); // Higher token usage

      // Ollama efficiency
      expect(stats.providers.ollama.avgCostPerToken).toBe(0); // Free
      expect(stats.providers.ollama.avgTokensPerRequest).toBe(1150);

      // Overall efficiency
      expect(stats.summary.avgCostPerToken).toBeCloseTo(0.00000036, 6);
      expect(stats.summary.avgTokensPerRequest).toBe(1300);
    });
  });
});
