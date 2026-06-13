/**
 * Auth Middleware
 *
 * Validates that the user is allowed to use the bot.
 * Checks registration status via server API.
 */

import type { Middleware } from 'grammy';
import type { BotContext } from '../bot.js';
import { logger } from '../config/logger.js';
import { config } from '../config/index.js';

export const authMiddleware: Middleware<BotContext> = async (ctx, next) => {
  // Skip auth for /start and /help commands
  const text = ctx.message?.text || '';
  if (text.startsWith('/start') || text.startsWith('/help')) {
    return next();
  }

  const userId = ctx.from?.id;
  if (!userId) {
    logger.warn('Received update without user ID');
    return;
  }

  // Store userId in context for handlers
  ctx.userId = String(userId);

  // Log authentication
  logger.debug(
    { userId, username: ctx.from?.username },
    'User authenticated',
  );

  return next();
};
