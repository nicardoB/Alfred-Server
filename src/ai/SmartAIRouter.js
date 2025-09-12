import { logger } from '../utils/logger.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { GitHubCopilotProvider } from './providers/GitHubCopilotProvider.js';

/**
 * Smart AI Router - Intelligently routes requests to the best AI provider
 * Based on task complexity, context, and user preferences
 */
export class SmartAIRouter {
  constructor() {
    this.providers = {
      claude: new ClaudeProvider('claude-3-5-sonnet-20241022'), // Sonnet for complex tasks
      'claude-haiku': new ClaudeProvider('claude-3-5-haiku-20241022'), // Haiku for simple tasks
      openai: new OpenAIProvider(),
      copilot: new GitHubCopilotProvider()
    };
    
    this.activeRequests = new Map();
    this.routingStats = {
      claude: 0,
      'claude-haiku': 0,
      openai: 0,
      copilot: 0
    };
  }

  /**
   * Process text command through the most appropriate AI provider
   */
  async processTextCommand(text, context) {
    const { sessionId, requestId, metadata = {} } = context;
    
    try {
      // Analyze request to determine best provider
      const provider = this.selectProvider(text, metadata);
      logger.info(`Routing text command to ${provider} for session ${sessionId}`);
      
      // Track active request
      this.activeRequests.set(requestId, {
        provider,
        sessionId,
        startTime: Date.now(),
        type: 'text'
      });
      
      // Process through selected provider
      const response = await this.providers[provider].processText(text, {
        ...context,
        provider
      });
      
      // Update stats
      this.routingStats[provider]++;
      
      // Clean up tracking
      this.activeRequests.delete(requestId);
      
      return {
        provider,
        response,
        confidence: response.confidence || 0.9,
        processingTimeMs: Date.now() - this.activeRequests.get(requestId)?.startTime || 0
      };
      
    } catch (error) {
      logger.error(`Failed to process text command: ${error.message}`);
      this.activeRequests.delete(requestId);
      throw error;
    }
  }

  /**
   * Process audio chunk through speech-to-text and then AI routing
   */
  async processAudioChunk(audioData, context) {
    const { sessionId, requestId, isLastChunk, audioFormat } = context;
    
    try {
      logger.info(`Processing audio chunk for session ${sessionId}, isLast: ${isLastChunk}`);
      
      // Track active request
      if (!this.activeRequests.has(requestId)) {
        this.activeRequests.set(requestId, {
          provider: 'speech-processing',
          sessionId,
          startTime: Date.now(),
          type: 'audio',
          chunks: []
        });
      }
      
      const request = this.activeRequests.get(requestId);
      request.chunks.push({
        data: audioData,
        timestamp: Date.now(),
        size: audioData.length
      });
      
      if (isLastChunk) {
        // Process complete audio through speech-to-text
        const transcription = await this.transcribeAudio(request.chunks, audioFormat);
        
        if (transcription.text) {
          // Route transcribed text through AI providers
          const aiResponse = await this.processTextCommand(transcription.text, {
            ...context,
            metadata: {
              ...context.metadata,
              source: 'audio',
              transcriptionConfidence: transcription.confidence
            }
          });
          
          this.activeRequests.delete(requestId);
          
          return {
            transcription,
            aiResponse,
            totalChunks: request.chunks.length,
            totalBytes: request.chunks.reduce((sum, chunk) => sum + chunk.size, 0)
          };
        }
      }
      
      return {
        status: 'processing',
        chunksReceived: request.chunks.length,
        bytesReceived: request.chunks.reduce((sum, chunk) => sum + chunk.size, 0)
      };
      
    } catch (error) {
      logger.error(`Failed to process audio chunk: ${error.message}`);
      this.activeRequests.delete(requestId);
      throw error;
    }
  }

  /**
   * Cancel an active request
   */
  async cancelRequest(sessionId, requestId) {
    if (this.activeRequests.has(requestId)) {
      const request = this.activeRequests.get(requestId);
      logger.info(`Cancelling request ${requestId} for session ${sessionId}`);
      
      // Cancel provider-specific processing if supported
      if (request.provider && this.providers[request.provider].cancelRequest) {
        await this.providers[request.provider].cancelRequest(requestId);
      }
      
      this.activeRequests.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * Get processing status for a request
   */
  async getProcessingStatus(requestId, sessionId) {
    const request = this.activeRequests.get(requestId);
    
    if (!request) {
      return {
        status: 'not_found',
        message: 'Request not found or completed'
      };
    }
    
    const processingTimeMs = Date.now() - request.startTime;
    
    return {
      status: 'processing',
      provider: request.provider,
      type: request.type,
      processingTimeMs,
      chunksReceived: request.chunks?.length || 0,
      sessionId: request.sessionId
    };
  }

  /**
   * Select the best AI provider based on request analysis
   */
  selectProvider(text, metadata = {}) {
    const textLower = text.toLowerCase();
    
    // Check for poker-specific routing preferences
    if (metadata.source === 'poker-coach') {
      return this.selectPokerProvider(textLower, metadata);
    }
    
    // Code-related queries → GitHub Copilot
    if (this.isCodeRelated(textLower)) {
      return 'copilot';
    }
    
    // Complex reasoning, analysis → Claude Sonnet
    if (this.isComplexReasoning(textLower)) {
      return 'claude';
    }
    
    // Simple queries, quick responses → Claude Haiku (faster/cheaper than GPT)
    if (this.isSimpleQuery(textLower)) {
      return 'claude-haiku';
    }
    
    // Default to Claude Sonnet for general queries
    return 'claude';
  }

  /**
   * Select provider specifically for poker coach requests
   */
  selectPokerProvider(text, metadata = {}) {
    // Hand analysis, strategy, complex poker decisions → Claude Sonnet
    if (this.isPokerAnalysis(text)) {
      return 'claude';
    }
    
    // Simple compliance checks, basic validation → Claude Haiku
    if (this.isPokerCompliance(text)) {
      return 'claude-haiku';
    }
    
    // Default to Sonnet for poker-related tasks
    return 'claude';
  }

  /**
   * Determine if query is code-related
   */
  isCodeRelated(text) {
    const codeKeywords = [
      'code', 'function', 'class', 'variable', 'bug', 'debug',
      'programming', 'algorithm', 'syntax', 'compile', 'error',
      'javascript', 'python', 'java', 'kotlin', 'react', 'node'
    ];
    
    return codeKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Determine if query requires complex reasoning
   */
  isComplexReasoning(text) {
    const complexKeywords = [
      'analyze', 'explain', 'compare', 'evaluate', 'strategy',
      'plan', 'architecture', 'design', 'research', 'complex'
    ];
    
    return complexKeywords.some(keyword => text.includes(keyword)) || text.length > 200;
  }

  /**
   * Determine if query is simple/quick
   */
  isSimpleQuery(text) {
    const simpleKeywords = [
      'what is', 'how to', 'define', 'quick', 'simple', 'basic'
    ];
    
    return simpleKeywords.some(keyword => text.includes(keyword)) && text.length < 100;
  }

  /**
   * Determine if query is poker analysis (complex)
   */
  isPokerAnalysis(text) {
    const analysisKeywords = [
      'analyze', 'analysis', 'strategy', 'decision', 'optimal', 'ev',
      'expected value', 'range', 'equity', 'pot odds', 'implied odds',
      'bluff', 'value bet', 'position', 'aggression', 'tight', 'loose'
    ];
    
    return analysisKeywords.some(keyword => text.includes(keyword)) || text.length > 150;
  }

  /**
   * Determine if query is poker compliance (simple)
   */
  isPokerCompliance(text) {
    const complianceKeywords = [
      'valid', 'check', 'verify', 'compliance', 'rule', 'legal',
      'format', 'structure', 'basic', 'simple'
    ];
    
    return complianceKeywords.some(keyword => text.includes(keyword)) && text.length < 100;
  }

  /**
   * Transcribe audio chunks to text
   */
  async transcribeAudio(chunks, audioFormat) {
    // Combine audio chunks
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    const combinedAudio = new Uint8Array(totalSize);
    
    let offset = 0;
    for (const chunk of chunks) {
      combinedAudio.set(new Uint8Array(chunk.data), offset);
      offset += chunk.size;
    }
    
    // Use OpenAI Whisper for transcription (most accurate for voice)
    try {
      const transcription = await this.providers.openai.transcribeAudio(
        combinedAudio, 
        audioFormat
      );
      
      return {
        text: transcription.text,
        confidence: transcription.confidence || 0.9,
        language: transcription.language || 'en'
      };
      
    } catch (error) {
      logger.error(`Audio transcription failed: ${error.message}`);
      throw new Error('Failed to transcribe audio');
    }
  }

  /**
   * Get routing statistics
   */
  getStats() {
    return {
      routingStats: { ...this.routingStats },
      activeRequests: this.activeRequests.size,
      totalRequests: Object.values(this.routingStats).reduce((sum, count) => sum + count, 0)
    };
  }
}
