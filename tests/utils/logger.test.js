import { jest } from '@jest/globals';

// Simple test to verify logger exists and has basic functionality
const { logger } = await import('../../src/utils/logger.js');

describe('Logger Configuration', () => {
  test('should export logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  test('should have winston logger methods', () => {
    // Test that logger has standard winston methods
    expect(logger).toHaveProperty('info');
    expect(logger).toHaveProperty('error');
    expect(logger).toHaveProperty('warn');
    expect(logger).toHaveProperty('debug');
    expect(logger).toHaveProperty('transports');
  });

  test('should handle logging calls without errors', () => {
    // Test basic logging functionality
    expect(() => {
      logger.info('Test info message');
      logger.error('Test error message');
      logger.warn('Test warning message');
      logger.debug('Test debug message');
    }).not.toThrow();
  });

  test('should have transports configured', () => {
    expect(logger.transports).toBeDefined();
    expect(Array.isArray(logger.transports)).toBe(true);
  });

  test('should be silenced in test environment', () => {
    // In test environment, transports should be silenced
    if (process.env.NODE_ENV === 'test') {
      logger.transports.forEach(transport => {
        expect(transport.silent).toBe(true);
      });
    }
  });

  test('should handle different log levels', () => {
    // Test that logger can handle different log levels
    expect(() => {
      logger.error('Test error message');
      logger.warn('Test warning message');
      logger.info('Test info message');
      logger.debug('Test debug message');
    }).not.toThrow();
  });

  test('should have correct default configuration', () => {
    expect(logger.level).toBeDefined();
    expect(logger.defaultMeta).toEqual({ service: 'alfred-mcp-server' });
  });

  test('should handle production vs non-production environments', () => {
    // Test environment-specific behavior
    expect(logger.transports).toBeDefined();
    expect(logger.transports.length).toBeGreaterThan(0);
    
    // In test environment, verify transports are silenced
    if (process.env.NODE_ENV === 'test') {
      const silencedTransports = logger.transports.filter(t => t.silent === true);
      expect(silencedTransports.length).toBeGreaterThan(0);
    }
  });
});
