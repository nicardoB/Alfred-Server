import { jest } from '@jest/globals';
import { setupDatabase } from '../../src/config/database.js';
import { initializeCostUsageModel, getCostUsageModel } from '../../src/models/CostUsage.js';

describe('CostUsage Model Tests', () => {
  let sequelize;
  let CostUsage;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    sequelize = await setupDatabase();
    CostUsage = await initializeCostUsageModel(sequelize);
  });

  afterAll(async () => {
    if (sequelize) {
      await sequelize.close();
    }
  });

  describe('Model Initialization', () => {
    test('should initialize model successfully', () => {
      expect(CostUsage).toBeDefined();
      expect(CostUsage.name).toBe('CostUsage');
    });

    test('should be accessible via getCostUsageModel', () => {
      const model = getCostUsageModel();
      expect(model).toBe(CostUsage);
    });

    test('should throw error if sequelize instance not provided', async () => {
      await expect(initializeCostUsageModel(null)).rejects.toThrow(
        'Sequelize instance is required for CostUsage model initialization'
      );
    });
  });

  describe('Model Schema', () => {
    test('should have correct table name', () => {
      expect(CostUsage.tableName).toBe('CostUsage');
    });

    test('should have required fields', () => {
      const attributes = CostUsage.getAttributes();
      
      expect(attributes.id).toBeDefined();
      expect(attributes.userId).toBeDefined();
      expect(attributes.toolContext).toBeDefined();
      expect(attributes.provider).toBeDefined();
      expect(attributes.requests).toBeDefined();
      expect(attributes.inputTokens).toBeDefined();
      expect(attributes.outputTokens).toBeDefined();
      expect(attributes.totalCost).toBeDefined();
    });

    test('should have proper field constraints', () => {
      const attributes = CostUsage.getAttributes();
      
      // Required fields
      expect(attributes.userId.allowNull).toBe(false);
      expect(attributes.toolContext.allowNull).toBe(false);
      expect(attributes.provider.allowNull).toBe(false);
      expect(attributes.requests.allowNull).toBe(false);
      expect(attributes.inputTokens.allowNull).toBe(false);
      expect(attributes.outputTokens.allowNull).toBe(false);
      expect(attributes.totalCost.allowNull).toBe(false);

      // Optional fields
      expect(attributes.model.allowNull).toBe(true);
      expect(attributes.conversationId.allowNull).toBe(true);
      expect(attributes.messageId.allowNull).toBe(true);
    });

    test('should have proper default values', () => {
      const attributes = CostUsage.getAttributes();
      
      expect(attributes.toolContext.defaultValue).toBe('chat');
      expect(attributes.requests.defaultValue).toBe(0);
      expect(attributes.inputTokens.defaultValue).toBe(0);
      expect(attributes.outputTokens.defaultValue).toBe(0);
      expect(attributes.totalCost.defaultValue).toBe(0);
    });

    test('should have provider validation', () => {
      const attributes = CostUsage.getAttributes();
      expect(attributes.provider.validate.isIn).toEqual([['claude', 'openai', 'copilot', 'github']]);
    });
  });

  describe('Database Operations', () => {
    beforeEach(async () => {
      // Clean up before each test
      await CostUsage.destroy({ where: {}, force: true });
    });

    test('should create cost usage record', async () => {
      const record = await CostUsage.create({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        toolContext: 'chat',
        provider: 'openai',
        requests: 1,
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.001500,
        model: 'gpt-4o-mini'
      });

      expect(record).toBeDefined();
      expect(record.userId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(record.provider).toBe('openai');
      expect(record.requests).toBe(1);
    });

    test('should enforce provider validation', async () => {
      await expect(CostUsage.create({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        toolContext: 'chat',
        provider: 'invalid-provider',
        requests: 1,
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.001500
      })).rejects.toThrow();
    });

    test('should handle findOrCreate operations', async () => {
      const [record, created] = await CostUsage.findOrCreate({
        where: { 
          userId: '123e4567-e89b-12d3-a456-426614174000',
          provider: 'openai',
          toolContext: 'chat'
        },
        defaults: {
          requests: 1,
          inputTokens: 100,
          outputTokens: 50,
          totalCost: 0.001500,
          model: 'gpt-4o-mini'
        }
      });

      expect(record).toBeDefined();
      expect(created).toBe(true);
      expect(record.provider).toBe('openai');

      // Second call should find existing record
      const [record2, created2] = await CostUsage.findOrCreate({
        where: { 
          userId: '123e4567-e89b-12d3-a456-426614174000',
          provider: 'openai',
          toolContext: 'chat'
        },
        defaults: {
          requests: 1,
          inputTokens: 100,
          outputTokens: 50,
          totalCost: 0.001500
        }
      });

      expect(created2).toBe(false);
      expect(record2.id).toBe(record.id);
    });

    test('should aggregate multiple records', async () => {
      // Create multiple records
      await CostUsage.create({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        toolContext: 'chat',
        provider: 'openai',
        requests: 1,
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.001500
      });

      await CostUsage.create({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        toolContext: 'chat',
        provider: 'claude',
        requests: 1,
        inputTokens: 200,
        outputTokens: 100,
        totalCost: 0.003000
      });

      const records = await CostUsage.findAll();
      expect(records).toHaveLength(2);

      const totalCost = records.reduce((sum, record) => sum + parseFloat(record.totalCost), 0);
      expect(totalCost).toBeCloseTo(0.004500, 6);
    });
  });
});
