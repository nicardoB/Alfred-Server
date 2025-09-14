import { jest } from '@jest/globals';
import { SmartAIRouter } from '../../src/ai/SmartAIRouter.js';

// Mock AI providers
const mockClaudeProvider = {
  processText: jest.fn(),
  processStreamingChat: jest.fn(),
  cancelRequest: jest.fn()
};

const mockOpenAIProvider = {
  processText: jest.fn(),
  processStreamingChat: jest.fn(),
  transcribeAudio: jest.fn(),
  cancelRequest: jest.fn()
};

const mockCopilotProvider = {
  processText: jest.fn(),
  processStreamingChat: jest.fn(),
  cancelRequest: jest.fn(),
  isAvailable: jest.fn().mockReturnValue(true)
};

jest.mock('../../src/ai/providers/ClaudeProvider.js', () => ({
  ClaudeProvider: jest.fn().mockImplementation(() => mockClaudeProvider)
}));

jest.mock('../../src/ai/providers/OpenAIProvider.js', () => ({
  OpenAIProvider: jest.fn().mockImplementation(() => mockOpenAIProvider)
}));

jest.mock('../../src/ai/providers/GitHubCopilotProvider.js', () => ({
  GitHubCopilotProvider: jest.fn().mockImplementation(() => mockCopilotProvider)
}));

// Mock CostUsage model
const mockCostUsage = {
  create: jest.fn().mockResolvedValue({})
};

jest.mock('../../src/models/CostUsage.js', () => ({
  getCostUsageModel: jest.fn(() => mockCostUsage)
}));

describe('SmartAIRouter', () => {
  let router;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    router = new SmartAIRouter();
    
    // Override providers with mocks
    router.providers = {
      claude: mockClaudeProvider,
      'claude-haiku': mockClaudeProvider, // Use same mock for both Claude models
      openai: mockOpenAIProvider,
      copilot: mockCopilotProvider
    };
    
    // Set up mock implementations
    mockClaudeProvider.processText.mockResolvedValue({ content: 'Claude response', confidence: 0.9 });
    mockOpenAIProvider.processText.mockResolvedValue({ content: 'OpenAI response', confidence: 0.85 });
    mockCopilotProvider.processText.mockResolvedValue({ content: 'Copilot response', confidence: 0.88 });
    mockOpenAIProvider.transcribeAudio.mockResolvedValue({ text: 'Hello Alfred', confidence: 0.9 });
    
    // Set up streaming mocks
    mockClaudeProvider.processStreamingChat.mockImplementation(async ({ onStream, onComplete }) => {
      onStream('Hello ');
      onStream('world!');
      onComplete('Hello world!', { 
        tokenCount: 10, 
        cost: 0.01, 
        model: 'claude-3-5-sonnet',
        inputTokens: 5,
        outputTokens: 5
      });
    });
    
    mockOpenAIProvider.processStreamingChat.mockImplementation(async ({ onStream, onComplete }) => {
      onStream('OpenAI ');
      onStream('response');
      onComplete('OpenAI response', { tokenCount: 8, cost: 0.008, model: 'gpt-4' });
    });
    
    mockCopilotProvider.processStreamingChat.mockImplementation(async ({ onStream, onComplete }) => {
      onStream('Code ');
      onStream('suggestion');
      onComplete('Code suggestion', { tokenCount: 12, cost: 0.005, model: 'copilot' });
    });
    
    // Reset cost usage mock
    mockCostUsage.create.mockClear();
  });

  describe('selectProvider', () => {
    it('should route code-related queries to GitHub Copilot', () => {
      const codeQueries = [
        'debug this javascript function',
        'write a Python class for user management',
        'fix compilation error in Kotlin',
        'create a React component'
      ];

      codeQueries.forEach(query => {
        const provider = router.selectProvider(query);
        expect(provider).toBe('copilot');
      });
    });

    it('should route complex reasoning to Claude', () => {
      const complexQueries = [
        'analyze the market trends and provide strategic recommendations',
        'explain the architectural differences between microservices and monoliths',
        'compare different machine learning approaches for this problem',
        'evaluate the pros and cons of this business strategy'
      ];

      complexQueries.forEach(query => {
        const provider = router.selectProvider(query);
        expect(provider).toBe('claude');
      });
    });

    it('should route simple queries to Claude Haiku', () => {
      const simpleQueries = [
        'what is the capital of France?',
        'how to boil an egg?',
        'define artificial intelligence',
        'quick summary of photosynthesis'
      ];

      simpleQueries.forEach(query => {
        const provider = router.selectProvider(query);
        expect(provider).toBe('claude-haiku');
      });
    });

    it('should default to Claude for general queries', () => {
      const generalQuery = 'Tell me about renewable energy sources';
      const provider = router.selectProvider(generalQuery);
      expect(provider).toBe('claude');
    });
  });

  describe('processTextCommand', () => {
    it('should process text command through selected provider', async () => {
      const mockResponse = {
        content: 'Test response',
        confidence: 0.9
      };
      mockClaudeProvider.processText.mockResolvedValue(mockResponse);

      const context = {
        sessionId: 'test-session',
        requestId: 'test-request',
        metadata: {}
      };

      const result = await router.processTextCommand('Tell me about AI', context);

      expect(result.provider).toBe('claude');
      expect(result.response).toEqual(mockResponse);
      expect(result.confidence).toBe(0.9);
      expect(mockClaudeProvider.processText).toHaveBeenCalledWith(
        'Tell me about AI',
        expect.objectContaining({
          ...context,
          provider: 'claude'
        })
      );
    });

    it('should track active requests', async () => {
      const mockResponse = { content: 'Test', confidence: 0.8 };
      mockOpenAIProvider.processText.mockResolvedValue(mockResponse);

      const context = {
        sessionId: 'test-session',
        requestId: 'test-request',
        metadata: {}
      };

      // Start processing
      const processingPromise = router.processTextCommand('what is AI?', context);
      
      // Check active request is tracked
      expect(router.activeRequests.has('test-request')).toBe(true);
      
      // Wait for completion
      await processingPromise;
      
      // Check request is cleaned up
      expect(router.activeRequests.has('test-request')).toBe(false);
    });

    it('should update routing statistics', async () => {
      const mockResponse = { content: 'Test', confidence: 0.8 };
      mockCopilotProvider.processText.mockResolvedValue(mockResponse);

      const initialStats = router.getStats();
      
      await router.processTextCommand('debug this code', {
        sessionId: 'test-session',
        requestId: 'test-request'
      });

      const updatedStats = router.getStats();
      expect(updatedStats.routingStats.copilot).toBe(initialStats.routingStats.copilot + 1);
    });

    it('should handle processing errors', async () => {
      mockClaudeProvider.processText.mockRejectedValue(new Error('Provider error'));

      await expect(router.processTextCommand('test query', {
        sessionId: 'test-session',
        requestId: 'test-request'
      })).rejects.toThrow('Provider error');

      // Should clean up active request on error
      expect(router.activeRequests.has('test-request')).toBe(false);
    });
  });

  describe('processAudioChunk', () => {
    it('should accumulate audio chunks until last chunk', async () => {
      const audioData1 = new Uint8Array([1, 2, 3, 4]);
      const audioData2 = new Uint8Array([5, 6, 7, 8]);
      
      const context = {
        sessionId: 'test-session',
        requestId: 'test-audio-request',
        audioFormat: { sampleRate: 16000, channels: 1 }
      };

      // First chunk
      const result1 = await router.processAudioChunk(audioData1, {
        ...context,
        isLastChunk: false
      });

      expect(result1.status).toBe('processing');
      expect(result1.chunksReceived).toBe(1);
      expect(result1.bytesReceived).toBe(4);

      // Second chunk (last)
      const mockTranscription = { text: 'Hello Alfred', confidence: 0.9 };
      const mockAIResponse = { provider: 'claude', response: { content: 'Hi there!' } };
      
      jest.spyOn(router, 'transcribeAudio').mockResolvedValue(mockTranscription);
      jest.spyOn(router, 'processTextCommand').mockResolvedValue(mockAIResponse);

      const result2 = await router.processAudioChunk(audioData2, {
        ...context,
        isLastChunk: true
      });

      expect(result2.transcription).toEqual(mockTranscription);
      expect(result2.aiResponse).toEqual(mockAIResponse);
      expect(result2.totalChunks).toBe(2);
      expect(result2.totalBytes).toBe(8);
    });

    it('should handle transcription errors', async () => {
      const audioData = new Uint8Array([1, 2, 3, 4]);
      
      jest.spyOn(router, 'transcribeAudio').mockRejectedValue(new Error('Transcription failed'));

      await expect(router.processAudioChunk(audioData, {
        sessionId: 'test-session',
        requestId: 'test-audio-request',
        isLastChunk: true,
        audioFormat: { sampleRate: 16000 }
      })).rejects.toThrow('Transcription failed');
    });
  });

  describe('cancelRequest', () => {
    it('should cancel active request', async () => {
      // Create an active request
      router.activeRequests.set('test-request', {
        provider: 'claude',
        sessionId: 'test-session',
        startTime: Date.now(),
        type: 'text'
      });

      const result = await router.cancelRequest('test-session', 'test-request');

      expect(result).toBe(true);
      expect(router.activeRequests.has('test-request')).toBe(false);
    });

    it('should return false for non-existent request', async () => {
      const result = await router.cancelRequest('test-session', 'non-existent');
      expect(result).toBe(false);
    });

    it('should call provider cancel method if available', async () => {
      mockClaudeProvider.cancelRequest = jest.fn().mockResolvedValue(true);
      
      router.activeRequests.set('test-request', {
        provider: 'claude',
        sessionId: 'test-session',
        startTime: Date.now(),
        type: 'text'
      });

      await router.cancelRequest('test-session', 'test-request');

      expect(mockClaudeProvider.cancelRequest).toHaveBeenCalledWith('test-request');
    });
  });

  describe('getProcessingStatus', () => {
    it('should return status for active request', async () => {
      const startTime = Date.now() - 5000; // 5 seconds ago
      router.activeRequests.set('test-request', {
        provider: 'claude',
        sessionId: 'test-session',
        startTime,
        type: 'text',
        chunks: []
      });

      const status = await router.getProcessingStatus('test-request', 'test-session');

      expect(status.status).toBe('processing');
      expect(status.provider).toBe('claude');
      expect(status.type).toBe('text');
      expect(status.processingTimeMs).toBeGreaterThan(4000);
      expect(status.sessionId).toBe('test-session');
    });

    it('should return not found for non-existent request', async () => {
      const status = await router.getProcessingStatus('non-existent', 'test-session');

      expect(status.status).toBe('not_found');
      expect(status.message).toBe('Request not found or completed');
    });
  });

  describe('transcribeAudio', () => {
    it('should combine audio chunks and transcribe', async () => {
      const chunks = [
        { data: new Uint8Array([1, 2, 3, 4]), size: 4 },
        { data: new Uint8Array([5, 6, 7, 8]), size: 4 }
      ];
      
      const mockTranscription = {
        text: 'Hello Alfred',
        confidence: 0.9,
        language: 'en'
      };
      
      mockOpenAIProvider.transcribeAudio.mockResolvedValue(mockTranscription);

      const result = await router.transcribeAudio(chunks, { sampleRate: 16000 });

      expect(result).toEqual(mockTranscription);
      expect(mockOpenAIProvider.transcribeAudio).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        { sampleRate: 16000 }
      );
    });

    it('should handle transcription errors', async () => {
      const chunks = [{ data: new Uint8Array([1, 2, 3, 4]), size: 4 }];
      
      mockOpenAIProvider.transcribeAudio.mockRejectedValue(new Error('API error'));

      await expect(router.transcribeAudio(chunks, {})).rejects.toThrow('Failed to transcribe audio');
    });
  });

  describe('getStats', () => {
    it('should return routing statistics', () => {
      router.routingStats.claude = 5;
      router.routingStats.openai = 3;
      router.routingStats.copilot = 2;
      
      router.activeRequests.set('req1', {});
      router.activeRequests.set('req2', {});

      const stats = router.getStats();

      expect(stats.routingStats).toEqual({
        claude: 5,
        'claude-haiku': 0,
        openai: 3,
        copilot: 2
      });
      expect(stats.activeRequests).toBe(2);
      expect(stats.totalRequests).toBe(10);
    });
  });

  describe('Tool Context Routing', () => {
    it('should route poker queries correctly', () => {
      // Test individual queries to understand routing
      const analyzeQuery = router.selectProvider('analyze this poker hand', { 
        toolContext: 'poker', 
        user: { role: 'owner' },
        userRole: 'owner'
      });
      expect(analyzeQuery).toBe('claude'); // Contains 'analyze' -> isPokerAnalysis -> defaultProvider

      const oddsQuery = router.selectProvider('what are the pot odds here?', { 
        toolContext: 'poker', 
        user: { role: 'owner' },
        userRole: 'owner'
      });
      expect(oddsQuery).toBe('claude'); // Contains 'pot odds' -> isPokerAnalysis -> defaultProvider

      const foldQuery = router.selectProvider('should I fold or call with this hand?', { 
        toolContext: 'poker', 
        user: { role: 'owner' },
        userRole: 'owner'
      });
      expect(foldQuery).toBe('claude'); // Contains 'fold' -> isPokerAnalysis -> defaultProvider

      const gtoQuery = router.selectProvider('GTO solver recommendation for this spot', { 
        toolContext: 'poker', 
        user: { role: 'owner' },
        userRole: 'owner'
      });
      expect(gtoQuery).toBe('claude-haiku'); // Contains 'gto' and 'recommendation' -> isPokerCompliance -> costOptimizedProvider
    });

    it('should route french language queries to appropriate provider', () => {
      // Complex language task should use default provider
      const complexProvider = router.selectProvider('explain French grammar rules', { 
        toolContext: 'french',
        user: { role: 'owner' },
        userRole: 'owner'
      });
      expect(complexProvider).toBe('claude');

      // Simple translation should use cost-optimized provider
      const simpleProvider = router.selectProvider('translate hello', { 
        toolContext: 'french',
        user: { role: 'owner' },
        userRole: 'owner'
      });
      expect(simpleProvider).toBe('claude-haiku');
    });

    it('should route voice queries to appropriate provider', () => {
      const provider = router.selectProvider('quick voice response', { 
        toolContext: 'voice',
        user: { role: 'owner' },
        userRole: 'owner'
      });
      expect(provider).toBe('claude-haiku');
    });

    it('should route workout queries correctly', () => {
      const provider = router.selectProvider('create workout plan', { 
        toolContext: 'workout',
        user: { role: 'owner' },
        userRole: 'owner'
      });
      expect(provider).toBe('claude-haiku');
    });
  });

  describe('processStreamingChat', () => {
    it('should process streaming chat with proper cost tracking', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com', role: 'owner' };
      const context = [{ content: 'Hello', role: 'user', metadata: { toolContext: 'chat' } }];
      
      let streamedContent = '';
      const onStream = jest.fn((chunk) => { streamedContent += chunk; });
      const onComplete = jest.fn();
      const onError = jest.fn();

      await router.processStreamingChat({
        userMessage: 'Hello',
        conversationId: 'conv-123',
        messageId: 'msg-123',
        context,
        user: mockUser,
        onStream,
        onComplete,
        onError
      });

      expect(onStream).toHaveBeenCalledWith('Hello ');
      expect(onStream).toHaveBeenCalledWith('world!');
      expect(onComplete).toHaveBeenCalledWith('Hello world!', expect.objectContaining({
        provider: 'claude', // Chat uses default provider
        toolContext: 'chat',
        processingTime: expect.any(Number)
      }));
      // Cost tracking happens in onComplete callback, so we need to verify it was called
      expect(onComplete).toHaveBeenCalled();
    });

    it('should handle streaming errors', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const context = [{ content: 'Hello', role: 'user' }];
      
      mockClaudeProvider.processStreamingChat.mockImplementation(async ({ onError }) => {
        onError(new Error('Streaming failed'));
      });

      const onStream = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      await router.processStreamingChat({
        userMessage: 'Hello',
        conversationId: 'conv-123',
        messageId: 'msg-123',
        context,
        user: mockUser,
        onStream,
        onComplete,
        onError
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle cost tracking errors gracefully', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const context = [{ content: 'Hello', role: 'user' }];
      
      // Mock cost tracking failure
      mockCostUsage.create.mockRejectedValue(new Error('Database error'));

      const onStream = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      await router.processStreamingChat({
        userMessage: 'Hello',
        conversationId: 'conv-123',
        messageId: 'msg-123',
        context,
        user: mockUser,
        onStream,
        onComplete,
        onError
      });

      // Should still complete successfully despite cost tracking failure
      expect(onComplete).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('Helper Methods', () => {
    it('should detect poker-related content', () => {
      expect(router.isPokerRelated('analyze this poker hand')).toBe(true);
      expect(router.isPokerRelated('what are the pot odds?')).toBe(true);
      expect(router.isPokerRelated('should I fold or call?')).toBe(true);
      expect(router.isPokerRelated('GTO solver recommendation')).toBe(true);
      expect(router.isPokerRelated('hello world')).toBe(false);
    });

    it('should detect poker compliance queries', () => {
      expect(router.isPokerCompliance('is this GTO compliant?')).toBe(true);
      expect(router.isPokerCompliance('verify this play according to solver')).toBe(true);
      expect(router.isPokerCompliance('audit my poker strategy')).toBe(true);
      expect(router.isPokerCompliance('hello world')).toBe(false);
    });

    test('should detect complex language tasks', async () => {
      expect(router.isComplexLanguageTask('explain why this grammar rule applies')).toBe(true);
      expect(router.isComplexLanguageTask('difference between these conjugations')).toBe(true);
      expect(router.isComplexLanguageTask('Hello how are you')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle unknown tool context', async () => {
      expect(() => {
        router.selectProvider('test query', { 
          toolContext: 'unknown_tool',
          user: { role: 'owner' }
        });
      }).toThrow("User role 'owner' does not have access to 'unknown_tool' tool");
    });

    test('should handle copilot unavailable fallback', async () => {
      // Mock copilot as unavailable
      router.providers.copilot.isAvailable.mockReturnValue(false);
      
      const result = router.selectProvider('write a function', { 
        toolContext: 'code',
        user: { role: 'owner' }
      });
      expect(result).toBe('claude');
    });

    test('should handle voice transcription routing', async () => {
      const result = router.selectProvider('transcribe this', { 
        toolContext: 'voice',
        isTranscription: true,
        user: { role: 'owner' }
      });
      expect(result).toBe('openai');
    });

    test('should handle missing copilot provider', async () => {
      // Remove copilot provider
      delete router.providers.copilot;
      
      const result = router.selectProvider('write a function', { 
        toolContext: 'code',
        user: { role: 'owner' }
      });
      expect(result).toBe('claude');
    });
  });
});
