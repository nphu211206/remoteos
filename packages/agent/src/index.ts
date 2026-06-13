#!/usr/bin/env node

/**
 * RemoteOS Agent — Entry Point
 *
 * This is the daemon that runs on the user's computer.
 * It connects to the relay server, polls for commands,
 * executes them, and returns results.
 *
 * Usage:
 *   pnpm dev           (development with hot-reload)
 *   pnpm start         (production)
 *   node dist/index.js (direct)
 */

import './env.js'; // Load .env first
import { AgentDaemon } from './daemon.js';
import { config } from './config/index.js';
import { logger } from './config/logger.js';

async function main(): Promise<void> {
  logger.info('🖥️  RemoteOS Agent starting...');
  logger.info({
    serverUrl: config.server.url,
    deviceId: config.device.id,
  }, 'Configuration loaded');

  const daemon = new AgentDaemon();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    await daemon.stop();
    logger.info('Agent stopped gracefully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });

  // Start the daemon
  await daemon.start();
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start agent');
  process.exit(1);
});
