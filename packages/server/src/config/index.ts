/**
 * Server Configuration
 *
 * Centralized, validated configuration from environment variables.
 * Uses a lazy-get pattern so missing vars fail fast at startup.
 */

function env(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function envInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`Invalid integer for ${key}: ${raw}`);
  return parsed;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  return raw === 'true' || raw === '1';
}

export const config = {
  /** Server settings */
  server: {
    host: env('SERVER_HOST', '0.0.0.0'),
    port: envInt('SERVER_PORT', 3000),
    nodeEnv: env('NODE_ENV', 'development'),
    corsOrigins: env('CORS_ORIGINS', '').split(',').filter(Boolean),
    logLevel: env('SERVER_LOG_LEVEL', 'info'),
  },

  /** Telegram Bot */
  telegram: {
    botToken: env('TELEGRAM_BOT_TOKEN', ''),
    webhookUrl: env('TELEGRAM_WEBHOOK_URL', ''),
  },

  /** Gemini AI */
  gemini: {
    apiKey: env('GEMINI_API_KEY', ''),
    model: env('GEMINI_MODEL', 'gemini-2.0-flash'),
  },

  /** Database */
  database: {
    url: env('DATABASE_URL', ''),
    sqlitePath: env('SQLITE_PATH', './data/remoteos.db'),
  },

  /** Redis (optional for dev) */
  redis: {
    url: env('REDIS_URL', ''),
  },

  /** Security */
  security: {
    jwtSecret: env('JWT_SECRET', 'dev-secret-change-in-production'),
    registrationCode: env('DEVICE_REGISTRATION_CODE', 'remoteos-dev'),
  },

  /** Rate Limiting */
  rateLimit: {
    max: envInt('RATE_LIMIT_MAX', 300),
    windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60_000),
  },

  /** Agent settings */
  agent: {
    pollIntervalMs: envInt('AGENT_POLL_INTERVAL_MS', 2000),
    heartbeatIntervalMs: envInt('AGENT_HEARTBEAT_INTERVAL_MS', 10_000),
    commandTimeoutMs: envInt('AGENT_COMMAND_TIMEOUT_MS', 30_000),
  },
} as const;

export type Config = typeof config;
