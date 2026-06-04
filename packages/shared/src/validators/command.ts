/**
 * Command validation schemas
 */

import { z } from 'zod';
import { MAX_COMMAND_TIMEOUT_MS, MAX_SHELL_COMMAND_LENGTH } from '../constants';

/** Command type validation */
export const commandTypeSchema = z.enum([
  'status', 'system_info', 'process_list', 'process_kill',
  'screenshot', 'screen_record',
  'file_list', 'file_info', 'file_download', 'file_upload', 'file_search', 'file_delete',
  'shell',
  'app_list', 'app_launch', 'app_close',
  'notify',
  'lock_screen', 'set_volume', 'get_clipboard', 'set_clipboard',
  'sleep', 'hibernate',
  'custom',
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
