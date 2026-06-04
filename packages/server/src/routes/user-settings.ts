/**
 * User Settings Routes — AI Configuration API
 *
 * GET  /users/:id/ai-config — Get user's AI config
 * POST /users/:id/ai-config — Set user's AI config
 * DELETE /users/:id/ai-config — Delete user's AI config
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserSettingsService } from '../services/user-settings-service.js';
import { AuthService } from '../services/auth-service.js';
import { logger } from '../config/logger.js';

const userSettingsService = new UserSettingsService();
const authService = new AuthService();

export function registerUserSettingsRoutes(server: FastifyInstance): void {
  /**
   * GET /users/:id/ai-config
   * Get user's AI configuration
   * :id is Telegram user ID, need to convert to internal UUID
   */
  server.get<{ Params: { id: string } }>('/users/:id/ai-config', async (req, reply) => {
    const telegramId = parseInt(req.params.id, 10);

    try {
      // Find user by Telegram ID
      const user = await authService.findOrCreateUser(telegramId, { firstName: 'User' });
      const config = await userSettingsService.getAIConfig(user.id);

      if (!config) {
        return reply.send({ success: false, error: 'No AI config found' });
      }

      // Mask API key
      return reply.send({
        success: true,
        config: {
          provider: config.provider,
          model: config.model,
          isActive: config.isActive,
          apiKeyMasked: userSettingsService.maskApiKey(config.apiKey),
        },
      });
    } catch (err) {
      logger.error({ err, telegramId }, 'Failed to get AI config');
      return reply.status(500).send({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * POST /users/:id/ai-config
   * Set user's AI configuration
   */
  server.post<{ Params: { id: string }; Body: { provider: string; apiKey: string; model: string } }>(
    '/users/:id/ai-config',
    async (req, reply) => {
      const telegramId = parseInt(req.params.id, 10);
      const { provider, apiKey, model } = req.body;

      // Validate
      if (!provider || !apiKey || !model) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required fields: provider, apiKey, model',
        });
      }

      const validProviders = ['gemini', 'openai', 'anthropic', 'local'];
      if (!validProviders.includes(provider)) {
        return reply.status(400).send({
          success: false,
          error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`,
        });
      }

      if (apiKey.length < 10) {
        return reply.status(400).send({
          success: false,
          error: 'API key too short',
        });
      }

      try {
        // Get or create user by Telegram ID
        const user = await authService.findOrCreateUser(telegramId, { firstName: 'User' });

        const config = await userSettingsService.setAIConfig(user.id, {
          provider: provider as 'gemini' | 'openai' | 'anthropic' | 'local',
          apiKey,
          model,
        });

        logger.info({ telegramId, userId: user.id, provider, model }, 'AI config saved');

        return reply.send({
          success: true,
          config: {
            provider: config.provider,
            model: config.model,
            isActive: config.isActive,
            apiKeyMasked: userSettingsService.maskApiKey(config.apiKey),
          },
        });
      } catch (err) {
        logger.error({ err, telegramId }, 'Failed to save AI config');
        return reply.status(500).send({ success: false, error: 'Failed to save config' });
      }
    },
  );

  /**
   * DELETE /users/:id/ai-config
   * Delete user's AI configuration
   */
  server.delete<{ Params: { id: string } }>('/users/:id/ai-config', async (req, reply) => {
    const telegramId = parseInt(req.params.id, 10);

    try {
      const user = await authService.findOrCreateUser(telegramId, { firstName: 'User' });
      await userSettingsService.deleteAIConfig(user.id);
      return reply.send({ success: true });
    } catch (err) {
      logger.error({ err, telegramId }, 'Failed to delete AI config');
      return reply.status(500).send({ success: false, error: 'Failed to delete config' });
    }
  });
}
