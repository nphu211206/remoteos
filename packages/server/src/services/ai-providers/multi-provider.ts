/**
 * Multi-Provider AI Service
 *
 * Supports multiple AI providers with automatic fallback:
 * - Gemini (primary)
 * - OpenAI (fallback 1)
 * - Anthropic (fallback 2)
 * - Local/Ollama (fallback 3)
 */

import { logger } from '../../config/logger.js';

export interface AIProviderConfig {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
}

export interface AIResponse {
  text: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class MultiProviderService {
  private providers: AIProviderConfig[] = [];
  private currentProviderIndex = 0;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Gemini (primary)
    if (process.env.GEMINI_API_KEY) {
      this.providers.push({
        name: 'gemini',
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
        enabled: true,
      });
    }

    // OpenAI (fallback 1)
    if (process.env.OPENAI_API_KEY) {
      this.providers.push({
        name: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        enabled: true,
      });
    }

    // Anthropic (fallback 2)
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.push({
        name: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        enabled: true,
      });
    }

    // Local/Ollama (fallback 3)
    if (process.env.OLLAMA_BASE_URL) {
      this.providers.push({
        name: 'ollama',
        baseUrl: process.env.OLLAMA_BASE_URL,
        model: process.env.OLLAMA_MODEL || 'llama3',
        enabled: true,
      });
    }

    logger.info({ providers: this.providers.map(p => p.name) }, 'AI providers initialized');
  }

  /**
   * Generate text using the best available provider
   */
  async generate(prompt: string, systemPrompt?: string): Promise<AIResponse> {
    for (const provider of this.providers) {
      if (!provider.enabled) continue;

      try {
        const response = await this.callProvider(provider, prompt, systemPrompt);
        return response;
      } catch (err) {
        logger.warn({ provider: provider.name, err }, 'Provider failed, trying next');
        continue;
      }
    }

    throw new Error('All AI providers failed');
  }

  /**
   * Call a specific provider
   */
  private async callProvider(provider: AIProviderConfig, prompt: string, systemPrompt?: string): Promise<AIResponse> {
    switch (provider.name) {
      case 'gemini':
        return this.callGemini(provider, prompt, systemPrompt);
      case 'openai':
        return this.callOpenAI(provider, prompt, systemPrompt);
      case 'anthropic':
        return this.callAnthropic(provider, prompt, systemPrompt);
      case 'ollama':
        return this.callOllama(provider, prompt, systemPrompt);
      default:
        throw new Error(`Unknown provider: ${provider.name}`);
    }
  }

  /**
   * Call Gemini API
   */
  private async callGemini(provider: AIProviderConfig, prompt: string, systemPrompt?: string): Promise<AIResponse> {
    const axios = (await import('axios')).default;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;

    const body: any = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    };

    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await axios.post(url, body, { timeout: 60000 });
    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error('Empty response from Gemini');

    return {
      text,
      provider: 'gemini',
      model: provider.model!,
      usage: response.data.usageMetadata ? {
        promptTokens: response.data.usageMetadata.promptTokenCount,
        completionTokens: response.data.usageMetadata.candidatesTokenCount,
        totalTokens: response.data.usageMetadata.totalTokenCount,
      } : undefined,
    };
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(provider: AIProviderConfig, prompt: string, systemPrompt?: string): Promise<AIResponse> {
    const axios = (await import('axios')).default;
    const url = 'https://api.openai.com/v1/chat/completions';

    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await axios.post(url, {
      model: provider.model,
      messages,
      max_tokens: 4096,
      temperature: 0.7,
    }, {
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    const text = response.data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from OpenAI');

    return {
      text,
      provider: 'openai',
      model: provider.model!,
      usage: response.data.usage ? {
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens,
      } : undefined,
    };
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(provider: AIProviderConfig, prompt: string, systemPrompt?: string): Promise<AIResponse> {
    const axios = (await import('axios')).default;
    const url = 'https://api.anthropic.com/v1/messages';

    const messages: any[] = [];
    messages.push({ role: 'user', content: prompt });

    const body: any = {
      model: provider.model,
      messages,
      max_tokens: 4096,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await axios.post(url, body, {
      headers: {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    const text = response.data.content?.[0]?.text;
    if (!text) throw new Error('Empty response from Anthropic');

    return {
      text,
      provider: 'anthropic',
      model: provider.model!,
      usage: response.data.usage ? {
        promptTokens: response.data.usage.input_tokens,
        completionTokens: response.data.usage.output_tokens,
        totalTokens: response.data.usage.input_tokens + response.data.usage.output_tokens,
      } : undefined,
    };
  }

  /**
   * Call Ollama API
   */
  private async callOllama(provider: AIProviderConfig, prompt: string, systemPrompt?: string): Promise<AIResponse> {
    const axios = (await import('axios')).default;
    const url = `${provider.baseUrl}/api/generate`;

    const body: any = {
      model: provider.model,
      prompt,
      stream: false,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await axios.post(url, body, { timeout: 120000 });

    const text = response.data.response;
    if (!text) throw new Error('Empty response from Ollama');

    return {
      text,
      provider: 'ollama',
      model: provider.model!,
      usage: response.data.usage ? {
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens,
      } : undefined,
    };
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    return this.providers.filter(p => p.enabled).map(p => p.name);
  }

  /**
   * Get current provider
   */
  getCurrentProvider(): string {
    return this.providers[this.currentProviderIndex]?.name || 'none';
  }
}
