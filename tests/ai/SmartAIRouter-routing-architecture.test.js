import { jest } from '@jest/globals';
import { SmartAIRouter } from '../../src/ai/SmartAIRouter.js';
import { PROVIDERS, TOOL_CONTEXTS, USER_ROLES } from '../../src/ai/enums.js';

describe('SmartAIRouter - New Routing Architecture', () => {
  let router;
  let mockProviders;
  let mockCostUsage;

  beforeEach(() => {
    // Mock providers with availability methods
    mockProviders = {
      ollama: {
        isAvailable: jest.fn().mockResolvedValue(true),
        processText: jest.fn().mockResolvedValue({ content: 'Ollama response', confidence: 0.8 })
      },
      openai: {
        isAvailable: jest.fn().mockResolvedValue(true),
        processText: jest.fn().mockResolvedValue({ content: 'OpenAI response', confidence: 0.85 })
      },
      claude: {
        isAvailable: jest.fn().mockResolvedValue(true),
        processText: jest.fn().mockResolvedValue({ content: 'Claude response', confidence: 0.9 })
      },
      'claude-haiku': {
        isAvailable: jest.fn().mockResolvedValue(true),
        processText: jest.fn().mockResolvedValue({ content: 'Claude Haiku response', confidence: 0.75 })
      },
      copilot: {
        isAvailable: jest.fn().mockResolvedValue(true),
        processText: jest.fn().mockResolvedValue({ content: 'Copilot response', confidence: 0.9 })
      }
    };

    mockCostUsage = {
      create: jest.fn().mockResolvedValue({ id: 'cost-123' }),
      findBySession: jest.fn().mockResolvedValue([])
    };

    router = new SmartAIRouter(mockProviders, mockCostUsage);
  });

  describe('OLLAMA-first Chat Routing', () => {
    it('should route to OLLAMA when AI routing decides it should handle the query', async () => {
      // Mock AI routing to return OLLAMA for simple queries
      jest.spyOn(router, 'getAIRoutingDecision').mockResolvedValue(PROVIDERS.OLLAMA);
      const executeWithFallbackSpy = jest.spyOn(router, 'executeWithFallback').mockResolvedValue(PROVIDERS.OLLAMA);

      const provider = await router.selectProvider('Hello, how are you?', {
        toolContext: TOOL_CONTEXTS.CHAT,
        user: { role: USER_ROLES.DEMO }
      });

      expect(executeWithFallbackSpy).toHaveBeenCalledWith(PROVIDERS.OLLAMA, expect.any(Object));
      expect(provider).toBe(PROVIDERS.OLLAMA);
    });

    it('should fallback to OpenAI when OLLAMA unavailable', async () => {
      mockProviders.ollama.isAvailable.mockResolvedValue(false);

      const provider = await router.selectProvider('Hello, how are you?', {
        toolContext: TOOL_CONTEXTS.CHAT,
        user: { role: USER_ROLES.DEMO }
      });

      expect(provider).toBe(PROVIDERS.OPENAI);
      expect(mockProviders.ollama.isAvailable).toHaveBeenCalled();
      expect(mockProviders.openai.isAvailable).toHaveBeenCalled();
    });

    it('should handle OLLAMA provider missing gracefully', async () => {
      delete mockProviders.ollama;
      router = new SmartAIRouter(mockProviders, mockCostUsage);

      const provider = await router.selectProvider('Hello, how are you?', {
        toolContext: TOOL_CONTEXTS.CHAT,
        user: { role: USER_ROLES.DEMO }
      });

      expect(provider).toBe(PROVIDERS.OPENAI);
    });
  });

  describe('Fallback Chain System', () => {
    it('should execute COPILOT → CLAUDE → OPENAI fallback chain', async () => {
      mockProviders.copilot.isAvailable.mockResolvedValue(false);
      mockProviders.claude.isAvailable.mockResolvedValue(true);

      const provider = await router.executeWithFallback(PROVIDERS.COPILOT, {
        sessionId: 'test-session'
      });

      expect(provider).toBe(PROVIDERS.CLAUDE);
      expect(mockProviders.copilot.isAvailable).toHaveBeenCalled();
      expect(mockProviders.claude.isAvailable).toHaveBeenCalled();
    });

    it('should execute CLAUDE → OPENAI → CLAUDE_HAIKU fallback chain', async () => {
      mockProviders.claude.isAvailable.mockResolvedValue(false);
      mockProviders.openai.isAvailable.mockResolvedValue(false);
      mockProviders['claude-haiku'].isAvailable.mockResolvedValue(true);

      const provider = await router.executeWithFallback(PROVIDERS.CLAUDE, {
        sessionId: 'test-session'
      });

      expect(provider).toBe(PROVIDERS.CLAUDE_HAIKU);
      expect(mockProviders.claude.isAvailable).toHaveBeenCalled();
      expect(mockProviders.openai.isAvailable).toHaveBeenCalled();
      expect(mockProviders['claude-haiku'].isAvailable).toHaveBeenCalled();
    });

    it('should execute OLLAMA → OPENAI → CLAUDE_HAIKU fallback chain', async () => {
      mockProviders.ollama.isAvailable.mockResolvedValue(false);
      mockProviders.openai.isAvailable.mockResolvedValue(false);
      mockProviders['claude-haiku'].isAvailable.mockResolvedValue(true);

      const provider = await router.executeWithFallback(PROVIDERS.OLLAMA, {
        sessionId: 'test-session'
      });

      expect(provider).toBe(PROVIDERS.CLAUDE_HAIKU);
    });

    it('should throw error when all providers in chain unavailable', async () => {
      mockProviders.copilot.isAvailable.mockResolvedValue(false);
      mockProviders.claude.isAvailable.mockResolvedValue(false);
      mockProviders.openai.isAvailable.mockResolvedValue(false);

      await expect(router.executeWithFallback(PROVIDERS.COPILOT, {
        sessionId: 'test-session'
      })).rejects.toThrow('No available providers');
    });

    it('should call fallback callback when fallback occurs', async () => {
      mockProviders.claude.isAvailable.mockResolvedValue(false);
      const onFallback = jest.fn();

      const provider = await router.executeWithFallback(PROVIDERS.CLAUDE, {
        sessionId: 'test-session',
        onFallback
      });

      expect(provider).toBe(PROVIDERS.OPENAI);
      expect(onFallback).toHaveBeenCalledWith({
        primary: PROVIDERS.CLAUDE,
        fallback: PROVIDERS.OPENAI,
        message: '✨ Using alternative model for best response'
      });
    });
  });

  describe('Provider Availability Checks', () => {
    it('should return true for available provider with isAvailable method', async () => {
      const available = await router.isProviderAvailable(PROVIDERS.OLLAMA);
      expect(available).toBe(true);
      expect(mockProviders.ollama.isAvailable).toHaveBeenCalled();
    });

    it('should return false for unavailable provider', async () => {
      mockProviders.ollama.isAvailable.mockResolvedValue(false);
      const available = await router.isProviderAvailable(PROVIDERS.OLLAMA);
      expect(available).toBe(false);
    });

    it('should return false for missing provider', async () => {
      const available = await router.isProviderAvailable('nonexistent');
      expect(available).toBe(false);
    });

    it('should return true for provider without isAvailable method', async () => {
      delete mockProviders.openai.isAvailable;
      const available = await router.isProviderAvailable(PROVIDERS.OPENAI);
      expect(available).toBe(true);
    });

    it('should handle isAvailable method errors gracefully', async () => {
      mockProviders.ollama.isAvailable.mockRejectedValue(new Error('Connection failed'));
      const available = await router.isProviderAvailable(PROVIDERS.OLLAMA);
      expect(available).toBe(false);
    });
  });

  describe('Routing Decision Matrix', () => {
    it('should route coding questions to COPILOT', async () => {
      const provider = await router.selectProvider('write a function to sort an array', {
        toolContext: TOOL_CONTEXTS.CODE,
        user: { role: USER_ROLES.OWNER }
      });

      expect(provider).toBe(PROVIDERS.COPILOT);
    });

    it('should route complex reasoning to CLAUDE', async () => {
      // Make OLLAMA unavailable so it falls through to AI routing
      mockProviders.ollama.isAvailable.mockResolvedValue(false);
      
      // Mock getAIRoutingDecision to return CLAUDE for complex reasoning
      const aiRoutingSpy = jest.spyOn(router, 'getAIRoutingDecision').mockResolvedValue(PROVIDERS.CLAUDE);
      const executeWithFallbackSpy = jest.spyOn(router, 'executeWithFallback').mockResolvedValue(PROVIDERS.CLAUDE);

      const provider = await router.selectProvider('analyze the philosophical implications of artificial intelligence', {
        toolContext: TOOL_CONTEXTS.CHAT,
        user: { role: USER_ROLES.OWNER }
      });

      expect(aiRoutingSpy).toHaveBeenCalled();
      expect(executeWithFallbackSpy).toHaveBeenCalledWith(PROVIDERS.CLAUDE, expect.any(Object));
      expect(provider).toBe(PROVIDERS.CLAUDE);
      
      aiRoutingSpy.mockRestore();
      executeWithFallbackSpy.mockRestore();
    });

    it('should route voice transcription to OPENAI', async () => {
      const provider = await router.selectProvider('transcribe this audio', {
        toolContext: TOOL_CONTEXTS.VOICE,
        isTranscription: true,
        user: { role: USER_ROLES.OWNER }
      });

      expect(provider).toBe(PROVIDERS.OPENAI);
    });

    it('should route French language tasks to CLAUDE', async () => {
      const provider = await router.selectProvider('explain French grammar', {
        toolContext: TOOL_CONTEXTS.FRENCH,
        user: { role: USER_ROLES.OWNER }
      });

      expect(provider).toBe(PROVIDERS.CLAUDE);
    });

    it('should route quick tasks to CLAUDE_HAIKU', async () => {
      const provider = await router.selectProvider('quick workout plan', {
        toolContext: TOOL_CONTEXTS.WORKOUT,
        user: { role: USER_ROLES.OWNER }
      });

      expect(provider).toBe(PROVIDERS.CLAUDE_HAIKU);
    });
  });

  describe('Fallback Logging and Notifications', () => {
    it('should log fallback usage with session info', async () => {
      // Spy on the actual logFallbackUsage method
      const logSpy = jest.spyOn(router, 'logFallbackUsage');
      mockProviders.claude.isAvailable.mockResolvedValue(false);

      await router.executeWithFallback(PROVIDERS.CLAUDE, {
        sessionId: 'test-session-123'
      });

      expect(logSpy).toHaveBeenCalledWith(
        PROVIDERS.CLAUDE,
        PROVIDERS.OPENAI,
        { sessionId: 'test-session-123' }
      );
      
      logSpy.mockRestore();
    });

    it('should handle missing session ID gracefully', async () => {
      mockProviders.claude.isAvailable.mockResolvedValue(false);

      const provider = await router.executeWithFallback(PROVIDERS.CLAUDE, {});
      expect(provider).toBe(PROVIDERS.OPENAI);
    });
  });

  describe('Integration with Existing Routing', () => {
    it('should maintain compatibility with tool context routing', async () => {
      const provider = await router.selectProvider('analyze this poker hand', {
        toolContext: TOOL_CONTEXTS.POKER,
        user: { role: USER_ROLES.OWNER }
      });

      expect(provider).toBe(PROVIDERS.CLAUDE);
    });

    it('should respect user role permissions', async () => {
      await expect(router.selectProvider('test query', {
        toolContext: 'unknown_tool',
        user: { role: USER_ROLES.DEMO }
      })).rejects.toThrow("does not have access to 'unknown_tool' tool");
    });

    it('should handle cost constraints', async () => {
      await expect(router.selectProvider('expensive query', {
        toolContext: TOOL_CONTEXTS.CHAT,
        user: { role: USER_ROLES.DEMO },
        estimatedCost: 999999
      })).rejects.toThrow('Request exceeds cost limit');
    });
  });
});
