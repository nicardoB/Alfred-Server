import { logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Cost tracking system for AI provider usage
 * Tracks tokens, requests, and estimated costs per provider with persistent storage
 */
export class CostTracker {
  constructor() {
    this.dataFile = join(__dirname, '../../data/cost-tracking.json');
    this.usage = {
      claude: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        lastReset: new Date().toISOString()
      },
      openai: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        lastReset: new Date().toISOString()
      },
      copilot: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        lastReset: new Date().toISOString()
      }
    };

    // Load existing data on startup
    this.loadData();

    // Pricing per 1K tokens (as of 2024)
    this.pricing = {
      claude: {
        input: 0.003,   // $3 per 1M tokens
        output: 0.015   // $15 per 1M tokens
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
      }
    };
  }

  /**
   * Load cost data from persistent storage
   */
  async loadData() {
    try {
      // Ensure data directory exists
      const dataDir = dirname(this.dataFile);
      await fs.mkdir(dataDir, { recursive: true });

      // Try to load existing data
      const data = await fs.readFile(this.dataFile, 'utf8');
      const savedUsage = JSON.parse(data);
      
      // Merge saved data with defaults
      Object.keys(this.usage).forEach(provider => {
        if (savedUsage[provider]) {
          this.usage[provider] = { ...this.usage[provider], ...savedUsage[provider] };
        }
      });
      
      logger.info('Cost tracking data loaded from persistent storage');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('Failed to load cost tracking data:', error.message);
      }
      // File doesn't exist or is corrupted, start fresh
      await this.saveData();
    }
  }

  /**
   * Save cost data to persistent storage
   */
  async saveData() {
    try {
      const dataDir = dirname(this.dataFile);
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(this.dataFile, JSON.stringify(this.usage, null, 2));
    } catch (error) {
      logger.error('Failed to save cost tracking data:', error);
    }
  }

  /**
   * Track usage for a provider request
   */
  trackUsage(provider, inputTokens, outputTokens, model = null) {
    if (!this.usage[provider]) {
      logger.warn(`Unknown provider for cost tracking: ${provider}`);
      return;
    }

    const usage = this.usage[provider];
    usage.requests++;
    usage.inputTokens += inputTokens;
    usage.outputTokens += outputTokens;

    // Calculate cost based on provider and model
    const cost = this.calculateCost(provider, inputTokens, outputTokens, model);
    usage.totalCost += cost;

    logger.info(`Cost tracking - ${provider}: +$${cost.toFixed(4)} (Total: $${usage.totalCost.toFixed(4)})`);
    
    // Save to persistent storage after each update
    this.saveData().catch(err => logger.error('Failed to persist cost data:', err));
  }

  /**
   * Calculate cost for a specific request
   */
  calculateCost(provider, inputTokens, outputTokens, model = null) {
    let pricing;

    switch (provider) {
      case 'claude':
        pricing = this.pricing.claude;
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
  getUsageStats() {
    const totalCost = Object.values(this.usage).reduce((sum, provider) => sum + provider.totalCost, 0);
    const totalRequests = Object.values(this.usage).reduce((sum, provider) => sum + provider.requests, 0);

    return {
      summary: {
        totalCost: parseFloat(totalCost.toFixed(4)),
        totalRequests,
        currency: 'USD'
      },
      providers: {
        claude: {
          ...this.usage.claude,
          totalCost: parseFloat(this.usage.claude.totalCost.toFixed(4)),
          avgCostPerRequest: this.usage.claude.requests > 0 
            ? parseFloat((this.usage.claude.totalCost / this.usage.claude.requests).toFixed(4))
            : 0
        },
        openai: {
          ...this.usage.openai,
          totalCost: parseFloat(this.usage.openai.totalCost.toFixed(4)),
          avgCostPerRequest: this.usage.openai.requests > 0 
            ? parseFloat((this.usage.openai.totalCost / this.usage.openai.requests).toFixed(4))
            : 0
        },
        copilot: {
          ...this.usage.copilot,
          totalCost: parseFloat(this.usage.copilot.totalCost.toFixed(4)),
          avgCostPerRequest: this.usage.copilot.requests > 0 
            ? parseFloat((this.usage.copilot.totalCost / this.usage.copilot.requests).toFixed(4))
            : 0
        }
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset usage statistics
   */
  async resetUsage(provider = null) {
    const resetData = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      lastReset: new Date().toISOString()
    };

    if (provider && this.usage[provider]) {
      this.usage[provider] = { ...resetData };
      logger.info(`Cost tracking reset for ${provider}`);
    } else {
      // Reset all providers
      Object.keys(this.usage).forEach(key => {
        this.usage[key] = { ...resetData };
      });
      logger.info('Cost tracking reset for all providers');
    }

    // Save reset data to persistent storage
    await this.saveData();
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
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }
}

// Singleton instance
export const costTracker = new CostTracker();
