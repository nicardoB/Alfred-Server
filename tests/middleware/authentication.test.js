import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { Sequelize, DataTypes } from 'sequelize';

// Mock models before importing authentication middleware
let mockUser, mockApiKey, mockSession, mockAuditLog;
let sequelize;

beforeAll(async () => {
  // Setup in-memory database
  sequelize = new Sequelize('sqlite::memory:', { logging: false });
  
  // Define test models
  mockUser = sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    hashedPassword: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('owner', 'family', 'friend', 'demo'), defaultValue: 'demo' },
    permissions: { type: DataTypes.JSON, defaultValue: {} },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    approved: { type: DataTypes.BOOLEAN, defaultValue: false }
  });

  mockApiKey = sequelize.define('ApiKey', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    keyHash: { type: DataTypes.STRING, allowNull: false },
    keyPrefix: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    permissions: { type: DataTypes.JSON, defaultValue: {} },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastUsed: { type: DataTypes.DATE },
    expiresAt: { type: DataTypes.DATE }
  });

  mockSession = sequelize.define('Session', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    token: { type: DataTypes.STRING(512), allowNull: false, unique: true },
    deviceInfo: { type: DataTypes.JSON },
    ipAddress: { type: DataTypes.STRING },
    userAgent: { type: DataTypes.STRING(1000) },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    lastActivity: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
  });

  mockAuditLog = sequelize.define('AuditLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID },
    action: { type: DataTypes.STRING, allowNull: false },
    resource: { type: DataTypes.STRING, allowNull: false },
    resourceId: { type: DataTypes.STRING },
    method: { type: DataTypes.STRING, allowNull: false },
    endpoint: { type: DataTypes.STRING, allowNull: false },
    ipAddress: { type: DataTypes.STRING },
    userAgent: { type: DataTypes.STRING },
    success: { type: DataTypes.BOOLEAN, defaultValue: true },
    details: { type: DataTypes.JSON, defaultValue: {} }
  });

  // Add static methods to AuditLog model
  mockAuditLog.logSecurityEvent = async function(data) {
    return this.create({
      action: 'security_event',
      resource: 'system',
      method: data.method || 'SYSTEM',
      endpoint: data.endpoint || '/system',
      ...data
    });
  };

  mockAuditLog.logAuthentication = async function(data) {
    return this.create({
      action: 'authentication',
      resource: 'user',
      method: 'POST',
      endpoint: '/api/v1/auth/login',
      ...data
    });
  };

  mockAuditLog.logApiAccess = async function(data) {
    return this.create({
      action: 'api_access',
      resource: data.resource || 'unknown',
      method: data.method,
      endpoint: data.endpoint,
      ...data
    });
  };

  // Add static methods to ApiKey model
  mockApiKey.hashKey = (keyString) => {
    return `hashed_${keyString}`;
  };

  // Add instance methods to ApiKey model
  mockApiKey.prototype.isExpired = function() {
    return this.expiresAt && new Date() > this.expiresAt;
  };

  mockApiKey.prototype.hasPermission = function(permission) {
    return this.permissions && this.permissions[permission] === true;
  };

  mockApiKey.prototype.recordUsage = async function() {
    this.lastUsed = new Date();
    await this.save();
  };

  // Add instance methods to User model
  mockUser.prototype.hasPermission = function(permission) {
    return this.permissions && this.permissions[permission] === true;
  };

  mockUser.prototype.validatePassword = async function(password) {
    return password === 'correct_password';
  };

  mockUser.prototype.isLocked = function() {
    return !!(this.lockedUntil && new Date() < this.lockedUntil);
  };

  // Add instance methods to Session model
  mockSession.prototype.isExpired = function() {
    return new Date() > this.expiresAt;
  };

  mockSession.prototype.updateActivity = async function() {
    this.lastActivity = new Date();
    await this.save();
  };

  // Set up associations
  mockUser.hasMany(mockApiKey, { foreignKey: 'userId', as: 'apiKeys' });
  mockApiKey.belongsTo(mockUser, { foreignKey: 'userId', as: 'user' });
  mockUser.hasMany(mockSession, { foreignKey: 'userId', as: 'sessions' });
  mockSession.belongsTo(mockUser, { foreignKey: 'userId', as: 'user' });

  await sequelize.sync();
});

// Mock model getters
jest.unstable_mockModule('../../src/models/User.js', () => ({
  getUserModel: () => mockUser
}));

jest.unstable_mockModule('../../src/models/ApiKey.js', () => ({
  getApiKeyModel: () => mockApiKey
}));

jest.unstable_mockModule('../../src/models/Session.js', () => ({
  getSessionModel: () => mockSession
}));

jest.unstable_mockModule('../../src/models/AuditLog.js', () => ({
  getAuditLogModel: () => mockAuditLog
}));

// Import authentication middleware after mocking
const { 
  authenticate, 
  requireRole, 
  requireOwner, 
  requirePermission,
  rateLimit 
} = await import('../../src/middleware/authentication.js');

describe('Authentication Middleware', () => {
  let testUser, testApiKey, req, res, next;

  beforeEach(async () => {
    // Create test user
    testUser = await mockUser.create({
      email: 'test@example.com',
      hashedPassword: 'hashed_password',
      role: 'owner',
      permissions: {
        'system.admin': true,
        'ai.chat': true,
        'poker.coach': true
      },
      isActive: true,
      approved: true
    });

    // Create test API key
    testApiKey = await mockApiKey.create({
      userId: testUser.id,
      keyHash: mockApiKey.hashKey('test-api-key-123'),
      keyPrefix: 'ak_test',
      name: 'Test Key',
      permissions: {
        'ai.chat': true,
        'poker.coach': true
      },
      isActive: true
    });

    // Mock request/response objects
    req = {
      headers: {},
      ip: '127.0.0.1',
      method: 'POST',
      path: '/api/test',
      get: jest.fn((header) => req.headers[header.toLowerCase()])
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    
    next = jest.fn();
  });

  afterEach(async () => {
    // Clean up test data
    await mockSession.destroy({ where: {} });
    await mockApiKey.destroy({ where: {} });
    await mockUser.destroy({ where: {} });
    jest.clearAllMocks();
  });

  describe('authenticate middleware', () => {
    test('should authenticate valid JWT token', async () => {
      const token = jwt.sign(
        { 
          userId: testUser.id, 
          email: testUser.email, 
          role: testUser.role 
        },
        process.env.JWT_SECRET || 'your-super-secure-jwt-secret-change-in-production',
        { expiresIn: '24h' }
      );

      // Create a session record for the JWT token
      await mockSession.create({
        userId: testUser.id,
        token: token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        isActive: true
      });

      req.headers.authorization = `Bearer ${token}`;

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(testUser.id);
      expect(req.user.email).toBe(testUser.email);
      expect(req.user.role).toBe(testUser.role);
    });

    test('should authenticate valid API key', async () => {
      req.headers['x-api-key'] = 'test-api-key-123';

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(testUser.id);
      expect(req.user.email).toBe(testUser.email);
    });

    test('should reject invalid JWT token', async () => {
      req.headers.authorization = 'Bearer invalid-token';

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Authentication required',
        message: 'Please provide a valid API key or JWT token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject invalid API key', async () => {
      req.headers['x-api-key'] = 'invalid-api-key';

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Authentication required',
        message: 'Please provide a valid API key or JWT token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject inactive API key', async () => {
      await testApiKey.update({ isActive: false });
      req.headers['x-api-key'] = 'test-api-key-123';

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Authentication required',
        message: 'Please provide a valid API key or JWT token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject inactive user', async () => {
      await testUser.update({ isActive: false });
      req.headers['x-api-key'] = 'test-api-key-123';

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Authentication required',
        message: 'Please provide a valid API key or JWT token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject unapproved user', async () => {
      await testUser.update({ approved: false });
      req.headers['x-api-key'] = 'test-api-key-123';

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Authentication required',
        message: 'Please provide a valid API key or JWT token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject request with no authentication', async () => {
      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Authentication required',
        message: 'Please provide a valid API key or JWT token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should update API key last used timestamp', async () => {
      const originalLastUsed = testApiKey.lastUsed;
      req.headers['x-api-key'] = 'test-api-key-123';

      await authenticate(req, res, next);

      await testApiKey.reload();
      expect(testApiKey.lastUsed).not.toBe(originalLastUsed);
    });
  });

  describe('requireRole middleware', () => {
    beforeEach(() => {
      req.user = {
        id: testUser.id,
        email: testUser.email,
        role: 'family'
      };
    });

    test('should allow access for matching role', () => {
      const middleware = requireRole(['family', 'owner']);
      
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should deny access for non-matching role', () => {
      const middleware = requireRole(['owner']);
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Insufficient permissions',
        message: 'Access denied. Required roles: owner'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle single role string', () => {
      req.user.role = 'owner';
      const middleware = requireRole('owner');
      
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireOwner middleware', () => {
    test('should allow access for owner role', () => {
      req.user = { role: 'owner' };
      
      requireOwner(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny access for non-owner role', () => {
      req.user = { role: 'family' };
      
      requireOwner(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Insufficient permissions',
        message: 'Access denied. Required roles: owner'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission middleware', () => {
    beforeEach(() => {
      req.user = {
        permissions: {
          'ai.chat': true,
          'poker.coach': true,
          'system.admin': false
        },
        hasPermission: function(permission) {
          return this.permissions && this.permissions[permission] === true;
        }
      };
    });

    test('should allow access with valid permission', () => {
      const middleware = requirePermission('ai.chat');
      
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny access without permission', () => {
      const middleware = requirePermission('system.admin');
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Insufficient permissions',
        message: "Permission 'system.admin' required"
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should deny access for missing permission', () => {
      const middleware = requirePermission('missing.permission');
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Insufficient permissions',
        message: "Permission 'missing.permission' required"
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('rateLimit middleware', () => {
    test('should create rate limiting middleware', () => {
      const middleware = rateLimit(100);
      
      expect(typeof middleware).toBe('function');
    });

    test('should allow requests within limit', () => {
      const middleware = rateLimit(100);
      
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
