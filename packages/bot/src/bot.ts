/**
 * Bot Factory
 *
 * Creates and configures the grammY bot with all handlers.
 */

import { Bot, session, type Context, type SessionFlavor } from 'grammy';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { registerCommands } from './handlers/commands.js';
import { registerMessages } from './handlers/messages.js';
import { registerCallbackQueries } from './handlers/callbacks.js';
import { registerAISettings } from './handlers/ai-settings.js';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth.js';

/** Session data stored per-user */
interface SessionData {
  /** Currently selected device ID */
  selectedDeviceId: string | null;
  /** Conversation state */
  state: 'idle' | 'awaiting_device_name' | 'awaiting_registration_code';
  /** AI setup state */
  aiSetupStep?: 'choose_provider' | 'enter_key' | 'choose_model';
  aiProvider?: string;
  aiApiKey?: string;
  /** Temporary data */
  temp: Record<string, unknown>;
}

/** Extended context with session and custom properties */
export type BotContext = Context & SessionFlavor<SessionData> & {
  userId?: string;
};

export async function createBot(): Promise<Bot<BotContext>> {
  const bot = new Bot<BotContext>(config.telegram.botToken);

  // ─── Debug Logging Middleware ────────────────────────────────
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text ?? ctx.callbackQuery?.data ?? '(no text)';
    const userId = ctx.from?.id ?? 'unknown';
    logger.info({ userId, text, updateId: ctx.update.update_id }, '📩 Received update');
    try {
      await next();
    } catch (err) {
      logger.error({ err, userId, text }, '❌ Handler error');
      throw err;
    }
  });

  // ─── Session Middleware ──────────────────────────────────────
  bot.use(session({
    initial: (): SessionData => ({
      selectedDeviceId: null,
      state: 'idle',
      temp: {},
    }),
  }));

  // ─── Error Handler ──────────────────────────────────────────
  bot.catch(errorHandler);

  // ─── Auth Middleware (skip /start) ───────────────────────────
  bot.use(authMiddleware);

  // ─── Register Handlers ──────────────────────────────────────
  registerCommands(bot);
  registerAISettings(bot);
  registerMessages(bot);
  registerCallbackQueries(bot);

  logger.info('Bot configured successfully');
  return bot;
}
