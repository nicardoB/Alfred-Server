import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { getUserModel } from '../models/User.js';

/**
 * WebSocket authentication middleware
 * Authenticates socket connections using JWT tokens
 */
export async function authenticateSocket(socket, next) {
  try {
    // Get token from handshake auth or query
    const token = socket.handshake.auth?.token || 
                  socket.handshake.query?.token ||
                  socket.request.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      logger.warn(`WebSocket connection rejected: No token provided from ${socket.handshake.address}`);
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded || !decoded.userId) {
      logger.warn(`WebSocket connection rejected: Invalid token from ${socket.handshake.address}`);
      return next(new Error('Invalid authentication token'));
    }

    // Get user from database
    const User = getUserModel();
    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'email', 'role', 'permissions', 'isActive']
    });

    if (!user || !user.isActive) {
      logger.warn(`WebSocket connection rejected: User not found or inactive - ${decoded.userId}`);
      return next(new Error('User not found or inactive'));
    }

    // Check if user has chat permissions
    const permissions = user.permissions || {};
    if (!permissions.chat) {
      logger.warn(`WebSocket connection rejected: User lacks chat permission - ${user.email}`);
      return next(new Error('Insufficient permissions for chat'));
    }

    // Attach user to socket
    socket.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: permissions
    };

    // Log successful authentication
    logger.info(`WebSocket authenticated: ${user.email} (${user.role}) from ${socket.handshake.address}`);
    
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn(`WebSocket connection rejected: Invalid JWT from ${socket.handshake.address}`);
      return next(new Error('Invalid authentication token'));
    } else if (error.name === 'TokenExpiredError') {
      logger.warn(`WebSocket connection rejected: Expired JWT from ${socket.handshake.address}`);
      return next(new Error('Authentication token expired'));
    } else {
      logger.error('WebSocket authentication error:', error);
      return next(new Error('Authentication failed'));
    }
  }
}

/**
 * Check if user has specific permission for WebSocket operations
 */
export function requireSocketPermission(permission) {
  return (socket, data, callback) => {
    if (!socket.user?.permissions?.[permission]) {
      const error = new Error(`Insufficient permissions: ${permission} required`);
      logger.warn(`Permission denied for ${socket.user?.email}: ${permission}`);
      
      if (callback) callback(error);
      else socket.emit('error', { message: error.message });
      
      return false;
    }
    return true;
  };
}

export default authenticateSocket;
