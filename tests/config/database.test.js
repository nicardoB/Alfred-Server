import { jest } from '@jest/globals';

// Mock logger before importing database
const mockLogger = {
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
};

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

const { setupDatabase, getDatabase } = await import('../../src/config/database.js');

describe('Database Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env;
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Development Environment', () => {
    it('should use SQLite for development without DATABASE_URL', async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'development'
      };
      delete process.env.DATABASE_URL;

      await setupDatabase();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Using SQLite for development - PostgreSQL recommended for production'
      );
      
      const db = getDatabase();
      expect(db.getDialect()).toBe('sqlite');
    });
  });

  describe('Production Environment', () => {
    it('should throw error when DATABASE_URL is missing in production', async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production'
      };
      delete process.env.DATABASE_URL;

      await expect(setupDatabase()).rejects.toThrow(
        'DATABASE_URL environment variable is required for unified Alfred MCP Server'
      );
    });

    it('should handle database setup errors', async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        DATABASE_URL: 'invalid://database/url'
      };

      await expect(setupDatabase()).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Database setup failed:',
        expect.any(Error)
      );
    });
  });
});
