/**
 * Webhook Routes
 *
 * Handles incoming webhooks from Telegram.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { TelegramService } from '../services/telegram-service.js';

const telegramService = new TelegramService();

export function registerWebhookRoutes(server: FastifyInstance): void {
  /**
   * POST /webhook/telegram
   * Receives updates from Telegram Bot API
   */
  server.post('/webhook/telegram', async (req: FastifyRequest, reply: FastifyReply) => {
    // Validate secret token if configured
    const secretToken = req.headers['x-telegram-bot-api-secret-token'] as string;

    if (config.telegram.botToken && secretToken !== config.telegram.botToken.slice(-32)) {
      logger.warn('Invalid Telegram webhook secret token');
      return reply.status(403).send({ ok: false, error: 'Invalid token' });
    }

    logger.debug({ update: req.body }, 'Received Telegram update');

    // Process the update asynchronously
    telegramService.processUpdate(req.body as Parameters<typeof telegramService.processUpdate>[0])
      .catch((err) => logger.error({ err }, 'Failed to process Telegram update'));

    // Acknowledge immediately (Telegram expects fast response)
    return reply.send({ ok: true });
  });
}
