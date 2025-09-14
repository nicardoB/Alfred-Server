import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Sequelize } from 'sequelize';
import { defineUserModel } from '../../src/models/User.js';
import { defineApiKeyModel } from '../../src/models/ApiKey.js';
import { defineSessionModel } from '../../src/models/Session.js';
import { defineAuditLogModel } from '../../src/models/AuditLog.js';

// Mock the authentication middleware completely
jest.unstable_mockModule('../../src/middleware/authentication.js', () => ({
  authenticate: (req, res, next) => {
    if (global.testUser) {
      req.user = global.testUser;
      req.authType = 'test';
    }
    next();
  },
  requireRole: (roles) => (req, res, next) => next(),
  requireOwner: (req, res, next) => next(),
  requirePermission: (permission) => (req, res, next) => next()
}));

const { default: authRoutes } = await import('../../src/routes/auth.js');

describe('Authentication Routes - Simplified', () => {
  let app;
  let sequelize;
  let User, ApiKey, Session, AuditLog;

  beforeAll(async () => {
    // Setup test database
    sequelize = new Sequelize('sqlite::memory:', { logging: false });
    
    // Initialize models
    User = defineUserModel(sequelize);
    ApiKey = defineApiKeyModel(sequelize);
    Session = defineSessionModel(sequelize);
    AuditLog = defineAuditLogModel(sequelize);
    
    // Set up associations
    User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
    User.hasMany(ApiKey, { foreignKey: 'userId', as: 'apiKeys' });
    User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
    Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    ApiKey.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    
    await sequelize.sync();

    // Set up global model references
    global.testModels = {
      User,
      ApiKey, 
      Session,
      AuditLog
    };

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRoutes);
  });

  afterAll(async () => {
    await sequelize.close();
  });

  afterEach(async () => {
    await User.destroy({ where: {} });
    await ApiKey.destroy({ where: {} });
    await Session.destroy({ where: {} });
    await AuditLog.destroy({ where: {} });
    global.testUser = null;
  });

  describe('API Key Management', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await User.create({
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner',
        permissions: { 'system.admin': true }
      });
      
      global.testUser = testUser;
    });

    test('should create API key for authenticated user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/api-keys')
        .send({
          name: 'Test API Key'
        })
        .expect(201);

      expect(response.body.message).toBe('API key created successfully');
      expect(response.body.apiKey).toMatch(/^ak_/);
      expect(response.body.keyId).toBeTruthy();

      // Verify API key was created in database
      const apiKey = await ApiKey.findByPk(response.body.keyId);
      expect(apiKey).toBeTruthy();
      expect(apiKey.name).toBe('Test API Key');
      expect(apiKey.userId).toBe(testUser.id);
    });

    test('should list user API keys', async () => {
      // Create test API key
      const keyData = ApiKey.generateKey();
      const testApiKey = await ApiKey.create({
        userId: testUser.id,
        name: 'Test Key',
        keyHash: keyData.hash,
        keyPrefix: keyData.prefix,
        permissions: { 'system.admin': true }
      });

      const response = await request(app)
        .get('/api/v1/auth/api-keys')
        .expect(200);

      expect(response.body.apiKeys).toHaveLength(1);
      expect(response.body.apiKeys[0].name).toBe('Test Key');
      expect(response.body.apiKeys[0].keyPrefix).toBe(keyData.prefix);
    });

    test('should revoke user API key', async () => {
      // Create test API key
      const keyData = ApiKey.generateKey();
      const testApiKey = await ApiKey.create({
        userId: testUser.id,
        name: 'Test Key',
        keyHash: keyData.hash,
        keyPrefix: keyData.prefix,
        permissions: { 'system.admin': true }
      });

      await request(app)
        .delete(`/api/v1/auth/api-keys/${testApiKey.id}`)
        .expect(200);

      const apiKey = await ApiKey.findByPk(testApiKey.id);
      expect(apiKey.isActive).toBe(false);
    });
  });
});
