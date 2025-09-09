import { logger } from '../../utils/logger.js';

export class GitHubCopilotProvider {
  constructor() {
    this.name = 'copilot';
  }

  async processText(text, context) {
    // Mock implementation for testing
    logger.info(`GitHub Copilot processing: ${text}`);
    
    return {
      content: `GitHub Copilot response to: ${text}`,
      confidence: 0.88,
      provider: 'copilot'
    };
  }

  async cancelRequest(requestId) {
    logger.info(`Cancelling GitHub Copilot request: ${requestId}`);
    return true;
  }
}
