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

    test.skip('should reject missing setup key', async () => {
      await request(app)
        .post('/api/v1/auth/setup-owner')
        .send({ email: 'owner@test.com', password: 'password123' })
        .expect(403);
    });

    test.skip('should handle setup errors', async () => {
      // Mock User.create to throw error
      const originalCreate = User.create;
      User.create = jest.fn().mockRejectedValue(new Error('Database error'));

      try {
        await request(app)
          .post('/api/v1/auth/setup-owner')
          .send({
            email: 'owner@test.com',
            password: 'password123',
            setupKey: process.env.SETUP_KEY || 'test-setup-key'
          })
          .expect(500);
      } finally {
        User.create = originalCreate;
      }
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
      // First, create some failed attempts
      testUser.failedLoginAttempts = 3;
      await testUser.save();

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.token).toBeDefined();
      
      // Check that failed attempts were reset
      await testUser.reload();
      expect(testUser.failedLoginAttempts).toBe(0);
    });

    test('should handle login errors', async () => {
      // Mock User.findOne to throw error
      const originalFindOne = User.findOne;
      User.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      try {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123'
          })
          .expect(500);
      } finally {
        User.findOne = originalFindOne;
      }
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

  describe('GET /profile', () => {
    test('should return user profile for authenticated user', async () => {
      const testUser = await User.create({
        email: 'profile@test.com',
        hashedPassword: 'hashedpassword',
        role: 'owner',
        approved: true,
        monthlyBudget: 100.00
      });

      global.testUser = testUser;

      const response = await request(app)
        .get('/api/v1/auth/profile')
        .expect(200);

      expect(response.body.user).toMatchObject({
        id: testUser.id,
        email: 'profile@test.com',
        role: 'owner',
        approved: true,
        monthlyBudget: 100.00
      });
    });

    test('should handle profile fetch errors', async () => {
      // Create a user that will cause an error in the profile endpoint
      const testUser = {
        id: 'test-user-id',
        email: 'test@test.com',
        role: 'owner',
        get permissions() {
          throw new Error('Database error');
        }
      };

      global.testUser = testUser;

      await request(app)
        .get('/api/v1/auth/profile')
        .expect(500);
    });
  });

  describe('Error Handling', () => {
    test('should handle API key creation errors', async () => {
      const testUser = await User.create({
        email: 'error@test.com',
        hashedPassword: 'hashedpassword',
        role: 'owner',
        approved: true
      });

      global.testUser = testUser;

      // Mock ApiKey.create to throw error
      const originalCreate = ApiKey.create;
      ApiKey.create = jest.fn().mockRejectedValue(new Error('Database error'));

      try {
        await request(app)
          .post('/api/v1/auth/api-keys')
          .send({ name: 'Test Key' })
          .expect(500);
      } finally {
        ApiKey.create = originalCreate;
      }
    });

    test('should handle API keys list errors', async () => {
      global.testUser = { id: 'test-user-id' };

      // Mock ApiKey.findAll to throw error
      const originalFindAll = ApiKey.findAll;
      ApiKey.findAll = jest.fn().mockRejectedValue(new Error('Database error'));

      try {
        await request(app)
          .get('/api/v1/auth/api-keys')
          .expect(500);
      } finally {
        ApiKey.findAll = originalFindAll;
      }
    });

    test('should handle API key revocation errors', async () => {
      global.testUser = { id: 'test-user-id' };

      // Mock ApiKey.findOne to throw error
      const originalFindOne = ApiKey.findOne;
      ApiKey.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      try {
        await request(app)
          .delete('/api/v1/auth/api-keys/test-key-id')
          .expect(500);
      } finally {
        ApiKey.findOne = originalFindOne;
      }
    });
  });

  describe('POST /logout', () => {
    test('should handle logout successfully', async () => {
      const testUser = await User.create({
        email: 'logout@test.com',
        hashedPassword: 'hashedpassword',
        role: 'owner',
        approved: true
      });

      global.testUser = testUser;

      await request(app)
        .post('/api/v1/auth/logout')
        .expect(200);
    });

    test('should handle logout errors', async () => {
      const testUser = {
        id: 'test-user-id',
        get session() {
          throw new Error('Session error');
        }
      };

      global.testUser = testUser;

      await request(app)
        .post('/api/v1/auth/logout')
        .expect(500);
    });
  });
});
