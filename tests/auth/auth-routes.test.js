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

describe('Authentication Routes', () => {
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

    // Set up global model references for the auth routes
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
  });

  describe('POST /setup-owner', () => {
    const validSetupKey = 'test-setup-key-123';
    
    beforeEach(() => {
      process.env.OWNER_SETUP_KEY = validSetupKey;
    });

    test('should create owner account with valid setup key', async () => {
      const response = await request(app)
        .post('/api/v1/auth/setup-owner')
        .send({
          email: 'owner@test.com',
          password: 'securePassword123',
          setupKey: validSetupKey
        })
        .expect(201);

      expect(response.body.message).toBe('Owner account created successfully');
      expect(response.body.user.email).toBe('owner@test.com');
      expect(response.body.user.role).toBe('owner');
      expect(response.body.apiKey).toMatch(/^ak_/);
      expect(response.body.warning).toContain('Save this API key securely');

      // Verify user was created in database
      const user = await User.findOne({ where: { email: 'owner@test.com' } });
      expect(user).toBeTruthy();
      expect(user.role).toBe('owner');
      expect(user.approved).toBe(true);
    });

    test('should reject invalid setup key', async () => {
      await request(app)
        .post('/api/v1/auth/setup-owner')
        .send({
          email: 'owner@test.com',
          password: 'securePassword123',
          setupKey: 'invalid-key'
        })
        .expect(403);
    });

    test('should reject if owner already exists', async () => {
      // Create existing owner
      await User.create({
        email: 'existing@test.com',
        hashedPassword: 'password123',
        role: 'owner'
      });

      await request(app)
        .post('/api/v1/auth/setup-owner')
        .send({
          email: 'new@test.com',
          password: 'securePassword123',
          setupKey: validSetupKey
        })
        .expect(409);
    });

    test('should reject missing setup key', async () => {
      await request(app)
        .post('/api/v1/auth/setup-owner')
        .send({
          email: 'owner@test.com',
          password: 'securePassword123'
        })
        .expect(403);
    });
  });

  describe('POST /login', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await User.create({
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'family',
        approved: true
      });
    });

    test('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBeTruthy();
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.role).toBe('family');

      // Verify session was created
      const session = await Session.findOne({ where: { userId: testUser.id } });
      expect(session).toBeTruthy();
      expect(session.token).toBe(response.body.token);
    });

    test('should reject invalid email', async () => {
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        })
        .expect(401);
    });

    test('should reject invalid password', async () => {
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      // Should increment failed attempts
      const user = await User.findByPk(testUser.id);
      expect(user.failedLoginAttempts).toBe(1);
    });

    test('should lock account after 5 failed attempts', async () => {
      // Set user to 4 failed attempts
      testUser.failedLoginAttempts = 4;
      await testUser.save();

      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      const user = await User.findByPk(testUser.id);
      expect(user.failedLoginAttempts).toBe(5);
      expect(user.lockedUntil).toBeTruthy();
      expect(user.isLocked()).toBe(true);
    });

    test('should reject login for locked account', async () => {
      // Lock the account
      testUser.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      await testUser.save();

      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(401);
    });

    test('should reset failed attempts on successful login', async () => {
      testUser.failedLoginAttempts = 3;
      await testUser.save();

      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      const user = await User.findByPk(testUser.id);
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.lockedUntil).toBe(null);
    });
  });

  describe('POST /api-keys', () => {
    let testUser, authToken;

    beforeEach(async () => {
      testUser = await User.create({
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner',
        permissions: { 'system.admin': true }
      });
      
      // Set global test user for middleware
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
  });

  describe('GET /api-keys', () => {
    let testUser, testApiKey;

    beforeEach(async () => {
      testUser = await User.create({
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner'
      });

      global.testUser = testUser;

      const keyData = ApiKey.generateKey();
      testApiKey = await ApiKey.create({
        userId: testUser.id,
        name: 'Test Key',
        keyHash: keyData.hash,
        keyPrefix: keyData.prefix,
        permissions: {}
      });

    });

    test('should list user API keys', async () => {
      const response = await request(app)
        .get('/api/v1/auth/api-keys')
        .expect(200);

      expect(response.body.apiKeys).toHaveLength(1);
      expect(response.body.apiKeys[0].name).toBe('Test Key');
      expect(response.body.apiKeys[0].keyPrefix).toBe(testApiKey.keyPrefix);
      expect(response.body.apiKeys[0].keyHash).toBeUndefined(); // Should not expose hash
    });
  });

  describe('DELETE /api-keys/:keyId', () => {
    let testUser, testApiKey;

    beforeEach(async () => {
      testUser = await User.create({
        email: 'test@example.com',
        hashedPassword: 'password123',
        role: 'owner'
      });

      global.testUser = testUser;

      const keyData = ApiKey.generateKey();
      testApiKey = await ApiKey.create({
        userId: testUser.id,
        name: 'Test Key',
        keyHash: keyData.hash,
        keyPrefix: keyData.prefix,
        permissions: {}
      });

    });

    test('should revoke user API key', async () => {
      await request(app)
        .delete(`/api/v1/auth/api-keys/${testApiKey.id}`)
        .expect(200);

      const apiKey = await ApiKey.findByPk(testApiKey.id);
      expect(apiKey.isActive).toBe(false);
    });

    test('should reject revoking non-existent key', async () => {
      await request(app)
        .delete('/api/v1/auth/api-keys/non-existent-id')
        .expect(404);
    });
  });
});
