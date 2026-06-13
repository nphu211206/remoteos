/**
 * Voice Service
 *
 * Handles voice-to-text transcription using OpenAI Whisper API.
 * Supports multiple languages with Vietnamese as default.
 */

import axios from 'axios';
import { logger } from '../config/logger.js';

export class VoiceService {
  private openaiKey: string;
  private model: string;

  constructor() {
    this.openaiKey = process.env.OPENAI_API_KEY || '';
    this.model = 'whisper-1';
  }

  /**
   * Check if voice service is configured
   */
  isConfigured(): boolean {
    return !!this.openaiKey || !!process.env.GEMINI_API_KEY;
  }

  /**
   * Transcribe audio buffer to text using OpenAI Whisper API
   */
  async transcribe(audioBuffer: Buffer, language: string = 'vi'): Promise<string> {
    if (!this.openaiKey) {
      throw new Error('OPENAI_API_KEY not configured for voice transcription');
    }

    logger.info({ bufferSize: audioBuffer.length, language }, 'Starting voice transcription');

    // Create multipart form data manually (no external dependency)
    const boundary = `----FormBoundary${Date.now()}`;
    const parts: Buffer[] = [];

    // Add file part
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.ogg"\r\n` +
      `Content-Type: audio/ogg\r\n\r\n`
    ));
    parts.push(audioBuffer);
    parts.push(Buffer.from('\r\n'));

    // Add model part
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `${this.model}\r\n`
    ));

    // Add language part
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `${language}\r\n`
    ));

    // Add response_format part
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `text\r\n`
    ));

    // End boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        body,
        {
          headers: {
            'Authorization': `Bearer ${this.openaiKey}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          timeout: 30000,
          maxContentLength: 50 * 1024 * 1024, // 50MB
        }
      );

      const text = typeof response.data === 'string' ? response.data : response.data?.text || '';

      logger.info({ text: text.substring(0, 100), language }, 'Voice transcription completed');

      return text.trim();
    } catch (err: any) {
      const errMsg = err.response?.data?.error?.message || err.message;
      logger.error({ error: errMsg }, 'Voice transcription failed');
      throw new Error(`Voice transcription failed: ${errMsg}`);
    }
  }

  /**
   * Transcribe audio from base64 string
   */
  async transcribeBase64(audioBase64: string, language: string = 'vi'): Promise<string> {
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Try OpenAI first
    if (this.openaiKey) {
      try {
        return await this.transcribe(audioBuffer, language);
      } catch (err) {
        logger.warn({ err }, 'OpenAI transcription failed, trying Gemini fallback');
      }
    }

    // Fallback to Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        return await this.transcribeWithGemini(audioBuffer, language, geminiKey);
      } catch (err) {
        logger.error({ err }, 'Gemini transcription failed');
        throw new Error('Voice transcription failed with all providers');
      }
    }

    throw new Error('No voice transcription provider configured');
  }

  /**
   * Transcribe using Gemini API (fallback)
   */
  private async transcribeWithGemini(audioBuffer: Buffer, language: string, apiKey: string): Promise<string> {
    const base64Audio = audioBuffer.toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await axios.post(url, {
      contents: [{
        parts: [
          { text: `Transcribe this audio to text. Language: ${language}. Return ONLY the transcribed text, nothing else.` },
          { inlineData: { mimeType: 'audio/ogg', data: base64Audio } },
        ],
      }],
      generationConfig: { maxOutputTokens: 1000 },
    }, { timeout: 30000 });

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Gemini returned empty transcription');

    logger.info({ text: text.substring(0, 100) }, 'Gemini voice transcription completed');
    return text;
  }
}

export const voiceService = new VoiceService();
