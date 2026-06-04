/**
 * AI Provider Factory
 *
 * Creates provider instances based on configuration.
 * Handles provider registration and lookup.
 */

import type { AIProviderType, AIProviderConfig } from '@remoteos/shared';
import type { AIProvider } from './base.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { LocalProvider } from './local.js';

export type { AIProvider, AIInterpretResult } from './base.js';

/** Factory for creating AI provider instances */
export class ProviderFactory {
  /** Create a provider instance from config */
  static create(config: AIProviderConfig): AIProvider {
    switch (config.provider) {
      case 'gemini':
        return new GeminiProvider(config);
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'local':
        return new LocalProvider(config);
      default:
        throw new Error(`Unknown AI provider: ${config.provider}`);
    }
  }

  /** Get list of supported providers */
  static getSupportedProviders(): AIProviderType[] {
    return ['gemini', 'openai', 'anthropic', 'local'];
  }

  /** Check if a provider type is valid */
  static isValidProvider(provider: string): provider is AIProviderType {
    return this.getSupportedProviders().includes(provider as AIProviderType);
  }
}
