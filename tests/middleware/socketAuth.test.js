import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const mockUser = {
  findByPk: jest.fn()
};

const mockGetUserModel = jest.fn(() => mockUser);

// Mock modules before importing
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

jest.unstable_mockModule('../../src/models/User.js', () => ({
  getUserModel: mockGetUserModel
}));

// Import the module under test
const { authenticateSocket, requireSocketPermission } = await import('../../src/middleware/socketAuth.js');

describe('Socket Authentication Middleware', () => {
  let mockSocket;
  let mockNext;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Set up JWT secret for tests
    process.env.JWT_SECRET = 'test-secret';

    // Create mock socket
    mockSocket = {
      handshake: {
        auth: {},
        query: {},
        address: '127.0.0.1'
      },
      request: {
        headers: {}
      },
      user: null,
      emit: jest.fn()
    };

    // Create mock next function
    mockNext = jest.fn();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  describe('authenticateSocket', () => {
    test('should authenticate with valid token in handshake auth', async () => {
      const userId = 'user-123';
      const token = jwt.sign({ userId }, 'test-secret');
      
      mockSocket.handshake.auth.token = token;
      
      const mockUserData = {
        id: userId,
        email: 'test@example.com',
        role: 'family',
        permissions: { chat: true },
        isActive: true
      };
      
      mockUser.findByPk.mockResolvedValue(mockUserData);

      await authenticateSocket(mockSocket, mockNext);

      expect(mockUser.findByPk).toHaveBeenCalledWith(userId, {
        attributes: ['id', 'email', 'role', 'permissions', 'isActive']
      });
      expect(mockSocket.user).toEqual({
        id: userId,
        email: 'test@example.com',
        role: 'family',
        permissions: { chat: true }
      });
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockLogger.info).toHaveBeenCalledWith(
        `WebSocket authenticated: test@example.com (family) from 127.0.0.1`
      );
    });

    test('should authenticate with valid token in query params', async () => {
      const userId = 'user-456';
      const token = jwt.sign({ userId }, 'test-secret');
      
      mockSocket.handshake.query.token = token;
      
      const mockUserData = {
        id: userId,
        email: 'query@example.com',
        role: 'friend',
        permissions: { chat: true },
        isActive: true
      };
      
      mockUser.findByPk.mockResolvedValue(mockUserData);

      await authenticateSocket(mockSocket, mockNext);

      expect(mockSocket.user.email).toBe('query@example.com');
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should authenticate with valid token in authorization header', async () => {
      const userId = 'user-789';
      const token = jwt.sign({ userId }, 'test-secret');
      
      mockSocket.request.headers.authorization = `Bearer ${token}`;
      
      const mockUserData = {
        id: userId,
        email: 'header@example.com',
        role: 'owner',
        permissions: { chat: true },
        isActive: true
      };
      
      mockUser.findByPk.mockResolvedValue(mockUserData);

      await authenticateSocket(mockSocket, mockNext);

      expect(mockSocket.user.email).toBe('header@example.com');
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should reject connection when no token provided', async () => {
      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Authentication token required'));
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'WebSocket connection rejected: No token provided from 127.0.0.1'
      );
    });

    test('should reject connection with invalid JWT', async () => {
      mockSocket.handshake.auth.token = 'invalid-token';

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Invalid authentication token'));
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'WebSocket connection rejected: Invalid JWT from 127.0.0.1'
      );
    });

    test('should reject connection with expired JWT', async () => {
      const expiredToken = jwt.sign(
        { userId: 'user-123', exp: Math.floor(Date.now() / 1000) - 3600 }, // Expired 1 hour ago
        'test-secret'
      );
      
      mockSocket.handshake.auth.token = expiredToken;

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Authentication token expired'));
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'WebSocket connection rejected: Expired JWT from 127.0.0.1'
      );
    });

    test('should reject connection with token missing userId', async () => {
      const invalidToken = jwt.sign({ email: 'test@example.com' }, 'test-secret'); // No userId
      
      mockSocket.handshake.auth.token = invalidToken;

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Invalid authentication token'));
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'WebSocket connection rejected: Invalid token from 127.0.0.1'
      );
    });

    test('should reject connection when user not found', async () => {
      const token = jwt.sign({ userId: 'nonexistent-user' }, 'test-secret');
      
      mockSocket.handshake.auth.token = token;
      mockUser.findByPk.mockResolvedValue(null);

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('User not found or inactive'));
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'WebSocket connection rejected: User not found or inactive - nonexistent-user'
      );
    });

    test('should reject connection when user is inactive', async () => {
      const userId = 'inactive-user';
      const token = jwt.sign({ userId }, 'test-secret');
      
      mockSocket.handshake.auth.token = token;
      
      const inactiveUser = {
        id: userId,
        email: 'inactive@example.com',
        role: 'family',
        permissions: { chat: true },
        isActive: false
      };
      
      mockUser.findByPk.mockResolvedValue(inactiveUser);

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('User not found or inactive'));
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'WebSocket connection rejected: User not found or inactive - inactive-user'
      );
    });

    test('should reject connection when user lacks chat permission', async () => {
      const userId = 'no-chat-user';
      const token = jwt.sign({ userId }, 'test-secret');
      
      mockSocket.handshake.auth.token = token;
      
      const userWithoutChat = {
        id: userId,
        email: 'nochat@example.com',
        role: 'demo',
        permissions: { code: true }, // No chat permission
        isActive: true
      };
      
      mockUser.findByPk.mockResolvedValue(userWithoutChat);

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Insufficient permissions for chat'));
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'WebSocket connection rejected: User lacks chat permission - nochat@example.com'
      );
    });

    test('should handle user with null permissions', async () => {
      const userId = 'null-perms-user';
      const token = jwt.sign({ userId }, 'test-secret');
      
      mockSocket.handshake.auth.token = token;
      
      const userWithNullPerms = {
        id: userId,
        email: 'nullperms@example.com',
        role: 'demo',
        permissions: null,
        isActive: true
      };
      
      mockUser.findByPk.mockResolvedValue(userWithNullPerms);

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Insufficient permissions for chat'));
    });

    test('should handle database errors gracefully', async () => {
      const token = jwt.sign({ userId: 'user-123' }, 'test-secret');
      
      mockSocket.handshake.auth.token = token;
      mockUser.findByPk.mockRejectedValue(new Error('Database connection failed'));

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Authentication failed'));
      expect(mockLogger.error).toHaveBeenCalledWith(
        'WebSocket authentication error:',
        expect.any(Error)
      );
    });

    test('should handle missing JWT secret', async () => {
      delete process.env.JWT_SECRET;
      
      const token = jwt.sign({ userId: 'user-123' }, 'different-secret');
      mockSocket.handshake.auth.token = token;

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Invalid authentication token'));
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('requireSocketPermission', () => {
    beforeEach(() => {
      mockSocket.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'family',
        permissions: {
          chat: true,
          code: true,
          poker: false
        }
      };
    });

    test('should allow access when user has required permission', () => {
      const permissionCheck = requireSocketPermission('chat');
      const mockCallback = jest.fn();

      const result = permissionCheck(mockSocket, {}, mockCallback);

      expect(result).toBe(true);
      expect(mockCallback).not.toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    test('should deny access when user lacks required permission', () => {
      const permissionCheck = requireSocketPermission('poker');
      const mockCallback = jest.fn();

      const result = permissionCheck(mockSocket, {}, mockCallback);

      expect(result).toBe(false);
      expect(mockCallback).toHaveBeenCalledWith(
        new Error('Insufficient permissions: poker required')
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Permission denied for test@example.com: poker'
      );
    });

    test('should emit error when no callback provided', () => {
      const permissionCheck = requireSocketPermission('poker');

      const result = permissionCheck(mockSocket, {});

      expect(result).toBe(false);
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Insufficient permissions: poker required'
      });
    });

    test('should deny access when user has no permissions', () => {
      mockSocket.user.permissions = null;
      
      const permissionCheck = requireSocketPermission('chat');
      const mockCallback = jest.fn();

      const result = permissionCheck(mockSocket, {}, mockCallback);

      expect(result).toBe(false);
      expect(mockCallback).toHaveBeenCalledWith(
        new Error('Insufficient permissions: chat required')
      );
    });

    test('should deny access when user is not authenticated', () => {
      mockSocket.user = null;
      
      const permissionCheck = requireSocketPermission('chat');
      const mockCallback = jest.fn();

      const result = permissionCheck(mockSocket, {}, mockCallback);

      expect(result).toBe(false);
      expect(mockCallback).toHaveBeenCalledWith(
        new Error('Insufficient permissions: chat required')
      );
    });

    test('should handle undefined permission gracefully', () => {
      const permissionCheck = requireSocketPermission('nonexistent');
      const mockCallback = jest.fn();

      const result = permissionCheck(mockSocket, {}, mockCallback);

      expect(result).toBe(false);
      expect(mockCallback).toHaveBeenCalledWith(
        new Error('Insufficient permissions: nonexistent required')
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle malformed authorization header', async () => {
      mockSocket.request.headers.authorization = 'InvalidFormat token123';
      
      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Invalid authentication token'));
    });

    test('should handle empty token strings', async () => {
      mockSocket.handshake.auth.token = '';
      
      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Authentication token required'));
    });

    test('should handle whitespace-only tokens', async () => {
      mockSocket.handshake.auth.token = '   ';
      
      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Invalid authentication token'));
    });

    test('should prioritize handshake auth over query and header', async () => {
      const userId = 'priority-user';
      const correctToken = jwt.sign({ userId }, 'test-secret');
      const wrongToken = jwt.sign({ userId: 'wrong-user' }, 'test-secret');
      
      // Set tokens in all locations, handshake.auth should win
      mockSocket.handshake.auth.token = correctToken;
      mockSocket.handshake.query.token = wrongToken;
      mockSocket.request.headers.authorization = `Bearer ${wrongToken}`;
      
      const mockUserData = {
        id: userId,
        email: 'priority@example.com',
        role: 'family',
        permissions: { chat: true },
        isActive: true
      };
      
      mockUser.findByPk.mockResolvedValue(mockUserData);

      await authenticateSocket(mockSocket, mockNext);

      expect(mockUser.findByPk).toHaveBeenCalledWith(userId, expect.any(Object));
      expect(mockSocket.user.email).toBe('priority@example.com');
    });
  });
});
