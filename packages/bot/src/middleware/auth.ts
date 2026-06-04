/**
 * Auth Middleware
 *
 * Validates that the user is allowed to use the bot.
 * For MVP: allows all users (registration happens via /start).
 */

import type { Middleware } from 'grammy';
import type { BotContext } from '../bot.js';
import { logger } from '../config/logger.js';

export const authMiddleware: Middleware<BotContext> = async (ctx, next) => {
  // Skip auth for /start command
  if (ctx.message?.text?.startsWith('/start')) {
    return next();
  }

  const userId = ctx.from?.id;
  if (!userId) {
    logger.warn('Received update without user ID');
    return;
  }

  // TODO: Check user registration status
  // For MVP, allow all users
  logger.debug({ userId, username: ctx.from?.username }, 'User authenticated');

  return next();
};
