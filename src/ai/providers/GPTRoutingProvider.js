import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';

/**
 * GPT-4o Mini as a routing decision maker
 * Uses the cheapest OpenAI model to make smart routing decisions
 */
export class GPTRoutingProvider {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = 'gpt-4o-mini';
  }

  /**
   * AI-driven routing decision using GPT-4o Mini
   */
  async makeRoutingDecision(query, userContext = {}) {
    const routingPrompt = `You are an AI routing system. Analyze this query and decide the optimal model:

Query: "${query}"
User Role: ${userContext.role || 'user'}
Cost Preference: ${userContext.costPreference || 'balanced'}

Available Models:
- LOCAL: Free Llama model (good for simple tasks, privacy-focused)
- GPT4_MINI: Cheap OpenAI model ($0.15/$0.60 per 1M tokens) - good balance
- CLAUDE_SONNET: Expensive Claude model ($3/$15 per 1M tokens) - best reasoning
- COPILOT: GitHub Copilot (code-specialized)

Routing Criteria:
1. Simple greetings, yes/no, basic questions → LOCAL or GPT4_MINI
2. Complex analysis, reasoning, strategy → CLAUDE_SONNET
3. Code, programming, debugging → COPILOT
4. Privacy-sensitive queries → LOCAL
5. Cost-conscious users → prefer LOCAL/GPT4_MINI

Examples:
- "hello" → LOCAL
- "how are you?" → GPT4_MINI  
- "analyze market trends" → CLAUDE_SONNET
- "debug this Python code" → COPILOT
- "personal financial advice" → LOCAL (privacy)

Respond with ONLY the routing decision: LOCAL, GPT4_MINI, CLAUDE_SONNET, or COPILOT`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: routingPrompt }],
        max_tokens: 10,
        temperature: 0.1 // Low temperature for consistent routing
      });

      const decision = response.choices[0].message.content.trim().toUpperCase();
      const validRoutes = ['LOCAL', 'GPT4_MINI', 'CLAUDE_SONNET', 'COPILOT'];
      
      if (validRoutes.includes(decision)) {
        logger.info(`GPT routing decision: ${query.substring(0, 50)}... → ${decision}`);
        return decision;
      }

      // Default to GPT4_MINI if unclear
      logger.warn(`Invalid routing decision: ${decision}, defaulting to GPT4_MINI`);
      return 'GPT4_MINI';

    } catch (error) {
      logger.error('GPT routing decision failed:', error);
      return 'GPT4_MINI'; // Safe fallback
    }
  }

  /**
   * Enhanced routing with context awareness
   */
  async makeContextAwareRoutingDecision(query, conversationHistory = [], userContext = {}) {
    // Build context from recent conversation
    const recentContext = conversationHistory
      .slice(-3) // Last 3 messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    const contextPrompt = `You are an AI routing system with conversation context.

Current Query: "${query}"
Recent Conversation:
${recentContext}

User Context:
- Role: ${userContext.role || 'user'}
- Cost Preference: ${userContext.costPreference || 'balanced'}
- Privacy Mode: ${userContext.privacyMode || false}

Routing Logic:
1. If privacy mode is ON → always LOCAL
2. If continuing complex discussion → maintain same model level
3. If switching topics → re-evaluate based on new query
4. Consider cost accumulation (prefer cheaper models when possible)

Available Models:
- LOCAL: Free, private, good for simple tasks
- GPT4_MINI: Cheap, balanced quality
- CLAUDE_SONNET: Expensive, best reasoning
- COPILOT: Code-specialized

Respond with ONLY: LOCAL, GPT4_MINI, CLAUDE_SONNET, or COPILOT`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: contextPrompt }],
        max_tokens: 10,
        temperature: 0.1
      });

      const decision = response.choices[0].message.content.trim().toUpperCase();
      const validRoutes = ['LOCAL', 'GPT4_MINI', 'CLAUDE_SONNET', 'COPILOT'];
      
      if (validRoutes.includes(decision)) {
        return decision;
      }

      return 'GPT4_MINI';

    } catch (error) {
      logger.error('Context-aware routing failed:', error);
      return 'GPT4_MINI';
    }
  }

  /**
   * Batch routing decisions for efficiency
   */
  async makeBatchRoutingDecisions(queries, userContext = {}) {
    const batchPrompt = `Route these queries to optimal models:

Queries:
${queries.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

User: ${userContext.role || 'user'} | Cost: ${userContext.costPreference || 'balanced'}

Models: LOCAL (free), GPT4_MINI (cheap), CLAUDE_SONNET (expensive), COPILOT (code)

Respond in format:
1. ROUTE_NAME
2. ROUTE_NAME
...`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: batchPrompt }],
        max_tokens: 50,
        temperature: 0.1
      });

      const decisions = response.choices[0].message.content
        .trim()
        .split('\n')
        .map(line => line.replace(/^\d+\.\s*/, '').trim().toUpperCase())
        .filter(decision => ['LOCAL', 'GPT4_MINI', 'CLAUDE_SONNET', 'COPILOT'].includes(decision));

      return decisions.length === queries.length ? decisions : queries.map(() => 'GPT4_MINI');

    } catch (error) {
      logger.error('Batch routing failed:', error);
      return queries.map(() => 'GPT4_MINI');
    }
  }
}
