import { logger } from '../utils/logger.js';
import { getCostUsageModel, initializeCostUsageModel } from '../models/CostUsage.js';
import { Op } from 'sequelize';

/**
 * Cost tracking system for AI provider usage
 * Tracks tokens, requests, and estimated costs per provider with persistent storage
 */
export class CostTracker {
  constructor() {
    this.isInitialized = false;
    this.initializeDatabase();

    // Pricing per 1K tokens (as of 2024)
    this.pricing = {
      claude: {
        'claude-3-5-sonnet-20241022': {
          input: 0.003,   // $3 per 1M tokens
          output: 0.015   // $15 per 1M tokens
        },
        'claude-3-5-haiku-20241022': {
          input: 0.00025, // $0.25 per 1M tokens
          output: 0.00125 // $1.25 per 1M tokens
        }
      },
      openai: {
        'gpt-4o-mini': {
          input: 0.00015,  // $0.15 per 1M tokens
          output: 0.0006   // $0.60 per 1M tokens
        },
        'gpt-4o': {
          input: 0.0025,   // $2.50 per 1M tokens
          output: 0.01     // $10 per 1M tokens
        }
      },
      copilot: {
        input: 0.002,    // Estimated based on GitHub pricing
        output: 0.008
      },
      ollama: {
        input: 0.0,      // Free local model
        output: 0.0
      }
    };
  }

  /**
   * Initialize database connection and models
   */
  async initializeDatabase() {
    try {
      await initializeCostUsageModel();
      this.isInitialized = true;
      logger.info('Cost tracking database initialized');
    } catch (error) {
      logger.error('Failed to initialize cost tracking database:', error);
    }
  }

  /**
   * Ensure database is initialized
   */
  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initializeDatabase();
    }
  }

  /**
   * Track usage for a provider request
   */
  async trackUsage(provider, inputTokens, outputTokens, model = null, source = 'general') {
    await this.ensureInitialized();
    
    if (!['claude', 'claude-haiku', 'openai', 'copilot'].includes(provider)) {
      logger.warn(`Unknown provider for cost tracking: ${provider}`);
      return;
    }

    try {
      const CostUsage = getCostUsageModel();
      
      // Create unique tracking key for provider + source combination
      const trackingKey = source === 'poker-coach' ? `${provider}-poker` : provider;
      
      // Get or create provider record
      let [usage] = await CostUsage.findOrCreate({
        where: { provider: trackingKey },
        defaults: {
          provider: trackingKey,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0,
          model,
          lastReset: new Date()
        }
      });

      // Calculate cost based on provider and model
      const cost = this.calculateCost(provider, inputTokens, outputTokens, model);
      
      // Update usage
      await usage.update({
        requests: usage.requests + 1,
        inputTokens: usage.inputTokens + inputTokens,
        outputTokens: usage.outputTokens + outputTokens,
        totalCost: parseFloat(usage.totalCost) + cost,
        model: model || usage.model
      });

      logger.info(`Cost tracking - ${trackingKey}: +$${cost.toFixed(4)} (Total: $${usage.totalCost.toFixed(4)})`);
    } catch (error) {
      logger.error('Failed to track usage:', error);
    }
  }

  /**
   * Calculate cost for a specific request
   */
  calculateCost(provider, inputTokens, outputTokens, model = null) {
    let pricing;

    // Handle poker-specific provider keys
    const baseProvider = provider.replace('-poker', '');

    switch (baseProvider) {
      case 'claude':
      case 'claude-haiku':
        const claudeModel = model || (baseProvider === 'claude-haiku' ? 'claude-3-5-haiku-20241022' : 'claude-3-5-sonnet-20241022');
        pricing = this.pricing.claude[claudeModel] || this.pricing.claude['claude-3-5-sonnet-20241022'];
        break;
      case 'openai':
        const modelKey = model || 'gpt-4o-mini';
        pricing = this.pricing.openai[modelKey] || this.pricing.openai['gpt-4o-mini'];
        break;
      case 'copilot':
        pricing = this.pricing.copilot;
        break;
      default:
        return 0;
    }

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Get current usage statistics
   */
  async getUsageStats() {
    await this.ensureInitialized();
    
    try {
      const CostUsage = getCostUsageModel();
      const allUsage = await CostUsage.findAll();
      
      const providers = {};
      let totalCost = 0;
      let totalRequests = 0;
      
      // Initialize default providers
      ['claude', 'openai', 'copilot'].forEach(provider => {
        providers[provider] = {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0,
          lastReset: new Date().toISOString(),
          avgCostPerRequest: 0
        };
      });
      
      // Populate with actual data and calculate totals
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      
      allUsage.forEach(usage => {
        const cost = parseFloat(usage.totalCost);
        const inputTokens = usage.inputTokens || 0;
        const outputTokens = usage.outputTokens || 0;
        const totalTokens = inputTokens + outputTokens;
        
        providers[usage.provider] = {
          requests: usage.requests,
          inputTokens,
          outputTokens,
          totalTokens,
          totalCost: parseFloat(cost.toFixed(4)),
          lastReset: usage.lastReset.toISOString(),
          avgCostPerRequest: usage.requests > 0 
            ? parseFloat((cost / usage.requests).toFixed(4))
            : 0,
          avgCostPerToken: totalTokens > 0 
            ? parseFloat((cost / totalTokens).toFixed(8))
            : 0,
          avgTokensPerRequest: usage.requests > 0 
            ? Math.round(totalTokens / usage.requests)
            : 0
        };
        
        totalCost += cost;
        totalRequests += usage.requests;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
      });

      const totalTokens = totalInputTokens + totalOutputTokens;
      
      return {
        summary: {
          totalCost: parseFloat(totalCost.toFixed(4)),
          totalRequests,
          totalInputTokens,
          totalOutputTokens,
          totalTokens,
          avgCostPerToken: totalTokens > 0 
            ? parseFloat((totalCost / totalTokens).toFixed(8))
            : 0,
          avgTokensPerRequest: totalRequests > 0 
            ? Math.round(totalTokens / totalRequests)
            : 0,
          currency: 'USD'
        },
        providers,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get usage stats:', error);
      return {
        summary: { 
          totalCost: 0, 
          totalRequests: 0, 
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          avgCostPerToken: 0,
          avgTokensPerRequest: 0,
          currency: 'USD' 
        },
        providers: {
          claude: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0, lastReset: new Date().toISOString(), avgCostPerRequest: 0, avgCostPerToken: 0, avgTokensPerRequest: 0 },
          openai: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0, lastReset: new Date().toISOString(), avgCostPerRequest: 0, avgCostPerToken: 0, avgTokensPerRequest: 0 },
          copilot: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0, lastReset: new Date().toISOString(), avgCostPerRequest: 0, avgCostPerToken: 0, avgTokensPerRequest: 0 }
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Reset usage statistics
   */
  async resetUsage(provider = null) {
    await this.ensureInitialized();
    
    try {
      const CostUsage = getCostUsageModel();
      
      if (provider) {
        await CostUsage.update({
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0,
          lastReset: new Date()
        }, {
          where: { provider }
        });
        logger.info(`Cost tracking reset for ${provider}`);
      } else {
        await CostUsage.update({
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0,
          lastReset: new Date()
        }, {
          where: {}
        });
        logger.info('Cost tracking reset for all providers');
      }
    } catch (error) {
      logger.error('Failed to reset usage:', error);
    }
  }

  /**
   * Get cost projection based on current usage
   */
  getCostProjection(days = 30) {
    const stats = this.getUsageStats();
    const dailyAverage = stats.summary.totalCost; // Assuming current usage is daily
    
    return {
      daily: parseFloat(dailyAverage.toFixed(4)),
      weekly: parseFloat((dailyAverage * 7).toFixed(4)),
      monthly: parseFloat((dailyAverage * days).toFixed(4)),
      currency: 'USD'
    };
  }

  /**
   * Estimate tokens from text (rough approximation)
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }
}

// Singleton instance
export const costTracker = new CostTracker();
