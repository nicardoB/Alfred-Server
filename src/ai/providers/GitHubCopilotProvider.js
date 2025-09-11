import { logger } from '../../utils/logger.js';

export class GitHubCopilotProvider {
  constructor() {
    this.name = 'copilot';
    this.apiKey = process.env.GITHUB_TOKEN;
    this.model = process.env.COPILOT_MODEL || 'gpt-4o';
    this.baseUrl = 'https://api.githubcopilot.com/chat/completions';
    
    // Debug logging for API key status
    if (this.apiKey) {
      logger.info(`GitHub Copilot API key loaded: ${this.apiKey.substring(0, 15)}...`);
    } else {
      logger.warn('GitHub Copilot API key not found in environment variables');
    }
  }

  async processText(text, context) {
    if (!this.apiKey) {
      logger.warn('GitHub Copilot API key not configured, using mock response');
      return {
        content: `GitHub Copilot mock response to: ${text}`,
        confidence: 0.88,
        provider: 'copilot'
      };
    }

    try {
      logger.info(`GitHub Copilot processing: ${text}`);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Editor-Version': 'vscode/1.85.0',
          'Editor-Plugin-Version': 'copilot-chat/0.11.1',
          'User-Agent': 'GitHubCopilotChat/0.11.1'
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: text
          }],
          model: this.model,
          temperature: 0.1,
          top_p: 1,
          n: 1,
          stream: false,
          intent: true
        })
      });

      if (!response.ok) {
        throw new Error(`GitHub Copilot API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || 'No response from GitHub Copilot';
      
      return {
        content,
        confidence: 0.92,
        provider: 'copilot'
      };
    } catch (error) {
      logger.error(`GitHub Copilot provider error: ${error.message}`);
      return {
        content: `I'm having trouble accessing GitHub Copilot right now. Please try again.`,
        confidence: 0.1,
        provider: 'copilot',
        error: error.message
      };
    }
  }

  async cancelRequest(requestId) {
    logger.info(`Cancelling GitHub Copilot request: ${requestId}`);
    return true;
  }
}
