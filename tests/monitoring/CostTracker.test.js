import { jest } from '@jest/globals';

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const mockCostUsageModel = {
  findOrCreate: jest.fn(),
  findAll: jest.fn(),
  destroy: jest.fn(),
  sum: jest.fn()
};

const mockGetCostUsageModel = jest.fn().mockReturnValue(mockCostUsageModel);
const mockInitializeCostUsageModel = jest.fn();

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

jest.unstable_mockModule('../../src/models/CostUsage.js', () => ({
  getCostUsageModel: mockGetCostUsageModel,
  initializeCostUsageModel: mockInitializeCostUsageModel
}));

// Import after mocking
const { CostTracker } = await import('../../src/monitoring/CostTracker.js');

describe('CostTracker', () => {
  let costTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    costTracker = new CostTracker();
  });

  describe('constructor', () => {
    test('should initialize with correct pricing structure', () => {
      expect(costTracker.pricing).toHaveProperty('claude');
      expect(costTracker.pricing).toHaveProperty('openai');
      expect(costTracker.pricing).toHaveProperty('copilot');
      expect(costTracker.isInitialized).toBe(true);
    });

    test('should call initializeDatabase on construction', () => {
      expect(mockInitializeCostUsageModel).toHaveBeenCalled();
    });
  });

  describe('initializeDatabase', () => {
    test('should initialize successfully', async () => {
      mockInitializeCostUsageModel.mockResolvedValue();
      
      await costTracker.initializeDatabase();
      
      expect(costTracker.isInitialized).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Cost tracking database initialized');
    });

    test('should handle initialization error', async () => {
      const error = new Error('Database connection failed');
      mockInitializeCostUsageModel.mockRejectedValue(error);
      
      await costTracker.initializeDatabase();
      
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize cost tracking database:', error);
    });
  });

  describe('ensureInitialized', () => {
    test('should initialize if not already initialized', async () => {
      costTracker.isInitialized = false;
      const initSpy = jest.spyOn(costTracker, 'initializeDatabase');
      
      await costTracker.ensureInitialized();
      
      expect(initSpy).toHaveBeenCalled();
    });

    test('should not initialize if already initialized', async () => {
      costTracker.isInitialized = true;
      const initSpy = jest.spyOn(costTracker, 'initializeDatabase');
      
      await costTracker.ensureInitialized();
      
      expect(initSpy).not.toHaveBeenCalled();
    });
  });

  describe('trackUsage', () => {
    beforeEach(() => {
      costTracker.isInitialized = true;
      mockCostUsageModel.findOrCreate.mockResolvedValue([{
        provider: 'openai',
        requests: 5,
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.05,
        increment: jest.fn(),
        save: jest.fn()
      }]);
    });

    test('should track usage for valid provider', async () => {
      await costTracker.trackUsage({
        provider: 'openai',
        inputTokens: 10,
        outputTokens: 5,
        model: 'gpt-4o-mini',
        userId: 'test-user',
        toolContext: 'chat'
      });
      
      expect(mockCostUsageModel.findOrCreate).toHaveBeenCalledWith({
        where: { provider: 'openai' },
        defaults: {
          provider: 'openai',
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0,
          model: 'gpt-4o-mini',
          lastReset: expect.any(Date)
        }
      });
    });

    test('should handle poker tool context tracking', async () => {
      await costTracker.trackUsage({
        provider: 'claude',
        inputTokens: 10,
        outputTokens: 5,
        userId: 'test-user',
        toolContext: 'poker',
        model: 'claude-3-5-sonnet-20241022'
      });
      
      expect(mockCostUsageModel.findOrCreate).toHaveBeenCalledWith({
        where: { 
          userId: 'test-user',
          toolContext: 'poker',
          provider: 'claude'
        },
        defaults: expect.objectContaining({
          userId: 'test-user',
          toolContext: 'poker',
          provider: 'claude'
        })
      });
    });

    test('should warn for unknown provider', async () => {
      await costTracker.trackUsage({
        provider: 'unknown-provider',
        inputTokens: 10,
        outputTokens: 5,
        userId: 'test-user',
        toolContext: 'chat'
      });
      
      expect(mockLogger.warn).toHaveBeenCalledWith('Unknown or missing provider for cost tracking: unknown-provider');
      expect(mockCostUsageModel.findOrCreate).not.toHaveBeenCalled();
    });

    test('should handle database error gracefully', async () => {
      const error = new Error('Database error');
      mockCostUsageModel.findOrCreate.mockRejectedValue(error);
      
      await costTracker.trackUsage({
        provider: 'openai',
        inputTokens: 10,
        outputTokens: 5,
        userId: 'test-user',
        toolContext: 'chat'
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to track usage:', error);
    });
  });

  describe('calculateCost', () => {
    test('should calculate cost for OpenAI model', () => {
      const cost = costTracker.calculateCost('openai', 1000, 500, 'gpt-4o-mini');
      
      // 1000/1000 * 0.00015 + 500/1000 * 0.0006 = 0.00015 + 0.0003 = 0.00045
      expect(cost).toBeCloseTo(0.00045, 5);
    });

    test('should calculate cost for Claude model', () => {
      const cost = costTracker.calculateCost('claude', 1000, 500, 'claude-3-5-sonnet-20241022');
      
      // 1000/1000 * 0.003 + 500/1000 * 0.015 = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    test('should use default pricing for unknown model', () => {
      const cost = costTracker.calculateCost('openai', 1000, 500, 'unknown-model');
      
      // Should use gpt-4o-mini pricing as default
      // 1000/1000 * 0.00015 + 500/1000 * 0.0006 = 0.00015 + 0.0003 = 0.00045
      expect(cost).toBeCloseTo(0.00045, 5);
    });

    test('should handle copilot pricing', () => {
      const cost = costTracker.calculateCost('copilot', 1000, 500);
      
      // 1000/1000 * 0.002 + 500/1000 * 0.008 = 0.002 + 0.004 = 0.006
      expect(cost).toBeCloseTo(0.006, 3);
    });

    test('should return 0 for unknown provider', () => {
      const cost = costTracker.calculateCost('unknown', 1000, 500);
      
      expect(cost).toBe(0);
    });
  });

  describe('estimateTokens', () => {
    test('should estimate tokens for text', () => {
      const tokens = costTracker.estimateTokens('Hello world');
      
      // Rough estimate: ~2 tokens for "Hello world"
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    test('should handle empty text', () => {
      const tokens = costTracker.estimateTokens('');
      
      expect(tokens).toBe(0);
    });

    test('should handle null/undefined text', () => {
      expect(costTracker.estimateTokens(null)).toBe(0);
      expect(costTracker.estimateTokens(undefined)).toBe(0);
    });
  });

  describe('getUsageStats', () => {
    test('should return usage statistics', async () => {
      const mockStats = [
        { provider: 'openai', requests: 10, inputTokens: 1000, outputTokens: 500, totalCost: 1.5, lastReset: new Date() },
        { provider: 'claude', requests: 5, inputTokens: 500, outputTokens: 250, totalCost: 2.0, lastReset: new Date() }
      ];
      
      mockCostUsageModel.findAll.mockResolvedValue(mockStats);
      
      const stats = await costTracker.getUsageStats();
      
      expect(stats).toHaveProperty('summary');
      expect(stats).toHaveProperty('providers');
      expect(stats).toHaveProperty('timestamp');
      expect(stats.summary.totalCost).toBe(3.5);
      expect(stats.summary.totalRequests).toBe(15);
      expect(mockCostUsageModel.findAll).toHaveBeenCalled();
    });

    test('should handle database error', async () => {
      const error = new Error('Database error');
      mockCostUsageModel.findAll.mockRejectedValue(error);
      
      const stats = await costTracker.getUsageStats();
      
      expect(stats).toHaveProperty('summary');
      expect(stats.summary.totalCost).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get usage stats:', error);
    });
  });

  describe('resetUsage', () => {
    test('should reset usage for specific provider', async () => {
      mockCostUsageModel.update = jest.fn().mockResolvedValue([1]);
      
      await costTracker.resetUsage('openai');
      
      expect(mockCostUsageModel.update).toHaveBeenCalledWith({
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        lastReset: expect.any(Date)
      }, {
        where: { provider: 'openai' }
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Cost tracking reset for openai');
    });

    test('should reset all usage when no provider specified', async () => {
      mockCostUsageModel.update = jest.fn().mockResolvedValue([3]);
      
      await costTracker.resetUsage();
      
      expect(mockCostUsageModel.update).toHaveBeenCalledWith({
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        lastReset: expect.any(Date)
      }, {
        where: {}
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Cost tracking reset for all providers');
    });

    test('should handle database error', async () => {
      const error = new Error('Database error');
      mockCostUsageModel.update = jest.fn().mockRejectedValue(error);
      
      await costTracker.resetUsage('openai');
      
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to reset usage:', error);
    });
  });

  describe('getCostProjection', () => {
    test('should return cost projection', () => {
      jest.spyOn(costTracker, 'getUsageStats').mockReturnValue({
        summary: { totalCost: 5.0, totalRequests: 100, currency: 'USD' }
      });
      
      const projection = costTracker.getCostProjection(30);
      
      expect(projection).toEqual({
        daily: 5.0,
        weekly: 35.0,
        monthly: 150.0,
        currency: 'USD'
      });
    });
  });
});
