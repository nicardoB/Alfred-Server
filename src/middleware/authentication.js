import jwt from 'jsonwebtoken';
import { getUserModel } from '../models/User.js';
import { getSessionModel } from '../models/Session.js';
import { getApiKeyModel } from '../models/ApiKey.js';
import { getAuditLogModel } from '../models/AuditLog.js';

/**
 * Authentication middleware for Alfred MCP Server
 * Supports JWT tokens, API keys, and session-based authentication
 */

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-change-in-production';
const API_KEY_HEADER = 'x-api-key';
const AUTH_HEADER = 'authorization';

/**
 * Extract authentication token from request headers
 */
function extractToken(req) {
  // Check for API key in headers
  const apiKey = req.headers[API_KEY_HEADER] || 
                 (req.headers[AUTH_HEADER]?.startsWith('Bearer ') ? 
                  req.headers[AUTH_HEADER].substring(7) : null);
  
  // Check for JWT token in Authorization Bearer header
  const jwtToken = req.headers[AUTH_HEADER]?.startsWith('Bearer ') ? 
                   req.headers[AUTH_HEADER].substring(7) : null;
  
  return { apiKey, jwtToken };
}

/**
 * Authenticate using API key
 */
async function authenticateApiKey(keyString) {
  try {
    const ApiKey = getApiKeyModel();
    const User = getUserModel();
    
    if (!ApiKey || !User) {
      throw new Error('Models not initialized');
    }

    const keyHash = ApiKey.hashKey(keyString);
    const apiKey = await ApiKey.findOne({
      where: { keyHash, isActive: true },
      include: [{
        model: User,
        as: 'user'
      }]
    });

    if (!apiKey || apiKey.isExpired()) {
      return null;
    }

    // Record usage
    await apiKey.recordUsage();

    return {
      user: apiKey.user,
      apiKey,
      authType: 'api_key'
    };
  } catch (error) {
    console.error('API key authentication error:', error);
    return null;
  }
}

/**
 * Authenticate using JWT token
 */
async function authenticateJWT(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const User = getUserModel();
    const Session = getSessionModel();
    
    console.log('JWT Auth Debug:', { 
      hasUser: !!User, 
      hasSession: !!Session, 
      userId: decoded.userId,
      tokenPrefix: token.substring(0, 20) + '...'
    });
    
    if (!User || !Session) {
      console.error('Models not initialized - User:', !!User, 'Session:', !!Session);
      throw new Error('Models not initialized');
    }

    const session = await Session.findOne({
      where: { 
        token,
        isActive: true,
        userId: decoded.userId
      },
      include: [{
        model: User,
        as: 'user'
      }]
    });

    console.log('Session lookup result:', { 
      found: !!session, 
      userId: decoded.userId,
      isExpired: session ? session.isExpired() : 'N/A'
    });

    if (!session) {
      console.log('No session found for token, creating JWT-only auth');
      // If no session exists but JWT is valid, authenticate with user lookup
      const user = await User.findOne({ where: { id: decoded.userId } });
      if (!user) {
        console.log('No user found for JWT userId:', decoded.userId);
        return null;
      }
      
      return {
        user,
        session: null,
        authType: 'jwt'
      };
    }
    
    if (session.isExpired()) {
      console.log('Session expired for user:', decoded.userId);
      return null;
    }

    // Update session activity
    await session.updateActivity();

    return {
      user: session.user,
      session,
      authType: 'jwt'
    };
  } catch (error) {
    console.error('JWT authentication error:', error);
    console.error('JWT Error Details:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n')[0]
    });
    return null;
  }
}

/**
 * Main authentication middleware
 */
export async function authenticate(req, res, next) {
  const startTime = Date.now();
  const { apiKey, jwtToken } = extractToken(req);
  
  let authResult = null;
  let authMethod = 'none';

  try {
    // Try API key authentication first
    if (apiKey) {
      authResult = await authenticateApiKey(apiKey);
      authMethod = 'api_key';
    }
    
    // Fall back to JWT authentication
    if (!authResult && jwtToken) {
      console.log('Attempting JWT authentication with token:', jwtToken.substring(0, 20) + '...');
      authResult = await authenticateJWT(jwtToken);
      authMethod = 'jwt';
      console.log('JWT authentication result:', !!authResult);
    }

    if (authResult) {
      // Check user status after successful authentication
      if (!authResult.user.isActive) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please provide a valid API key or JWT token'
        });
      }
      
      if (!authResult.user.approved) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please provide a valid API key or JWT token'
        });
      }

      // Authentication successful
      req.user = authResult.user;
      req.authType = authResult.authType;
      req.session = authResult.session;
      req.apiKey = authResult.apiKey;

      // Log successful authentication
      const AuditLog = getAuditLogModel();
      if (AuditLog) {
        await AuditLog.logApiAccess({
          userId: authResult.user.id,
          method: req.method,
          endpoint: req.path,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          success: true,
          statusCode: 200,
          duration: Date.now() - startTime,
          sessionId: authResult.session?.id,
          apiKeyId: authResult.apiKey?.id
        });
      }

      return next();
    }

    // Authentication failed
    const AuditLog = getAuditLogModel();
    if (AuditLog) {
      await AuditLog.logSecurityEvent({
        action: 'unauthorized_access',
        method: req.method,
        endpoint: req.path,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        statusCode: 401,
        errorMessage: `Authentication failed using ${authMethod}`,
        duration: Date.now() - startTime
      });
    }

    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid API key or JWT token'
    });

  } catch (error) {
    console.error('Authentication middleware error:', error);
    
    const AuditLog = getAuditLogModel();
    if (AuditLog) {
      await AuditLog.logSecurityEvent({
        action: 'authentication_error',
        method: req.method,
        endpoint: req.path,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        statusCode: 500,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });
    }

    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    });
  }
}

/**
 * Role-based authorization middleware
 */

export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Permission-based authorization middleware
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
    }

    // Check user permissions
    if (!req.user.hasPermission(permission)) {
      // Check API key permissions if using API key auth
      if (req.apiKey && !req.apiKey.hasPermission(permission)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `Permission '${permission}' required`
        });
      } else if (!req.apiKey) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `Permission '${permission}' required`
        });
      }
    }

    next();
  };
}

/**
 * Owner-only access middleware
 */
export const requireOwner = requireRole(['owner']);

/**
 * Family and above access middleware
 */
export const requireFamily = requireRole(['owner', 'family']);

/**
 * Friend and above access middleware
 */
export const requireFriend = requireRole(['owner', 'family', 'friend']);

/**
 * Rate limiting middleware
 */
export function rateLimit(requestsPerHour = 100) {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    const now = Date.now();
    const windowStart = now - (60 * 60 * 1000); // 1 hour window
    
    if (!requests.has(key)) {
      requests.set(key, []);
    }
    
    const userRequests = requests.get(key);
    
    // Remove old requests outside the window
    const recentRequests = userRequests.filter(time => time > windowStart);
    requests.set(key, recentRequests);
    
    if (recentRequests.length >= requestsPerHour) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Maximum ${requestsPerHour} requests per hour allowed`
      });
    }
    
    // Add current request
    recentRequests.push(now);
    next();
  };
}
