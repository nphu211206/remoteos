/**
 * RemoteOS Server — Application Factory
 *
 * Creates and configures the Fastify instance with all plugins.
 * Separated from index.ts for testability.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { initializeDatabase } from './db/index.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimitMiddleware, auditMiddleware } from './middleware/security.js';
import { AlertService } from './services/alert-service.js';
import { setupWebSocket } from './websocket.js';

export async function createServer() {
  // ─── Initialize Database ──────────────────────────────────────
  initializeDatabase();

  // ─── Create Fastify Instance ──────────────────────────────────
  const server = Fastify({
    logger: config.server.nodeEnv === 'development' ? {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    } : true,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    trustProxy: true,
  });

  // ─── Make DB available in handlers ────────────────────────────
  server.decorateRequest('userId', null as string | null);
  server.decorateRequest('deviceId', null as string | null);

  // ─── Security Plugins ──────────────────────────────────────────
  await server.register(helmet, {
    contentSecurityPolicy: config.server.nodeEnv === 'production',
  });

  await server.register(cors, {
    origin: config.server.nodeEnv === 'development' ? true : config.server.corsOrigins,
    credentials: true,
  });

  await server.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
  });

  // ─── Error Handler ─────────────────────────────────────────────
  server.setErrorHandler(errorHandler);

  // ─── Per-User Rate Limiting & Audit Logging ───────────────────
  server.addHook('onRequest', rateLimitMiddleware);
  server.addHook('onRequest', auditMiddleware);

  // ─── Health Check (before auth) ────────────────────────────────
  server.get('/health', async () => {
    const { getDatabase } = await import('./db/index.js');
    let dbStatus: 'connected' | 'disconnected' = 'connected';
    try {
      getDatabase().$client.prepare('SELECT 1').get();
    } catch {
      dbStatus = 'disconnected';
    }

    return {
      status: dbStatus === 'connected' ? 'healthy' : 'degraded',
      version: '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };
  });

  // ─── API Routes ────────────────────────────────────────────────
  await registerRoutes(server);

  // ─── WebSocket (Real-time) ──────────────────────────────────────
  await setupWebSocket(server);

  // ─── Start Alert Monitoring ─────────────────────────────────────
  const alertService = new AlertService();
  alertService.startMonitoring(30_000); // Check every 30 seconds

  return server;
}
