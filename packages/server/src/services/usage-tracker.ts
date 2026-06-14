/**
 * Usage Tracker — Per-User Token & Request Tracking
 *
 * Tracks:
 * - Token usage per user (input, output, total)
 * - Request count per user
 * - Cost estimation
 * - Daily/monthly limits
 * - Usage history
 */

import { getDatabase } from '../db/index.js';
import { logger } from '../config/logger.js';
import { sql } from 'drizzle-orm';

export interface UsageStats {
  userId: string;
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  todayRequests: number;
  todayTokens: number;
  monthRequests: number;
  monthTokens: number;
}

export interface UsageRecord {
  id: number;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestType: string;
  timestamp: string;
}

// Cost per 1M tokens (USD) — approximate Gemini pricing
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'gemini-3.5-flash': { input: 0.15, output: 0.60 },
  'gemini-3-flash': { input: 0.15, output: 0.60 },
  'gemini-3.1-flash-lite': { input: 0.075, output: 0.30 },
  'gemini-2.5-flash-lite': { input: 0.075, output: 0.30 },
};

let initialized = false;

function ensureTable(): void {
  if (initialized) return;
  try {
    const db = getDatabase();
    db.$client.exec(`
      CREATE TABLE IF NOT EXISTS usage_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        request_type TEXT DEFAULT 'general',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_usage_user
        ON usage_tracking(user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_usage_date
        ON usage_tracking(created_at);
    `);
    initialized = true;
  } catch (err) {
    logger.error({ err }, 'Failed to initialize usage tracking table');
  }
}

export function recordUsage(
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  requestType: string = 'general',
): void {
  ensureTable();
  try {
    const db = getDatabase();
    const totalTokens = inputTokens + outputTokens;
    db.run(
      sql`INSERT INTO usage_tracking (user_id, model, input_tokens, output_tokens, total_tokens, request_type)
          VALUES (${userId}, ${model}, ${inputTokens}, ${outputTokens}, ${totalTokens}, ${requestType})`,
    );
  } catch (err) {
    logger.error({ err }, 'Failed to record usage');
  }
}

export function getUserUsage(userId: string): UsageStats {
  ensureTable();
  try {
    const db = getDatabase();

    // Total all-time
    const total = db.get(
      sql`SELECT COUNT(*) as requests, COALESCE(SUM(input_tokens), 0) as input, COALESCE(SUM(output_tokens), 0) as output, COALESCE(SUM(total_tokens), 0) as total
          FROM usage_tracking WHERE user_id = ${userId}`,
    ) as { requests: number; input: number; output: number; total: number };

    // Today
    const today = db.get(
      sql`SELECT COUNT(*) as requests, COALESCE(SUM(total_tokens), 0) as tokens
          FROM usage_tracking WHERE user_id = ${userId} AND DATE(created_at) = DATE('now')`,
    ) as { requests: number; tokens: number };

    // This month
    const month = db.get(
      sql`SELECT COUNT(*) as requests, COALESCE(SUM(total_tokens), 0) as tokens
          FROM usage_tracking WHERE user_id = ${userId} AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
    ) as { requests: number; tokens: number };

    // Estimate cost
    const costPerMInput = 0.15; // Average
    const costPerMOutput = 0.60;
    const estimatedCost = (total.input * costPerMInput + total.output * costPerMOutput) / 1_000_000;

    return {
      userId,
      totalRequests: total.requests,
      totalTokens: total.total,
      inputTokens: total.input,
      outputTokens: total.output,
      estimatedCostUsd: estimatedCost,
      todayRequests: today.requests,
      todayTokens: today.tokens,
      monthRequests: month.requests,
      monthTokens: month.tokens,
    };
  } catch (err) {
    logger.error({ err }, 'Failed to get user usage');
    return {
      userId,
      totalRequests: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0,
      estimatedCostUsd: 0, todayRequests: 0, todayTokens: 0, monthRequests: 0, monthTokens: 0,
    };
  }
}

export function getRecentUsage(userId: string, limit: number = 20): UsageRecord[] {
  ensureTable();
  try {
    const db = getDatabase();
    return db.all(
      sql`SELECT * FROM usage_tracking WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`,
    ) as UsageRecord[];
  } catch (err) {
    logger.error({ err }, 'Failed to get recent usage');
    return [];
  }
}

export function getGlobalUsage(): { totalRequests: number; totalTokens: number; activeUsers: number } {
  ensureTable();
  try {
    const db = getDatabase();
    const result = db.get(
      sql`SELECT COUNT(*) as requests, COALESCE(SUM(total_tokens), 0) as tokens, COUNT(DISTINCT user_id) as users
          FROM usage_tracking WHERE DATE(created_at) = DATE('now')`,
    ) as { requests: number; tokens: number; users: number };
    return { totalRequests: result.requests, totalTokens: result.tokens, activeUsers: result.users };
  } catch (err) {
    logger.error({ err }, 'Failed to get global usage');
    return { totalRequests: 0, totalTokens: 0, activeUsers: 0 };
  }
}
