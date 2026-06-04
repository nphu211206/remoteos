/**
 * AI Provider Types — Multi-provider support for RemoteOS
 *
 * Allows users to bring their own AI (OpenAI, Claude, Gemini, Local LLM)
 * instead of being locked into a single provider.
 */

// ─── Provider Types ───────────────────────────────────────────────

/** Supported AI providers */
export type AIProviderType = 'gemini' | 'openai' | 'anthropic' | 'local';

/** User's AI configuration (stored in DB) */
export interface UserAIConfig {
  id: string;
  userId: string;
  provider: AIProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Provider capabilities */
export interface AIProviderCapabilities {
  maxTokens: number;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
}

/** Provider configuration */
export interface AIProviderConfig {
  provider: AIProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

// ─── Default Models ───────────────────────────────────────────────

export const AI_PROVIDER_DEFAULTS: Record<AIProviderType, {
  models: string[];
  defaultModel: string;
  baseUrl: string;
  capabilities: AIProviderCapabilities;
}> = {
  gemini: {
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.1-flash-lite'],
    defaultModel: 'gemini-3.1-flash-lite',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    capabilities: { maxTokens: 8192, supportsFunctionCalling: true, supportsStreaming: true, costPer1kInput: 0, costPer1kOutput: 0 },
  },
  openai: {
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    capabilities: { maxTokens: 4096, supportsFunctionCalling: true, supportsStreaming: true, costPer1kInput: 0.005, costPer1kOutput: 0.015 },
  },
  anthropic: {
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-8'],
    defaultModel: 'claude-haiku-4-5',
    baseUrl: 'https://api.anthropic.com/v1',
    capabilities: { maxTokens: 4096, supportsFunctionCalling: true, supportsStreaming: true, costPer1kInput: 0.003, costPer1kOutput: 0.015 },
  },
  local: {
    models: ['llama3', 'mistral', 'codellama', 'custom'],
    defaultModel: 'llama3',
    baseUrl: 'http://localhost:11434/api',
    capabilities: { maxTokens: 4096, supportsFunctionCalling: false, supportsStreaming: true, costPer1kInput: 0, costPer1kOutput: 0 },
  },
};

// ─── Provider Display Info ────────────────────────────────────────

export const AI_PROVIDER_INFO: Record<AIProviderType, {
  name: string;
  icon: string;
  description: string;
  website: string;
}> = {
  gemini: {
    name: 'Google Gemini',
    icon: '🔮',
    description: 'Free tier: 500 requests/day',
    website: 'https://aistudio.google.com/apikey',
  },
  openai: {
    name: 'OpenAI',
    icon: '🤖',
    description: 'GPT-4o, GPT-4o Mini',
    website: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    name: 'Anthropic Claude',
    icon: '🧠',
    description: 'Claude Sonnet, Haiku, Opus',
    website: 'https://console.anthropic.com/',
  },
  local: {
    name: 'Local LLM',
    icon: '💻',
    description: 'Ollama, LM Studio, etc.',
    website: 'https://ollama.ai/',
  },
};
