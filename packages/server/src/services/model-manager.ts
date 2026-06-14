/**
 * Smart Model Manager — Intelligent Model Rotation
 *
 * Maximizes AI throughput by rotating across all available Gemini models.
 * Each model has independent rate limits (RPM, RPD, TPM).
 * By rotating, we can use the COMBINED capacity of all models.
 *
 * Quota Analysis (from user's Gemini API dashboard):
 * ┌─────────────────────────┬─────┬────────┬─────┐
 * │ Model                   │ RPM │ TPM    │ RPD │
 * ├─────────────────────────┼─────┼────────┼─────┤
 * │ gemini-3.1-flash-lite   │ 15  │ 250K   │ 500 │ ← Highest capacity!
 * │ gemini-2.5-flash-lite   │ 10  │ 250K   │ 20  │
 * │ gemini-3.5-flash        │ 5   │ 250K   │ 20  │
 * │ gemini-2.5-flash        │ 5   │ 250K   │ 20  │
 * │ gemini-3-flash          │ 5   │ 250K   │ 20  │
 * └─────────────────────────┴─────┴────────┴─────┘
 *
 * Combined: 40 RPM, 1.25M TPM, 580 RPD
 *
 * Strategy:
 * - Round-robin across all models to distribute load
 * - Track per-model usage (RPM, RPD)
 * - Skip models that hit their limit
 * - Prefer higher-capacity models for complex tasks
 * - Use lighter models for simple/recovery tasks
 */

import { logger } from '../config/logger.js';

// ─── Model Configuration ─────────────────────────────────────────

export interface ModelConfig {
  id: string;
  name: string;
  rpm: number;        // Requests per minute limit
  rpd: number;        // Requests per day limit
  tpm: number;        // Tokens per minute limit
  quality: number;    // Quality score 1-5 (5 = best)
  contextWindow: number; // Max context tokens
  isAvailable: boolean;  // Currently available
}

const MODELS: ModelConfig[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    rpm: 5,
    rpd: 20,
    tpm: 250_000,
    quality: 5,
    contextWindow: 1_000_000,
    isAvailable: true,
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    rpm: 5,
    rpd: 20,
    tpm: 250_000,
    quality: 5,
    contextWindow: 1_000_000,
    isAvailable: true,
  },
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    rpm: 5,
    rpd: 20,
    tpm: 250_000,
    quality: 4,
    contextWindow: 1_000_000,
    isAvailable: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    rpm: 15,
    rpd: 500,
    tpm: 250_000,
    quality: 3,
    contextWindow: 1_000_000,
    isAvailable: true,
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    rpm: 10,
    rpd: 20,
    tpm: 250_000,
    quality: 3,
    contextWindow: 1_000_000,
    isAvailable: true,
  },
];

// ─── Usage Tracking ──────────────────────────────────────────────

interface ModelUsage {
  /** Timestamps of requests in the last minute */
  requestsInMinute: number[];
  /** Total requests today */
  requestsToday: number;
  /** Day reset timestamp */
  dayStart: number;
  /** Total tokens used in the last minute */
  tokensInMinute: number;
  /** Last error timestamp (for backoff) */
  lastErrorAt: number;
  /** Error count in last 5 minutes */
  recentErrors: number;
  /** Consecutive failures */
  consecutiveFailures: number;
}

const usage = new Map<string, ModelUsage>();

function getUsage(modelId: string): ModelUsage {
  if (!usage.has(modelId)) {
    usage.set(modelId, {
      requestsInMinute: [],
      requestsToday: 0,
      dayStart: getDayStart(),
      tokensInMinute: 0,
      lastErrorAt: 0,
      recentErrors: 0,
      consecutiveFailures: 0,
    });
  }
  return usage.get(modelId)!;
}

function getDayStart(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function cleanupMinuteRequests(modelUsage: ModelUsage): void {
  const oneMinuteAgo = Date.now() - 60_000;
  modelUsage.requestsInMinute = modelUsage.requestsInMinute.filter(t => t > oneMinuteAgo);
}

function resetDayIfNeeded(modelUsage: ModelUsage): void {
  const dayStart = getDayStart();
  if (modelUsage.dayStart < dayStart) {
    modelUsage.requestsToday = 0;
    modelUsage.dayStart = dayStart;
  }
}

// ─── Main Manager ────────────────────────────────────────────────

export class ModelManager {
  private currentIndex = 0;

  /**
   * Get the best available model for a request.
   * Uses round-robin with capacity awareness.
   */
  getBestModel(taskComplexity: 'simple' | 'medium' | 'complex' = 'medium'): ModelConfig | null {
    const now = Date.now();

    // Sort models by suitability
    const candidates = MODELS
      .filter(m => m.isAvailable)
      .filter(m => {
        // Check if model has capacity
        const u = getUsage(m.id);
        cleanupMinuteRequests(u);
        resetDayIfNeeded(u);

        // Check RPM
        if (u.requestsInMinute.length >= m.rpm * 0.9) return false; // 90% threshold

        // Check RPD
        if (u.requestsToday >= m.rpd * 0.9) return false;

        // Check error backoff
        if (u.consecutiveFailures >= 3) {
          // Backoff: skip for 2 minutes after 3 consecutive failures
          if (now - u.lastErrorAt < 120_000) return false;
          u.consecutiveFailures = 0; // Reset after backoff
        }

        return true;
      });

    if (candidates.length === 0) {
      logger.warn('All models at capacity, trying least-loaded');
      // Fallback: pick the model with the most remaining capacity
      return this.getLeastLoadedModel();
    }

    // For complex tasks, prefer higher quality models
    if (taskComplexity === 'complex') {
      const highQuality = candidates.filter(m => m.quality >= 4);
      if (highQuality.length > 0) {
        return this.roundRobin(highQuality);
      }
    }

    // For simple tasks, prefer higher capacity models
    if (taskComplexity === 'simple') {
      const highCapacity = candidates.filter(m => m.rpm >= 10);
      if (highCapacity.length > 0) {
        return this.roundRobin(highCapacity);
      }
    }

    // Default: round-robin across all candidates
    return this.roundRobin(candidates);
  }

  /**
   * Round-robin selection across a list of models
   */
  private roundRobin(models: ModelConfig[]): ModelConfig {
    if (models.length === 0) return MODELS[0]!;

    // Find the next model in rotation that's in the candidates
    const sorted = [...models].sort((a, b) => {
      // Prefer higher quality, then higher RPM
      if (a.quality !== b.quality) return b.quality - a.quality;
      return b.rpm - a.rpm;
    });

    const model = sorted[this.currentIndex % sorted.length]!;
    this.currentIndex = (this.currentIndex + 1) % sorted.length;
    return model;
  }

  /**
   * Get the model with the most remaining capacity
   */
  private getLeastLoadedModel(): ModelConfig {
    let best = MODELS[0]!;
    let bestScore = -Infinity;

    for (const model of MODELS) {
      const u = getUsage(model.id);
      cleanupMinuteRequests(u);
      resetDayIfNeeded(u);

      const rpmRemaining = model.rpm - u.requestsInMinute.length;
      const rpdRemaining = model.rpd - u.requestsToday;
      const score = rpmRemaining * 10 + rpdRemaining;

      if (score > bestScore) {
        bestScore = score;
        best = model;
      }
    }

    return best;
  }

  /**
   * Record a successful request
   */
  recordSuccess(modelId: string, tokensUsed: number = 0): void {
    const u = getUsage(modelId);
    u.requestsInMinute.push(Date.now());
    u.requestsToday++;
    u.tokensInMinute += tokensUsed;
    u.consecutiveFailures = 0;
  }

  /**
   * Record a failed request (429 rate limit)
   */
  recordRateLimit(modelId: string): void {
    const u = getUsage(modelId);
    u.lastErrorAt = Date.now();
    u.consecutiveFailures++;
    u.recentErrors++;

    // Mark model as temporarily unavailable if too many errors
    const model = MODELS.find(m => m.id === modelId);
    if (model && u.consecutiveFailures >= 5) {
      model.isAvailable = false;
      logger.warn({ modelId }, 'Model temporarily disabled due to rate limits');

      // Re-enable after 5 minutes
      setTimeout(() => {
        model.isAvailable = true;
        u.consecutiveFailures = 0;
        logger.info({ modelId }, 'Model re-enabled');
      }, 300_000);
    }
  }

  /**
   * Record a generic error
   */
  recordError(modelId: string): void {
    const u = getUsage(modelId);
    u.lastErrorAt = Date.now();
    u.recentErrors++;
  }

  /**
   * Get model by ID
   */
  getModel(modelId: string): ModelConfig | undefined {
    return MODELS.find(m => m.id === modelId);
  }

  /**
   * Get all models with their current usage stats
   */
  getStats(): Array<ModelConfig & { usage: { rpmUsed: number; rpdUsed: number; failures: number } }> {
    return MODELS.map(m => {
      const u = getUsage(m.id);
      cleanupMinuteRequests(u);
      resetDayIfNeeded(u);
      return {
        ...m,
        usage: {
          rpmUsed: u.requestsInMinute.length,
          rpdUsed: u.requestsToday,
          failures: u.consecutiveFailures,
        },
      };
    });
  }

  /**
   * Get the recovery model (lightweight, high capacity)
   */
  getRecoveryModel(): ModelConfig {
    // Prefer lite models for recovery (they have higher RPM)
    const liteModels = MODELS.filter(m =>
      m.isAvailable && m.id.includes('lite') && m.rpm >= 10
    );
    if (liteModels.length > 0) {
      return liteModels[0]!;
    }
    return MODELS.find(m => m.isAvailable) ?? MODELS[0]!;
  }

  /**
   * Wait for capacity on a specific model
   */
  async waitForCapacity(modelId: string): Promise<void> {
    const model = MODELS.find(m => m.id === modelId);
    if (!model) return;

    const u = getUsage(modelId);
    cleanupMinuteRequests(u);

    if (u.requestsInMinute.length >= model.rpm) {
      const oldestRequest = u.requestsInMinute[0]!;
      const waitTime = oldestRequest + 60_000 - Date.now() + 100;
      if (waitTime > 0 && waitTime < 60_000) {
        logger.info({ modelId, waitMs: waitTime }, 'Waiting for model capacity');
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Get total remaining capacity across all models
   */
  getTotalCapacity(): { rpm: number; rpd: number } {
    let totalRpm = 0;
    let totalRpd = 0;

    for (const model of MODELS) {
      if (!model.isAvailable) continue;
      const u = getUsage(model.id);
      cleanupMinuteRequests(u);
      resetDayIfNeeded(u);

      totalRpm += Math.max(0, model.rpm - u.requestsInMinute.length);
      totalRpd += Math.max(0, model.rpd - u.requestsToday);
    }

    return { rpm: totalRpm, rpd: totalRpd };
  }
}

// ─── Singleton ───────────────────────────────────────────────────

let managerInstance: ModelManager | null = null;

export function getModelManager(): ModelManager {
  if (!managerInstance) {
    managerInstance = new ModelManager();
  }
  return managerInstance;
}
