/**
 * Command validation schemas
 */

import { z } from 'zod';
import { MAX_COMMAND_TIMEOUT_MS, MAX_SHELL_COMMAND_LENGTH } from '../constants';

/** Command type validation — synced with shared/src/types/command.ts */
export const commandTypeSchema = z.enum([
  // System monitoring
  'status', 'system_info', 'process_list', 'process_kill',
  // Screen
  'screenshot', 'screen_record',
  // File operations
  'file_list', 'file_info', 'file_read', 'file_edit', 'file_download', 'file_upload',
  'file_search', 'file_delete',
  // Editor
  'open_editor',
  // Shell
  'shell',
  // Applications
  'app_list', 'app_launch', 'app_close',
  // Notifications
  'notify',
  // System control
  'lock_screen', 'set_volume', 'get_clipboard', 'set_clipboard',
  // Power
  'sleep', 'hibernate',
  // Custom
  'custom',
  // Advanced AI
  'screen_vision', 'desktop_click', 'desktop_type', 'desktop_keys',
  'desktop_drag', 'desktop_scroll',
  'browser_open', 'browser_search', 'browser_navigate',
  'process_file', 'analyze_image',
  'memory_save', 'memory_load',
  'proactive_suggest', 'daily_report',
  'execute_code', 'sql_query', 'data_export',
  'generate_chart', 'generate_report',
  // RAG System
  'rag_query', 'rag_add_document',
  // AI Planner & Multi-Agent
  'plan_task', 'parallel_tasks',
  // Workflow
  'workflow_create', 'workflow_execute',
  // Analytics
  'analytics_predict', 'analytics_anomaly',
  // Plugin System
  'plugin_list', 'plugin_install', 'plugin_uninstall',
  // Integration Hub
  'integration_github', 'integration_slack', 'integration_email',
  // Enterprise
  'enterprise_users', 'enterprise_teams',
]);

/** Command priority validation */
export const commandPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

/** Command status validation */
export const commandStatusSchema = z.enum([
  'created', 'queued', 'delivered', 'executing', 'completed', 'failed', 'timeout', 'cancelled',
]);

/** Command danger level validation */
export const commandDangerLevelSchema = z.enum(['safe', 'moderate', 'dangerous', 'critical']);

/** Command parameters validation (base — additional per-type validation done in code) */
export const commandParamsSchema = z.record(z.unknown());

/** Create command request validation */
export const commandCreateRequestSchema = z.object({
  deviceId: z.string().uuid(),
  type: commandTypeSchema,
  params: commandParamsSchema.default({}),
  priority: commandPrioritySchema.default('normal'),
  timeoutMs: z.number()
    .int()
    .min(1000)
    .max(MAX_COMMAND_TIMEOUT_MS)
    .default(30_000),
});

/** Command result validation */
export const commandResultSchema = z.object({
  commandId: z.string().min(1),
  deviceId: z.string().min(1),
  status: z.enum(['completed', 'failed', 'timeout']),
  output: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    stack: z.string().optional(),
  }).optional(),
  executionTimeMs: z.number().int().min(0),
  executedAt: z.coerce.date(),
});

/** Command result submission validation */
export const commandResultRequestSchema = z.object({
  deviceId: z.string().uuid(),
  sessionToken: z.string().min(1),
  result: commandResultSchema,
});

/** Poll request validation */
export const pollRequestSchema = z.object({
  deviceId: z.string().uuid(),
  sessionToken: z.string().min(1),
  lastCommandId: z.string().uuid().optional(),
});

/** Shell command validation — FULL ACCESS MODE */
export const shellCommandSchema = z.object({
  command: z.string()
    .min(1, 'Command cannot be empty')
    .max(10000, 'Command too long'),
});
