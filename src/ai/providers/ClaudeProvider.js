import { logger } from '../../utils/logger.js';

export class ClaudeProvider {
  constructor() {
    this.name = 'claude';
  }

  async processText(text, context) {
    // Mock implementation for testing
    logger.info(`Claude processing: ${text}`);
    
    return {
      content: `Claude response to: ${text}`,
      confidence: 0.9,
      provider: 'claude'
    };
  }

  async cancelRequest(requestId) {
    logger.info(`Cancelling Claude request: ${requestId}`);
    return true;
  }
}
