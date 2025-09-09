import { logger } from '../../utils/logger.js';

export class OpenAIProvider {
  constructor() {
    this.name = 'openai';
  }

  async processText(text, context) {
    // Mock implementation for testing
    logger.info(`OpenAI processing: ${text}`);
    
    return {
      content: `OpenAI response to: ${text}`,
      confidence: 0.85,
      provider: 'openai'
    };
  }

  async transcribeAudio(audioData, audioFormat) {
    // Mock implementation for testing
    logger.info(`OpenAI transcribing audio: ${audioData.length} bytes`);
    
    return {
      text: 'Hello Alfred, what is the weather today?',
      confidence: 0.92,
      language: 'en'
    };
  }

  async cancelRequest(requestId) {
    logger.info(`Cancelling OpenAI request: ${requestId}`);
    return true;
  }
}
