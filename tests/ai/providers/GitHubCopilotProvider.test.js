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
const { GitHubCopilotProvider } = await import('../../../src/ai/providers/GitHubCopilotProvider.js');

describe('GitHubCopilotProvider', () => {
  let provider;
  let originalEnv;

  beforeAll(() => {
    originalEnv = process.env;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    provider = new GitHubCopilotProvider();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      expect(provider.name).toBe('copilot');
      expect(provider.model).toBe('gpt-4o-mini');
      expect(provider.baseUrl).toBe('https://models.github.ai/inference/chat/completions');
    });

    test('should use environment variables when available', () => {
      process.env.GITHUB_TOKEN = 'test-github-token';
      process.env.COPILOT_MODEL = 'gpt-4';
      
      const newProvider = new GitHubCopilotProvider();
      
      expect(newProvider.apiKey).toBe('test-github-token');
      expect(newProvider.model).toBe('gpt-4');
      expect(mockLogger.info).toHaveBeenCalledWith('GitHub Copilot API key loaded: test-github-tok...');
    });

    test('should warn when API key is missing', () => {
      delete process.env.GITHUB_TOKEN;
      
      new GitHubCopilotProvider();
      
      expect(mockLogger.warn).toHaveBeenCalledWith('GitHub Copilot API key not found in environment variables');
    });
  });

  describe('processText', () => {
    test('should return mock response when API key is not configured', async () => {
      provider.apiKey = null;
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: 'GitHub Copilot mock response to: Hello',
        confidence: 0.88,
        provider: 'copilot'
      });
      expect(mockLogger.warn).toHaveBeenCalledWith('GitHub Copilot API key not configured, using mock response');
    });

    test('should process text successfully with API key', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Hello! I can help you with coding tasks.'
            }
          }],
          usage: {
            prompt_tokens: 8,
            completion_tokens: 12
          }
        })
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: 'Hello! I can help you with coding tasks.',
        confidence: 0.92,
        provider: 'copilot'
      });
      
      expect(global.fetch).toHaveBeenCalledWith(provider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-key',
          'User-Agent': 'Alfred-MCP-Server/1.0.0'
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: 'Hello'
          }],
          model: 'gpt-4o-mini',
          temperature: 0.1,
          top_p: 1,
          n: 1,
          stream: false
        })
      });
      
      expect(mockCostTracker.trackUsage).toHaveBeenCalledWith({
        provider: 'copilot',
        inputTokens: 8,
        outputTokens: 12,
        userId: undefined,
        toolContext: 'chat',
        model: 'gpt-4o-mini',
        conversationId: undefined,
        messageId: undefined,
        sessionId: undefined
      });
    });

    test('should handle API error response', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: jest.fn().mockResolvedValue('Access denied')
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: "I'm having trouble accessing GitHub Copilot right now. Please try again.",
        confidence: 0.1,
        provider: 'copilot',
        error: 'GitHub Copilot API error: 403 Forbidden - Access denied'
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith('GitHub Copilot provider error: GitHub Copilot API error: 403 Forbidden - Access denied');
    });

    test('should handle network error', async () => {
      provider.apiKey = 'test-key';
      
      global.fetch.mockRejectedValue(new Error('Network timeout'));
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: "I'm having trouble accessing GitHub Copilot right now. Please try again.",
        confidence: 0.1,
        provider: 'copilot',
        error: 'Network timeout'
      });
    });

    test('should handle missing response content', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: []
        })
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      const result = await provider.processText('Hello', {});
      
      expect(result.content).toBe('No response from GitHub Copilot');
    });

    test('should estimate tokens when usage data is missing', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Response'
            }
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
      const result = await provider.cancelRequest('request-456');
      
      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Cancelling GitHub Copilot request: request-456');
    });
  });
});
