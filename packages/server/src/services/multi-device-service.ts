/**
 * Multi-Device Service
 *
 * Manages multiple devices with:
 * - Device groups (work, home, server)
 * - Batch commands (execute on all devices)
 * - Device comparison
 * - Fleet monitoring
 */

import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase, schema } from '../db/index.js';
import { logger } from '../config/logger.js';
import { DeviceService } from './device-service.js';
import { CommandService } from './command-service.js';

const deviceService = new DeviceService();
const commandService = new CommandService();

// ─── Types ────────────────────────────────────────────────────────

export interface DeviceGroup {
  id: string;
  userId: string;
  name: string;
  description: string;
  deviceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BatchCommandResult {
  deviceId: string;
  deviceName: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// ─── Multi-Device Service ─────────────────────────────────────────

export class MultiDeviceService {

  /**
   * Get status of all devices for a user
   */
  async getAllDeviceStatus(userId: string): Promise<Array<{
    id: string;
    name: string;
    status: string;
    os: string;
    cpuUsage?: number;
    ramUsage?: number;
    diskUsage?: number;
    uptime?: string;
    lastSeen?: string;
  }>> {
    const devices = await deviceService.listByUser(userId);

    return devices.map(d => ({
      id: d.id,
      name: d.name,
      status: d.status,
      os: d.os,
      cpuUsage: undefined, // Would need to fetch from device_state
      ramUsage: undefined,
      diskUsage: undefined,
      uptime: undefined,
      lastSeen: undefined,
    }));
  }

  /**
   * Execute a command on multiple devices (batch)
   */
  async executeBatch(
    userId: string,
    deviceIds: string[],
    commandType: string,
    commandParams?: Record<string, unknown>,
  ): Promise<BatchCommandResult[]> {
    const results: BatchCommandResult[] = [];

    for (const deviceId of deviceIds) {
      try {
        const devices = await deviceService.listByUser(userId);
        const device = devices.find(d => d.id === deviceId);

        if (!device) {
          results.push({
            deviceId,
            deviceName: 'Unknown',
            success: false,
            error: 'Device not found',
          });
          continue;
        }

        if (device.status !== 'online') {
          results.push({
            deviceId,
            deviceName: device.name,
            success: false,
            error: 'Device offline',
          });
          continue;
        }

        const result = await commandService.create(userId, {
          deviceId,
          type: commandType,
          params: commandParams,
        });

        if (result.success) {
          const cmdResult = await commandService.waitForResult(result.command!.id, 30_000);
          results.push({
            deviceId,
            deviceName: device.name,
            success: cmdResult?.status === 'completed',
            result: cmdResult?.output,
            error: cmdResult?.error?.message,
          });
        } else {
          results.push({
            deviceId,
            deviceName: device.name,
            success: false,
            error: result.error,
          });
        }
      } catch (err) {
        results.push({
          deviceId,
          deviceName: 'Unknown',
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Execute command on all online devices
   */
  async executeOnAll(
    userId: string,
    commandType: string,
    commandParams?: Record<string, unknown>,
  ): Promise<BatchCommandResult[]> {
    const devices = await deviceService.listByUser(userId);
    const onlineDeviceIds = devices
      .filter(d => d.status === 'online')
      .map(d => d.id);

    if (onlineDeviceIds.length === 0) {
      return [];
    }

    return this.executeBatch(userId, onlineDeviceIds, commandType, commandParams);
  }

  /**
   * Create a device group
   */
  async createGroup(userId: string, name: string, description: string, deviceIds: string[]): Promise<DeviceGroup> {
    const db = getDatabase();
    const sqlite = db.$client;
    const now = new Date().toISOString();
    const id = randomUUID();

    // Create groups table if not exists
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS device_groups (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        device_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    sqlite.prepare(`
      INSERT INTO device_groups (id, user_id, name, description, device_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, name, description, JSON.stringify(deviceIds), now, now);

    logger.info({ id, name, deviceCount: deviceIds.length }, 'Device group created');

    return {
      id,
      userId,
      name,
      description,
      deviceIds,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * List device groups for a user
   */
  async listGroups(userId: string): Promise<DeviceGroup[]> {
    const db = getDatabase();
    const sqlite = db.$client;

    // Create table if not exists
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS device_groups (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        device_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    const rows = sqlite.prepare('SELECT * FROM device_groups WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      deviceIds: JSON.parse((row.device_ids as string) ?? '[]'),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  }

  /**
   * Execute command on a device group
   */
  async executeOnGroup(
    userId: string,
    groupName: string,
    commandType: string,
    commandParams?: Record<string, unknown>,
  ): Promise<BatchCommandResult[]> {
    const groups = await this.listGroups(userId);
    const group = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());

    if (!group) {
      return [];
    }

    return this.executeBatch(userId, group.deviceIds, commandType, commandParams);
  }

  /**
   * Compare devices (get side-by-side status)
   */
  async compareDevices(userId: string, deviceIds: string[]): Promise<Array<{
    id: string;
    name: string;
    status: string;
    os: string;
    metrics?: Record<string, unknown>;
  }>> {
    const devices = await deviceService.listByUser(userId);
    const selected = devices.filter(d => deviceIds.includes(d.id));

    return selected.map(d => ({
      id: d.id,
      name: d.name,
      status: d.status,
      os: d.os,
      metrics: undefined, // Would need to fetch from device_state
    }));
  }

  /**
   * Delete a device group
   */
  async deleteGroup(groupId: string, userId: string): Promise<boolean> {
    const db = getDatabase();
    const sqlite = db.$client;

    const result = sqlite.prepare('DELETE FROM device_groups WHERE id = ? AND user_id = ?').run(groupId, userId);
    return result.changes > 0;
  }
}
