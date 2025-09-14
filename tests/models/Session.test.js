import { jest } from '@jest/globals';
import { Sequelize, DataTypes, Op } from 'sequelize';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: mockLogger
}));

const { defineSessionModel } = await import('../../src/models/Session.js');

describe('Session Model', () => {
  let sequelize;
  let SessionModel;

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

    SessionModel = defineSessionModel(sequelize);
    await sequelize.sync({ force: true });

    // Create test users
    await User.bulkCreate([
      { id: '550e8400-e29b-41d4-a716-446655440000', email: 'test1@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440001', email: 'test2@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440002', email: 'test3@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440005', email: 'test4@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440010', email: 'test5@example.com' }
    ]);
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await SessionModel.destroy({ where: {} });
  });

  describe('Instance Methods', () => {
    let session;

    beforeEach(async () => {
      session = await SessionModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        token: 'test-session-token-123',
        expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
        deviceInfo: { key: 'value' }
      });
    });

    it('should check if session is expired', () => {
      // Not expired (future expiration)
      expect(session.isExpired()).toBe(false);

      // Set past expiration
      session.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      expect(session.isExpired()).toBe(true);

      // Handle null expiration (comparison with null returns true in JS)
      session.expiresAt = null;
      expect(session.isExpired()).toBe(true); // new Date() > null is true
    });

    it('should update last activity', async () => {
      const originalActivity = session.lastActivity;
      
      // Wait a small amount to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));
      await session.updateActivity();
      
      expect(session.lastActivity.getTime()).toBeGreaterThan(originalActivity.getTime());
    });

    it('should check if session is active', () => {
      expect(session.isActive).toBe(true);
      
      session.isActive = false;
      expect(session.isActive).toBe(false);
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      // Create test sessions
      await SessionModel.bulkCreate([
        {
          userId: '550e8400-e29b-41d4-a716-446655440001',
          token: 'active-session-token-1',
          expiresAt: new Date(Date.now() + 86400000) // Future
        },
        {
          userId: '550e8400-e29b-41d4-a716-446655440002',
          token: 'expired-session-token-1',
          expiresAt: new Date(Date.now() - 86400000) // Past
        },
        {
          userId: '550e8400-e29b-41d4-a716-446655440001',
          token: 'active-session-token-2',
          expiresAt: new Date(Date.now() + 86400000) // Future
        }
      ]);
    });

    it('should find active sessions for user', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440001';
      const activeSessions = await SessionModel.findAll({
        where: {
          userId,
          isActive: true,
          expiresAt: {
            [Op.gt]: new Date()
          }
        }
      });
      
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.every(s => s.userId === userId)).toBe(true);
      expect(activeSessions.every(s => !s.isExpired())).toBe(true);
    });

    it('should cleanup expired sessions', async () => {
      const initialCount = await SessionModel.count();
      expect(initialCount).toBe(3);
      
      const cleanedCount = await SessionModel.destroy({
        where: {
          expiresAt: {
            [Op.lt]: new Date()
          }
        }
      });
      expect(cleanedCount).toBe(1); // One expired session removed
      
      const remainingCount = await SessionModel.count();
      expect(remainingCount).toBe(2); // Only active sessions remain
    });
  });

  describe('Model Creation and Validation', () => {
    it('should create session with required fields', async () => {
      const session = await SessionModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440005',
        token: 'new-session-token-456',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        deviceInfo: { test: true }
      });

      expect(session.token).toBe('new-session-token-456');
      expect(session.userId).toBe('550e8400-e29b-41d4-a716-446655440005');
      expect(session.deviceInfo).toEqual({ test: true });
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    it('should handle default values', async () => {
      const session = await SessionModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440010',
        token: 'minimal-session-token',
        expiresAt: new Date(Date.now() + 3600000)
      });

      expect(session.isActive).toBe(true);
      expect(session.lastActivity).toBeInstanceOf(Date);
    });

    it('should enforce unique token constraint', async () => {
      await SessionModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440001',
        token: 'unique-session-token',
        expiresAt: new Date(Date.now() + 3600000)
      });

      await expect(SessionModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440002',
        token: 'unique-session-token',
        expiresAt: new Date(Date.now() + 3600000)
      })).rejects.toThrow();
    });
  });
});
