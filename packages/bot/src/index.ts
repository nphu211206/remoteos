/**
 * RemoteOS Telegram Bot — Entry Point
 *
 * Bootstraps the grammY bot with all command handlers,
 * middleware, and error handling.
 *
 * Handles 409 Conflict errors gracefully by retrying after a delay.
 */

import { createBot } from './bot.js';
import { config } from './config/index.js';
import { logger } from './config/logger.js';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

async function startBot(retryCount = 0): Promise<void> {
  logger.info({ attempt: retryCount + 1 }, '🤖 RemoteOS Telegram Bot starting...');

  try {
    const bot = await createBot();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');
      bot.stop();
      logger.info('Bot stopped gracefully');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Start the bot
    if (config.telegram.useWebhook && config.telegram.webhookUrl) {
      logger.info({ url: config.telegram.webhookUrl }, 'Starting in webhook mode');
      await bot.api.setWebhook(config.telegram.webhookUrl);
      logger.info('Webhook registered');
    } else {
      logger.info('Starting in polling mode');
      await bot.start({
        onStart: (info) => {
          logger.info({ username: info.username }, '✅ Bot started successfully');
        },
      });
    }
  } catch (err: unknown) {
    const error = err as { error_code?: number; message?: string };

    // Handle 409 Conflict (another bot instance is running)
    if (error.error_code === 409) {
      logger.warn(
        { retryCount, maxRetries: MAX_RETRIES },
        '⚠️ 409 Conflict — another bot instance is running. Retrying in 5s...',
      );

      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return startBot(retryCount + 1);
      }

      logger.fatal('❌ Max retries reached. Another bot instance is still running.');
      logger.fatal('   Run: taskkill /F /IM node.exe  then restart.');
      process.exit(1);
    }

    // Handle other errors
    logger.fatal({ err }, 'Failed to start bot');
    process.exit(1);
  }
}

startBot();
