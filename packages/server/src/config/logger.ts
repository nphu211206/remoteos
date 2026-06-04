/**
 * Server Logger Configuration
 *
 * Uses Pino for high-performance structured logging.
 * In development: pretty-printed colored output.
 * In production: JSON for log aggregation.
 */

import pino from 'pino';
import { config } from './index.js';

export const logger = pino({
  level: config.server.logLevel,
  ...(config.server.nodeEnv === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

export type Logger = typeof logger;
