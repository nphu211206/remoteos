/**
 * Authentication Middleware
 *
 * Extracts and verifies JWT token from Authorization header.
 * In development mode, falls back to a default dev user if no token is provided.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth-service.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

const authService = new AuthService();

/**
 * Auth middleware for protected routes
 * Extracts Bearer token from Authorization header.
 * In development mode, falls back to default dev user.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  // Try JWT auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = authService.verifyToken(token);

    if (payload) {
      (request as FastifyRequest & { userId: string }).userId = payload.userId;
      logger.debug({ userId: payload.userId }, 'Request authenticated via JWT');
      return;
    }
  }

  // In development mode, fall back to default dev user
  if (config.server.nodeEnv === 'development') {
    const defaultUser = await authService.findOrCreateUser(0, {
      firstName: 'Dev User',
      language: 'vi',
    });
    (request as FastifyRequest & { userId: string }).userId = defaultUser.id;
    logger.debug({ userId: defaultUser.id }, 'Request authenticated via dev user');
    return;
  }

  // Production: require valid token
  reply.status(401).send({
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header',
    },
  });
}

/**
 * Optional auth middleware — doesn't fail if no token,
 * but attaches userId if valid token is present
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = authService.verifyToken(token);
    if (payload) {
      (request as FastifyRequest & { userId: string }).userId = payload.userId;
      return;
    }
  }

  // Fall back to dev user in development
  if (config.server.nodeEnv === 'development') {
    const defaultUser = await authService.findOrCreateUser(0, {
      firstName: 'Dev User',
      language: 'vi',
    });
    (request as FastifyRequest & { userId: string }).userId = defaultUser.id;
  }
}
