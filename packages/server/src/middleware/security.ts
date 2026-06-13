/**
 * Security Middleware — Rate Limiting & Audit Logging
 *
 * Features:
 * - Per-user rate limiting (configurable RPM)
 * - Audit logging for all API calls
 * - Request sanitization
 * - IP-based rate limiting for unauthenticated requests
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../config/logger.js';

// ─── Per-User Rate Limiting ───────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const userRateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_RPM = 30; // 30 requests per minute per user
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

/**
 * Check if user has exceeded rate limit
 * Returns true if allowed, false if rate limited
 */
function checkUserRateLimit(userId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = userRateLimits.get(userId);

  if (!entry || now > entry.resetTime) {
    // New window
    userRateLimits.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_RPM - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }

  if (entry.count >= RATE_LIMIT_RPM) {
    const resetIn = entry.resetTime - now;
    return { allowed: false, remaining: 0, resetIn };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_RPM - entry.count, resetIn: entry.resetTime - now };
}

// ─── Audit Logging ────────────────────────────────────────────

interface AuditEntry {
  timestamp: string;
  userId: string;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
  statusCode?: number;
  durationMs?: number;
}

const auditLog: AuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 10_000;

/**
 * Log an API call to the audit trail
 */
function logAudit(entry: AuditEntry): void {
  auditLog.push(entry);

  // Trim if too large
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_ENTRIES);
  }

  // Log to file/console
  logger.info({
    audit: true,
    userId: entry.userId,
    method: entry.method,
    path: entry.path,
    ip: entry.ip,
    status: entry.statusCode,
    duration: entry.durationMs,
  }, 'API call');
}

/**
 * Get recent audit log entries
 */
export function getAuditLog(limit = 100, userId?: string): AuditEntry[] {
  let entries = auditLog;
  if (userId) {
    entries = entries.filter(e => e.userId === userId);
  }
  return entries.slice(-limit);
}

// ─── Rate Limit Middleware ─────────────────────────────────────

export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Skip rate limiting for health endpoint and device endpoints
  if (request.url === '/health' ||
      request.url === '/api/v1/devices/register' ||
      request.url === '/api/v1/device/heartbeat' ||
      request.url === '/api/v1/device/poll') return;

  const userId = (request as FastifyRequest & { userId?: string }).userId;
  const ip = request.ip || request.socket.remoteAddress || 'unknown';

  // Use userId if available, otherwise use IP
  const identifier = userId || `ip:${ip}`;

  const { allowed, remaining, resetIn } = checkUserRateLimit(identifier);

  // Set rate limit headers
  reply.header('X-RateLimit-Limit', RATE_LIMIT_RPM);
  reply.header('X-RateLimit-Remaining', remaining);
  reply.header('X-RateLimit-Reset', Math.ceil(resetIn / 1000));

  if (!allowed) {
    logger.warn({ userId, ip, path: request.url }, 'Rate limit exceeded');

    reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(resetIn / 1000),
      },
    });
  }
}

// ─── Audit Middleware ──────────────────────────────────────────

export async function auditMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const startTime = Date.now();
  const userId = (request as FastifyRequest & { userId?: string }).userId || 'anonymous';
  const ip = request.ip || request.socket.remoteAddress || 'unknown';

  // Log after response is sent
  reply.raw.on('finish', () => {
    const durationMs = Date.now() - startTime;

    logAudit({
      timestamp: new Date().toISOString(),
      userId,
      method: request.method,
      path: request.url,
      ip,
      userAgent: request.headers['user-agent'] || 'unknown',
      statusCode: reply.statusCode,
      durationMs,
    });
  });
}

// ─── Input Sanitization Middleware ─────────────────────────────

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|FETCH|DECLARE|TRUNCATE)\b)/i,
  /(--|\/\*|\*\/|;|'|"|\\)/,
  /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
];

const XSS_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
];

/**
 * Check if input contains potential injection attacks
 */
export function detectInjection(input: string): { safe: boolean; type?: string } {
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return { safe: false, type: 'sql_injection' };
    }
  }

  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(input)) {
      return { safe: false, type: 'xss' };
    }
  }

  return { safe: true };
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
}

// ─── Cleanup ──────────────────────────────────────────────────

/**
 * Clean up expired rate limit entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of userRateLimits.entries()) {
    if (now > entry.resetTime) {
      userRateLimits.delete(key);
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);
