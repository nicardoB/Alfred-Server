import { logger } from '../../utils/logger.js';
import { costTracker } from '../../monitoring/CostTracker.js';

export class ClaudeProvider {
  constructor(model = null) {
    this.name = 'claude';
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = model || process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
    this.baseUrl = 'https://api.anthropic.com/v1/messages';
    
    // Debug logging for API key status
    if (this.apiKey) {
      logger.info(`Claude API key loaded: ${this.apiKey.substring(0, 15)}...`);
    } else {
      logger.warn('Claude API key not found in environment variables');
    }
  }

  async processText(text, context) {
    if (!this.apiKey) {
      logger.warn('Claude API key not configured, using mock response');
      return {
        content: `Claude mock response to: ${text}`,
        confidence: 0.9,
        provider: this.name
      };
    }

    try {
      logger.info(`Claude (${this.model}) processing: ${text}`);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: text
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || 'No response from Claude';
      
      // Track usage for cost monitoring
      const inputTokens = data.usage?.input_tokens || costTracker.estimateTokens(text);
      const outputTokens = data.usage?.output_tokens || costTracker.estimateTokens(content);
      const providerKey = this.model.includes('haiku') ? 'claude-haiku' : 'claude';
      
      costTracker.trackUsage({
        provider: providerKey,
        inputTokens,
        outputTokens,
        userId: context?.metadata?.userId,
        toolContext: context?.metadata?.toolContext || 'chat',
        model: this.model,
        conversationId: context?.metadata?.conversationId,
        messageId: context?.metadata?.messageId,
        sessionId: context?.sessionId
      });
      
      return {
        content,
        confidence: 0.95,
        provider: this.name
      };
    } catch (error) {
      logger.error(`Claude provider error: ${error.message}`);
      return {
        content: `I apologize, but I'm having trouble processing your request right now. Please try again.`,
        confidence: 0.1,
        provider: this.name,
        error: error.message
      };
    }
  }

  async cancelRequest(requestId) {
    logger.info(`Cancelling Claude request: ${requestId}`);
    return true;
  }
}
