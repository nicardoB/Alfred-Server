import { logger } from '../utils/logger.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { GitHubCopilotProvider } from './providers/GitHubCopilotProvider.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { getCostUsageModel } from '../models/CostUsage.js';

/**
 * Unified Smart AI Router - Intelligently routes requests to the best AI provider
 * Based on tool context, task complexity, user role, and cost constraints
 */
export class SmartAIRouter {
  constructor() {
    this.providers = {
      ollama: new OllamaProvider(), // Free local model - PRIMARY ROUTER
      claude: new ClaudeProvider(process.env.CLAUDE_API_KEY, 'claude-3-5-sonnet-20241022'), // Sonnet for complex tasks
      'claude-haiku': new ClaudeProvider(process.env.CLAUDE_API_KEY, 'claude-3-5-haiku-20241022'), // Haiku for simple tasks
      openai: new OpenAIProvider(),
      copilot: new GitHubCopilotProvider()
    };
    
    this.activeRequests = new Map();
    this.routingStats = {
      ollama: 0,
      claude: 0,
      'claude-haiku': 0,
      openai: 0,
      copilot: 0
    };

    // Tool-specific routing configurations
    this.toolConfigs = {
      chat: {
        defaultProvider: 'openai', // GPT-4o Mini as reliable default
        fallbackProvider: 'openai', // GPT-4o Mini as fallback
        costOptimizedProvider: 'ollama', // Ollama when available
        maxCostPerRequest: { owner: 1.0, family: 0.1, friend: 0.02, demo: 0.01 }
      },
      poker: {
        defaultProvider: 'claude', // Poker analysis requires sophisticated reasoning
        costOptimizedProvider: 'claude-haiku',
        maxCostPerRequest: { owner: 2.0, family: 0, friend: 0, demo: 0 } // Owner-only
      },
      code: {
        defaultProvider: 'copilot', // GitHub Copilot for code
        fallbackProvider: 'claude',
        maxCostPerRequest: { owner: 1.5, family: 0, friend: 0, demo: 0 } // Owner-only
      },
      voice: {
        defaultProvider: 'claude-haiku', // Fast responses for voice
        transcriptionProvider: 'openai', // Whisper for transcription
        maxCostPerRequest: { owner: 0.5, family: 0.05, friend: 0.01, demo: 0.005 }
      },
      french: {
        defaultProvider: 'claude', // Language learning needs good reasoning
        costOptimizedProvider: 'claude-haiku',
        maxCostPerRequest: { owner: 0.8, family: 0.1, friend: 0.02, demo: 0 }
      },
      workout: {
        defaultProvider: 'claude-haiku', // Simple coaching responses
        maxCostPerRequest: { owner: 0.3, family: 0.05, friend: 0.01, demo: 0 }
      }
    };
  }

  /**
   * Process text command through the most appropriate AI provider
   */
  async processTextCommand(text, context) {
    const { sessionId, requestId, metadata = {} } = context;
    
    try {
      // Analyze request to determine best provider
      const provider = await this.selectProvider(text, metadata);
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
   * Unified provider selection based on tool context, user role, and cost constraints
   */
  async selectProvider(text, metadata = {}) {
    const { toolContext = 'chat', user, estimatedCost = 0 } = metadata;
    const userRole = user?.role || 'demo';
    
    // Get tool configuration
    const toolConfig = this.toolConfigs[toolContext] || this.toolConfigs.chat;
    
    // Check if user has permission for this tool
    if (!this.hasToolPermission(userRole, toolContext)) {
      throw new Error(`User role '${userRole}' does not have access to '${toolContext}' tool`);
    }
    
    // Check cost constraints
    const maxCost = toolConfig.maxCostPerRequest[userRole] || 0;
    if (estimatedCost > maxCost) {
      logger.warn(`Request cost ${estimatedCost} exceeds limit ${maxCost} for ${userRole} in ${toolContext}`);
      // Use cost-optimized provider if available
      if (toolConfig.costOptimizedProvider) {
        return toolConfig.costOptimizedProvider;
      }
      throw new Error(`Request exceeds cost limit for ${userRole} role`);
    }
    
    // Route based on tool context
    return await this.routeByTool(toolContext, text, metadata);
  }

  /**
   * Route request based on specific tool context
   */
  async routeByTool(toolContext, text, metadata = {}) {
    const textLower = text.toLowerCase();
    const toolConfig = this.toolConfigs[toolContext];
    
    switch (toolContext) {
      case 'chat':
        return await this.routeChat(textLower, metadata, toolConfig);
      
      case 'poker':
        return this.routePoker(textLower, metadata, toolConfig);
      
      case 'code':
        return this.routeCode(textLower, metadata, toolConfig);
      
      case 'voice':
        return this.routeVoice(textLower, metadata, toolConfig);
      
      case 'french':
        return this.routeFrench(textLower, metadata, toolConfig);
      
      case 'workout':
        return this.routeWorkout(textLower, metadata, toolConfig);
      
      default:
        logger.warn(`Unknown tool context: ${toolContext}, using chat routing`);
        return await this.routeChat(textLower, metadata, this.toolConfigs.chat);
    }
  }

  /**
   * Chat tool routing - general conversation with free-first approach
   */
  async routeChat(text, metadata, config) {
    // Auto-detect code queries and route to code tool
    if (this.isCodeRelated(text)) {
      return this.routeCode(text, metadata, this.toolConfigs.code);
    }
    
    // Check if Ollama is available for free routing
    if (this.providers.ollama && await this.providers.ollama.isAvailable()) {
      // Use Ollama's smart routing decision
      const routingDecision = await this.providers.ollama.makeRoutingDecision(text, {
        role: metadata.user?.role || 'demo',
        costPreference: metadata.costPreference || 'free-first'
      });
      
      switch (routingDecision) {
        case 'LOCAL':
          return 'ollama'; // Handle locally for free
        case 'GPT4_MINI':
          return 'openai'; // Cheap fallback
        case 'CLAUDE_SONNET':
          return 'claude'; // Complex reasoning
        case 'COPILOT':
          return 'copilot'; // Code tasks
        default:
          return 'ollama'; // Default to free
      }
    }
    
    // Fallback to original logic if Ollama unavailable
    // Complex reasoning, analysis → Claude Sonnet
    if (this.isComplexReasoning(text)) {
      return 'claude';
    }
    
    // Simple queries, quick responses → GPT-4o Mini (cheapest paid)
    if (this.isSimpleQuery(text)) {
      return 'openai';
    }
    
    // Default to cheapest paid option
    return 'openai';
  }

  /**
   * Poker tool routing - hand analysis and strategy
   */
  routePoker(text, metadata, config) {
    // Simple compliance checks → Claude Haiku
    if (this.isPokerCompliance(text)) {
      return config.costOptimizedProvider;
    }
    
    // Complex analysis → Claude Sonnet
    if (this.isPokerAnalysis(text)) {
      return config.defaultProvider;
    }
    
    // Default to main provider for poker
    return config.defaultProvider;
  }

  /**
   * Code tool routing - programming assistance
   */
  routeCode(text, metadata, config) {
    // Always prefer GitHub Copilot for code
    if (this.providers.copilot && typeof this.providers.copilot.isAvailable === 'function' && this.providers.copilot.isAvailable()) {
      return 'copilot';
    }
    
    // Fallback to Claude for code analysis
    return 'claude';
  }

  /**
   * Voice tool routing - speech processing
   */
  routeVoice(text, metadata, config) {
    // Transcription always uses OpenAI Whisper
    if (metadata.isTranscription) {
      return config.transcriptionProvider;
    }
    
    // Voice responses need to be fast
    return config.defaultProvider; // claude-haiku
  }

  /**
   * French tutor routing - language learning
   */
  routeFrench(text, metadata, config) {
    // Complex grammar explanations → Claude Sonnet
    if (this.isComplexLanguageTask(text)) {
      return config.defaultProvider;
    }
    
    // Simple translations, corrections → Claude Haiku
    return config.costOptimizedProvider;
  }

  /**
   * Workout coach routing - fitness guidance
   */
  routeWorkout(text, metadata, config) {
    // Workout coaching is generally simple
    return config.defaultProvider; // claude-haiku
  }

  /**
   * Check if user role has permission for tool
   */
  hasToolPermission(userRole, toolContext) {
    const permissions = {
      owner: ['chat', 'poker', 'code', 'voice', 'french', 'workout'],
      family: ['chat', 'voice', 'french', 'workout'],
      friend: ['chat'],
      demo: ['chat']
    };
    
    return permissions[userRole]?.includes(toolContext) || false;
  }

  /**
   * Process streaming chat with unified tool context and cost tracking
   */
  async processStreamingChat(options) {
    const {
      conversationId,
      messageId,
      context,
      userMessage,
      user,
      onStream,
      onComplete,
      onError,
      isRegeneration = false
    } = options;

    try {
      // Determine tool context from conversation or default to chat
      const toolContext = context[0]?.metadata?.toolContext || 'chat';
      
      // Select appropriate provider
      const provider = this.selectProvider(userMessage || '', {
        toolContext,
        user,
        conversationContext: context
      });

      logger.info(`Streaming chat via ${provider} for user ${user.email} in ${toolContext} context`);

      // Track request start
      const startTime = Date.now();
      let totalTokens = 0;
      let streamedContent = '';

      // Process through selected provider with streaming
      await this.providers[provider].processStreamingChat({
        messages: context,
        onStream: (chunk) => {
          streamedContent += chunk;
          onStream(chunk);
        },
        onComplete: async (finalContent, metadata) => {
          const processingTime = Date.now() - startTime;
          totalTokens = metadata.tokenCount || 0;
          const cost = metadata.cost || 0;

          // Record cost usage
          await this.recordCostUsage({
            userId: user.id,
            toolContext,
            provider,
            model: metadata.model,
            conversationId,
            messageId,
            inputTokens: metadata.inputTokens || 0,
            outputTokens: metadata.outputTokens || 0,
            totalCost: cost,
            processingTime
          });

          // Update routing stats
          this.routingStats[provider]++;

          onComplete(finalContent, {
            ...metadata,
            provider,
            toolContext,
            processingTime
          });
        },
        onError: (error) => {
          logger.error(`Streaming chat error with ${provider}:`, error);
          onError(error);
        }
      });

    } catch (error) {
      logger.error('Smart AI Router streaming error:', error);
      onError(error);
    }
  }

  /**
   * Record cost usage in database with tool context
   */
  async recordCostUsage(usage) {
    try {
      const CostUsage = getCostUsageModel();
      
      await CostUsage.create({
        userId: usage.userId,
        toolContext: usage.toolContext,
        provider: usage.provider,
        model: usage.model,
        conversationId: usage.conversationId,
        messageId: usage.messageId,
        requests: 1,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalCost: usage.totalCost
      });

      logger.debug(`Recorded cost usage: ${usage.totalCost} for ${usage.provider} in ${usage.toolContext}`);
      
    } catch (error) {
      logger.error('Failed to record cost usage:', error);
      // Don't throw - cost tracking failure shouldn't break the chat
    }
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
   * Determine if query is complex language learning task
   */
  isComplexLanguageTask(text) {
    const complexLanguageKeywords = [
      'grammar', 'conjugation', 'subjunctive', 'explain why',
      'difference between', 'when to use', 'rule', 'exception'
    ];
    
    return complexLanguageKeywords.some(keyword => text.includes(keyword));
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
      'bluff', 'value bet', 'position', 'aggression', 'tight', 'loose',
      'opponent', 'betting line', 'review', 'calculate', 'postflop'
    ];
    
    return analysisKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Determine if query is poker-related at all
   */
  isPokerRelated(text) {
    const pokerKeywords = [
      'poker', 'hand', 'cards', 'bet', 'fold', 'call', 'raise', 'bluff',
      'gto', 'solver', 'equity', 'pot odds', 'preflop', 'flop', 'turn', 'river',
      'villain', 'hero', 'position', 'stack', 'tournament', 'cash game'
    ];
    
    return pokerKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Determine if query is poker compliance (simple)
   */
  isPokerCompliance(text) {
    const complianceKeywords = [
      'gto', 'compliance', 'check', 'verify', 'validate', 'framework',
      'solver', 'according to', 'is this', 'correct play', 'verification',
      'audit', 'recommendation'
    ];
    
    return complianceKeywords.some(keyword => text.includes(keyword));
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
