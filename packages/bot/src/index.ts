/**
 * RemoteOS Telegram Bot — Entry Point
 *
 * Uses raw HTTP polling with proper duplicate handling.
 */

import { createBot } from './bot.js';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import axios from 'axios';

const API = `https://api.telegram.org/bot${config.telegram.botToken}`;

async function startBot(): Promise<void> {
  logger.info('🤖 RemoteOS Telegram Bot starting...');

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

    // Initialize bot (required for handleUpdate)
    await bot.init();
    const me = bot.botInfo;
    logger.info({ username: me?.username }, '✅ Bot connected');

    // Use raw polling with proper offset management
    logger.info('Starting raw polling mode...');
    let offset = 0;
    const processedIds = new Set<number>();
    let pollCount = 0;

    while (true) {
      try {
        pollCount++;
        if (pollCount % 10 === 1) {
          logger.info({ offset, pollCount }, 'Polling...');
        }
        const response = await axios.get(`${API}/getUpdates`, {
          params: { offset, timeout: 1 },
          timeout: 5000,
        });

        const rawData = response.data;
        const updates = rawData?.result || [];

        // Log EVERY response for debugging
        if (updates.length > 0) {
          logger.info({ count: updates.length, offset, ok: rawData?.ok }, 'Received updates');

          for (const update of updates) {
            const updateId = update.update_id;

            // Skip if already processed
            if (processedIds.has(updateId)) {
              logger.info({ updateId }, 'Skipping duplicate update');
              continue;
            }

            // Mark as processed
            processedIds.add(updateId);
            offset = updateId + 1;

            // Process update
            try {
              await bot.handleUpdate(update);
            } catch (err) {
              logger.error({ err, updateId }, 'Error processing update');
            }
          }

          // Clean up old processed IDs (keep last 1000)
          if (processedIds.size > 1000) {
            const ids = Array.from(processedIds).sort((a, b) => a - b);
            for (let i = 0; i < ids.length - 1000; i++) {
              processedIds.delete(ids[i]);
            }
          }
        }
      } catch (err: any) {
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          // Long polling timeout — normal, continue
          continue;
        }
        logger.error({ err: err.message }, 'Poll error');
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  } catch (err: unknown) {
    logger.fatal({ err }, 'Failed to start bot');
    process.exit(1);
  }
}

startBot();
