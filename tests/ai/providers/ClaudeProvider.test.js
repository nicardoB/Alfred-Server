import { jest } from '@jest/globals';

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const mockCostTracker = {
  estimateTokens: jest.fn().mockReturnValue(50),
  trackUsage: jest.fn()
};

// Mock fetch globally
global.fetch = jest.fn();

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

jest.unstable_mockModule('../../../src/monitoring/CostTracker.js', () => ({
  costTracker: mockCostTracker
}));

// Import after mocking
const { ClaudeProvider } = await import('../../../src/ai/providers/ClaudeProvider.js');

describe('ClaudeProvider', () => {
  let provider;
  let originalEnv;

  beforeAll(() => {
    originalEnv = process.env;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    provider = new ClaudeProvider();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      expect(provider.name).toBe('claude');
      expect(provider.model).toBe('claude-3-5-sonnet-20241022');
      expect(provider.baseUrl).toBe('https://api.anthropic.com/v1/messages');
    });

    test('should use environment variables when available', () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.CLAUDE_MODEL = 'claude-3-opus-20240229';
      
      const newProvider = new ClaudeProvider();
      
      expect(newProvider.apiKey).toBe('test-api-key');
      expect(newProvider.model).toBe('claude-3-opus-20240229');
      expect(mockLogger.info).toHaveBeenCalledWith('Claude API key loaded: test-api-key...');
    });

    test('should use custom model parameter', () => {
      const customProvider = new ClaudeProvider('claude-3-haiku-20240307');
      
      expect(customProvider.model).toBe('claude-3-haiku-20240307');
    });

    test('should warn when API key is missing', () => {
      delete process.env.ANTHROPIC_API_KEY;
      
      new ClaudeProvider();
      
      expect(mockLogger.warn).toHaveBeenCalledWith('Claude API key not found in environment variables');
    });
  });

  describe('processText', () => {
    test('should return mock response when API key is not configured', async () => {
      provider.apiKey = null;
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: 'Claude mock response to: Hello',
        confidence: 0.9,
        provider: 'claude'
      });
      expect(mockLogger.warn).toHaveBeenCalledWith('Claude API key not configured, using mock response');
    });

    test('should process text successfully with API key', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          content: [{
            text: 'Hello! How can I assist you today?'
          }],
          usage: {
            input_tokens: 12,
            output_tokens: 18
          }
        })
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: 'Hello! How can I assist you today?',
        confidence: 0.95,
        provider: 'claude'
      });
      
      expect(global.fetch).toHaveBeenCalledWith(provider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: 'Hello'
          }]
        })
      });
      
      expect(mockCostTracker.trackUsage).toHaveBeenCalledWith('claude', 12, 18, {
        userId: undefined,
        toolContext: 'chat',
        model: 'claude-3-5-sonnet-20241022',
        conversationId: undefined,
        messageId: undefined,
        sessionId: undefined
      });
    });

    test('should handle API error response', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: "I apologize, but I'm having trouble processing your request right now. Please try again.",
        confidence: 0.1,
        provider: 'claude',
        error: 'Claude API error: 401 Unauthorized'
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith('Claude provider error: Claude API error: 401 Unauthorized');
    });

    test('should handle network error', async () => {
      provider.apiKey = 'test-key';
      
      global.fetch.mockRejectedValue(new Error('Network error'));
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: "I apologize, but I'm having trouble processing your request right now. Please try again.",
        confidence: 0.1,
        provider: 'claude',
        error: 'Network error'
      });
    });

    test('should handle missing response content', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          content: []
        })
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      const result = await provider.processText('Hello', {});
      
      expect(result.content).toBe('No response from Claude');
    });

    test('should estimate tokens when usage data is missing', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          content: [{
            text: 'Response'
          }]
        })
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      await provider.processText('Hello', {});
      
      expect(mockCostTracker.estimateTokens).toHaveBeenCalledWith('Hello');
      expect(mockCostTracker.estimateTokens).toHaveBeenCalledWith('Response');
    });
  });

  describe('cancelRequest', () => {
    test('should cancel request successfully', async () => {
      const result = await provider.cancelRequest('request-123');
      
      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Cancelling Claude request: request-123');
    });
  });
});
