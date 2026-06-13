/**
 * Scheduler Service — Automation Engine
 *
 * Allows users to schedule recurring tasks:
 * - "mỗi 8h sáng chụp màn hình"
 * - "mỗi ngày backup dữ liệu"
 * - "mỗi thứ 2 check status"
 * - "mỗi 5 phút monitor CPU"
 *
 * Uses node-cron for scheduling with persistent storage.
 */

import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase, schema } from '../db/index.js';
import { logger } from '../config/logger.js';
import { CommandService } from './command-service.js';
import { DeviceService } from './device-service.js';
import { AIService } from './ai-service.js';

const commandService = new CommandService();
const deviceService = new DeviceService();
const aiService = new AIService();

// ─── Types ────────────────────────────────────────────────────────

export interface Schedule {
  id: string;
  userId: string;
  deviceId: string;
  name: string;
  cronExpression: string;
  commandType: string;
  commandParams: Record<string, unknown>;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleRequest {
  name: string;
  cronExpression: string;
  commandType: string;
  commandParams?: Record<string, unknown>;
  deviceId: string;
}

// ─── Cron Expression Parser ───────────────────────────────────────

// Convert natural language schedule to cron expression
// Examples:
//   "mỗi 8h sáng" → "0 8 * * *"
//   "mỗi 5 phút" → "*/5 * * * *"
//   "mỗi thứ 2" → "0 9 * * 1"
//   "mỗi ngày 18h" → "0 18 * * *"
//   "mỗi giờ" → "0 * * * *"
//   "mỗi tháng" → "0 0 1 * *"
export function parseScheduleText(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Every N minutes
  const everyMin = lower.match(/mỗi\s+(\d+)\s*phút/);
  if (everyMin) return `*/${everyMin[1]} * * * *`;

  // Every N hours
  const everyHour = lower.match(/mỗi\s+(\d+)\s*giờ/);
  if (everyHour) return `0 */${everyHour[1]} * * *`;

  // Every hour
  if (/mỗi giờ|every hour/i.test(lower)) return '0 * * * *';

  // Every 5 minutes
  if (/mỗi 5 phút|every 5 min/i.test(lower)) return '*/5 * * * *';

  // Every 15 minutes
  if (/mỗi 15 phút|every 15 min/i.test(lower)) return '*/15 * * * *';

  // Every 30 minutes
  if (/mỗi 30 phút|every 30 min/i.test(lower)) return '*/30 * * * *';

  // Specific time: "mỗi ngày 8h" or "mỗi ngày lúc 8:30"
  const dailyTime = lower.match(/mỗi ngày\s*(?:lúc)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:sáng|am)?/);
  if (dailyTime) {
    const hour = parseInt(dailyTime[1]);
    const min = dailyTime[2] ? parseInt(dailyTime[2]) : 0;
    return `${min} ${hour} * * *`;
  }

  // "mỗi 8h sáng" or "mỗi 9h tối"
  const everyTime = lower.match(/mỗi\s+(\d{1,2})\s*(?:h|giờ)\s*(sáng|am|chiều|pm|tối)?/);
  if (everyTime) {
    let hour = parseInt(everyTime[1]);
    const period = everyTime[2];
    if (period === 'chiều' || period === 'pm' || period === 'tối') {
      if (hour < 12) hour += 12;
    }
    return `0 ${hour} * * *`;
  }

  // Morning: "mỗi sáng" or "mỗi ngày sáng"
  if (/mỗi sáng|every morning/i.test(lower)) return '0 8 * * *';

  // Evening: "mỗi tối"
  if (/mỗi tối|every evening/i.test(lower)) return '0 20 * * *';

  // Night: "mỗi đêm"
  if (/mỗi đêm|every night/i.test(lower)) return '0 22 * * *';

  // Monday
  if (/mỗi thứ 2|every monday/i.test(lower)) return '0 9 * * 1';

  // Friday
  if (/mỗi thứ 6|every friday/i.test(lower)) return '0 9 * * 5';

  // Weekend
  if (/mỗi cuối tuần|every weekend/i.test(lower)) return '0 10 * * 0,6';

  // Every month
  if (/mỗi tháng|every month/i.test(lower)) return '0 0 1 * *';

  // Specific hour: "8h sáng"
  const specificHour = lower.match(/(\d{1,2})\s*(?:h|giờ)\s*(?:sáng|am)?/);
  if (specificHour) {
    return `0 ${specificHour[1]} * * *`;
  }

  return null;
}

// ─── Scheduler Service Class ─────────────────────────────────────

export class SchedulerService {
  private activeTimers = new Map<string, ReturnType<typeof setInterval>>();

  /**
   * Initialize scheduler — load all active schedules from DB
   */
  async initialize(): Promise<void> {
    try {
      const db = getDatabase();
      const sqlite = db.$client;

      // Create schedules table
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS schedules (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          device_id TEXT NOT NULL,
          name TEXT NOT NULL,
          cron_expression TEXT NOT NULL,
          command_type TEXT NOT NULL,
          command_params TEXT DEFAULT '{}',
          is_active INTEGER DEFAULT 1,
          last_run_at TEXT,
          next_run_at TEXT,
          run_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Load active schedules
      const schedules = sqlite.prepare('SELECT * FROM schedules WHERE is_active = 1').all() as Array<Record<string, unknown>>;
      for (const schedule of schedules) {
        this.startSchedule(schedule as unknown as Schedule);
      }
      logger.info({ count: schedules.length }, 'Scheduler initialized');
    } catch (err) {
      logger.error({ err }, 'Failed to initialize scheduler');
    }
  }

  /**
   * Create a new schedule
   */
  async create(userId: string, request: CreateScheduleRequest): Promise<Schedule> {
    const db = getDatabase();
    const sqlite = db.$client;
    const now = new Date().toISOString();
    const id = randomUUID();

    const schedule: Schedule = {
      id,
      userId,
      deviceId: request.deviceId,
      name: request.name,
      cronExpression: request.cronExpression,
      commandType: request.commandType,
      commandParams: request.commandParams ?? {},
      isActive: true,
      lastRunAt: null,
      nextRunAt: this.calculateNextRun(request.cronExpression),
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    sqlite.prepare(`
      INSERT INTO schedules (id, user_id, device_id, name, cron_expression, command_type, command_params, is_active, last_run_at, next_run_at, run_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      schedule.id, schedule.userId, schedule.deviceId, schedule.name,
      schedule.cronExpression, schedule.commandType, JSON.stringify(schedule.commandParams),
      schedule.isActive ? 1 : 0, schedule.lastRunAt, schedule.nextRunAt,
      schedule.runCount, schedule.createdAt, schedule.updatedAt,
    );

    this.startSchedule(schedule);
    logger.info({ id, name: schedule.name, cron: schedule.cronExpression }, 'Schedule created');

    return schedule;
  }

  /**
   * List all schedules for a user
   */
  async listByUser(userId: string): Promise<Schedule[]> {
    const db = getDatabase();
    const sqlite = db.$client;
    const rows = sqlite.prepare('SELECT * FROM schedules WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Array<Record<string, unknown>>;
    return rows.map(this.rowToSchedule);
  }

  /**
   * Delete a schedule
   */
  async delete(scheduleId: string, userId: string): Promise<boolean> {
    const db = getDatabase();
    const sqlite = db.$client;
    const result = sqlite.prepare('DELETE FROM schedules WHERE id = ? AND user_id = ?').run(scheduleId, userId);
    this.stopSchedule(scheduleId);
    return result.changes > 0;
  }

  /**
   * Toggle schedule active/inactive
   */
  async toggle(scheduleId: string, userId: string): Promise<Schedule | null> {
    const db = getDatabase();
    const sqlite = db.$client;
    const row = sqlite.prepare('SELECT * FROM schedules WHERE id = ? AND user_id = ?').get(scheduleId, userId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const schedule = this.rowToSchedule(row);
    schedule.isActive = !schedule.isActive;
    schedule.updatedAt = new Date().toISOString();

    sqlite.prepare('UPDATE schedules SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(schedule.isActive ? 1 : 0, schedule.updatedAt, scheduleId);

    if (schedule.isActive) {
      this.startSchedule(schedule);
    } else {
      this.stopSchedule(scheduleId);
    }

    return schedule;
  }

  /**
   * Start a schedule (begin polling)
   */
  private startSchedule(schedule: Schedule): void {
    // Stop existing timer if any
    this.stopSchedule(schedule.id);

    // Parse cron to interval (simplified — check every minute)
    const intervalMs = 60 * 1000; // 1 minute

    const timer = setInterval(async () => {
      await this.executeSchedule(schedule);
    }, intervalMs);

    this.activeTimers.set(schedule.id, timer);
    logger.debug({ id: schedule.id, name: schedule.name }, 'Schedule started');
  }

  /**
   * Stop a schedule
   */
  private stopSchedule(scheduleId: string): void {
    const timer = this.activeTimers.get(scheduleId);
    if (timer) {
      clearInterval(timer);
      this.activeTimers.delete(scheduleId);
    }
  }

  /**
   * Execute a scheduled task
   */
  private async executeSchedule(schedule: Schedule): Promise<void> {
    const now = new Date();
    if (!this.shouldRun(schedule.cronExpression, now)) return;

    logger.info({ id: schedule.id, name: schedule.name, type: schedule.commandType }, 'Executing scheduled task');

    try {
      // Find online device
      const devices = await deviceService.listByUser(schedule.userId);
      const device = devices.find(d => d.id === schedule.deviceId && d.status === 'online');

      if (!device) {
        logger.warn({ deviceId: schedule.deviceId }, 'Device offline, skipping schedule');
        return;
      }

      // Execute command
      const result = await commandService.create(schedule.userId, {
        deviceId: schedule.deviceId,
        type: schedule.commandType,
        params: schedule.commandParams,
      });

      if (result.success) {
        const cmdResult = await commandService.waitForResult(result.command!.id, 30_000);
        if (cmdResult?.status === 'completed') {
          logger.info({ id: schedule.name, type: schedule.commandType }, 'Scheduled task completed');
        }
      }

      // Update schedule
      const db = getDatabase();
      const sqlite = db.$client;
      sqlite.prepare('UPDATE schedules SET last_run_at = ?, run_count = run_count + 1, updated_at = ? WHERE id = ?')
        .run(now.toISOString(), now.toISOString(), schedule.id);
    } catch (err) {
      logger.error({ err, scheduleId: schedule.id }, 'Scheduled task failed');
    }
  }

  /**
   * Check if schedule should run at this time (full cron check)
   */
  private shouldRun(cronExpr: string, now: Date): boolean {
    const parts = cronExpr.split(' ');
    if (parts.length !== 5) return false;

    const [min, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Check minute
    if (!this.matchesCronField(min, now.getMinutes())) return false;

    // Check hour
    if (!this.matchesCronField(hour, now.getHours())) return false;

    // Check day of month
    if (!this.matchesCronField(dayOfMonth, now.getDate())) return false;

    // Check month
    if (!this.matchesCronField(month, now.getMonth() + 1)) return false;

    // Check day of week (0=Sunday in JS, 0=Sunday in cron)
    if (!this.matchesCronField(dayOfWeek, now.getDay())) return false;

    return true;
  }

  /**
   * Match a single cron field against a value
   */
  private matchesCronField(field: string, value: number): boolean {
    if (field === '*') return true;
    if (field.startsWith('*/')) {
      const interval = parseInt(field.slice(2));
      return value % interval === 0;
    }
    if (field.includes(',')) {
      return field.split(',').some(v => this.matchesCronField(v.trim(), value));
    }
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return value >= start && value <= end;
    }
    return parseInt(field) === value;
  }

  /**
   * Calculate next run time
   */
  private calculateNextRun(cronExpr: string): string {
    // Simplified — return next minute
    const next = new Date();
    next.setMinutes(next.getMinutes() + 1);
    return next.toISOString();
  }

  /**
   * Convert DB row to Schedule object
   */
  private rowToSchedule(row: Record<string, unknown>): Schedule {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      deviceId: row.device_id as string,
      name: row.name as string,
      cronExpression: row.cron_expression as string,
      commandType: row.command_type as string,
      commandParams: JSON.parse((row.command_params as string) ?? '{}'),
      isActive: (row.is_active as number) === 1,
      lastRunAt: row.last_run_at as string | null,
      nextRunAt: row.next_run_at as string | null,
      runCount: (row.run_count as number) ?? 0,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
