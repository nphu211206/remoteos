/**
 * Voice Routes
 *
 * Handles voice-to-text transcription endpoints.
 */

import type { FastifyInstance } from 'fastify';
import { voiceService } from '../services/voice-service.js';
import { logger } from '../config/logger.js';

export function registerVoiceRoutes(fastify: FastifyInstance): void {
  /**
   * POST /voice/transcribe
   * Transcribe audio to text using Whisper API
   */
  fastify.post('/voice/transcribe', async (request, reply) => {
    const { audioBase64, language } = request.body as {
      audioBase64: string;
      language?: string;
    };

    if (!audioBase64) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required field: audioBase64',
      });
    }

    if (!voiceService.isConfigured()) {
      return reply.status(503).send({
        success: false,
        error: 'Voice transcription not configured. Set OPENAI_API_KEY environment variable.',
      });
    }

    try {
      const text = await voiceService.transcribeBase64(audioBase64, language || 'vi');

      return {
        success: true,
        text,
        language: language || 'vi',
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Voice transcription failed');
      return reply.status(500).send({
        success: false,
        error: err.message,
      });
    }
  });

  /**
   * GET /voice/status
   * Check if voice service is available
   */
  fastify.get('/voice/status', async () => {
    return {
      configured: voiceService.isConfigured(),
      model: 'whisper-1',
      supportedLanguages: ['vi', 'en', 'ja', 'ko', 'zh', 'fr', 'de', 'es'],
    };
  });
}
