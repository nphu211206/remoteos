/**
 * Device validation schemas
 */

import { z } from 'zod';

/** Device OS validation */
export const deviceOsSchema = z.enum(['windows', 'macos', 'linux', 'unknown']);

/** Device status validation */
export const deviceStatusSchema = z.enum([
  'unregistered', 'pending', 'online', 'offline', 'busy', 'locked', 'error',
]);

/** Device info validation (registration payload) */
export const deviceInfoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  os: deviceOsSchema,
  osVersion: z.string().min(1).max(50),
  hostname: z.string().min(1).max(255),
  agentVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  localIp: z.string().ip().optional(),
  cpuModel: z.string().max(200).optional(),
  cpuCores: z.number().int().min(1).max(256).optional(),
  totalRamGb: z.number().min(0.1).max(1024).optional(),
  totalDiskGb: z.number().min(1).max(100000).optional(),
  gpuModel: z.string().max(200).optional(),
  screenResolution: z.string().max(20).optional(),
});

/** Device registration request validation */
export const deviceRegisterRequestSchema = z.object({
  device: deviceInfoSchema,
  registrationToken: z.string().min(1).max(256),
});

/** Device state validation (heartbeat payload) */
export const deviceStateSchema = z.object({
  deviceId: z.string().uuid(),
  status: deviceStatusSchema,
  cpuUsage: z.number().min(0).max(100),
  ramUsage: z.number().min(0).max(100),
  diskUsage: z.number().min(0).max(100),
  cpuTemp: z.number().min(-40).max(150).nullable(),
  gpuTemp: z.number().min(-40).max(150).nullable(),
  networkDownMbps: z.number().min(0),
  networkUpMbps: z.number().min(0),
  uptimeSeconds: z.number().int().min(0),
  processCount: z.number().int().min(0),
  batteryPercent: z.number().min(0).max(100).nullable(),
  isCharging: z.boolean().nullable(),
  activeWindow: z.string().max(500).optional(),
  timestamp: z.coerce.date(),
});

/** Heartbeat request validation */
export const heartbeatRequestSchema = z.object({
  deviceId: z.string().uuid(),
  sessionToken: z.string().min(1),
  state: deviceStateSchema,
});

/** Device tier validation */
export const deviceTierSchema = z.enum(['free', 'pro', 'team', 'enterprise']);
