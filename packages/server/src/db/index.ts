/**
 * Database Connection Module
 *
 * Initializes SQLite database with Drizzle ORM.
 * Auto-creates the data directory and runs migrations on startup.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.js';
import { logger } from '../config/logger.js';
import { config } from '../config/index.js';

let db: ReturnType<typeof createDatabase>;

function createDatabase() {
  const dbPath = config.database.sqlitePath;

  // Ensure data directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.info({ dir }, 'Created database directory');
  }

  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  logger.info({ path: dbPath }, 'Database connected');

  return drizzle(sqlite, { schema });
}

/**
 * Get the database instance (singleton)
 */
export function getDatabase() {
  if (!db) {
    db = createDatabase();
  }
  return db;
}

/**
 * Initialize database tables (create if not exist)
 * Uses Drizzle's raw SQL for initial setup since we don't have migrations yet
 */
export function initializeDatabase() {
  const database = getDatabase();
  const sqlite = database.$client;

  logger.info('Initializing database tables...');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id INTEGER UNIQUE NOT NULL,
      telegram_username TEXT,
      display_name TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      language TEXT NOT NULL DEFAULT 'vi',
      timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
      preferences TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      os TEXT NOT NULL,
      os_version TEXT NOT NULL,
      hostname TEXT NOT NULL,
      agent_version TEXT NOT NULL,
      local_ip TEXT,
      cpu_model TEXT,
      cpu_cores INTEGER,
      total_ram_gb REAL,
      total_disk_gb REAL,
      gpu_model TEXT,
      screen_resolution TEXT,
      status TEXT NOT NULL DEFAULT 'unregistered',
      session_token TEXT,
      session_expires_at TEXT,
      last_seen_at TEXT,
      config TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_state (
      device_id TEXT PRIMARY KEY REFERENCES devices(id),
      status TEXT NOT NULL,
      cpu_usage REAL NOT NULL,
      ram_usage REAL NOT NULL,
      disk_usage REAL NOT NULL,
      cpu_temp REAL,
      gpu_temp REAL,
      network_down_mbps REAL NOT NULL,
      network_up_mbps REAL NOT NULL,
      uptime_seconds INTEGER NOT NULL,
      process_count INTEGER NOT NULL,
      battery_percent REAL,
      is_charging INTEGER,
      active_window TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}',
      priority TEXT NOT NULL DEFAULT 'normal',
      timeout_ms INTEGER NOT NULL DEFAULT 30000,
      status TEXT NOT NULL DEFAULT 'created',
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      started_at TEXT,
      expires_at TEXT NOT NULL,
      idempotency_key TEXT,
      parent_command_id TEXT,
      ai_metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS command_results (
      command_id TEXT PRIMARY KEY REFERENCES commands(id),
      device_id TEXT NOT NULL REFERENCES devices(id),
      status TEXT NOT NULL,
      output TEXT,
      error_code TEXT,
      error_message TEXT,
      error_retryable INTEGER,
      execution_time_ms INTEGER NOT NULL,
      executed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      device_id TEXT REFERENCES devices(id),
      token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      device_id TEXT,
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      ip TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL,
      success INTEGER NOT NULL,
      failure_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS registration_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      used_by_device_id TEXT
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
    CREATE INDEX IF NOT EXISTS idx_commands_device_id_status ON commands(device_id, status);
    CREATE INDEX IF NOT EXISTS idx_commands_user_id ON commands(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);

    -- User AI Configs table
    CREATE TABLE IF NOT EXISTS user_ai_configs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL CHECK(provider IN ('gemini', 'openai', 'anthropic', 'local')),
      api_key TEXT NOT NULL,
      model TEXT NOT NULL,
      base_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_ai_configs_user_id ON user_ai_configs(user_id);
  `);

  logger.info('Database tables initialized');
}

export { schema };
