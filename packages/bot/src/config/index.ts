/**
 * Bot Configuration
 */

function env(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  /** Telegram settings */
  telegram: {
    botToken: env('TELEGRAM_BOT_TOKEN', ''),
    webhookUrl: env('TELEGRAM_WEBHOOK_URL', ''),
    useWebhook: env('TELEGRAM_USE_WEBHOOK', 'false') === 'true',
  },

  /** Server connection */
  server: {
    url: env('SERVER_URL', 'http://localhost:3000'),
  },

  /** Logging */
  logging: {
    level: env('BOT_LOG_LEVEL', 'info'),
  },
} as const;

export type BotConfig = typeof config;
