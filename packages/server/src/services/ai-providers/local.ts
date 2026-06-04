/**
 * Local LLM AI Provider
 *
 * Ollama API integration for local models.
 */

import axios from 'axios';
import type { AIProviderConfig } from '@remoteos/shared';
import { BaseAIProvider, type AIInterpretResult } from './base.js';
import { logger } from '../../config/logger.js';

interface OllamaResponse {
  response: string;
  done: boolean;
}

export class LocalProvider extends BaseAIProvider {
  readonly type = 'local' as const;

  async interpret(text: string, systemPrompt: string): Promise<AIInterpretResult> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434/api';

    try {
      const response = await axios.post<OllamaResponse>(
        `${baseUrl}/generate`,
        {
          model: this.config.model,
          prompt: `${systemPrompt}\n\nUser: "${text}"\n\nResponse:`,
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 16384,
          },
        },
        { timeout: 120_000 },
      );

      const aiText = response.data.response?.trim();
      if (!aiText) {
        throw new Error('Empty response from local model');
      }

      const parsed = this.parseJSON(aiText);
      if (!parsed || !parsed.type) {
        throw new Error('Invalid JSON response from local model');
      }

      return {
        type: parsed.type as string,
        params: parsed.params as Record<string, unknown> | undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
        rawResponse: aiText,
      };
    } catch (err) {
      logger.error({ err }, 'Local LLM API call failed');
      throw err;
    }
  }
}
