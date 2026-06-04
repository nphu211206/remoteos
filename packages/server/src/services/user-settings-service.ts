/**
 * User Settings Service
 *
 * Manages user-specific settings including AI provider configuration.
 * Handles API key encryption/decryption and validation.
 */

import { eq } from 'drizzle-orm';
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AIProviderType, UserAIConfig } from '@remoteos/shared';
import { getDatabase, schema } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

export class UserSettingsService {
  private encryptionKey: Buffer;

  constructor() {
    // Derive encryption key from JWT secret
    this.encryptionKey = Buffer.from(config.security.jwtSecret.padEnd(32, '0').slice(0, 32));
  }

  // ─── AI Config CRUD ────────────────────────────────────────────

  /**
   * Get user's active AI configuration
   */
  async getAIConfig(userId: string): Promise<UserAIConfig | null> {
    const db = getDatabase();
    const result = await db.query.userAiConfigs.findFirst({
      where: eq(schema.userAiConfigs.userId, userId),
    });

    if (!result) return null;

    return {
      id: result.id,
      userId: result.userId,
      provider: result.provider as AIProviderType,
      apiKey: this.decrypt(result.apiKey),
      model: result.model,
      baseUrl: result.baseUrl ?? undefined,
      isActive: result.isActive ?? true,
      createdAt: new Date(result.createdAt),
      updatedAt: new Date(result.updatedAt),
    };
  }

  /**
   * Set user's AI configuration (create or update)
   */
  async setAIConfig(userId: string, config: {
    provider: AIProviderType;
    apiKey: string;
    model: string;
    baseUrl?: string;
  }): Promise<UserAIConfig> {
    const db = getDatabase();
    const now = new Date().toISOString();
    const encryptedKey = this.encrypt(config.apiKey);

    // Check if user already has a config
    const existing = await db.query.userAiConfigs.findFirst({
      where: eq(schema.userAiConfigs.userId, userId),
    });

    if (existing) {
      // Update existing
      await db.update(schema.userAiConfigs)
        .set({
          provider: config.provider,
          apiKey: encryptedKey,
          model: config.model,
          baseUrl: config.baseUrl ?? null,
          updatedAt: now,
        })
        .where(eq(schema.userAiConfigs.userId, userId));

      logger.info({ userId, provider: config.provider }, 'AI config updated');
    } else {
      // Create new
      await db.insert(schema.userAiConfigs).values({
        id: randomUUID(),
        userId,
        provider: config.provider,
        apiKey: encryptedKey,
        model: config.model,
        baseUrl: config.baseUrl ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      logger.info({ userId, provider: config.provider }, 'AI config created');
    }

    return {
      id: existing?.id ?? randomUUID(),
      userId,
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      isActive: true,
      createdAt: existing ? new Date(existing.createdAt) : new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Delete user's AI configuration
   */
  async deleteAIConfig(userId: string): Promise<void> {
    const db = getDatabase();
    await db.delete(schema.userAiConfigs)
      .where(eq(schema.userAiConfigs.userId, userId));
    logger.info({ userId }, 'AI config deleted');
  }

  // ─── Encryption ────────────────────────────────────────────────

  /**
   * Encrypt API key using AES-256-CBC
   */
  private encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt API key
   */
  private decrypt(ciphertext: string): string {
    try {
      const [ivHex, encrypted] = ciphertext.split(':');
      if (!ivHex || !encrypted) {
        // Not encrypted (legacy or plain text)
        return ciphertext;
      }
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      // If decryption fails, return as-is (might be plain text)
      return ciphertext;
    }
  }

  // ─── Validation ────────────────────────────────────────────────

  /**
   * Mask API key for display (show first 4 and last 4 chars)
   */
  maskApiKey(key: string): string {
    if (key.length <= 8) return '****';
    return `${key.slice(0, 4)}****${key.slice(-4)}`;
  }
}
