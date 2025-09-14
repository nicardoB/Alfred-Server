import { jest } from '@jest/globals';
import { Sequelize, DataTypes } from 'sequelize';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: mockLogger
}));

const { defineApiKeyModel } = await import('../../src/models/ApiKey.js');

describe('ApiKey Model', () => {
  let sequelize;
  let ApiKeyModel;

  beforeAll(async () => {
    sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false
    });

    // Create a simple User model for foreign key reference
    const User = sequelize.define('User', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false
      }
    }, {
      tableName: 'users'
    });

    ApiKeyModel = defineApiKeyModel(sequelize);
    await sequelize.sync({ force: true });

    // Create test users
    await User.bulkCreate([
      { id: '550e8400-e29b-41d4-a716-446655440000', email: 'test1@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440001', email: 'test2@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440002', email: 'test3@example.com' }
    ]);
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Static Methods', () => {
    it('should hash API key correctly', () => {
      const key = 'test-key-123';
      const hash = ApiKeyModel.hashKey(key);
      
      expect(hash).toBe('625faa3fbbc3d2bd9d6ee7678d04cc5339cb33dc68d9b58451853d60046e226a');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA256 hex length
    });

    it('should handle API key with ak_ prefix', () => {
      const keyWithPrefix = 'ak_test-key-123';
      const keyWithoutPrefix = 'test-key-123';
      
      const hashWithPrefix = ApiKeyModel.hashKey(keyWithPrefix);
      const hashWithoutPrefix = ApiKeyModel.hashKey(keyWithoutPrefix);
      
      expect(hashWithPrefix).toBe(hashWithoutPrefix);
    });
  });

  describe('Instance Methods', () => {
    let apiKey;

    beforeEach(async () => {
      apiKey = await ApiKeyModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Key',
        keyHash: 'test-hash',
        keyPrefix: 'ak_12345',
        permissions: {
          chat: true,
          poker: false,
          monitoring: true
        },
        expiresAt: null
      });
    });

    afterEach(async () => {
      await ApiKeyModel.destroy({ where: {} });
    });

    it('should check if API key is expired', () => {
      // Not expired (no expiration date) - returns null when expiresAt is null
      expect(apiKey.isExpired()).toBe(null);

      // Set future expiration
      apiKey.expiresAt = new Date(Date.now() + 86400000); // 24 hours from now
      expect(apiKey.isExpired()).toBe(false);

      // Set past expiration
      apiKey.expiresAt = new Date(Date.now() - 86400000); // 24 hours ago
      expect(apiKey.isExpired()).toBe(true);
    });

    it('should check permissions correctly', () => {
      expect(apiKey.hasPermission('chat')).toBe(true);
      expect(apiKey.hasPermission('poker')).toBe(false);
      expect(apiKey.hasPermission('monitoring')).toBe(true);
      expect(apiKey.hasPermission('nonexistent')).toBe(false);
    });

    it('should record usage correctly', async () => {
      const initialUsageCount = apiKey.usageCount;
      const initialLastUsed = apiKey.lastUsed;

      await apiKey.recordUsage();

      expect(apiKey.usageCount).toBe(initialUsageCount + 1);
      expect(apiKey.lastUsed).toBeInstanceOf(Date);
      expect(apiKey.lastUsed.getTime()).toBeGreaterThan(
        initialLastUsed ? initialLastUsed.getTime() : 0
      );
    });
  });

  describe('Model Creation', () => {
    afterEach(async () => {
      await ApiKeyModel.destroy({ where: {} });
    });

    it('should create API key with required fields', async () => {
      const apiKey = await ApiKeyModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test API Key',
        keyHash: 'test-hash-value',
        keyPrefix: 'ak_test1',
        permissions: { chat: true }
      });

      expect(apiKey.userId).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(apiKey.name).toBe('Test API Key');
      expect(apiKey.keyHash).toBe('test-hash-value');
      expect(apiKey.permissions).toEqual({ chat: true });
      expect(apiKey.usageCount).toBe(0);
      expect(apiKey.isActive).toBe(true);
    });

    it('should handle default values correctly', async () => {
      const apiKey = await ApiKeyModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Default Test Key',
        keyHash: 'default-hash',
        keyPrefix: 'ak_deflt'
      });

      expect(apiKey.usageCount).toBe(0);
      expect(apiKey.isActive).toBe(true);
      expect(apiKey.permissions).toEqual({});
      expect(apiKey.expiresAt).toBeUndefined();
    });
  });
});
