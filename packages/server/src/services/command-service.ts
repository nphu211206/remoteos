/**
 * Command Service
 *
 * Manages command lifecycle: creation, queuing, polling, result handling.
 * Uses SQLite database via Drizzle ORM.
 */

import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type {
  Command,
  CommandOutput,
  CommandResult,
  CommandResultRequest,
  PollRequest,
  PollResponse,
  CommandStatus,
} from '@remoteos/shared';
import { DEFAULT_COMMAND_TIMEOUT_MS } from '@remoteos/shared/constants';
import { getDatabase, schema } from '../db/index.js';
import { logger } from '../config/logger.js';

/** Minimal command create request for internal use */
interface CommandCreateInput {
  deviceId: string;
  type: string;
  params?: Record<string, unknown>;
  priority?: string;
  timeoutMs?: number;
}

// Result waiters for synchronous command execution
const resultWaiters = new Map<string, {
  resolve: (result: CommandResult) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

export class CommandService {
  /**
   * Create a new command
   */
  async create(userId: string, request: CommandCreateInput): Promise<{
    success: boolean;
    command?: Command;
    estimatedWaitMs?: number;
    error?: string;
  }> {
    const db = getDatabase();
    const commandId = nanoid();
    const now = new Date();
    const timeoutMs = request.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const nowStr = now.toISOString();
    const expiresAt = new Date(now.getTime() + timeoutMs).toISOString();

    await db.insert(schema.commands).values({
      id: commandId,
      deviceId: request.deviceId,
      userId,
      type: request.type,
      params: JSON.stringify(request.params ?? {}),
      priority: (request.priority ?? 'normal') as 'low' | 'normal' | 'high' | 'critical',
      timeoutMs,
      status: 'queued',
      createdAt: nowStr,
      expiresAt,
    });

    const command: Command = {
      id: commandId,
      deviceId: request.deviceId,
      userId,
      type: request.type as Command['type'],
      params: request.params ?? {},
      priority: (request.priority as Command['priority']) ?? 'normal',
      timeoutMs,
      status: 'queued',
      createdAt: now,
      deliveredAt: null,
      startedAt: null,
      expiresAt: new Date(expiresAt),
    };

    logger.info({ commandId, deviceId: request.deviceId, type: request.type }, 'Command created');

    // Count pending commands for this device
    const pending = await db.query.commands.findMany({
      where: and(
        eq(schema.commands.deviceId, request.deviceId),
        eq(schema.commands.status, 'queued'),
      ),
    });

    return {
      success: true,
      command,
      estimatedWaitMs: pending.length * 1000,
    };
  }

  /**
   * Agent polls for pending commands
   */
  async pollForDevice(request: PollRequest): Promise<PollResponse> {
    const db = getDatabase();

    // Find all queued commands for this device
    const queuedCommands = await db.query.commands.findMany({
      where: and(
        eq(schema.commands.deviceId, request.deviceId),
        eq(schema.commands.status, 'queued'),
      ),
    });

    if (queuedCommands.length === 0) {
      return { hasCommands: false, commands: [], serverTime: new Date() };
    }

    // Mark as delivered
    const now = new Date().toISOString();
    const commandIds = queuedCommands.map((c) => c.id);

    for (const cmdId of commandIds) {
      await db.update(schema.commands)
        .set({ status: 'delivered', deliveredAt: now })
        .where(eq(schema.commands.id, cmdId));
    }

    // Convert to Command type
    const commands: Command[] = queuedCommands.map((c) => ({
      id: c.id,
      deviceId: c.deviceId,
      userId: c.userId,
      type: c.type as Command['type'],
      params: JSON.parse(c.params) as Record<string, unknown>,
      priority: c.priority as Command['priority'],
      timeoutMs: c.timeoutMs,
      status: 'delivered' as CommandStatus,
      createdAt: new Date(c.createdAt),
      deliveredAt: new Date(now),
      startedAt: null,
      expiresAt: new Date(c.expiresAt),
    }));

    logger.info({ count: commands.length, deviceId: request.deviceId }, 'Commands delivered to agent');

    return {
      hasCommands: true,
      commands,
      serverTime: new Date(),
    };
  }

  /**
   * Agent submits command execution result
   */
  async submitResult(commandId: string, request: CommandResultRequest): Promise<{
    acknowledged: boolean;
  }> {
    const db = getDatabase();

    // Verify command exists
    const command = await db.query.commands.findFirst({
      where: eq(schema.commands.id, commandId),
    });

    if (!command) {
      return { acknowledged: false };
    }

    const result = request.result;

    // Update command status
    await db.update(schema.commands)
      .set({ status: result.status as CommandStatus })
      .where(eq(schema.commands.id, commandId));

    // Insert result
    await db.insert(schema.commandResults).values({
      commandId,
      deviceId: request.deviceId,
      status: result.status,
      output: result.output ? JSON.stringify(result.output) : null,
      errorCode: result.error?.code ?? null,
      errorMessage: result.error?.message ?? null,
      errorRetryable: result.error?.retryable ?? null,
      executionTimeMs: result.executionTimeMs,
      executedAt: result.executedAt.toISOString(),
    });

    // Resolve waiter if exists
    const waiter = resultWaiters.get(commandId);
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(result);
      resultWaiters.delete(commandId);
    }

    logger.info({ commandId, status: result.status, executionTimeMs: result.executionTimeMs }, 'Command result received');

    return { acknowledged: true };
  }

  /**
   * Get command by ID
   */
  async getById(commandId: string): Promise<{
    command: Command;
    result: CommandResult | null;
  } | null> {
    const db = getDatabase();

    const command = await db.query.commands.findFirst({
      where: eq(schema.commands.id, commandId),
    });

    if (!command) return null;

    const resultRow = await db.query.commandResults.findFirst({
      where: eq(schema.commandResults.commandId, commandId),
    });

    return {
      command: {
        id: command.id,
        deviceId: command.deviceId,
        userId: command.userId,
        type: command.type as Command['type'],
        params: JSON.parse(command.params) as Record<string, unknown>,
        priority: command.priority as Command['priority'],
        timeoutMs: command.timeoutMs,
        status: command.status as CommandStatus,
        createdAt: new Date(command.createdAt),
        deliveredAt: command.deliveredAt ? new Date(command.deliveredAt) : null,
        startedAt: command.startedAt ? new Date(command.startedAt) : null,
        expiresAt: new Date(command.expiresAt),
      },
      result: resultRow ? {
        commandId: resultRow.commandId,
        deviceId: resultRow.deviceId,
        status: resultRow.status as CommandResult['status'],
        output: resultRow.output ? JSON.parse(resultRow.output) as CommandOutput : undefined,
        error: resultRow.errorCode ? {
          code: resultRow.errorCode,
          message: resultRow.errorMessage ?? '',
          retryable: resultRow.errorRetryable ?? false,
        } : undefined,
        executionTimeMs: resultRow.executionTimeMs,
        executedAt: new Date(resultRow.executedAt),
      } : null,
    };
  }

  /**
   * Cancel a pending command
   */
  async cancel(commandId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();

    const command = await db.query.commands.findFirst({
      where: eq(schema.commands.id, commandId),
    });

    if (!command) {
      return { success: false, error: 'Command not found' };
    }

    if (command.userId !== userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (command.status !== 'queued' && command.status !== 'delivered') {
      return { success: false, error: `Cannot cancel command in status: ${command.status}` };
    }

    await db.update(schema.commands)
      .set({ status: 'cancelled' })
      .where(eq(schema.commands.id, commandId));

    logger.info({ commandId }, 'Command cancelled');
    return { success: true };
  }

  /**
   * Wait for a command result (with timeout)
   */
  async waitForResult(commandId: string, timeoutMs: number): Promise<CommandResult | null> {
    const db = getDatabase();

    // Check if result already exists
    const existing = await db.query.commandResults.findFirst({
      where: eq(schema.commandResults.commandId, commandId),
    });

    if (existing) {
      return {
        commandId: existing.commandId,
        deviceId: existing.deviceId,
        status: existing.status as CommandResult['status'],
        output: existing.output ? JSON.parse(existing.output) : undefined,
        error: existing.errorCode ? {
          code: existing.errorCode,
          message: existing.errorMessage ?? '',
          retryable: existing.errorRetryable ?? false,
        } : undefined,
        executionTimeMs: existing.executionTimeMs,
        executedAt: new Date(existing.executedAt),
      };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resultWaiters.delete(commandId);
        resolve(null);
      }, timeoutMs);

      resultWaiters.set(commandId, { resolve, timer });
    });
  }
}
