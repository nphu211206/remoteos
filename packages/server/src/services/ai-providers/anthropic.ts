/**
 * Anthropic Claude AI Provider
 *
 * Claude API integration (Sonnet, Haiku, Opus)
 */

import axios from 'axios';
import type { AIProviderConfig } from '@remoteos/shared';
import { BaseAIProvider, type AIInterpretResult } from './base.js';
import { logger } from '../../config/logger.js';

interface AnthropicResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export class AnthropicProvider extends BaseAIProvider {
  readonly type = 'anthropic' as const;

  async interpret(text: string, systemPrompt: string): Promise<AIInterpretResult> {
    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com/v1';

    try {
      const response = await axios.post<AnthropicResponse>(
        `${baseUrl}/messages`,
        {
          model: this.config.model,
          max_tokens: 16384,
          system: systemPrompt,
          messages: [
            { role: 'user', content: text },
          ],
        },
        {
          timeout: 120_000,
          headers: {
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        },
      );

      const aiText = response.data.content?.[0]?.text?.trim();
      if (!aiText) {
        throw new Error('Empty response from Anthropic');
      }

      const parsed = this.parseJSON(aiText);
      if (!parsed || !parsed.type) {
        throw new Error('Invalid JSON response from Anthropic');
      }

      return {
        type: parsed.type as string,
        params: parsed.params as Record<string, unknown> | undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        rawResponse: aiText,
      };
    } catch (err) {
      logger.error({ err }, 'Anthropic API call failed');
      throw err;
    }
  }
}
