import { SmartAIRouter } from '../../src/ai/SmartAIRouter.js';

describe('Production Fixes Validation', () => {
  let router;

  beforeEach(() => {
    router = new SmartAIRouter();
  });

  describe('Routing Fixes - Simple Queries to GPT-4o Mini', () => {
    it('should route greetings to OpenAI (GPT-4o Mini)', async () => {
      const greetings = ['hello', 'hi', 'hey', 'Hello there!'];
      
      for (const greeting of greetings) {
        const result = await router.routeChat(greeting, {}, router.toolConfigs.chat);
        expect(result).toBe('openai');
      }
    });

    it('should route short responses to OpenAI (GPT-4o Mini)', async () => {
      const shortResponses = ['yes', 'no', 'thanks', 'ok', 'sure'];
      
      for (const response of shortResponses) {
        const result = await router.routeChat(response, {}, router.toolConfigs.chat);
        expect(result).toBe('openai');
      }
    });

    it('should route simple questions to OpenAI (GPT-4o Mini)', async () => {
      const simpleQuestions = [
        'what is AI?',
        'how to code?', 
        'define machine learning',
        'quick help'
      ];
      
      for (const question of simpleQuestions) {
        const result = await router.routeChat(question, {}, router.toolConfigs.chat);
        expect(result).toBe('openai');
      }
    });
  });

  describe('Routing Fixes - Complex Queries to Claude', () => {
    it('should route analysis requests to Claude', async () => {
      const analysisQueries = [
        'analyze the pros and cons of renewable energy',
        'analyze this complex economic situation',
        'analyze the relationship between these factors'
      ];
      
      for (const query of analysisQueries) {
        const result = await router.routeChat(query, {}, router.toolConfigs.chat);
        expect(result).toBe('claude');
      }
    });

    it('should route explanation requests to Claude', async () => {
      const explanationQueries = [
        'explain the complex relationship between economics and politics',
        'explain why this architectural pattern is better',
        'explain the strategy behind this decision'
      ];
      
      for (const query of explanationQueries) {
        const result = await router.routeChat(query, {}, router.toolConfigs.chat);
        expect(result).toBe('claude');
      }
    });

    it('should route long queries to Claude', async () => {
      const longQuery = 'This is a very long and detailed query that exceeds the simple query threshold and should therefore be routed to Claude for more sophisticated processing and analysis capabilities rather than the cheaper GPT-4o Mini model.';
      
      const result = await router.routeChat(longQuery, {}, router.toolConfigs.chat);
      expect(result).toBe('claude');
    });
  });

  describe('Cost Optimization Logic', () => {
    it('should prefer cheaper models for simple tasks', async () => {
      const cheapTasks = [
        'hello',
        'yes', 
        'what is this?',
        'quick question',
        'simple task'
      ];

      for (const task of cheapTasks) {
        const provider = await router.routeChat(task, {}, router.toolConfigs.chat);
        expect(provider).toBe('openai'); // GPT-4o Mini is cheaper than Claude
      }
    });

    it('should use appropriate models for complex reasoning', async () => {
      const complexTasks = [
        'analyze the economic impact of artificial intelligence',
        'compare and evaluate different architectural approaches',
        'design a comprehensive strategy for market expansion'
      ];

      for (const task of complexTasks) {
        const provider = await router.routeChat(task, {}, router.toolConfigs.chat);
        expect(provider).toBe('claude'); // Claude for complex reasoning
      }
    });
  });

  describe('Fallback Behavior Validation', () => {
    it('should fallback to OpenAI when Ollama unavailable', async () => {
      // Ollama is typically unavailable in test environment
      const result = await router.routeChat('hello', {}, router.toolConfigs.chat);
      expect(result).toBe('openai');
    });

    it('should default to OpenAI for ambiguous queries', async () => {
      const ambiguousQueries = [
        'help me with this',
        'I need assistance',
        'can you help?'
      ];

      for (const query of ambiguousQueries) {
        const result = await router.routeChat(query, {}, router.toolConfigs.chat);
        expect(result).toBe('openai'); // Should default to cheaper option
      }
    });
  });

  describe('Detection Logic Validation', () => {
    it('should correctly identify simple queries', () => {
      const simpleQueries = [
        'hello',
        'hi there', 
        'what is AI?',
        'how to code',
        'define ML',
        'quick help',
        'yes'
      ];

      simpleQueries.forEach(query => {
        expect(router.isSimpleQuery(query)).toBe(true);
      });
    });

    it('should correctly identify complex reasoning queries', () => {
      const complexQueries = [
        'analyze this data thoroughly',
        'explain the complex relationship',
        'compare these different approaches',
        'evaluate the strategic implications',
        'design a comprehensive plan'
      ];

      complexQueries.forEach(query => {
        expect(router.isComplexReasoning(query)).toBe(true);
      });
    });

    it('should handle edge cases correctly', () => {
      // Empty or very short queries should be simple
      expect(router.isSimpleQuery('')).toBe(true);
      expect(router.isSimpleQuery('a')).toBe(true);
      
      // Medium queries without keywords should not be complex
      const mediumQuery = 'This is a medium length query without complex keywords';
      expect(router.isComplexReasoning(mediumQuery)).toBe(false);
    });
  });

  describe('Cost Calculation Validation', () => {
    it('should calculate costs correctly for different providers', () => {
      const inputTokens = 1000;
      const outputTokens = 500;

      // Test OpenAI GPT-4o Mini pricing
      const openaiCost = router.costTracker.calculateCost('openai', inputTokens, outputTokens, 'gpt-4o-mini');
      expect(openaiCost).toBeCloseTo(0.000825, 6); // (1000 * 0.15 + 500 * 0.60) / 1000000

      // Test Claude Haiku pricing  
      const claudeCost = router.costTracker.calculateCost('claude', inputTokens, outputTokens, 'claude-3-haiku');
      expect(claudeCost).toBeCloseTo(0.000875, 6); // (1000 * 0.25 + 500 * 1.25) / 1000000

      // Test Ollama (free)
      const ollamaCost = router.costTracker.calculateCost('ollama', inputTokens, outputTokens, 'llama3.1:8b');
      expect(ollamaCost).toBe(0);
    });

    it('should show cost difference between models', () => {
      const inputTokens = 1000;
      const outputTokens = 500;

      const openaiCost = router.costTracker.calculateCost('openai', inputTokens, outputTokens, 'gpt-4o-mini');
      const claudeCost = router.costTracker.calculateCost('claude', inputTokens, outputTokens, 'claude-3-haiku');

      // Claude should be more expensive than OpenAI GPT-4o Mini
      expect(claudeCost).toBeGreaterThan(openaiCost);
      
      // Verify the cost difference is significant enough to matter for routing
      const costDifference = claudeCost - openaiCost;
      expect(costDifference).toBeGreaterThan(0);
    });
  });

  describe('Real-world Scenario Validation', () => {
    it('should handle typical chat conversation routing', async () => {
      const conversation = [
        { text: 'hello', expectedProvider: 'openai' },
        { text: 'how are you?', expectedProvider: 'openai' },
        { text: 'can you analyze the current market trends?', expectedProvider: 'claude' },
        { text: 'thanks', expectedProvider: 'openai' },
        { text: 'explain the complex economic implications', expectedProvider: 'claude' }
      ];

      for (const { text, expectedProvider } of conversation) {
        const result = await router.routeChat(text, {}, router.toolConfigs.chat);
        expect(result).toBe(expectedProvider);
      }
    });

    it('should optimize costs for typical usage patterns', async () => {
      // Simulate typical usage: mostly simple queries with occasional complex ones
      const queries = [
        'hello', 'hi', 'yes', 'thanks', 'ok', // 5 simple (should use OpenAI)
        'analyze this complex problem' // 1 complex (should use Claude)
      ];

      let openaiCount = 0;
      let claudeCount = 0;

      for (const query of queries) {
        const provider = await router.routeChat(query, {}, router.toolConfigs.chat);
        if (provider === 'openai') openaiCount++;
        if (provider === 'claude') claudeCount++;
      }

      // Should prefer cheaper OpenAI for most queries
      expect(openaiCount).toBe(5);
      expect(claudeCount).toBe(1);
    });
  });
});
