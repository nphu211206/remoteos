/**
 * AI Provider Base Interface
 *
 * All AI providers (Gemini, OpenAI, Claude, Local) implement this interface.
 * The AI Service uses this to abstract away provider-specific details.
 */

import type { AIProviderType, AIProviderConfig } from '@remoteos/shared';

/** Result from AI interpretation */
export interface AIInterpretResult {
  type: string;
  params?: Record<string, unknown>;
  confidence: number;
  rawResponse?: string;
}

/** AI Provider interface — all providers implement this */
export interface AIProvider {
  /** Provider type identifier */
  readonly type: AIProviderType;

  /** Interpret natural language text and return a command intent */
  interpret(text: string, systemPrompt: string): Promise<AIInterpretResult>;

  /** Check if the provider is available and configured */
  isAvailable(): boolean;

  /** Get provider display name */
  getName(): string;
}

/** Base class with common functionality */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly type: AIProviderType;

  protected config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  abstract interpret(text: string, systemPrompt: string): Promise<AIInterpretResult>;

  isAvailable(): boolean {
    return !!this.config.apiKey && !!this.config.model;
  }

  getName(): string {
    return this.type.charAt(0).toUpperCase() + this.type.slice(1);
  }

  /** Parse JSON from AI response, handling markdown code blocks */
  protected parseJSON(text: string): Record<string, unknown> | null {
    try {
      let jsonStr = text.trim();

      // Handle markdown code blocks
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1]!.trim();
      }

      return JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
