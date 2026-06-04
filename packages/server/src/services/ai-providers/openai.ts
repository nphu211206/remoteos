/**
 * OpenAI AI Provider
 *
 * OpenAI API integration (GPT-4o, GPT-4o Mini, etc.)
 */

import axios from 'axios';
import type { AIProviderConfig } from '@remoteos/shared';
import { BaseAIProvider, type AIInterpretResult } from './base.js';
import { logger } from '../../config/logger.js';

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
}

export class OpenAIProvider extends BaseAIProvider {
  readonly type = 'openai' as const;

  async interpret(text: string, systemPrompt: string): Promise<AIInterpretResult> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';

    try {
      const response = await axios.post<OpenAIResponse>(
        `${baseUrl}/chat/completions`,
        {
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          temperature: 0.7,
          max_tokens: 16384,
        },
        {
          timeout: 120_000,
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const aiText = response.data.choices?.[0]?.message?.content?.trim();
      if (!aiText) {
        throw new Error('Empty response from OpenAI');
      }

      const parsed = this.parseJSON(aiText);
      if (!parsed || !parsed.type) {
        throw new Error('Invalid JSON response from OpenAI');
      }

      return {
        type: parsed.type as string,
        params: parsed.params as Record<string, unknown> | undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        rawResponse: aiText,
      };
    } catch (err) {
      logger.error({ err }, 'OpenAI API call failed');
      throw err;
    }
  }
}
