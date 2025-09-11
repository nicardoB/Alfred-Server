import { logger } from '../../utils/logger.js';

export class ClaudeProvider {
  constructor() {
    this.name = 'claude';
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
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
        provider: 'claude'
      };
    }

    try {
      logger.info(`Claude processing: ${text}`);
      
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
      
      return {
        content,
        confidence: 0.95,
        provider: 'claude'
      };
    } catch (error) {
      logger.error(`Claude provider error: ${error.message}`);
      return {
        content: `I apologize, but I'm having trouble processing your request right now. Please try again.`,
        confidence: 0.1,
        provider: 'claude',
        error: error.message
      };
    }
  }

  async cancelRequest(requestId) {
    logger.info(`Cancelling Claude request: ${requestId}`);
    return true;
  }
}
