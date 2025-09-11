import { logger } from '../../utils/logger.js';

export class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.GPT_MODEL || 'gpt-4o-mini';
    this.baseUrl = 'https://api.openai.com/v1/chat/completions';
  }

  async processText(text, context) {
    if (!this.apiKey) {
      logger.warn('OpenAI API key not configured, using mock response');
      return {
        content: `OpenAI mock response to: ${text}`,
        confidence: 0.85,
        provider: 'openai'
      };
    }

    try {
      logger.info(`OpenAI processing: ${text}`);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{
            role: 'user',
            content: text
          }],
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || 'No response from OpenAI';
      
      return {
        content,
        confidence: 0.9,
        provider: 'openai'
      };
    } catch (error) {
      logger.error(`OpenAI provider error: ${error.message}`);
      return {
        content: `I'm having trouble processing your request right now. Please try again.`,
        confidence: 0.1,
        provider: 'openai',
        error: error.message
      };
    }
  }

  async transcribeAudio(audioData, audioFormat) {
    if (!this.apiKey) {
      logger.warn('OpenAI API key not configured, using mock transcription');
      return {
        text: 'Hello Alfred, what is the weather today?',
        confidence: 0.92,
        language: 'en'
      };
    }

    try {
      logger.info(`OpenAI transcribing audio: ${audioData.length} bytes`);
      
      const formData = new FormData();
      formData.append('file', new Blob([audioData], { type: 'audio/wav' }), 'audio.wav');
      formData.append('model', 'whisper-1');
      
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`OpenAI Whisper API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        text: data.text || '',
        confidence: 0.95,
        language: data.language || 'en'
      };
    } catch (error) {
      logger.error(`OpenAI transcription error: ${error.message}`);
      return {
        text: 'Hello Alfred',
        confidence: 0.1,
        language: 'en',
        error: error.message
      };
    }
  }

  async cancelRequest(requestId) {
    logger.info(`Cancelling OpenAI request: ${requestId}`);
    return true;
  }
}
