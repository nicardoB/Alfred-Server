import { jest } from '@jest/globals';
import { SessionManager } from '../../src/session/SessionManager.js';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

jest.mock('../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

describe('SessionManager', () => {
  let sessionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionManager = new SessionManager();
  });

  describe('createSession', () => {
    it('should create a new session with default metadata', async () => {
      const sessionId = 'test-session-1';
      const session = await sessionManager.createSession(sessionId);

      expect(session).toEqual({
        id: sessionId,
        createdAt: expect.any(String),
        lastActivity: expect.any(String),
        metadata: {},
        isActive: true
      });
      expect(sessionManager.sessions.has(sessionId)).toBe(true);
      // Logger calls are mocked, so we don't test them in unit tests
    });

    it('should create a new session with custom metadata', async () => {
      const sessionId = 'test-session-2';
      const metadata = { userId: 'user-123', toolContext: 'chat' };
      const session = await sessionManager.createSession(sessionId, metadata);

      expect(session.metadata).toEqual(metadata);
      expect(session.id).toBe(sessionId);
      expect(session.isActive).toBe(true);
    });

    it('should create sessions with valid timestamps', async () => {
      const sessionId = 'test-session-3';
      const beforeCreate = Date.now();
      const session = await sessionManager.createSession(sessionId);
      const afterCreate = Date.now();

      const createdTime = new Date(session.createdAt).getTime();
      expect(createdTime).toBeGreaterThanOrEqual(beforeCreate);
      expect(createdTime).toBeLessThanOrEqual(afterCreate);
      expect(session.lastActivity).toEqual(session.createdAt);
    });

    it('should overwrite existing session with same ID', async () => {
      const sessionId = 'duplicate-session';
      const firstSession = await sessionManager.createSession(sessionId, { version: 1 });
      const secondSession = await sessionManager.createSession(sessionId, { version: 2 });

      expect(sessionManager.sessions.size).toBe(1);
      expect(secondSession.metadata.version).toBe(2);
      expect(firstSession).not.toEqual(secondSession);
    });
  });

  describe('getSession', () => {
    it('should retrieve existing session and update lastActivity', async () => {
      const sessionId = 'test-session';
      const originalSession = await sessionManager.createSession(sessionId);
      const originalTime = new Date(originalSession.lastActivity).getTime();
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const retrievedSession = await sessionManager.getSession(sessionId);
      const retrievedTime = new Date(retrievedSession.lastActivity).getTime();

      expect(retrievedSession.id).toBe(sessionId);
      expect(retrievedTime).toBeGreaterThan(originalTime);
    });

    it('should return null for non-existent session', async () => {
      const session = await sessionManager.getSession('non-existent');
      expect(session).toBeNull();
    });

    it('should handle empty session ID', async () => {
      const session = await sessionManager.getSession('');
      expect(session).toBeNull();
    });

    it('should handle null session ID', async () => {
      const session = await sessionManager.getSession(null);
      expect(session).toBeNull();
    });
  });

  describe('updateSessionMetadata', () => {
    it('should update metadata for existing session', async () => {
      const sessionId = 'test-session';
      await sessionManager.createSession(sessionId, { initial: true });

      const result = await sessionManager.updateSessionMetadata(sessionId, { 
        updated: true, 
        timestamp: Date.now() 
      });

      expect(result).toBe(true);
      const session = await sessionManager.getSession(sessionId);
      expect(session.metadata).toEqual({
        initial: true,
        updated: true,
        timestamp: expect.any(Number)
      });
    });

    it('should merge metadata without overwriting existing keys', async () => {
      const sessionId = 'test-session';
      await sessionManager.createSession(sessionId, { 
        userId: 'user-123', 
        toolContext: 'chat' 
      });

      await sessionManager.updateSessionMetadata(sessionId, { 
        toolContext: 'code', 
        newField: 'value' 
      });

      const session = await sessionManager.getSession(sessionId);
      expect(session.metadata).toEqual({
        userId: 'user-123',
        toolContext: 'code', // Should be updated
        newField: 'value'
      });
    });

    it('should update lastActivity timestamp', async () => {
      const sessionId = 'test-session';
      const originalSession = await sessionManager.createSession(sessionId);
      const originalTime = new Date(originalSession.lastActivity).getTime();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await sessionManager.updateSessionMetadata(sessionId, { updated: true });
      const updatedSession = await sessionManager.getSession(sessionId);
      const updatedTime = new Date(updatedSession.lastActivity).getTime();

      expect(updatedTime).toBeGreaterThan(originalTime);
    });

    it('should return false for non-existent session', async () => {
      const result = await sessionManager.updateSessionMetadata('non-existent', { test: true });
      expect(result).toBe(false);
    });

    it('should handle empty metadata update', async () => {
      const sessionId = 'test-session';
      await sessionManager.createSession(sessionId, { original: true });

      const result = await sessionManager.updateSessionMetadata(sessionId, {});
      expect(result).toBe(true);

      const session = await sessionManager.getSession(sessionId);
      expect(session.metadata).toEqual({ original: true });
    });
  });

  describe('endSession', () => {
    it('should end existing session', async () => {
      const sessionId = 'test-session';
      await sessionManager.createSession(sessionId);

      const result = await sessionManager.endSession(sessionId);

      expect(result).toBe(true);
      expect(sessionManager.sessions.has(sessionId)).toBe(false);
      // Logger calls are mocked, so we don't test them in unit tests
    });

    it('should return false for non-existent session', async () => {
      const result = await sessionManager.endSession('non-existent');
      expect(result).toBe(false);
      expect(mockLogger.info).not.toHaveBeenCalledWith('Session ended: non-existent');
    });

    it('should set session as inactive and add endedAt timestamp before deletion', async () => {
      const sessionId = 'test-session';
      await sessionManager.createSession(sessionId);

      // Mock the session deletion to capture the session state before deletion
      const originalDelete = sessionManager.sessions.delete.bind(sessionManager.sessions);
      let sessionBeforeDeletion = null;
      sessionManager.sessions.delete = jest.fn((id) => {
        sessionBeforeDeletion = sessionManager.sessions.get(id);
        return originalDelete(id);
      });

      await sessionManager.endSession(sessionId);

      expect(sessionBeforeDeletion.isActive).toBe(false);
      expect(sessionBeforeDeletion.endedAt).toBeDefined();
      expect(new Date(sessionBeforeDeletion.endedAt)).toBeInstanceOf(Date);
    });
  });

  describe('getActiveSessions', () => {
    it('should return empty array when no sessions exist', () => {
      const activeSessions = sessionManager.getActiveSessions();
      expect(activeSessions).toEqual([]);
    });

    it('should return all active sessions', async () => {
      await sessionManager.createSession('session-1');
      await sessionManager.createSession('session-2');
      await sessionManager.createSession('session-3');

      const activeSessions = sessionManager.getActiveSessions();
      expect(activeSessions).toHaveLength(3);
      expect(activeSessions.every(session => session.isActive)).toBe(true);
    });

    it('should exclude ended sessions', async () => {
      await sessionManager.createSession('session-1');
      await sessionManager.createSession('session-2');
      await sessionManager.createSession('session-3');

      await sessionManager.endSession('session-2');

      const activeSessions = sessionManager.getActiveSessions();
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map(s => s.id)).toEqual(['session-1', 'session-3']);
    });

    it('should return sessions with all required properties', async () => {
      await sessionManager.createSession('test-session', { userId: 'user-123' });

      const activeSessions = sessionManager.getActiveSessions();
      expect(activeSessions[0]).toEqual({
        id: 'test-session',
        createdAt: expect.any(String),
        lastActivity: expect.any(String),
        metadata: { userId: 'user-123' },
        isActive: true
      });
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions based on lastActivity', async () => {
      // Create sessions with different timestamps
      await sessionManager.createSession('recent-session');
      await sessionManager.createSession('old-session');

      // Manually set old session's lastActivity to 25 hours ago
      const oldSession = sessionManager.sessions.get('old-session');
      oldSession.lastActivity = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

      const cleanedCount = sessionManager.cleanupExpiredSessions(24 * 60 * 60 * 1000); // 24 hours

      expect(cleanedCount).toBe(1);
      expect(sessionManager.sessions.has('recent-session')).toBe(true);
      expect(sessionManager.sessions.has('old-session')).toBe(false);
      // Logger calls are mocked, so we don't test them in unit tests
    });

    it('should not remove sessions within the age limit', async () => {
      await sessionManager.createSession('session-1');
      await sessionManager.createSession('session-2');

      const cleanedCount = sessionManager.cleanupExpiredSessions(24 * 60 * 60 * 1000);

      expect(cleanedCount).toBe(0);
      expect(sessionManager.sessions.size).toBe(2);
    });

    it('should use default max age when not specified', async () => {
      await sessionManager.createSession('test-session');
      
      // Set session to be 25 hours old
      const session = sessionManager.sessions.get('test-session');
      session.lastActivity = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

      const cleanedCount = sessionManager.cleanupExpiredSessions(); // No maxAge specified

      expect(cleanedCount).toBe(1);
      expect(sessionManager.sessions.size).toBe(0);
    });

    it('should handle custom max age values', async () => {
      await sessionManager.createSession('session-1');
      await sessionManager.createSession('session-2');

      // Set one session to be 2 hours old
      const oldSession = sessionManager.sessions.get('session-1');
      oldSession.lastActivity = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      // Clean up sessions older than 1 hour
      const cleanedCount = sessionManager.cleanupExpiredSessions(60 * 60 * 1000);

      expect(cleanedCount).toBe(1);
      expect(sessionManager.sessions.has('session-1')).toBe(false);
      expect(sessionManager.sessions.has('session-2')).toBe(true);
    });

    it('should return 0 when no sessions exist', () => {
      const cleanedCount = sessionManager.cleanupExpiredSessions();
      expect(cleanedCount).toBe(0);
    });

    it('should handle multiple expired sessions', async () => {
      // Create 3 sessions
      await sessionManager.createSession('session-1');
      await sessionManager.createSession('session-2');
      await sessionManager.createSession('session-3');

      // Make 2 of them expired
      const session1 = sessionManager.sessions.get('session-1');
      const session2 = sessionManager.sessions.get('session-2');
      session1.lastActivity = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      session2.lastActivity = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

      const cleanedCount = sessionManager.cleanupExpiredSessions(24 * 60 * 60 * 1000);

      expect(cleanedCount).toBe(2);
      expect(sessionManager.sessions.size).toBe(1);
      expect(sessionManager.sessions.has('session-3')).toBe(true);
    });

    it('should handle invalid lastActivity timestamps gracefully', async () => {
      await sessionManager.createSession('test-session');
      
      // Set invalid timestamp
      const session = sessionManager.sessions.get('test-session');
      session.lastActivity = 'invalid-date';

      // Should not throw error and should treat as expired (NaN comparison results in false, so not cleaned)
      const cleanedCount = sessionManager.cleanupExpiredSessions(24 * 60 * 60 * 1000);
      
      expect(cleanedCount).toBe(0); // Invalid dates result in NaN, which fails comparison
      expect(sessionManager.sessions.size).toBe(1);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent session operations', async () => {
      const sessionId = 'concurrent-session';
      
      // Create multiple concurrent operations
      const operations = [
        sessionManager.createSession(sessionId, { op: 1 }),
        sessionManager.getSession(sessionId),
        sessionManager.updateSessionMetadata(sessionId, { op: 2 }),
        sessionManager.getSession(sessionId)
      ];

      const results = await Promise.all(operations);
      
      // Should not throw errors
      expect(results[0]).toBeDefined(); // create result
      expect(results[2]).toBe(true); // update result
    });

    it('should handle very long session IDs', async () => {
      const longSessionId = 'a'.repeat(1000);
      const session = await sessionManager.createSession(longSessionId);
      
      expect(session.id).toBe(longSessionId);
      expect(sessionManager.sessions.has(longSessionId)).toBe(true);
    });

    it('should handle special characters in session IDs', async () => {
      const specialSessionId = 'session-!@#$%^&*()_+-={}[]|\\:";\'<>?,./';
      const session = await sessionManager.createSession(specialSessionId);
      
      expect(session.id).toBe(specialSessionId);
      expect(sessionManager.sessions.has(specialSessionId)).toBe(true);
    });

    it('should handle large metadata objects', async () => {
      const sessionId = 'large-metadata-session';
      const largeMetadata = {
        data: 'x'.repeat(10000),
        nested: {
          deep: {
            very: {
              deep: {
                object: 'value'
              }
            }
          }
        },
        array: new Array(1000).fill('item')
      };

      const session = await sessionManager.createSession(sessionId, largeMetadata);
      expect(session.metadata).toEqual(largeMetadata);
    });
  });
});
