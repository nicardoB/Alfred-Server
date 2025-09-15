/**
 * AI Provider Enums for type-safe provider selection
 */

export const PROVIDERS = {
  CLAUDE: 'claude',
  CLAUDE_HAIKU: 'claude-haiku',
  OPENAI: 'openai',
  COPILOT: 'copilot',
  OLLAMA: 'ollama',
  GPT_ROUTING: 'gpt-routing'
};

export const TOOL_CONTEXTS = {
  CHAT: 'chat',
  POKER: 'poker',
  CODE: 'code',
  VOICE: 'voice',
  FRENCH: 'french',
  WORKOUT: 'workout'
};

export const AI_DECISIONS = {
  LOCAL: 'LOCAL',
  GPT4_MINI: 'GPT4_MINI',
  CLAUDE_SONNET: 'CLAUDE_SONNET',
  CLAUDE_HAIKU: 'CLAUDE_HAIKU',
  COPILOT: 'COPILOT'
};

export const USER_ROLES = {
  OWNER: 'owner',
  FAMILY: 'family',
  FRIEND: 'friend',
  DEMO: 'demo'
};

// Provider capabilities mapping
export const PROVIDER_CAPABILITIES = {
  [PROVIDERS.CLAUDE]: {
    reasoning: 'excellent',
    coding: 'good',
    speed: 'medium',
    cost: 'high'
  },
  [PROVIDERS.CLAUDE_HAIKU]: {
    reasoning: 'good',
    coding: 'fair',
    speed: 'fast',
    cost: 'low'
  },
  [PROVIDERS.OPENAI]: {
    reasoning: 'excellent',
    coding: 'excellent',
    speed: 'medium',
    cost: 'medium',
    transcription: true
  },
  [PROVIDERS.COPILOT]: {
    reasoning: 'good',
    coding: 'excellent',
    speed: 'fast',
    cost: 'medium'
  },
  [PROVIDERS.OLLAMA]: {
    reasoning: 'fair',
    coding: 'fair',
    speed: 'fast',
    cost: 'free',
    local: true
  }
};

// Tool context default configurations
export const TOOL_DEFAULTS = {
  [TOOL_CONTEXTS.CHAT]: {
    defaultProvider: PROVIDERS.CLAUDE,
    costOptimizedProvider: PROVIDERS.OPENAI
  },
  [TOOL_CONTEXTS.POKER]: {
    defaultProvider: PROVIDERS.CLAUDE,
    costOptimizedProvider: PROVIDERS.CLAUDE_HAIKU
  },
  [TOOL_CONTEXTS.CODE]: {
    defaultProvider: PROVIDERS.COPILOT,
    fallbackProvider: PROVIDERS.CLAUDE
  },
  [TOOL_CONTEXTS.VOICE]: {
    defaultProvider: PROVIDERS.CLAUDE_HAIKU,
    transcriptionProvider: PROVIDERS.OPENAI
  },
  [TOOL_CONTEXTS.FRENCH]: {
    defaultProvider: PROVIDERS.CLAUDE,
    costOptimizedProvider: PROVIDERS.CLAUDE_HAIKU
  },
  [TOOL_CONTEXTS.WORKOUT]: {
    defaultProvider: PROVIDERS.CLAUDE_HAIKU
  }
};

// Validation helpers
export const isValidProvider = (provider) => {
  return Object.values(PROVIDERS).includes(provider);
};

export const isValidToolContext = (context) => {
  return Object.values(TOOL_CONTEXTS).includes(context);
};

export const isValidUserRole = (role) => {
  return Object.values(USER_ROLES).includes(role);
};

// Provider mapping for AI routing decisions
export const AI_DECISION_TO_PROVIDER = {
  [AI_DECISIONS.LOCAL]: PROVIDERS.OLLAMA,
  [AI_DECISIONS.GPT4_MINI]: PROVIDERS.OPENAI,
  [AI_DECISIONS.CLAUDE_SONNET]: PROVIDERS.CLAUDE,
  [AI_DECISIONS.CLAUDE_HAIKU]: PROVIDERS.CLAUDE_HAIKU,
  [AI_DECISIONS.COPILOT]: PROVIDERS.COPILOT
};
