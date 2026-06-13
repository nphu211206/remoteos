/**
 * Agent Configuration
 *
 * Reads config from environment variables and generates
 * persistent device identity if not already created.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from './logger.js';

function env(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function envInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`Invalid integer for ${key}: ${raw}`);
  return parsed;
}

/** Persistent device identity file */
interface DeviceIdentity {
  id: string;
  name: string;
  createdAt: string;
}

function loadOrCreateIdentity(): DeviceIdentity {
  const configDir = join(homedir(), '.remoteos');
  const identityPath = join(configDir, 'identity.json');

  if (existsSync(identityPath)) {
    try {
      const data = JSON.parse(readFileSync(identityPath, 'utf-8'));
      return data as DeviceIdentity;
    } catch (err) {
      logger.warn({ err, path: identityPath }, 'Corrupted identity file, recreating');
    }
  }

  // Create new identity
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const identity: DeviceIdentity = {
    id: randomUUID(),
    name: `${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? 'RemoteOS'}-PC`,
    createdAt: new Date().toISOString(),
  };

  writeFileSync(identityPath, JSON.stringify(identity, null, 2));
  return identity;
}

const identity = loadOrCreateIdentity();

export const config = {
  /** Device identity (persistent across restarts) */
  device: {
    id: identity.id,
    name: env('DEVICE_NAME', identity.name),
  },

  /** Server connection */
  server: {
    url: env('SERVER_URL', 'http://localhost:3000'),
    registrationCode: env('DEVICE_REGISTRATION_CODE', 'remoteos-dev'),
  },

  /** Timing */
  timing: {
    pollIntervalMs: envInt('AGENT_POLL_INTERVAL_MS', 2_000),
    heartbeatIntervalMs: envInt('AGENT_HEARTBEAT_INTERVAL_MS', 10_000),
    commandTimeoutMs: envInt('AGENT_COMMAND_TIMEOUT_MS', 30_000),
  },

  /** Feature flags */
  features: {
    allowScreenshot: process.env.ALLOW_SCREENSHOT !== 'false',
    allowShell: process.env.ALLOW_SHELL !== 'false',
    allowFileDownload: process.env.ALLOW_FILE_DOWNLOAD !== 'false',
  },

  /** Limits */
  limits: {
    maxDownloadSizeBytes: envInt('MAX_DOWNLOAD_SIZE_BYTES', 2 * 1024 * 1024 * 1024),
    maxShellCommandLength: envInt('MAX_SHELL_COMMAND_LENGTH', 10000),
  },

  /** Logging */
  logging: {
    level: env('AGENT_LOG_LEVEL', 'info'),
  },
} as const;

export type AgentConfig = typeof config;
