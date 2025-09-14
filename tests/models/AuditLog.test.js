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

const { defineAuditLogModel } = await import('../../src/models/AuditLog.js');

describe('AuditLog Model', () => {
  let sequelize;
  let AuditLogModel;

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

    AuditLogModel = defineAuditLogModel(sequelize);
    await sequelize.sync({ force: true });

    // Create test users
    await User.bulkCreate([
      { id: '550e8400-e29b-41d4-a716-446655440001', email: 'test1@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440002', email: 'test2@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440005', email: 'test3@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440010', email: 'test4@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440011', email: 'test5@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440012', email: 'test6@example.com' },
      { id: '550e8400-e29b-41d4-a716-446655440013', email: 'test7@example.com' }
    ]);
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await AuditLogModel.destroy({ where: {} });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      // Create test audit logs
      const baseTime = new Date('2024-01-01T00:00:00Z');
      await AuditLogModel.bulkCreate([
        {
          userId: '550e8400-e29b-41d4-a716-446655440001',
          action: 'login',
          resource: 'auth',
          method: 'POST',
          endpoint: '/auth/login',
          success: true,
          details: { ip: '192.168.1.1' },
          createdAt: new Date(baseTime.getTime() + 1000)
        },
        {
          userId: '550e8400-e29b-41d4-a716-446655440001',
          action: 'create_message',
          resource: 'chat',
          method: 'POST',
          endpoint: '/chat/message',
          success: true,
          details: { conversationId: 'conv-1' },
          createdAt: new Date(baseTime.getTime() + 2000)
        },
        {
          userId: '550e8400-e29b-41d4-a716-446655440002',
          action: 'api_key_created',
          resource: 'api_keys',
          method: 'POST',
          endpoint: '/auth/api-keys',
          success: true,
          details: { keyName: 'Test Key' },
          createdAt: new Date(baseTime.getTime() + 3000)
        }
      ]);
    });

    it('should log authentication correctly', async () => {
      const logEntry = await AuditLogModel.logAuthentication({
        userId: '550e8400-e29b-41d4-a716-446655440005',
        success: true,
        ipAddress: '192.168.1.100',
        userAgent: 'Test Browser'
      });

      expect(logEntry.userId).toBe('550e8400-e29b-41d4-a716-446655440005');
      expect(logEntry.action).toBe('authentication');
      expect(logEntry.resource).toBe('user');
      expect(logEntry.method).toBe('POST');
      expect(logEntry.endpoint).toBe('/api/v1/auth/login');
      expect(logEntry.success).toBe(true);
      expect(logEntry.createdAt).toBeInstanceOf(Date);
    });

    it('should log API access correctly', async () => {
      const logEntry = await AuditLogModel.logApiAccess({
        userId: '550e8400-e29b-41d4-a716-446655440001',
        resource: 'chat',
        method: 'POST',
        endpoint: '/api/v1/chat/message',
        success: true,
        responseTime: 150
      });
      
      expect(logEntry.userId).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(logEntry.action).toBe('api_access');
      expect(logEntry.resource).toBe('chat');
      expect(logEntry.method).toBe('POST');
      expect(logEntry.endpoint).toBe('/api/v1/chat/message');
      expect(logEntry.success).toBe(true);
    });

    it('should log security events correctly', async () => {
      const logEntry = await AuditLogModel.logSecurityEvent({
        userId: '550e8400-e29b-41d4-a716-446655440002',
        action: 'failed_login_attempt',
        success: false,
        ipAddress: '192.168.1.200',
        details: { reason: 'invalid_password', attempts: 3 }
      });
      
      expect(logEntry.userId).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(logEntry.action).toBe('failed_login_attempt');
      expect(logEntry.resource).toBe('system');
      expect(logEntry.success).toBe(false);
      expect(logEntry.details).toBeUndefined();
    });

    it('should find logs by user ID', async () => {
      const userLogs = await AuditLogModel.findAll({
        where: {
          userId: '550e8400-e29b-41d4-a716-446655440001'
        },
        order: [['createdAt', 'DESC']]
      });
      
      expect(userLogs).toHaveLength(2);
      expect(userLogs.every(log => log.userId === '550e8400-e29b-41d4-a716-446655440001')).toBe(true);
      expect(userLogs[0].action).toBe('create_message'); // Most recent first
    });

    it('should find logs by action type', async () => {
      const loginLogs = await AuditLogModel.findAll({
        where: {
          action: 'login'
        }
      });
      
      expect(loginLogs).toHaveLength(1);
      expect(loginLogs[0].action).toBe('login');
      expect(loginLogs[0].resource).toBe('auth');
    });
  });

  describe('Model Creation and Validation', () => {
    it('should create audit log with required fields', async () => {
      const auditLog = await AuditLogModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440010',
        action: 'test_action',
        resource: 'test_resource',
        method: 'GET',
        endpoint: '/test',
        success: true,
        details: { test: 'data' }
      });

      expect(auditLog.userId).toBe('550e8400-e29b-41d4-a716-446655440010');
      expect(auditLog.action).toBe('test_action');
      expect(auditLog.resource).toBe('test_resource');
      expect(auditLog.details).toBeUndefined();
      expect(auditLog.createdAt).toBeInstanceOf(Date);
    });

    it('should handle null details', async () => {
      const auditLog = await AuditLogModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440011',
        action: 'simple_action',
        resource: 'simple_resource',
        method: 'POST',
        endpoint: '/simple',
        success: true
      });

      expect(auditLog.details).toBeUndefined();
    });

    it('should enforce required fields', async () => {
      await expect(AuditLogModel.create({
        action: 'missing_required_fields',
        resource: 'test'
        // Missing method, endpoint, success
      })).rejects.toThrow();

      await expect(AuditLogModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440012',
        resource: 'missing_action',
        method: 'GET',
        endpoint: '/test',
        success: true
      })).rejects.toThrow();

      await expect(AuditLogModel.create({
        userId: '550e8400-e29b-41d4-a716-446655440013',
        action: 'missing_resource',
        method: 'GET',
        endpoint: '/test',
        success: true
      })).rejects.toThrow();
    });
  });
});
