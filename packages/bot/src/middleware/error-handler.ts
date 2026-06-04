/**
 * Bot Error Handler
 *
 * Catches all unhandled errors in bot handlers.
 */

import type { ErrorHandler } from 'grammy';
import type { BotContext } from '../bot.js';
import { logger } from '../config/logger.js';

export const errorHandler: ErrorHandler<BotContext> = (err) => {
  const ctx = err.ctx;
  const error = err.error;

  logger.error({
    err: error,
    updateType: ctx.update.update_id,
    chatId: ctx.chat?.id,
    userId: ctx.from?.id,
  }, 'Bot error');

  // Try to inform the user
  ctx.reply('❌ Đã xảy ra lỗi. Vui lòng thử lại.').catch(() => {
    // Silently fail if we can't even send the error message
  });
};
