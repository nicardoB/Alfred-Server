import { logger } from '../utils/logger.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { GitHubCopilotProvider } from './providers/GitHubCopilotProvider.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { GPTRoutingProvider } from './providers/GPTRoutingProvider.js';
import { getCostUsageModel } from '../models/CostUsage.js';
import { costTracker } from '../monitoring/CostTracker.js';
import { 
  PROVIDERS, 
  TOOL_CONTEXTS, 
  AI_DECISIONS, 
  USER_ROLES,
  TOOL_DEFAULTS,
  AI_DECISION_TO_PROVIDER,
  isValidProvider,
  isValidToolContext,
  isValidUserRole
} from './enums.js';

/**
 * Unified Smart AI Router - Intelligently routes requests to the best AI provider
 * Based on tool context, task complexity, user role, and cost constraints
 */
export class SmartAIRouter {
  constructor(providers = null, costUsage = null) {
    this.providers = providers || {
      ...(process.env.OLLAMA_ENABLED !== 'false' ? { [PROVIDERS.OLLAMA]: new OllamaProvider() } : {}),
      [PROVIDERS.CLAUDE]: new ClaudeProvider(),
      [PROVIDERS.OPENAI]: new OpenAIProvider(),
      [PROVIDERS.COPILOT]: new GitHubCopilotProvider(),
      [PROVIDERS.CLAUDE_HAIKU]: new ClaudeProvider('claude-3-haiku-20240307')
    };
    
    // AI-driven routing providers
    this.routingProviders = {
      gpt: new GPTRoutingProvider(), // GPT-4o Mini for smart routing decisions
      ...(this.providers[PROVIDERS.OLLAMA] ? { ollama: this.providers[PROVIDERS.OLLAMA] } : {})
    };

    this.activeRequests = new Map();
    this.routingStats = {
      [PROVIDERS.CLAUDE]: 0,
      [PROVIDERS.CLAUDE_HAIKU]: 0,
      [PROVIDERS.OPENAI]: 0,
      [PROVIDERS.COPILOT]: 0,
      [PROVIDERS.OLLAMA]: 0
    };

    // Tool-specific routing configurations
    this.toolConfigs = {
      [TOOL_CONTEXTS.CHAT]: {
        defaultProvider: PROVIDERS.CLAUDE,
        costOptimizedProvider: PROVIDERS.OPENAI, // GPT-4o Mini is cost-effective
        maxCostPerRequest: { [USER_ROLES.OWNER]: 1.0, [USER_ROLES.FAMILY]: 0.2, [USER_ROLES.FRIEND]: 0.05, [USER_ROLES.DEMO]: 0 }
      },
      [TOOL_CONTEXTS.POKER]: {
        defaultProvider: PROVIDERS.CLAUDE, // Best for poker analysis
        costOptimizedProvider: PROVIDERS.CLAUDE_HAIKU,
        maxCostPerRequest: { [USER_ROLES.OWNER]: 0.5, [USER_ROLES.FAMILY]: 0.1, [USER_ROLES.FRIEND]: 0.02, [USER_ROLES.DEMO]: 0 }
      },
      [TOOL_CONTEXTS.CODE]: {
        defaultProvider: PROVIDERS.COPILOT, // GitHub Copilot excels at code
        fallbackProvider: PROVIDERS.CLAUDE,
        maxCostPerRequest: { [USER_ROLES.OWNER]: 0.8, [USER_ROLES.FAMILY]: 0.15, [USER_ROLES.FRIEND]: 0.03, [USER_ROLES.DEMO]: 0 }
      },
      [TOOL_CONTEXTS.VOICE]: {
        defaultProvider: PROVIDERS.CLAUDE_HAIKU, // Fast responses for voice
        transcriptionProvider: PROVIDERS.OPENAI, // Whisper for transcription
        maxCostPerRequest: { [USER_ROLES.OWNER]: 0.3, [USER_ROLES.FAMILY]: 0.05, [USER_ROLES.FRIEND]: 0.01, [USER_ROLES.DEMO]: 0 }
      },
      [TOOL_CONTEXTS.FRENCH]: {
        defaultProvider: PROVIDERS.CLAUDE, // Language learning needs good reasoning
        costOptimizedProvider: PROVIDERS.CLAUDE_HAIKU,
        maxCostPerRequest: { [USER_ROLES.OWNER]: 0.8, [USER_ROLES.FAMILY]: 0.1, [USER_ROLES.FRIEND]: 0.02, [USER_ROLES.DEMO]: 0 }
      },
      [TOOL_CONTEXTS.WORKOUT]: {
        defaultProvider: PROVIDERS.CLAUDE_HAIKU, // Simple coaching responses
        maxCostPerRequest: { [USER_ROLES.OWNER]: 0.3, [USER_ROLES.FAMILY]: 0.05, [USER_ROLES.FRIEND]: 0.01, [USER_ROLES.DEMO]: 0 }
      }
    };
  }

  /**
   * Process text command through the most appropriate AI provider
   */
  async processTextCommand(text, context) {
    const { sessionId, requestId, metadata = {} } = context;
    
    // Define fallback chain based on query type and available providers
    const getFallbackChain = (primaryProvider) => {
      const chains = {
        // Code queries: Copilot → OpenAI → Ollama
        [PROVIDERS.COPILOT]: [PROVIDERS.COPILOT, PROVIDERS.OPENAI, PROVIDERS.OLLAMA],
        
        // Complex reasoning: Claude → OpenAI → Ollama  
        [PROVIDERS.CLAUDE]: [PROVIDERS.CLAUDE, PROVIDERS.OPENAI, PROVIDERS.OLLAMA],
        
        // Fast queries: Haiku → OpenAI → Ollama
        [PROVIDERS.CLAUDE_HAIKU]: [PROVIDERS.CLAUDE_HAIKU, PROVIDERS.OPENAI, PROVIDERS.OLLAMA],
        
        // OpenAI queries: OpenAI → Ollama
        [PROVIDERS.OPENAI]: [PROVIDERS.OPENAI, PROVIDERS.OLLAMA],
        
        // Ollama queries: Ollama only (already local)
        [PROVIDERS.OLLAMA]: [PROVIDERS.OLLAMA]
      };
      
      return chains[primaryProvider] || [primaryProvider, PROVIDERS.OPENAI, PROVIDERS.OLLAMA];
    };
    
    try {
      // Analyze request to determine best provider
      const primaryProvider = await this.selectProvider(text, metadata);
      const fallbackChain = getFallbackChain(primaryProvider);
      
      logger.info(`Primary provider: ${primaryProvider}, fallback chain: ${fallbackChain.join(' → ')}`);
      
      let lastError = null;
      let usedProvider = null;
      let response = null;
      
      // Try each provider in the fallback chain
      for (const provider of fallbackChain) {
        // Skip if provider doesn't exist
        if (!this.providers[provider]) {
          logger.warn(`Provider ${provider} not available, skipping`);
          continue;
        }
        
        try {
          logger.info(`Attempting ${provider} for session ${sessionId}`);
          
          // Track active request
          this.activeRequests.set(requestId, {
            provider,
            sessionId,
            startTime: Date.now(),
            type: 'text'
          });
          
          // Process through current provider
          response = await this.providers[provider].processText(text, {
            ...context,
            provider
          });
          
          usedProvider = provider;
          logger.info(`Successfully processed with ${provider}`);
          break;
          
        } catch (providerError) {
          logger.warn(`Provider ${provider} failed: ${providerError.message}`);
          lastError = providerError;
          
          // If this wasn't the primary choice, log the fallback
          if (provider !== primaryProvider) {
            logger.info(`Fell back from ${primaryProvider} to ${provider} due to: ${providerError.message}`);
          }
          
          continue;
        }
      }
      
      // If all providers failed, throw the last error
      if (!response || !usedProvider) {
        logger.error(`All providers in chain failed. Last error: ${lastError?.message}`);
        throw lastError || new Error('All AI providers unavailable');
      }
      
      // Track usage for cost monitoring
      try {
        logger.info(`DEBUG: Provider ${usedProvider} response has usage:`, !!response.usage);
        logger.info(`DEBUG: Response keys:`, Object.keys(response));
        if (response.usage) {
          const { inputTokens = 0, outputTokens = 0 } = response.usage;
          logger.info(`DEBUG: Tracking usage for ${usedProvider}: ${inputTokens} input, ${outputTokens} output tokens, userId: ${metadata.userId}`);
          
          const trackingResult = await costTracker.trackUsage({
            provider: usedProvider,
            inputTokens,
            outputTokens,
            userId: metadata.userId,
            toolContext: metadata.toolContext || 'chat',
            conversationId: metadata.conversationId,
            sessionId
          });
          
          logger.info(`DEBUG: CostTracker result:`, trackingResult);
          logger.info(`Cost tracked for ${usedProvider}: ${inputTokens} input, ${outputTokens} output tokens`);
        } else {
          logger.warn(`No usage data returned from ${usedProvider} for cost tracking. Response keys: ${Object.keys(response)}`);
        }
      } catch (costError) {
        logger.error(`Failed to track cost for ${usedProvider}:`, costError);
        logger.error(`Cost error stack:`, costError.stack);
        // Don't fail the request if cost tracking fails
      }
      
      // Update stats
      this.routingStats[usedProvider]++;
      
      // Clean up tracking
      this.activeRequests.delete(requestId);
      
      return {
        provider: usedProvider,
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
    const { toolContext = TOOL_CONTEXTS.CHAT, user, estimatedCost = 0 } = metadata;
    const userRole = user?.role || USER_ROLES.DEMO;
    
    // Validate inputs
    if (!isValidToolContext(toolContext)) {
      logger.warn(`Invalid tool context: ${toolContext}, defaulting to chat`);
    }
    if (!isValidUserRole(userRole)) {
      logger.warn(`Invalid user role: ${userRole}, defaulting to demo`);
    }
    
    // Get tool configuration
    const toolConfig = this.toolConfigs[toolContext] || this.toolConfigs[TOOL_CONTEXTS.CHAT];
    
    // Check if user has permission for this tool
    if (!this.hasToolPermission(userRole, toolContext)) {
      throw new Error(`User role '${userRole}' does not have access to '${toolContext}' tool`);
    }
    
    // Check cost constraints
    const maxCost = toolConfig.maxCostPerRequest[userRole] || 0;
    if (estimatedCost > maxCost) {
      logger.warn(`Request cost ${estimatedCost} exceeds limit ${maxCost} for ${userRole} in ${toolContext}`);
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
    const toolConfig = this.toolConfigs[toolContext] || this.toolConfigs[TOOL_CONTEXTS.CHAT];
    
    switch (toolContext) {
      case TOOL_CONTEXTS.CHAT:
        return await this.routeChat(textLower, metadata, toolConfig);
      
      case TOOL_CONTEXTS.POKER:
        return this.routePoker(textLower, metadata, toolConfig);
      
      case TOOL_CONTEXTS.CODE:
        return this.routeCode(textLower, metadata, toolConfig);
      
      case TOOL_CONTEXTS.VOICE:
        return this.routeVoice(textLower, metadata, toolConfig);
      
      case TOOL_CONTEXTS.FRENCH:
        return this.routeFrench(textLower, metadata, toolConfig);
      
      case TOOL_CONTEXTS.WORKOUT:
        return this.routeWorkout(textLower, metadata, toolConfig);
      
      default:
        logger.warn(`Unknown tool context: ${toolContext}, defaulting to chat`);
        return await this.routeChat(textLower, metadata, this.toolConfigs[TOOL_CONTEXTS.CHAT]);
    }
  }

  /**
   * Chat tool routing - AI-driven routing with intelligent provider selection
   */
  async routeChat(text, metadata, config) {
    const chatConfig = this.toolConfigs[TOOL_CONTEXTS.CHAT];
    
    // Use AI routing to decide best provider (OLLAMA can route to itself if suitable)
    const aiRoutingDecision = await this.getAIRoutingDecision(text, metadata);
    if (aiRoutingDecision) {
      return await this.executeWithFallback(aiRoutingDecision, metadata);
    }
    
    // Final fallback: cost-optimized provider
    return await this.executeWithFallback(chatConfig.costOptimizedProvider, metadata);
  }


  /**
   * Execute provider selection with fallback chain
   */
  async executeWithFallback(primaryProvider, metadata = {}) {
    const fallbackChains = {
      [PROVIDERS.COPILOT]: [PROVIDERS.CLAUDE, PROVIDERS.OPENAI],
      [PROVIDERS.CLAUDE]: [PROVIDERS.OPENAI, PROVIDERS.CLAUDE_HAIKU],
      [PROVIDERS.OLLAMA]: [PROVIDERS.OPENAI, PROVIDERS.CLAUDE_HAIKU],
      [PROVIDERS.OPENAI]: [PROVIDERS.CLAUDE_HAIKU],
      [PROVIDERS.CLAUDE_HAIKU]: [PROVIDERS.OPENAI]
    };

    // Try primary provider first
    if (await this.isProviderAvailable(primaryProvider)) {
      return primaryProvider;
    }

    // Try fallback chain
    const fallbacks = fallbackChains[primaryProvider] || [PROVIDERS.OPENAI];
    for (const fallbackProvider of fallbacks) {
      if (await this.isProviderAvailable(fallbackProvider)) {
        // Log fallback usage for user notification
        this.logFallbackUsage(primaryProvider, fallbackProvider, metadata);
        return fallbackProvider;
      }
    }

    // If all providers fail, throw error
    throw new Error(`No available providers. Primary: ${primaryProvider}, Fallbacks: ${fallbacks.join(', ')}`);
  }

  /**
   * Check if provider is available
   */
  async isProviderAvailable(provider) {
    try {
      const providerInstance = this.providers[provider];
      if (!providerInstance) {
        return false;
      }
      
      // Check if provider has isAvailable method
      if (typeof providerInstance.isAvailable === 'function') {
        return await providerInstance.isAvailable();
      }
      
      // If no availability check, assume available
      return true;
    } catch (error) {
      logger.warn(`Provider availability check failed for ${provider}:`, error.message);
      return false;
    }
  }

  /**
   * Log fallback usage for user notifications
   */
  logFallbackUsage(primaryProvider, fallbackProvider, metadata) {
    const sessionId = metadata.sessionId || 'unknown';
    logger.info(`Provider fallback: ${primaryProvider} → ${fallbackProvider} for session ${sessionId}`);
    
    // Store fallback info for potential UI notification
    if (metadata.onFallback && typeof metadata.onFallback === 'function') {
      metadata.onFallback({
        primary: primaryProvider,
        fallback: fallbackProvider,
        message: '✨ Using alternative model for best response'
      });
    }
  }

  /**
   * AI-driven routing decision with multiple fallback options
   */
  async getAIRoutingDecision(text, metadata = {}) {
    const userContext = {
      role: metadata.user?.role || 'demo',
      costPreference: metadata.costPreference || 'balanced',
      privacyMode: metadata.privacyMode || false
    };

    // Try Ollama first (free routing)
    if (this.providers[PROVIDERS.OLLAMA] && await this.providers[PROVIDERS.OLLAMA].isAvailable()) {
      try {
        const decision = await this.providers[PROVIDERS.OLLAMA].makeRoutingDecision(text, userContext);
        return this.mapRoutingDecision(decision);
      } catch (error) {
        logger.warn('Ollama routing failed:', error);
      }
    }

    // Try GPT-4o Mini routing (cheap but reliable)
    try {
      const decision = await this.routingProviders.gpt.makeRoutingDecision(text, userContext);
      return this.mapRoutingDecision(decision);
    } catch (error) {
      logger.warn('GPT routing failed:', error);
    }

    // No AI routing available
    return null;
  }

  /**
   * Map AI routing decisions to provider names
   */
  mapRoutingDecision(decision) {
    const provider = AI_DECISION_TO_PROVIDER[decision];
    if (!provider) {
      logger.warn(`Unknown AI decision: ${decision}, defaulting to OpenAI`);
      return PROVIDERS.OPENAI;
    }
    return provider;
  }

  /**
   * Poker tool routing - defaults to Claude for poker analysis
   */
  routePoker(text, metadata, config) {
    // Default to Claude Sonnet for poker analysis
    return config.defaultProvider;
  }

  /**
   * Code tool routing - programming assistance
   */
  routeCode(text, metadata, config) {
    // Always prefer GitHub Copilot for code
    if (this.providers[PROVIDERS.COPILOT] && typeof this.providers[PROVIDERS.COPILOT].isAvailable === 'function' && this.providers[PROVIDERS.COPILOT].isAvailable()) {
      return PROVIDERS.COPILOT;
    }
    
    // Fallback to Claude for code analysis
    return PROVIDERS.CLAUDE;
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
   * French tool routing - language learning assistance
   */
  routeFrench(text, metadata, config) {
    // Default to Claude Sonnet for French language tasks
    return config.defaultProvider;
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
      [USER_ROLES.OWNER]: [TOOL_CONTEXTS.CHAT, TOOL_CONTEXTS.POKER, TOOL_CONTEXTS.CODE, TOOL_CONTEXTS.VOICE, TOOL_CONTEXTS.FRENCH, TOOL_CONTEXTS.WORKOUT],
      [USER_ROLES.FAMILY]: [TOOL_CONTEXTS.CHAT, TOOL_CONTEXTS.VOICE, TOOL_CONTEXTS.FRENCH, TOOL_CONTEXTS.WORKOUT],
      [USER_ROLES.FRIEND]: [TOOL_CONTEXTS.CHAT],
      [USER_ROLES.DEMO]: [TOOL_CONTEXTS.CHAT] // Allow demo users basic chat access
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
