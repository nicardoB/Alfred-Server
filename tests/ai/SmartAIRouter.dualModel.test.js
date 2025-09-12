import { jest } from '@jest/globals';
import { SmartAIRouter } from '../../src/ai/SmartAIRouter.js';

// Mock AI providers
const mockClaudeSonnetProvider = {
  processText: jest.fn(),
  cancelRequest: jest.fn()
};

const mockClaudeHaikuProvider = {
  processText: jest.fn(),
  cancelRequest: jest.fn()
};

const mockOpenAIProvider = {
  processText: jest.fn(),
  transcribeAudio: jest.fn(),
  cancelRequest: jest.fn()
};

const mockCopilotProvider = {
  processText: jest.fn(),
  cancelRequest: jest.fn()
};

jest.mock('../../src/ai/providers/ClaudeProvider.js', () => ({
  ClaudeProvider: jest.fn().mockImplementation((apiKey, model) => {
    if (model === 'claude-3-5-haiku-20241022') {
      return mockClaudeHaikuProvider;
    }
    return mockClaudeSonnetProvider;
  })
}));

jest.mock('../../src/ai/providers/OpenAIProvider.js', () => ({
  OpenAIProvider: jest.fn().mockImplementation(() => mockOpenAIProvider)
}));

jest.mock('../../src/ai/providers/GitHubCopilotProvider.js', () => ({
  GitHubCopilotProvider: jest.fn().mockImplementation(() => mockCopilotProvider)
}));

describe('SmartAIRouter - Dual Claude Model Routing', () => {
  let router;

  beforeEach(() => {
    jest.clearAllMocks();
    router = new SmartAIRouter();
    
    // Override the providers with our mocks
    router.providers = {
      claude: mockClaudeSonnetProvider,
      'claude-haiku': mockClaudeHaikuProvider,
      openai: mockOpenAIProvider,
      copilot: mockCopilotProvider
    };
    
    // Set up mock implementations
    mockClaudeSonnetProvider.processText.mockResolvedValue({ 
      content: 'Sonnet response', 
      confidence: 0.9 
    });
    mockClaudeHaikuProvider.processText.mockResolvedValue({ 
      content: 'Haiku response', 
      confidence: 0.85 
    });
    mockOpenAIProvider.processText.mockResolvedValue({ 
      content: 'OpenAI response', 
      confidence: 0.8 
    });
    mockCopilotProvider.processText.mockResolvedValue({ 
      content: 'Copilot response', 
      confidence: 0.88 
    });
  });

  describe('Poker Analysis Routing', () => {
    describe('isPokerAnalysis', () => {
      it('should identify poker analysis requests', () => {
        const analysisQueries = [
          'analyze this poker hand',
          'poker strategy decision with pocket aces',
          'evaluate my betting line on the river',
          'opponent analysis for this session',
          'review my bluff frequency',
          'calculate pot odds for this spot',
          'range analysis against tight player',
          'postflop strategy with top pair'
        ];

        analysisQueries.forEach(query => {
          expect(router.isPokerAnalysis(query)).toBe(true);
        });
      });

      it('should not identify non-poker queries as analysis', () => {
        const nonPokerQueries = [
          'what is the weather today?',
          'debug this javascript function',
          'explain quantum physics',
          'write a business plan'
        ];

        nonPokerQueries.forEach(query => {
          expect(router.isPokerAnalysis(query)).toBe(false);
        });
      });
    });

    describe('isPokerCompliance', () => {
      it('should identify poker compliance requests', () => {
        const complianceQueries = [
          'check GTO compliance for this hand',
          'validate GTO strategy',
          'framework compliance check',
          'verify solver recommendation',
          'GTO compliance audit',
          'is this correct play according to solver?',
          'solver verification needed',
          'validate this decision'
        ];

        complianceQueries.forEach(query => {
          expect(router.isPokerCompliance(query)).toBe(true);
        });
      });

      it('should not identify analysis queries as compliance', () => {
        const analysisQueries = [
          'analyze this poker hand deeply',
          'opponent tendencies in this spot',
          'range construction against villain'
        ];

        analysisQueries.forEach(query => {
          expect(router.isPokerCompliance(query)).toBe(false);
        });
      });
    });

    describe('selectPokerProvider', () => {
      it('should route complex poker analysis to Claude Sonnet', () => {
        const complexAnalysisQueries = [
          'analyze this complex 4-bet pot with multiple opponents',
          'deep dive into opponent tendencies and exploitative adjustments',
          'comprehensive session review with advanced metrics',
          'multi-street analysis with range construction'
        ];

        complexAnalysisQueries.forEach(query => {
          const provider = router.selectPokerProvider(query);
          expect(provider).toBe('claude');
        });
      });

      it('should route GTO compliance checks to Claude Haiku', () => {
        const complianceQueries = [
          'check GTO compliance',
          'validate GTO strategy',
          'framework compliance check',
          'solver verification',
          'is this GTO correct?'
        ];

        complianceQueries.forEach(query => {
          const provider = router.selectPokerProvider(query);
          expect(provider).toBe('claude-haiku');
        });
      });

      it('should default poker analysis to Claude Sonnet when not compliance', () => {
        const analysisQueries = [
          'poker hand review',
          'betting strategy evaluation',
          'opponent read development'
        ];

        analysisQueries.forEach(query => {
          const provider = router.selectPokerProvider(query);
          expect(provider).toBe('claude');
        });
      });

      it('should default complex poker analysis to Claude Sonnet', () => {
        const complexQuery = 'detailed analysis of this tournament spot with ICM considerations';
        const provider = router.selectPokerProvider(complexQuery);
        expect(provider).toBe('claude');
      });
    });
  });

  describe('Provider Selection Integration', () => {
    it('should route poker analysis through selectPokerProvider', () => {
      const pokerQuery = 'analyze this complex poker hand with opponent reads';
      const spy = jest.spyOn(router, 'selectPokerProvider');
      
      const provider = router.selectProvider(pokerQuery);
      
      expect(spy).toHaveBeenCalledWith(pokerQuery, {});
      expect(provider).toBe('claude'); // Complex analysis -> Sonnet
    });

    it('should route poker compliance through selectPokerProvider', () => {
      const complianceQuery = 'check GTO compliance for this play';
      const spy = jest.spyOn(router, 'selectPokerProvider');
      
      const provider = router.selectProvider(complianceQuery);
      
      expect(spy).toHaveBeenCalledWith('check gto compliance for this play', {});
      expect(provider).toBe('claude-haiku'); // Compliance -> Haiku
    });

    it('should use regular routing for non-poker queries', () => {
      const codeQuery = 'debug this javascript function';
      const spy = jest.spyOn(router, 'selectPokerProvider');
      
      const provider = router.selectProvider(codeQuery);
      
      expect(spy).not.toHaveBeenCalled();
      expect(provider).toBe('copilot'); // Code -> Copilot
    });
  });

  describe('processTextCommand with Dual Models', () => {
    it('should process poker analysis with Claude Sonnet', async () => {
      const context = {
        sessionId: 'poker-session',
        requestId: 'analysis-request',
        metadata: { source: 'poker' }
      };

      const result = await router.processTextCommand(
        'analyze this complex poker hand with multiple decision points',
        context
      );

      expect(result.provider).toBe('claude');
      expect(mockClaudeSonnetProvider.processText).toHaveBeenCalledWith(
        'analyze this complex poker hand with multiple decision points',
        expect.objectContaining({
          ...context,
          provider: 'claude'
        })
      );
      expect(mockClaudeHaikuProvider.processText).not.toHaveBeenCalled();
    });

    it('should process poker compliance with Claude Haiku', async () => {
      const context = {
        sessionId: 'poker-session',
        requestId: 'compliance-request',
        metadata: { source: 'poker' }
      };

      const result = await router.processTextCommand(
        'check GTO compliance for this betting pattern',
        context
      );

      expect(result.provider).toBe('claude-haiku');
      expect(mockClaudeHaikuProvider.processText).toHaveBeenCalledWith(
        'check GTO compliance for this betting pattern',
        expect.objectContaining({
          ...context,
          provider: 'claude-haiku'
        })
      );
      expect(mockClaudeSonnetProvider.processText).not.toHaveBeenCalled();
    });

    it('should include source metadata for cost tracking', async () => {
      const context = {
        sessionId: 'poker-session',
        requestId: 'test-request',
        metadata: { source: 'poker' }
      };

      await router.processTextCommand('analyze poker hand', context);

      expect(mockClaudeSonnetProvider.processText).toHaveBeenCalledWith(
        'analyze poker hand',
        expect.objectContaining({
          metadata: expect.objectContaining({
            source: 'poker'
          })
        })
      );
    });

    it('should track routing statistics for both Claude models', async () => {
      const initialStats = router.getStats();
      
      // Process with Sonnet
      await router.processTextCommand('complex poker analysis', {
        sessionId: 'test',
        requestId: 'req1'
      });
      
      // Process with Haiku
      await router.processTextCommand('GTO compliance check', {
        sessionId: 'test',
        requestId: 'req2'
      });

      const updatedStats = router.getStats();
      expect(updatedStats.routingStats.claude).toBe(initialStats.routingStats.claude + 1);
      expect(updatedStats.routingStats['claude-haiku']).toBe((initialStats.routingStats['claude-haiku'] || 0) + 1);
    });
  });

  describe('Cost Tracking Integration', () => {
    it('should pass poker source for cost tracking', async () => {
      const context = {
        sessionId: 'poker-session',
        requestId: 'cost-test',
        metadata: { source: 'poker' }
      };

      await router.processTextCommand('poker hand analysis', context);

      expect(mockClaudeSonnetProvider.processText).toHaveBeenCalledWith(
        'poker hand analysis',
        expect.objectContaining({
          metadata: expect.objectContaining({
            source: 'poker'
          })
        })
      );
    });

    it('should handle requests without source metadata', async () => {
      const context = {
        sessionId: 'general-session',
        requestId: 'general-request',
        metadata: {}
      };

      await router.processTextCommand('general AI question', context);

      expect(mockClaudeSonnetProvider.processText).toHaveBeenCalledWith(
        'general AI question',
        expect.objectContaining({
          metadata: {}
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle Sonnet provider errors gracefully', async () => {
      mockClaudeSonnetProvider.processText.mockRejectedValue(new Error('Sonnet API error'));

      await expect(router.processTextCommand('complex poker analysis', {
        sessionId: 'test',
        requestId: 'error-test'
      })).rejects.toThrow('Sonnet API error');

      expect(router.activeRequests.has('error-test')).toBe(false);
    });

    it('should handle Haiku provider errors gracefully', async () => {
      mockClaudeHaikuProvider.processText.mockRejectedValue(new Error('Haiku API error'));

      await expect(router.processTextCommand('GTO compliance check', {
        sessionId: 'test',
        requestId: 'haiku-error'
      })).rejects.toThrow('Haiku API error');

      expect(router.activeRequests.has('haiku-error')).toBe(false);
    });
  });

  describe('Cancellation Support', () => {
    it('should cancel Sonnet requests', async () => {
      router.activeRequests.set('sonnet-request', {
        provider: 'claude',
        sessionId: 'test-session',
        startTime: Date.now(),
        type: 'text'
      });

      const result = await router.cancelRequest('test-session', 'sonnet-request');

      expect(result).toBe(true);
      expect(router.activeRequests.has('sonnet-request')).toBe(false);
    });

    it('should cancel Haiku requests', async () => {
      router.activeRequests.set('haiku-request', {
        provider: 'claude-haiku',
        sessionId: 'test-session',
        startTime: Date.now(),
        type: 'text'
      });

      const result = await router.cancelRequest('test-session', 'haiku-request');

      expect(result).toBe(true);
      expect(router.activeRequests.has('haiku-request')).toBe(false);
    });
  });
});
