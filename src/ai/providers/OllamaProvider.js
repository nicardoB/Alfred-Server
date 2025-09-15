import { logger } from '../../utils/logger.js';
import { costTracker } from '../../monitoring/CostTracker.js';

/**
 * Ollama Provider - Free local LLM integration
 * Handles local model inference with zero API costs
 */
export class OllamaProvider {
  constructor() {
    this.name = 'ollama';
    this.baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    this.isLocal = true;
    this.cost = 0; // Free!
    
    logger.info(`Ollama provider initialized: ${this.baseUrl} (${this.model})`);
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      logger.warn('Ollama not available:', error.message);
      return false;
    }
  }

  /**
   * Process text with local Ollama model
   */
  async processText(text, context = {}) {
    const { sessionId, requestId, stream = false } = context;
    
    if (!await this.isAvailable()) {
      throw new Error('Ollama service not available. Please install and start Ollama.');
    }

    try {
      logger.info(`Ollama processing: ${text.substring(0, 100)}...`);
      
      const requestBody = {
        model: this.model,
        prompt: text,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 2000
        }
      };

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Track usage (tokens estimated, cost = 0)
      const estimatedTokens = Math.ceil(text.length / 4);
      const outputTokens = Math.ceil(data.response?.length / 4 || 0);
      
      await costTracker.trackUsage({
        provider: 'ollama',
        inputTokens: estimatedTokens,
        outputTokens,
        userId: context?.metadata?.userId,
        toolContext: context?.metadata?.toolContext || 'chat',
        model: this.model,
        conversationId: context?.metadata?.conversationId,
        messageId: context?.metadata?.messageId,
        sessionId: context?.sessionId
      });

      return {
        content: data.response,
        confidence: 0.85,
        provider: 'ollama',
        model: this.model,
        usage: {
          inputTokens: estimatedTokens,
          outputTokens: outputTokens,
          cost: 0 // Free!
        }
      };

    } catch (error) {
      logger.error('Ollama processing error:', error);
      throw error;
    }
  }

  /**
   * Smart routing decision - determines if query should stay local or route to paid model
   */
  async makeRoutingDecision(query, userContext = {}) {
    const routingPrompt = `
Analyze this user query and decide the best AI model to handle it:

Query: "${query}"
User Role: ${userContext.role || 'user'}
Cost Preference: ${userContext.costPreference || 'balanced'}

Routing Options:
1. LOCAL (free) - Handle with local Llama model
2. GPT4_MINI (cheap) - Simple tasks, good quality
3. CLAUDE_SONNET (expensive) - Complex reasoning, analysis
4. COPILOT (code) - Programming tasks

Consider:
- Query complexity
- Cost implications
- User's role and preferences
- Privacy requirements

Respond with just the routing decision: LOCAL, GPT4_MINI, CLAUDE_SONNET, or COPILOT
`;

    try {
      const decision = await this.processText(routingPrompt);
      const route = decision.content.trim().toUpperCase();
      
      // Validate routing decision
      const validRoutes = ['LOCAL', 'GPT4_MINI', 'CLAUDE_SONNET', 'COPILOT'];
      if (validRoutes.includes(route)) {
        return route;
      }
      
      // Default to local if decision is unclear
      return 'LOCAL';
      
    } catch (error) {
      logger.warn('Routing decision failed, defaulting to LOCAL:', error);
      return 'LOCAL';
    }
  }
}
