import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

/**
 * Session Manager - Handles user sessions and metadata
 */
export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Create a new session
   */
  async createSession(sessionId, metadata = {}) {
    const session = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      metadata: metadata,
      isActive: true
    };

    this.sessions.set(sessionId, session);
    logger.info(`Session created: ${sessionId}`);
    
    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date().toISOString();
    }
    return session || null;
  }

  /**
   * Update session metadata
   */
  async updateSessionMetadata(sessionId, metadata) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata = { ...session.metadata, ...metadata };
      session.lastActivity = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * End a session
   */
  async endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      session.endedAt = new Date().toISOString();
      this.sessions.delete(sessionId);
      logger.info(`Session ended: ${sessionId}`);
      return true;
    }
    return false;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(maxAgeMs = 24 * 60 * 60 * 1000) { // 24 hours
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivity = new Date(session.lastActivity).getTime();
      if (now - lastActivity > maxAgeMs) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId);
      logger.info(`Expired session cleaned up: ${sessionId}`);
    });

    return expiredSessions.length;
  }
}
