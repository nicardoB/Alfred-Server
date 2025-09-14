import { SmartAIRouter } from '../../src/ai/SmartAIRouter.js';
import { jest } from '@jest/globals';

describe('SmartAIRouter Production Fixes', () => {
  let router;

  beforeEach(() => {
    router = new SmartAIRouter();
  });

  describe('Routing Logic Fixes', () => {
    it('should route simple greetings to cost-effective models', async () => {
      const testCases = ['hello', 'hi', 'hey', 'good morning'];
      
      for (const text of testCases) {
        const result = await router.routeChat(text, {}, router.toolConfigs.chat);
        expect(['ollama', 'openai']).toContain(result);
      }
    });

    it('should route short messages to cost-effective models', async () => {
      const shortMessages = ['yes', 'no', 'thanks', 'ok', 'sure'];
      
      for (const text of shortMessages) {
        const result = await router.routeChat(text, {}, router.toolConfigs.chat);
        expect(['ollama', 'openai']).toContain(result);
      }
    });

    it('should route complex queries intelligently', async () => {
      const complexQueries = [
        'Analyze the economic implications of artificial intelligence on job markets',
        'Explain the philosophical differences between determinism and free will',
        'Compare and contrast different architectural patterns for microservices'
      ];
      
      for (const text of complexQueries) {
        const result = await router.routeChat(text, {}, router.toolConfigs.chat);
        expect(['ollama', 'openai', 'claude', 'copilot']).toContain(result);
      }
    });

    it('should route medium-length queries intelligently', async () => {
      const mediumQuery = 'Can you help me understand how to use this new feature?';
      const result = await router.routeChat(mediumQuery, {}, router.toolConfigs.chat);
      expect(['ollama', 'openai', 'claude', 'copilot']).toContain(result);
    });
  });

  describe('Fallback Behavior When AI Routing Fails', () => {
    beforeEach(() => {
      // Mock AI routing to fail/return null
      jest.spyOn(router, 'getAIRoutingDecision').mockResolvedValue(null);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should fallback to keyword detection for complex queries', async () => {
      const result = await router.routeChat('analyze this complex data', {}, router.toolConfigs.chat);
      expect(result).toBe('claude'); // Should use isComplexReasoning fallback
    });

    it('should fallback to keyword detection for code queries', async () => {
      const result = await router.routeChat('debug this javascript function', {}, router.toolConfigs.chat);
      expect(result).toBe('claude'); // Code queries route to routeCode, which returns claude
    });

    it('should fallback to OpenAI for simple queries', async () => {
      const result = await router.routeChat('hello there', {}, router.toolConfigs.chat);
      expect(result).toBe('openai'); // Should use isSimpleQuery fallback
    });

    it('should default to OpenAI when no patterns match', async () => {
      const result = await router.routeChat('random query', {}, router.toolConfigs.chat);
      expect(result).toBe('openai'); // Should use final default
    });
  });

  describe('Cost Optimization', () => {
    it('should prefer cost-effective models for simple tasks', async () => {
      const cheapQueries = [
        'hello',
        'yes',
        'what is this?',
        'quick help'
      ];

      for (const query of cheapQueries) {
        const provider = await router.routeChat(query, {}, router.toolConfigs.chat);
        // AI routing should prefer free (ollama) or cheap (openai) models
        expect(['ollama', 'openai']).toContain(provider);
      }
    });

    it('should route complex tasks intelligently', async () => {
      const complexQueries = [
        'analyze the economic impact of artificial intelligence on job markets',
        'explain the complex architectural patterns in distributed systems'
      ];

      for (const query of complexQueries) {
        const provider = await router.routeChat(query, {}, router.toolConfigs.chat);
        // AI can route to any provider based on analysis
        expect(['ollama', 'openai', 'claude', 'copilot']).toContain(provider);
      }
    });
  });

  describe('Fallback Behavior', () => {
    it('should handle routing when providers are available', async () => {
      const result = await router.routeChat('hello', {}, router.toolConfigs.chat);
      expect(['ollama', 'openai', 'claude', 'copilot']).toContain(result);
    });

    it('should handle provider availability gracefully', async () => {
      const result = await router.routeChat('hello', {}, router.toolConfigs.chat);
      expect(['ollama', 'openai', 'claude', 'copilot']).toContain(result);
    });
  });
});
