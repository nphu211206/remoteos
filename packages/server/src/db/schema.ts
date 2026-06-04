/**
 * RemoteOS Database Schema — Drizzle ORM (SQLite)
 *
 * All tables derived from @remoteos/shared types.
 * SQLite uses: integer for boolean, text for enum/JSON, text for timestamps.
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ─── Users ─────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // UUID
  telegramId: integer('telegram_id').unique().notNull(),
  telegramUsername: text('telegram_username'),
  displayName: text('display_name').notNull(),
  tier: text('tier', { enum: ['free', 'pro', 'team', 'enterprise'] }).notNull().default('free'),
  status: text('status', { enum: ['active', 'suspended', 'deleted'] }).notNull().default('active'),
  language: text('language').notNull().default('vi'),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  preferences: text('preferences', {}).notNull().default('{}'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  lastActiveAt: text('last_active_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ─── Devices ───────────────────────────────────────────────────────

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(), // UUID from agent
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  os: text('os', { enum: ['windows', 'macos', 'linux', 'unknown'] }).notNull(),
  osVersion: text('os_version').notNull(),
  hostname: text('hostname').notNull(),
  agentVersion: text('agent_version').notNull(),
  localIp: text('local_ip'),
  cpuModel: text('cpu_model'),
  cpuCores: integer('cpu_cores'),
  totalRamGb: real('total_ram_gb'),
  totalDiskGb: real('total_disk_gb'),
  gpuModel: text('gpu_model'),
  screenResolution: text('screen_resolution'),
  status: text('status', {
    enum: ['unregistered', 'pending', 'online', 'offline', 'busy', 'locked', 'error'],
  }).notNull().default('unregistered'),
  sessionToken: text('session_token'),
  sessionExpiresAt: text('session_expires_at'),
  lastSeenAt: text('last_seen_at'),
  config: text('config', {}),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ─── Device State (latest snapshot) ────────────────────────────────

export const deviceState = sqliteTable('device_state', {
  deviceId: text('device_id').primaryKey().references(() => devices.id),
  status: text('status').notNull(),
  cpuUsage: real('cpu_usage').notNull(),
  ramUsage: real('ram_usage').notNull(),
  diskUsage: real('disk_usage').notNull(),
  cpuTemp: real('cpu_temp'),
  gpuTemp: real('gpu_temp'),
  networkDownMbps: real('network_down_mbps').notNull(),
  networkUpMbps: real('network_up_mbps').notNull(),
  uptimeSeconds: integer('uptime_seconds').notNull(),
  processCount: integer('process_count').notNull(),
  batteryPercent: real('battery_percent'),
  isCharging: integer('is_charging', { mode: 'boolean' }),
  activeWindow: text('active_window'),
  timestamp: text('timestamp').notNull(),
});

// ─── Commands ──────────────────────────────────────────────────────

export const commands = sqliteTable('commands', {
  id: text('id').primaryKey(), // UUID
  deviceId: text('device_id').notNull().references(() => devices.id),
  userId: text('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  params: text('params').notNull().default('{}'),
  priority: text('priority', { enum: ['low', 'normal', 'high', 'critical'] }).notNull().default('normal'),
  timeoutMs: integer('timeout_ms').notNull().default(30000),
  status: text('status', {
    enum: ['created', 'queued', 'delivered', 'executing', 'completed', 'failed', 'timeout', 'cancelled'],
  }).notNull().default('created'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  deliveredAt: text('delivered_at'),
  startedAt: text('started_at'),
  expiresAt: text('expires_at').notNull(),
  idempotencyKey: text('idempotency_key'),
  parentCommandId: text('parent_command_id'),
  aiMetadata: text('ai_metadata', {}),
});

// ─── Command Results ───────────────────────────────────────────────

export const commandResults = sqliteTable('command_results', {
  commandId: text('command_id').primaryKey().references(() => commands.id),
  deviceId: text('device_id').notNull().references(() => devices.id),
  status: text('status', { enum: ['completed', 'failed', 'timeout'] }).notNull(),
  output: text('output', {}),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  errorRetryable: integer('error_retryable', { mode: 'boolean' }),
  executionTimeMs: integer('execution_time_ms').notNull(),
  executedAt: text('executed_at').notNull(),
});

// ─── Sessions ──────────────────────────────────────────────────────

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // UUID
  userId: text('user_id').notNull().references(() => users.id),
  deviceId: text('device_id').references(() => devices.id),
  tokenHash: text('token_hash').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  expiresAt: text('expires_at').notNull(),
  metadata: text('metadata', {}).notNull().default('{}'),
});

// ─── Audit Log ─────────────────────────────────────────────────────

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(), // UUID
  userId: text('user_id').notNull().references(() => users.id),
  deviceId: text('device_id'),
  action: text('action').notNull(),
  details: text('details', {}).notNull().default('{}'),
  ip: text('ip').notNull().default(''),
  timestamp: text('timestamp').notNull().$defaultFn(() => new Date().toISOString()),
  success: integer('success', { mode: 'boolean' }).notNull(),
  failureReason: text('failure_reason'),
});

// ─── Registration Tokens ───────────────────────────────────────────

export const registrationTokens = sqliteTable('registration_tokens', {
  id: text('id').primaryKey(), // UUID
  tokenHash: text('token_hash').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  usedByDeviceId: text('used_by_device_id'),
});

// ─── User AI Configs ──────────────────────────────────────────────

export const userAiConfigs = sqliteTable('user_ai_configs', {
  id: text('id').primaryKey(), // UUID
  userId: text('user_id').notNull().references(() => users.id),
  provider: text('provider', {
    enum: ['gemini', 'openai', 'anthropic', 'local'],
  }).notNull(),
  apiKey: text('api_key').notNull(), // Encrypted
  model: text('model').notNull(),
  baseUrl: text('base_url'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ─── Relations ─────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
  commands: many(commands),
  sessions: many(sessions),
  auditLog: many(auditLog),
  aiConfigs: many(userAiConfigs),
}));

export const userAiConfigsRelations = relations(userAiConfigs, ({ one }) => ({
  user: one(users, { fields: [userAiConfigs.userId], references: [users.id] }),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, { fields: [devices.userId], references: [users.id] }),
  state: one(deviceState, { fields: [devices.id], references: [deviceState.deviceId] }),
  commands: many(commands),
}));

export const commandsRelations = relations(commands, ({ one }) => ({
  device: one(devices, { fields: [commands.deviceId], references: [devices.id] }),
  user: one(users, { fields: [commands.userId], references: [users.id] }),
  result: one(commandResults, { fields: [commands.id], references: [commandResults.commandId] }),
}));

export const commandResultsRelations = relations(commandResults, ({ one }) => ({
  command: one(commands, { fields: [commandResults.commandId], references: [commands.id] }),
}));
