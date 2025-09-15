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
global.FormData = jest.fn().mockImplementation(() => ({
  append: jest.fn()
}));
global.Blob = jest.fn().mockImplementation((data, options) => ({ data, options }));

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

jest.unstable_mockModule('../../../src/monitoring/CostTracker.js', () => ({
  costTracker: mockCostTracker
}));

// Import after mocking
const { OpenAIProvider } = await import('../../../src/ai/providers/OpenAIProvider.js');

describe('OpenAIProvider', () => {
  let provider;
  let originalEnv;

  beforeAll(() => {
    originalEnv = process.env;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    provider = new OpenAIProvider();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      expect(provider.name).toBe('openai');
      expect(provider.model).toBe('gpt-4o-mini');
      expect(provider.baseUrl).toBe('https://api.openai.com/v1/chat/completions');
    });

    test('should use environment variables when available', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      process.env.GPT_MODEL = 'gpt-4';
      
      const newProvider = new OpenAIProvider();
      
      expect(newProvider.apiKey).toBe('test-api-key');
      expect(newProvider.model).toBe('gpt-4');
      expect(mockLogger.info).toHaveBeenCalledWith('OpenAI API key loaded: test-api-key...');
    });

    test('should warn when API key is missing', () => {
      delete process.env.OPENAI_API_KEY;
      
      new OpenAIProvider();
      
      expect(mockLogger.warn).toHaveBeenCalledWith('OpenAI API key not found in environment variables');
    });
  });

  describe('processText', () => {
    test('should return mock response when API key is not configured', async () => {
      provider.apiKey = null;
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: 'OpenAI mock response to: Hello',
        confidence: 0.85,
        provider: 'openai'
      });
      expect(mockLogger.warn).toHaveBeenCalledWith('OpenAI API key not configured, using mock response');
    });

    test('should process text successfully with API key', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Hello! How can I help you?'
            }
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 15
          }
        })
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: 'Hello! How can I help you?',
        confidence: 0.9,
        provider: 'openai',
        usage: {
          inputTokens: 10,
          outputTokens: 15,
          model: 'gpt-4o-mini'
        }
      });
      
      expect(global.fetch).toHaveBeenCalledWith(provider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-key'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: 'Hello'
          }],
          max_tokens: 1000,
          temperature: 0.7
        })
      });
      
      // Cost tracking is now handled by SmartAIRouter, not directly by providers
      expect(mockCostTracker.trackUsage).not.toHaveBeenCalled();
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
        content: "I'm having trouble processing your request right now. Please try again.",
        confidence: 0.1,
        provider: 'openai',
        error: 'OpenAI API error: 401 Unauthorized'
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith('OpenAI provider error: OpenAI API error: 401 Unauthorized');
    });

    test('should handle network error', async () => {
      provider.apiKey = 'test-key';
      
      global.fetch.mockRejectedValue(new Error('Network error'));
      
      const result = await provider.processText('Hello', {});
      
      expect(result).toEqual({
        content: "I'm having trouble processing your request right now. Please try again.",
        confidence: 0.1,
        provider: 'openai',
        error: 'Network error'
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
      
      expect(result.content).toBe('No response from OpenAI');
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

  describe('transcribeAudio', () => {
    test('should return mock transcription when API key is not configured', async () => {
      provider.apiKey = null;
      
      const result = await provider.transcribeAudio(new Uint8Array([1, 2, 3]), 'wav');
      
      expect(result).toEqual({
        text: 'Hello Alfred, what is the weather today?',
        confidence: 0.92,
        language: 'en'
      });
      expect(mockLogger.warn).toHaveBeenCalledWith('OpenAI API key not configured, using mock transcription');
    });

    test('should transcribe audio successfully with API key', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          text: 'Hello world',
          language: 'en'
        })
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      const audioData = new Uint8Array([1, 2, 3, 4]);
      const result = await provider.transcribeAudio(audioData, 'wav');
      
      expect(result).toEqual({
        text: 'Hello world',
        confidence: 0.95,
        language: 'en'
      });
      
      expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-key'
        },
        body: expect.any(Object)
      });
    });

    test('should handle transcription API error', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      const result = await provider.transcribeAudio(new Uint8Array([1, 2, 3]), 'wav');
      
      expect(result).toEqual({
        text: 'Hello Alfred',
        confidence: 0.1,
        language: 'en',
        error: 'OpenAI Whisper API error: 400 Bad Request'
      });
    });

    test('should handle transcription network error', async () => {
      provider.apiKey = 'test-key';
      
      global.fetch.mockRejectedValue(new Error('Connection failed'));
      
      const result = await provider.transcribeAudio(new Uint8Array([1, 2, 3]), 'wav');
      
      expect(result).toEqual({
        text: 'Hello Alfred',
        confidence: 0.1,
        language: 'en',
        error: 'Connection failed'
      });
    });

    test('should handle missing transcription text', async () => {
      provider.apiKey = 'test-key';
      
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({})
      };
      
      global.fetch.mockResolvedValue(mockResponse);
      
      const result = await provider.transcribeAudio(new Uint8Array([1, 2, 3]), 'wav');
      
      expect(result.text).toBe('');
      expect(result.language).toBe('en');
    });
  });

  describe('cancelRequest', () => {
    test('should cancel request successfully', async () => {
      const result = await provider.cancelRequest('request-123');
      
      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Cancelling OpenAI request: request-123');
    });
  });
});
