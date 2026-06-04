/**
 * Gemini AI Provider
 *
 * Google's Gemini API integration.
 * Supports both API key (query param) and OAuth token (Bearer header).
 */

import axios from 'axios';
import type { AIProviderConfig } from '@remoteos/shared';
import { BaseAIProvider, type AIInterpretResult } from './base.js';
import { logger } from '../../config/logger.js';

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
    finishReason: string;
  }>;
}

export class GeminiProvider extends BaseAIProvider {
  readonly type = 'gemini' as const;

  async interpret(text: string, systemPrompt: string): Promise<AIInterpretResult> {
    const fullPrompt = `${systemPrompt}\n\nUser: "${text}"\n\nResponse:`;

    const url = `${this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/models'}/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    try {
      const response = await axios.post<GeminiResponse>(
        url,
        {
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 65536,
            topP: 0.95,
          },
        },
        { timeout: 120_000 },
      );

      const aiText = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!aiText) {
        throw new Error('Empty response from Gemini');
      }

      const parsed = this.parseJSON(aiText);
      if (!parsed || !parsed.type) {
        throw new Error('Invalid JSON response from Gemini');
      }

      return {
        type: parsed.type as string,
        params: parsed.params as Record<string, unknown> | undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        rawResponse: aiText,
      };
    } catch (err) {
      logger.error({ err }, 'Gemini API call failed');
      throw err;
    }
  }
}
