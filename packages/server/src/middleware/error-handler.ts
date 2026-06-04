/**
 * Global Error Handler
 *
 * Catches all unhandled errors and returns consistent API error responses.
 */

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../config/logger.js';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const statusCode = error.statusCode ?? 500;
  const isServerError = statusCode >= 500;

  // Log server errors with full details
  if (isServerError) {
    logger.error({
      err: error,
      req: {
        method: request.method,
        url: request.url,
        id: request.id,
      },
    }, 'Unhandled server error');
  } else {
    logger.warn({
      statusCode,
      message: error.message,
      req: {
        method: request.method,
        url: request.url,
        id: request.id,
      },
    }, 'Client error');
  }

  // Send consistent error response
  reply.status(statusCode).send({
    success: false,
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: isServerError ? 'An internal error occurred' : error.message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
        details: error.validation,
      }),
    },
    meta: {
      requestId: request.id,
      timestamp: new Date().toISOString(),
    },
  });
}
