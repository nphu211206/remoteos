/**
 * Authentication Service
 *
 * Handles JWT token generation, verification, and user session management.
 */

import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { getDatabase, schema } from '../db/index.js';
import { config } from '../config/index.js';
import { hashString } from '@remoteos/shared/utils';
import { logger } from '../config/logger.js';

export interface JwtPayload {
  userId: string;
  telegramId: number;
  iat?: number;
  exp?: number;
}

export class AuthService {
  /**
   * Find or create a user by Telegram ID
   */
  async findOrCreateUser(telegramId: number, data: {
    username?: string | null;
    firstName?: string;
    language?: string;
  }): Promise<typeof schema.users.$inferSelect> {
    const db = getDatabase();

    // Try to find existing user
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.telegramId, telegramId),
    });

    if (existing) {
      // Update last active
      await db.update(schema.users)
        .set({ lastActiveAt: new Date().toISOString() })
        .where(eq(schema.users.id, existing.id));
      return existing;
    }

    // Create new user
    const userId = randomUUID();
    const now = new Date().toISOString();

    const newUser = {
      id: userId,
      telegramId,
      telegramUsername: data.username ?? null,
      displayName: data.firstName ?? `User_${telegramId}`,
      tier: 'free' as const,
      status: 'active' as const,
      language: data.language ?? 'vi',
      timezone: 'Asia/Ho_Chi_Minh',
      preferences: JSON.stringify({
        language: data.language ?? 'vi',
        alertsEnabled: true,
        quietHoursStart: null,
        quietHoursEnd: null,
        defaultTimeoutSeconds: 30,
        confirmDangerousCommands: true,
        theme: 'auto',
      }),
      createdAt: now,
      lastActiveAt: now,
    };

    await db.insert(schema.users).values(newUser);

    logger.info({ userId, telegramId }, 'New user created');
    return newUser;
  }

  /**
   * Generate a JWT token for a user
   */
  generateToken(userId: string, telegramId: number): string {
    const payload: JwtPayload = { userId, telegramId };
    return jwt.sign(payload, config.security.jwtSecret, {
      expiresIn: '30d',
    });
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, config.security.jwtSecret) as JwtPayload;
      return decoded;
    } catch (err) {
      logger.debug({ err }, 'Token verification failed');
      return null;
    }
  }

  /**
   * Create a session for a user-device pair
   */
  async createSession(userId: string, deviceId: string | null, meta: {
    ip?: string;
    userAgent?: string;
    telegramChatId?: number;
  }): Promise<string> {
    const db = getDatabase();
    const sessionToken = randomUUID();
    const tokenHash = hashString(sessionToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(schema.sessions).values({
      id: randomUUID(),
      userId,
      deviceId,
      tokenHash,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: JSON.stringify(meta),
    });

    return sessionToken;
  }

  /**
   * Generate a registration token for device pairing
   */
  async generateRegistrationToken(userId: string): Promise<string> {
    const db = getDatabase();
    const token = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const tokenHash = hashString(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    await db.insert(schema.registrationTokens).values({
      id: randomUUID(),
      tokenHash,
      userId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    logger.info({ userId }, 'Registration token generated');
    return token;
  }

  /**
   * Validate and consume a registration token
   */
  async validateRegistrationToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    error?: string;
  }> {
    const db = getDatabase();
    const tokenHash = hashString(token);
    const now = new Date().toISOString();

    const record = await db.query.registrationTokens.findFirst({
      where: and(
        eq(schema.registrationTokens.tokenHash, tokenHash),
        gt(schema.registrationTokens.expiresAt, now),
      ),
    });

    if (!record) {
      return { valid: false, error: 'Invalid or expired token' };
    }

    if (record.usedAt) {
      return { valid: false, error: 'Token already used' };
    }

    // Mark as used
    await db.update(schema.registrationTokens)
      .set({ usedAt: now })
      .where(eq(schema.registrationTokens.id, record.id));

    return { valid: true, userId: record.userId };
  }
}
