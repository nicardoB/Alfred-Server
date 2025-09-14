import { SmartAIRouter } from '../../src/ai/SmartAIRouter.js';

describe('SmartAIRouter Production Fixes', () => {
  let router;

  beforeEach(() => {
    router = new SmartAIRouter();
  });

  describe('Routing Logic Fixes', () => {
    it('should route simple greetings to OpenAI (GPT-4o Mini)', async () => {
      const testCases = ['hello', 'hi', 'hey', 'Hello there'];
      
      for (const text of testCases) {
        const result = await router.routeChat(text, {}, router.toolConfigs.chat);
        expect(result).toBe('openai');
      }
    });

    it('should route short messages to OpenAI (GPT-4o Mini)', async () => {
      const shortMessages = ['yes', 'no', 'thanks', 'ok', 'what?'];
      
      for (const text of shortMessages) {
        const result = await router.routeChat(text, {}, router.toolConfigs.chat);
        expect(result).toBe('openai');
      }
    });

    it('should route complex queries to Claude', async () => {
      const complexQueries = [
        'analyze the pros and cons of renewable energy',
        'explain the complex relationship between economics and politics',
        'design a comprehensive architecture for a distributed system'
      ];
      
      for (const text of complexQueries) {
        const result = await router.routeChat(text, {}, router.toolConfigs.chat);
        expect(result).toBe('claude');
      }
    });

    it('should default to OpenAI for medium-length queries', async () => {
      const mediumQuery = 'Can you help me understand how to use this new feature?';
      const result = await router.routeChat(mediumQuery, {}, router.toolConfigs.chat);
      expect(result).toBe('openai');
    });
  });

  describe('Simple Query Detection', () => {
    it('should correctly identify simple queries', () => {
      const simpleQueries = [
        'hello',
        'hi there',
        'what is AI?',
        'how to code',
        'define machine learning',
        'quick question',
        'simple task'
      ];

      simpleQueries.forEach(query => {
        expect(router.isSimpleQuery(query)).toBe(true);
      });
    });

    it('should correctly identify non-simple queries', () => {
      const complexQueries = [
        'This is a longer message that should not be considered simple because it exceeds the length threshold',
        'analyze the complex relationship between various factors',
        'medium length query without simple keywords'
      ];

      complexQueries.forEach(query => {
        expect(router.isSimpleQuery(query)).toBe(false);
      });
    });
  });

  describe('Complex Reasoning Detection', () => {
    it('should correctly identify complex reasoning queries', () => {
      const complexQueries = [
        'analyze this data',
        'explain the relationship',
        'compare these options',
        'evaluate the strategy',
        'design a plan',
        'This is a very long query that should be considered complex due to its length exceeding 200 characters. It contains multiple sentences and requires more sophisticated processing than a simple greeting or short question would need.'
      ];

      complexQueries.forEach(query => {
        expect(router.isComplexReasoning(query)).toBe(true);
      });
    });

    it('should correctly identify non-complex queries', () => {
      const simpleQueries = [
        'hello',
        'what is this?',
        'short question',
        'help me'
      ];

      simpleQueries.forEach(query => {
        expect(router.isComplexReasoning(query)).toBe(false);
      });
    });
  });

  describe('Cost Optimization', () => {
    it('should prefer cheaper models for simple tasks', async () => {
      const cheapQueries = [
        'hello',
        'yes',
        'what is this?',
        'quick help'
      ];

      for (const query of cheapQueries) {
        const provider = await router.routeChat(query, {}, router.toolConfigs.chat);
        // Should route to OpenAI (GPT-4o Mini) which is cheaper than Claude
        expect(provider).toBe('openai');
      }
    });

    it('should use appropriate models for complex tasks', async () => {
      const complexQueries = [
        'analyze the economic impact of artificial intelligence on job markets',
        'explain the complex architectural patterns in distributed systems'
      ];

      for (const query of complexQueries) {
        const provider = await router.routeChat(query, {}, router.toolConfigs.chat);
        // Should route to Claude for complex reasoning
        expect(provider).toBe('claude');
      }
    });
  });

  describe('Fallback Behavior', () => {
    it('should fallback to OpenAI when Ollama is unavailable', async () => {
      // Mock Ollama as unavailable
      router.providers.ollama = {
        isAvailable: jest.fn().mockResolvedValue(false)
      };

      const result = await router.routeChat('hello', {}, router.toolConfigs.chat);
      expect(result).toBe('openai');
    });

    it('should handle missing provider gracefully', async () => {
      // Test with undefined provider
      router.providers.ollama = undefined;

      const result = await router.routeChat('hello', {}, router.toolConfigs.chat);
      expect(result).toBe('openai');
    });
  });
});
