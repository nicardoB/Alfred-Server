import { jest } from '@jest/globals';

// Mock the database model
const mockCostUsage = {
  findAll: jest.fn(),
  findOrCreate: jest.fn(),
  create: jest.fn()
};

jest.unstable_mockModule('../../src/models/CostUsage.js', () => ({
  getCostUsageModel: () => mockCostUsage,
  initializeCostUsageModel: jest.fn()
}));

const { CostTracker } = await import('../../src/monitoring/CostTracker.js');

describe('CostTracker Aggregation Fixes', () => {
  let costTracker;

  beforeAll(() => {
    costTracker = new CostTracker();
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock CostUsage.findOrCreate to return a mock instance
    mockCostUsage.findOrCreate.mockResolvedValue([{
      provider: 'openai',
      model: 'gpt-4o-mini',
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      model: null,
      lastReset: new Date(),
      update: jest.fn().mockResolvedValue(true)
    }]);

    // Mock the database initialization to avoid empty returns
    mockCostUsage.findAll.mockResolvedValue([]);
    
    // Create a fresh CostTracker instance for each test
    costTracker = new CostTracker();
  });

  describe('Cost Aggregation', () => {
    it('should correctly aggregate multiple requests for same user', async () => {
      // Mock database responses for aggregated usage
      const mockUsageData = [
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          requests: 2,
          inputTokens: 250, // 100 + 150
          outputTokens: 125, // 50 + 75
          totalCost: 0.0005, // 0.0002 + 0.0003
          lastReset: new Date()
        }
      ];

      mockCostUsage.findAll.mockResolvedValue(mockUsageData);

      // Get aggregated stats
      const stats = await costTracker.getUsageStats();

      // Verify aggregation matches actual CostTracker structure
      expect(stats.summary.totalCost).toBe(0.0005);
      expect(stats.summary.totalRequests).toBe(2);
      expect(stats.summary.totalInputTokens).toBe(250);
      expect(stats.summary.totalOutputTokens).toBe(125);
      expect(stats.summary.totalTokens).toBe(375);
      expect(stats.summary.avgCostPerToken).toBeCloseTo(0.00000133, 8);
      expect(stats.summary.avgTokensPerRequest).toBe(188);
      
      expect(stats.providers.openai.totalCost).toBe(0.0005);
      expect(stats.providers.openai.inputTokens).toBe(250);
      expect(stats.providers.openai.outputTokens).toBe(125);
      expect(stats.providers.openai.totalTokens).toBe(375);
      expect(stats.providers.openai.avgCostPerToken).toBeCloseTo(0.00000133, 8);
      expect(stats.providers.openai.avgTokensPerRequest).toBe(188);
    });

    it('should track costs per provider separately', async () => {
      const mockUsageData = [
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          requests: 1,
          inputTokens: 100,
          outputTokens: 50,
          totalCost: 0.0002,
          lastReset: new Date()
        },
        {
          provider: 'claude',
          model: 'claude-3-5-haiku-20241022',
          requests: 1,
          inputTokens: 200,
          outputTokens: 100,
          totalCost: 0.0001,
          lastReset: new Date()
        }
      ];

      mockCostUsage.findAll.mockResolvedValue(mockUsageData);

      const stats = await costTracker.getUsageStats();

      expect(stats.summary.totalCost).toBe(0.0003);
      expect(stats.summary.totalInputTokens).toBe(300); // 100 + 200
      expect(stats.summary.totalOutputTokens).toBe(150); // 50 + 100
      expect(stats.summary.totalTokens).toBe(450);
      
      expect(stats.providers.openai.totalCost).toBe(0.0002);
      expect(stats.providers.openai.totalTokens).toBe(150);
      expect(stats.providers.claude.totalCost).toBe(0.0001);
      expect(stats.providers.claude.totalTokens).toBe(300);
    });

    it('should handle incremental cost updates correctly', async () => {
      let callCount = 0;
      mockCostUsage.findAll.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([{
            provider: 'openai',
            model: 'gpt-4o-mini',
            requests: 1,
            inputTokens: 100,
            outputTokens: 50,
            totalCost: 0.0002,
            lastReset: new Date()
          }]);
        } else {
          return Promise.resolve([{
            provider: 'openai',
            model: 'gpt-4o-mini',
            requests: 2,
            inputTokens: 250,
            outputTokens: 125,
            totalCost: 0.0005,
            lastReset: new Date()
          }]);
        }
      });

      // First request stats
      const firstStats = await costTracker.getUsageStats();
      expect(firstStats.summary.totalCost).toBe(0.0002);

      // Second request should show incremented total
      const secondStats = await costTracker.getUsageStats();
      expect(secondStats.summary.totalCost).toBe(0.0005);
    });
  });

  describe('Cost Calculation Accuracy', () => {
    it('should calculate OpenAI GPT-4o Mini costs correctly', () => {
      const inputTokens = 1000;
      const outputTokens = 500;
      
      const cost = costTracker.calculateCost('openai', inputTokens, outputTokens, 'gpt-4o-mini');
      
      // GPT-4o Mini: $0.15/1M input, $0.60/1M output
      const expectedCost = (inputTokens * 0.15 / 1000000) + (outputTokens * 0.60 / 1000000);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should calculate Claude Haiku costs correctly', () => {
      const inputTokens = 1000;
      const outputTokens = 500;
      
      const cost = costTracker.calculateCost('claude', inputTokens, outputTokens, 'claude-3-5-haiku-20241022');
      
      // Claude 3.5 Haiku: $0.25/1M input, $1.25/1M output (per 1K tokens: $0.00025 input, $0.00125 output)
      const expectedCost = (inputTokens * 0.00025 / 1000) + (outputTokens * 0.00125 / 1000);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should handle Ollama as free correctly', () => {
      const cost = costTracker.calculateCost('ollama', 1000, 500, 'llama3.1:8b');
      expect(cost).toBe(0);
    });
  });

  describe('Real-time Updates', () => {
    it('should provide consistent cost data for WebSocket updates', async () => {
      const mockUsageData = [{
        provider: 'openai',
        model: 'gpt-4o-mini',
        requests: 1,
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.0002,
        lastReset: new Date()
      }];

      mockCostUsage.findAll.mockResolvedValue(mockUsageData);

      const stats = await costTracker.getUsageStats();
      
      expect(stats).toHaveProperty('summary');
      expect(stats).toHaveProperty('providers');
      expect(stats.summary).toHaveProperty('totalCost');
      expect(stats.summary).toHaveProperty('totalRequests');
      expect(stats.summary).toHaveProperty('totalInputTokens');
      expect(stats.summary).toHaveProperty('totalOutputTokens');
      expect(stats.summary).toHaveProperty('totalTokens');
      expect(stats.summary).toHaveProperty('avgCostPerToken');
      expect(stats.summary).toHaveProperty('avgTokensPerRequest');
      expect(stats.summary).toHaveProperty('currency');
    });

    it('should format cost data for client consumption', async () => {
      const mockUsageData = [{
        provider: 'openai',
        model: 'gpt-4o-mini',
        requests: 1,
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.0002,
        lastReset: new Date()
      }];

      mockCostUsage.findAll.mockResolvedValue(mockUsageData);

      const stats = await costTracker.getUsageStats();
      
      // Verify structure matches WebSocket expectations
      expect(typeof stats.summary.totalCost).toBe('number');
      expect(typeof stats.summary.totalRequests).toBe('number');
      expect(typeof stats.summary.totalInputTokens).toBe('number');
      expect(typeof stats.summary.totalOutputTokens).toBe('number');
      expect(typeof stats.summary.totalTokens).toBe('number');
      expect(typeof stats.summary.avgCostPerToken).toBe('number');
      expect(typeof stats.summary.avgTokensPerRequest).toBe('number');
      expect(typeof stats.summary.currency).toBe('string');
      expect(stats.providers.openai).toBeDefined();
      expect(stats.providers.openai).toHaveProperty('totalTokens');
      expect(stats.providers.openai).toHaveProperty('avgCostPerToken');
      expect(stats.providers.openai).toHaveProperty('avgTokensPerRequest');
    });
  });

  describe('Token Analytics', () => {
    it('should provide detailed token analytics for cost optimization', async () => {
      const mockUsageData = [
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
          totalCost: 0.0125,
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
      ];

      mockCostUsage.findAll.mockResolvedValue(mockUsageData);

      const stats = await costTracker.getUsageStats();

      // Overall analytics
      expect(stats.summary.totalTokens).toBe(45500); // 7500 + 15000 + 23000
      expect(stats.summary.totalInputTokens).toBe(30000);
      expect(stats.summary.totalOutputTokens).toBe(15500);
      expect(stats.summary.avgTokensPerRequest).toBe(1300); // 45500 / 35 requests
      expect(stats.summary.avgCostPerToken).toBeCloseTo(0.00000044, 8); // 0.02 / 45500

      // Provider-specific analytics
      expect(stats.providers.openai.avgTokensPerRequest).toBe(750); // 7500 / 10
      expect(stats.providers.openai.avgCostPerToken).toBe(0.000001); // 0.0075 / 7500
      
      expect(stats.providers.claude.avgTokensPerRequest).toBe(3000); // 15000 / 5
      expect(stats.providers.claude.avgCostPerToken).toBeCloseTo(0.00000083, 8); // 0.0125 / 15000
      
      expect(stats.providers.ollama.avgTokensPerRequest).toBe(1150); // 23000 / 20
      expect(stats.providers.ollama.avgCostPerToken).toBe(0); // Free model
    });

    it('should handle edge cases in token calculations', async () => {
      const mockUsageData = [
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0,
          lastReset: new Date()
        }
      ];

      mockCostUsage.findAll.mockResolvedValue(mockUsageData);

      const stats = await costTracker.getUsageStats();

      expect(stats.summary.avgCostPerToken).toBe(0);
      expect(stats.summary.avgTokensPerRequest).toBe(0);
      expect(stats.providers.openai.avgCostPerToken).toBe(0);
      expect(stats.providers.openai.avgTokensPerRequest).toBe(0);
    });
  });
});
