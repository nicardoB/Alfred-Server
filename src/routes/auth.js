import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getUserModel } from '../models/User.js';
import { getSessionModel } from '../models/Session.js';
import { getApiKeyModel } from '../models/ApiKey.js';
import { getAuditLogModel } from '../models/AuditLog.js';
import { authenticate, requireOwner } from '../middleware/authentication.js';
import { getRolePermissions, getRoleBudget, getRoleRateLimit } from '../config/permissions.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-change-in-production';

/**
 * Initialize owner account (first-time setup)
 * POST /api/v1/auth/setup-owner
 */
router.post('/setup-owner', async (req, res) => {
  try {
    const { email, password, setupKey } = req.body;
    
    // Verify setup key for security
    const expectedSetupKey = process.env.OWNER_SETUP_KEY;
    if (!expectedSetupKey || setupKey !== expectedSetupKey) {
      return res.status(403).json({
        error: 'Invalid setup key',
        message: 'Owner setup requires valid setup key'
      });
    }

    const User = getUserModel();
    
    // Check if owner already exists
    const existingOwner = await User.findOne({ where: { role: 'owner' } });
    if (existingOwner) {
      return res.status(409).json({
        error: 'Owner already exists',
        message: 'System already has an owner account'
      });
    }

    // Create owner account
    const owner = await User.create({
      email,
      hashedPassword: password, // Will be hashed by model hook
      role: 'owner',
      permissions: getRolePermissions('owner'),
      approved: true,
      monthlyBudget: getRoleBudget('owner')
    });

    // Create initial API key for owner
    const ApiKey = getApiKeyModel();
    const keyData = ApiKey.generateKey();
    
    await ApiKey.create({
      userId: owner.id,
      name: 'Owner Initial Key',
      keyHash: keyData.hash,
      keyPrefix: keyData.prefix,
      permissions: getRolePermissions('owner')
    });

    // Log the setup
    const AuditLog = getAuditLogModel();
    await AuditLog.logSecurityEvent({
      userId: owner.id,
      action: 'owner_setup',
      method: 'POST',
      endpoint: '/api/v1/auth/setup-owner',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      success: true,
      statusCode: 201
    });

    res.status(201).json({
      message: 'Owner account created successfully',
      user: {
        id: owner.id,
        email: owner.email,
        role: owner.role
      },
      apiKey: keyData.key,
      warning: 'Save this API key securely - it will not be shown again'
    });

  } catch (error) {
    console.error('Owner setup error:', error);
    res.status(500).json({
      error: 'Setup failed',
      message: error.message
    });
  }
});

/**
 * User login
 * POST /api/v1/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const User = getUserModel();
    const Session = getSessionModel();
    const AuditLog = getAuditLogModel();

    const user = await User.findOne({ where: { email } });
    
    if (!user || user.isLocked()) {
      await AuditLog.logAuthentication({
        method: 'POST',
        endpoint: '/api/v1/auth/login',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        statusCode: 401,
        errorMessage: 'Invalid credentials or account locked'
      });
      
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid credentials'
      });
    }

    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      // Increment failed attempts
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      }
      await user.save();

      await AuditLog.logAuthentication({
        userId: user.id,
        method: 'POST',
        endpoint: '/api/v1/auth/login',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        statusCode: 401,
        errorMessage: 'Invalid password'
      });

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid credentials'
      });
    }

    // Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    await user.save();

    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Create session
    const session = await Session.create({
      userId: user.id,
      token,
      deviceInfo: {
        userAgent: req.get('User-Agent'),
        ip: req.ip
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    await AuditLog.logAuthentication({
      userId: user.id,
      method: 'POST',
      endpoint: '/api/v1/auth/login',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      success: true,
      statusCode: 200,
      sessionId: session.id
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
});

/**
 * User logout
 * POST /api/v1/auth/logout
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    if (req.session) {
      req.session.isActive = false;
      await req.session.save();
    }

    const AuditLog = getAuditLogModel();
    await AuditLog.logAuthentication({
      userId: req.user.id,
      action: 'logout',
      method: 'POST',
      endpoint: '/api/v1/auth/logout',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      success: true,
      statusCode: 200,
      sessionId: req.session?.id
    });

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error.message
    });
  }
});

/**
 * Get current user profile
 * GET /api/v1/auth/profile
 */
router.get('/profile', (req, res, next) => {
  console.log('PROFILE ROUTE DEBUG - Route hit');
  authenticate(req, res, next);
}, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        permissions: req.user.permissions,
        monthlyBudget: req.user.monthlyBudget,
        lastLogin: req.user.lastLogin,
        approved: req.user.approved
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      error: 'Profile fetch failed',
      message: error.message
    });
  }
});

/**
 * Create new API key
 * POST /api/v1/auth/api-keys
 */
router.post('/api-keys', authenticate, async (req, res) => {
  try {
    const { name, permissions = {} } = req.body;
    const ApiKey = getApiKeyModel();
    
    const keyData = ApiKey.generateKey();
    
    const apiKey = await ApiKey.create({
      userId: req.user.id,
      name,
      keyHash: keyData.hash,
      keyPrefix: keyData.prefix,
      permissions: {
        ...req.user.permissions,
        ...permissions // Allow subset of user permissions
      }
    });

    const AuditLog = getAuditLogModel();
    await AuditLog.logSecurityEvent({
      userId: req.user.id,
      action: 'api_key_created',
      method: 'POST',
      endpoint: '/api/v1/auth/api-keys',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      success: true,
      statusCode: 201,
      resourceId: apiKey.id
    });

    res.status(201).json({
      message: 'API key created successfully',
      apiKey: keyData.key,
      keyId: apiKey.id,
      warning: 'Save this API key securely - it will not be shown again'
    });

  } catch (error) {
    console.error('API key creation error:', error);
    res.status(500).json({
      error: 'API key creation failed',
      message: error.message
    });
  }
});

/**
 * List user's API keys
 * GET /api/v1/auth/api-keys
 */
router.get('/api-keys', authenticate, async (req, res) => {
  try {
    const ApiKey = getApiKeyModel();
    
    const apiKeys = await ApiKey.findAll({
      where: { userId: req.user.id },
      attributes: ['id', 'name', 'keyPrefix', 'lastUsed', 'usageCount', 'isActive', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });

    res.json({ apiKeys });
  } catch (error) {
    console.error('API keys list error:', error);
    res.status(500).json({
      error: 'Failed to fetch API keys',
      message: error.message
    });
  }
});

/**
 * Revoke API key
 * DELETE /api/v1/auth/api-keys/:keyId
 */
router.delete('/api-keys/:keyId', authenticate, async (req, res) => {
  try {
    const { keyId } = req.params;
    const ApiKey = getApiKeyModel();
    
    const apiKey = await ApiKey.findOne({
      where: { 
        id: keyId,
        userId: req.user.id
      }
    });

    if (!apiKey) {
      return res.status(404).json({
        error: 'API key not found',
        message: 'API key does not exist or does not belong to you'
      });
    }

    apiKey.isActive = false;
    await apiKey.save();

    const AuditLog = getAuditLogModel();
    await AuditLog.logSecurityEvent({
      userId: req.user.id,
      action: 'api_key_revoked',
      method: 'DELETE',
      endpoint: `/api/v1/auth/api-keys/${keyId}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      success: true,
      statusCode: 200,
      resourceId: keyId
    });

    res.json({ message: 'API key revoked successfully' });
  } catch (error) {
    console.error('API key revocation error:', error);
    res.status(500).json({
      error: 'API key revocation failed',
      message: error.message
    });
  }
});

export default router;
