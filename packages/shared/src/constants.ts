/**
 * RemoteOS System Constants
 *
 * Central configuration values used across all packages.
 * Organized by domain for easy discovery.
 */

// ─── API ───────────────────────────────────────────────────────────

/** API version prefix */
export const API_VERSION = 'v1' as const;

/** API base path */
export const API_BASE_PATH = `/api/${API_VERSION}` as const;

// ─── Timing ────────────────────────────────────────────────────────

/** Agent heartbeat interval (10 seconds) */
export const HEARTBEAT_INTERVAL_MS = 10_000;

/** Agent command poll interval (2 seconds) */
export const POLL_INTERVAL_MS = 2_000;

/** Default command execution timeout (120 seconds) */
export const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;

/** Maximum command execution timeout (5 minutes) */
export const MAX_COMMAND_TIMEOUT_MS = 300_000;

/** Device offline detection threshold (30 seconds without heartbeat) */
export const DEVICE_OFFLINE_THRESHOLD_MS = 30_000;

/** Device pending registration expiry (5 minutes) */
export const REGISTRATION_EXPIRY_MS = 5 * 60 * 1000;

/** Session token expiry (24 hours) */
export const SESSION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Heartbeat timeout before marking device offline */
export const HEARTBEAT_TIMEOUT_MS = 30_000;

// ─── Rate Limiting ─────────────────────────────────────────────────

/** Max commands per minute per user */
export const RATE_LIMIT_COMMANDS_PER_MINUTE = 300;

/** Max commands per hour per user */
export const RATE_LIMIT_COMMANDS_PER_HOUR = 500;

/** Max API requests per minute per IP */
export const RATE_LIMIT_API_PER_MINUTE = 300;

/** Max webhook requests per minute */
export const RATE_LIMIT_WEBHOOK_PER_MINUTE = 200;

// ─── Device Limits ─────────────────────────────────────────────────

/** Max devices per user (free tier) */
export const MAX_DEVICES_FREE = 1;

/** Max devices per user (pro tier) */
export const MAX_DEVICES_PRO = 5;

/** Max devices per user (team tier) */
export const MAX_DEVICES_TEAM = 25;

/** Max commands in agent queue */
export const MAX_COMMAND_QUEUE_SIZE = 100;

// ─── Alert Thresholds ──────────────────────────────────────────────

export const ALERT_THRESHOLDS = {
  /** CPU usage % to trigger alert */
  CPU_HIGH: 90,
  /** RAM usage % to trigger alert */
  RAM_HIGH: 90,
  /** Disk free % below which to alert */
  DISK_LOW: 10,
  /** CPU temperature (°C) to trigger alert */
  TEMP_HIGH: 85,
  /** Network downtime (seconds) before alerting */
  NETWORK_DOWN_SECONDS: 60,
} as const;

/** Alert cooldown periods (seconds) to prevent spam */
export const ALERT_COOLDOWNS = {
  CPU_HIGH: 15 * 60,
  RAM_HIGH: 15 * 60,
  DISK_LOW: 60 * 60,
  TEMP_HIGH: 5 * 60,
  APP_CRASH: 5 * 60,
  NETWORK_DOWN: 5 * 60,
} as const;

// ─── Security ──────────────────────────────────────────────────────

/**
 * FULL ACCESS MODE — No command restrictions
 * User has granted full system access to the AI.
 * The AI can execute ANY command.
 */
export const ALLOWED_SHELL_COMMANDS: readonly string[] = [
  '*', // Wildcard — all commands allowed
] as const;

/** FULL ACCESS MODE — No restrictions. User has complete control. */
export const BLOCKED_SHELL_PATTERNS: readonly string[] = [
  // Empty — FULL ACCESS mode, no restrictions
] as const;

/** Maximum file path length */
export const MAX_PATH_LENGTH = 260;

/** Maximum shell command length */
export const MAX_SHELL_COMMAND_LENGTH = 10000;

/** Maximum file upload size (50MB) */
export const MAX_FILE_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Maximum file download size (2GB) */
export const MAX_FILE_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

// ─── Telegram ──────────────────────────────────────────────────────

/** Maximum Telegram message length */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/** Maximum Telegram caption length */
export const TELEGRAM_MAX_CAPTION_LENGTH = 1024;

/** Maximum Telegram file size (50MB via Bot API) */
export const TELEGRAM_MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Telegram inline keyboard max buttons per row */
export const TELEGRAM_MAX_BUTTONS_PER_ROW = 3;

/** Telegram inline keyboard max rows */
export const TELEGRAM_MAX_ROWS = 10;

// ─── Database ──────────────────────────────────────────────────────

/** SQLite database filename (development) */
export const SQLITE_DB_FILENAME = 'remoteos.db';

/** Default page size for pagination */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum page size for pagination */
export const MAX_PAGE_SIZE = 100;

// ─── Cache ─────────────────────────────────────────────────────────

/** System status cache TTL (30 seconds) */
export const CACHE_TTL_STATUS_MS = 30_000;

/** Process list cache TTL (10 seconds) */
export const CACHE_TTL_PROCESSES_MS = 10_000;

/** AI response cache TTL (1 hour) */
export const CACHE_TTL_AI_RESPONSE_MS = 60 * 60 * 1000;

/** Max in-memory cache entries */
export const CACHE_MAX_ENTRIES = 1000;

// ─── Regex Patterns ────────────────────────────────────────────────

/** UUID v4 pattern */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** URL pattern */
export const URL_REGEX = /^https?:\/\/.+/;

/** IPv4 pattern */
export const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

/** Telegram user ID pattern (numeric) */
export const TELEGRAM_ID_REGEX = /^\d+$/;

/** Semver pattern */
export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
