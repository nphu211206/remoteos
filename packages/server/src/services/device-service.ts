/**
 * Device Service
 *
 * Manages device lifecycle: registration, heartbeat, state tracking.
 * Uses SQLite database via Drizzle ORM.
 */

import { eq, and, gt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
  DeviceRegisterRequest,
  DeviceRegisterResponse,
  DeviceSummary,
  DeviceInfo,
  HeartbeatRequest,
  HeartbeatResponse,
  DeviceState,
} from '@remoteos/shared';
import { generateToken } from '@remoteos/shared/utils';
import { DEVICE_OFFLINE_THRESHOLD_MS } from '@remoteos/shared/constants';
import { getDatabase, schema } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

export class DeviceService {
  /**
   * Register a new device or re-register an existing one
   */
  async register(request: DeviceRegisterRequest, userId: string): Promise<DeviceRegisterResponse> {
    const db = getDatabase();
    const { device, registrationToken } = request;

    // Validate registration token
    if (registrationToken !== config.security.registrationCode) {
      // Check database for generated tokens
      const { AuthService } = await import('./auth-service.js');
      const authService = new AuthService();
      const tokenResult = await authService.validateRegistrationToken(registrationToken);

      if (!tokenResult.valid) {
        logger.warn({ deviceId: device.id }, 'Invalid registration token');
        return { success: false, error: 'Invalid registration token', errorCode: 'INVALID_TOKEN' };
      }
      userId = tokenResult.userId ?? userId;
    }

    // Check if device already exists
    const existing = await db.query.devices.findFirst({
      where: eq(schema.devices.id, device.id),
    });

    const sessionToken = generateToken(32);
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    if (existing) {
      // Re-registration: update info
      await db.update(schema.devices)
        .set({
          name: device.name,
          os: device.os,
          osVersion: device.osVersion,
          hostname: device.hostname,
          agentVersion: device.agentVersion,
          localIp: device.localIp ?? null,
          cpuModel: device.cpuModel ?? null,
          cpuCores: device.cpuCores ?? null,
          totalRamGb: device.totalRamGb ?? null,
          totalDiskGb: device.totalDiskGb ?? null,
          gpuModel: device.gpuModel ?? null,
          screenResolution: device.screenResolution ?? null,
          sessionToken,
          sessionExpiresAt,
          status: 'online',
          lastSeenAt: now,
        })
        .where(eq(schema.devices.id, device.id));

      logger.info({ deviceId: device.id, name: device.name }, 'Device re-registered');
      return {
        success: true,
        deviceId: device.id,
        sessionToken,
        expiresAt: new Date(sessionExpiresAt),
      };
    }

    // New registration
    await db.insert(schema.devices).values({
      id: device.id,
      userId,
      name: device.name,
      os: device.os,
      osVersion: device.osVersion,
      hostname: device.hostname,
      agentVersion: device.agentVersion,
      localIp: device.localIp ?? null,
      cpuModel: device.cpuModel ?? null,
      cpuCores: device.cpuCores ?? null,
      totalRamGb: device.totalRamGb ?? null,
      totalDiskGb: device.totalDiskGb ?? null,
      gpuModel: device.gpuModel ?? null,
      screenResolution: device.screenResolution ?? null,
      status: 'online',
      sessionToken,
      sessionExpiresAt,
      lastSeenAt: now,
      createdAt: now,
    });

    // Create initial device state
    await db.insert(schema.deviceState).values({
      deviceId: device.id,
      status: 'online',
      cpuUsage: 0,
      ramUsage: 0,
      diskUsage: 0,
      cpuTemp: null,
      gpuTemp: null,
      networkDownMbps: 0,
      networkUpMbps: 0,
      uptimeSeconds: 0,
      processCount: 0,
      batteryPercent: null,
      isCharging: null,
      activeWindow: null,
      timestamp: now,
    });

    logger.info({ deviceId: device.id, name: device.name }, 'New device registered');
    return {
      success: true,
      deviceId: device.id,
      sessionToken,
      expiresAt: new Date(sessionExpiresAt),
    };
  }

  /**
   * Handle heartbeat from agent
   */
  async handleHeartbeat(request: HeartbeatRequest): Promise<HeartbeatResponse> {
    const db = getDatabase();

    // Verify device and session
    const device = await db.query.devices.findFirst({
      where: and(
        eq(schema.devices.id, request.deviceId),
        eq(schema.devices.sessionToken, request.sessionToken),
      ),
    });

    if (!device) {
      return { acknowledged: false, pendingCommands: 0, serverTime: new Date() };
    }

    const now = new Date().toISOString();

    // Update device last seen
    await db.update(schema.devices)
      .set({
        lastSeenAt: now,
        status: request.state.status,
      })
      .where(eq(schema.devices.id, request.deviceId));

    // Upsert device state
    const existingState = await db.query.deviceState.findFirst({
      where: eq(schema.deviceState.deviceId, request.deviceId),
    });

    const stateData = {
      deviceId: request.deviceId,
      status: request.state.status,
      cpuUsage: request.state.cpuUsage,
      ramUsage: request.state.ramUsage,
      diskUsage: request.state.diskUsage,
      cpuTemp: request.state.cpuTemp,
      gpuTemp: request.state.gpuTemp,
      networkDownMbps: request.state.networkDownMbps,
      networkUpMbps: request.state.networkUpMbps,
      uptimeSeconds: request.state.uptimeSeconds,
      processCount: request.state.processCount,
      batteryPercent: request.state.batteryPercent,
      isCharging: request.state.isCharging,
      activeWindow: request.state.activeWindow ?? null,
      timestamp: now,
    };

    if (existingState) {
      await db.update(schema.deviceState)
        .set(stateData)
        .where(eq(schema.deviceState.deviceId, request.deviceId));
    } else {
      await db.insert(schema.deviceState).values(stateData);
    }

    // Count pending commands
    const pendingCommands = await db.query.commands.findMany({
      where: and(
        eq(schema.commands.deviceId, request.deviceId),
        eq(schema.commands.status, 'queued'),
      ),
    });

    return {
      acknowledged: true,
      pendingCommands: pendingCommands.length,
      serverTime: new Date(),
    };
  }

  /**
   * List all devices for a user
   */
  async listByUser(userId: string): Promise<DeviceSummary[]> {
    const db = getDatabase();

    const userDevices = await db.query.devices.findMany({
      where: eq(schema.devices.userId, userId),
      with: { state: true },
    });

    const now = Date.now();
    return userDevices.map((d) => {
      const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
      const isOnline = now - lastSeen < DEVICE_OFFLINE_THRESHOLD_MS;

      return {
        id: d.id,
        name: d.name,
        os: d.os as DeviceSummary['os'],
        status: isOnline ? 'online' : 'offline',
        lastSeenAt: d.lastSeenAt ? new Date(d.lastSeenAt) : null,
        cpuUsage: d.state?.cpuUsage ?? null,
        ramUsage: d.state?.ramUsage ?? null,
      };
    });
  }

  /**
   * Get device by ID
   */
  async getById(deviceId: string): Promise<{
    device: DeviceInfo;
    state: DeviceState | null;
    lastSeenAt: Date | null;
  } | null> {
    const db = getDatabase();

    const device = await db.query.devices.findFirst({
      where: eq(schema.devices.id, deviceId),
      with: { state: true },
    });

    if (!device) return null;

    return {
      device: {
        id: device.id,
        name: device.name,
        os: device.os as DeviceInfo['os'],
        osVersion: device.osVersion,
        hostname: device.hostname,
        agentVersion: device.agentVersion,
        localIp: device.localIp ?? undefined,
        cpuModel: device.cpuModel ?? undefined,
        cpuCores: device.cpuCores ?? undefined,
        totalRamGb: device.totalRamGb ?? undefined,
        totalDiskGb: device.totalDiskGb ?? undefined,
        gpuModel: device.gpuModel ?? undefined,
        screenResolution: device.screenResolution ?? undefined,
      },
      state: device.state ? {
        deviceId: device.state.deviceId,
        status: device.state.status as DeviceState['status'],
        cpuUsage: device.state.cpuUsage,
        ramUsage: device.state.ramUsage,
        diskUsage: device.state.diskUsage,
        cpuTemp: device.state.cpuTemp,
        gpuTemp: device.state.gpuTemp,
        networkDownMbps: device.state.networkDownMbps,
        networkUpMbps: device.state.networkUpMbps,
        uptimeSeconds: device.state.uptimeSeconds,
        processCount: device.state.processCount,
        batteryPercent: device.state.batteryPercent,
        isCharging: device.state.isCharging,
        activeWindow: device.state.activeWindow ?? undefined,
        timestamp: new Date(device.state.timestamp),
      } : null,
      lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt) : null,
    };
  }

  /**
   * Get device session token (for internal use)
   */
  async getSessionToken(deviceId: string): Promise<string | null> {
    const db = getDatabase();
    const device = await db.query.devices.findFirst({
      where: eq(schema.devices.id, deviceId),
      columns: { sessionToken: true },
    });
    return device?.sessionToken ?? null;
  }
}
