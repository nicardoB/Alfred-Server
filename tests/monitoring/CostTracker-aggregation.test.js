const { CostTracker } = require('../../src/monitoring/CostTracker.js');
const { CostUsage } = require('../../src/models/CostUsage.js');

// Mock the database model
jest.mock('../../src/models/CostUsage.js');

describe('CostTracker Aggregation Fixes', () => {
  let costTracker;

  beforeEach(() => {
    costTracker = new CostTracker();
    jest.clearAllMocks();
  });

  describe('Cost Aggregation', () => {
    it('should correctly aggregate multiple requests for same user', async () => {
      // Mock database responses for sequential requests
      const mockUsageData = [
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          inputTokens: 100,
          outputTokens: 50,
          cost: 0.0002,
          userId: 'user123',
          createdAt: new Date()
        },
        {
          provider: 'openai', 
          model: 'gpt-4o-mini',
          inputTokens: 150,
          outputTokens: 75,
          cost: 0.0003,
          userId: 'user123',
          createdAt: new Date()
        }
      ];

      CostUsage.findAll.mockResolvedValue(mockUsageData);

      // Track first request
      await costTracker.trackUsage('openai', 100, 50, 'gpt-4o-mini', 'chat');
      
      // Track second request
      await costTracker.trackUsage('openai', 150, 75, 'gpt-4o-mini', 'chat');

      // Get aggregated stats
      const stats = await costTracker.getUsageStats();

      // Verify aggregation
      expect(stats.summary.totalCost).toBe(0.0005); // 0.0002 + 0.0003
      expect(stats.summary.totalTokens).toBe(375); // 100+50+150+75
      expect(stats.providers.openai.totalCost).toBe(0.0005);
      expect(stats.providers.openai.totalTokens).toBe(375);
    });

    it('should track costs per provider separately', async () => {
      const mockUsageData = [
        {
          provider: 'openai',
          model: 'gpt-4o-mini', 
          inputTokens: 100,
          outputTokens: 50,
          cost: 0.0002,
          userId: 'user123'
        },
        {
          provider: 'claude',
          model: 'claude-3-haiku',
          inputTokens: 200,
          outputTokens: 100,
          cost: 0.0011,
          userId: 'user123'
        }
      ];

      CostUsage.findAll.mockResolvedValue(mockUsageData);

      await costTracker.trackUsage('openai', 100, 50, 'gpt-4o-mini', 'chat');
      await costTracker.trackUsage('claude', 200, 100, 'claude-3-haiku', 'chat');

      const stats = await costTracker.getUsageStats();

      expect(stats.summary.totalCost).toBe(0.0013);
      expect(stats.providers.openai.totalCost).toBe(0.0002);
      expect(stats.providers.claude.totalCost).toBe(0.0011);
    });

    it('should handle incremental cost updates correctly', async () => {
      let callCount = 0;
      CostUsage.findAll.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([{
            provider: 'openai',
            model: 'gpt-4o-mini',
            inputTokens: 100,
            outputTokens: 50, 
            cost: 0.0002,
            userId: 'user123'
          }]);
        } else {
          return Promise.resolve([
            {
              provider: 'openai',
              model: 'gpt-4o-mini',
              inputTokens: 100,
              outputTokens: 50,
              cost: 0.0002,
              userId: 'user123'
            },
            {
              provider: 'openai',
              model: 'gpt-4o-mini', 
              inputTokens: 150,
              outputTokens: 75,
              cost: 0.0003,
              userId: 'user123'
            }
          ]);
        }
      });

      // First request
      await costTracker.trackUsage('openai', 100, 50, 'gpt-4o-mini', 'chat');
      const firstStats = await costTracker.getUsageStats();
      expect(firstStats.summary.totalCost).toBe(0.0002);

      // Second request should increment
      await costTracker.trackUsage('openai', 150, 75, 'gpt-4o-mini', 'chat');
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
      
      const cost = costTracker.calculateCost('claude', inputTokens, outputTokens, 'claude-3-haiku');
      
      // Claude Haiku: $0.25/1M input, $1.25/1M output
      const expectedCost = (inputTokens * 0.25 / 1000000) + (outputTokens * 1.25 / 1000000);
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
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.0002,
        userId: 'user123',
        createdAt: new Date()
      }];

      CostUsage.findAll.mockResolvedValue(mockUsageData);

      const stats = await costTracker.getUsageStats();
      
      expect(stats).toHaveProperty('summary');
      expect(stats).toHaveProperty('providers');
      expect(stats.summary).toHaveProperty('totalCost');
      expect(stats.summary).toHaveProperty('totalTokens');
      expect(stats.summary).toHaveProperty('requestCount');
    });

    it('should format cost data for client consumption', async () => {
      const mockUsageData = [{
        provider: 'openai',
        model: 'gpt-4o-mini',
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.0002,
        userId: 'user123'
      }];

      CostUsage.findAll.mockResolvedValue(mockUsageData);

      const stats = await costTracker.getUsageStats();
      
      // Verify structure matches WebSocket expectations
      expect(typeof stats.summary.totalCost).toBe('number');
      expect(typeof stats.summary.totalTokens).toBe('number');
      expect(typeof stats.summary.requestCount).toBe('number');
      expect(stats.providers.openai).toBeDefined();
    });
  });
});
