/**
 * RemoteOS Server — Entry Point
 *
 * Bootstraps the Fastify relay server with all plugins,
 * routes, and graceful shutdown handling.
 */

import './env.js'; // Load .env first
import { createServer } from './app.js';
import { config } from './config/index.js';
import { logger } from './config/logger.js';

async function main(): Promise<void> {
  const server = await createServer();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, closing server...');
    try {
      await server.close();
      logger.info('Server closed gracefully');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start listening
  try {
    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info({
      port: config.server.port,
      host: config.server.host,
      env: config.server.nodeEnv,
    }, `🚀 RemoteOS Server running at http://${config.server.host}:${config.server.port}`);
    logger.info(`📚 Swagger docs at http://${config.server.host}:${config.server.port}/docs`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'Server startup failed');
  process.exit(1);
});
