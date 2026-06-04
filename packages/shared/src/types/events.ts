/**
 * Event system type definitions for RemoteOS.
 *
 * Events power real-time communication between all components:
 * - Agent ↔ Server (device lifecycle, command execution)
 * - Server → Bot (user notifications, alerts)
 * - Internal (metrics, audit, system health)
 */

// ─── Event Type Registry ───────────────────────────────────────────

/** All event types in the system */
export type EventType =
  // Device lifecycle
  | 'device:registered'
  | 'device:online'
  | 'device:offline'
  | 'device:state_update'
  | 'device:config_updated'
  | 'device:unregistered'

  // Command lifecycle
  | 'command:created'
  | 'command:queued'
  | 'command:delivered'
  | 'command:started'
  | 'command:completed'
  | 'command:failed'
  | 'command:timeout'
  | 'command:cancelled'

  // Alerts
  | 'alert:cpu_high'
  | 'alert:ram_high'
  | 'alert:disk_low'
  | 'alert:temp_high'
  | 'alert:app_crash'
  | 'alert:network_down'
  | 'alert:agent_offline'

  // System
  | 'system:error'
  | 'system:health_check'
  | 'system:rate_limit_exceeded'

  // User
  | 'user:registered'
  | 'user:device_linked'
  | 'user:device_unlinked'

  // File
  | 'file:download_started'
  | 'file:download_progress'
  | 'file:download_completed'
  | 'file:download_failed'
  | 'file:upload_started'
  | 'file:upload_completed';

// ─── Base Event ────────────────────────────────────────────────────

/** Base event structure — all events extend this */
export interface BaseEvent<T = unknown> {
  /** Event type identifier */
  type: EventType;
  /** Event payload */
  payload: T;
  /** ISO timestamp */
  timestamp: Date;
  /** Source identifier (device ID, user ID, or 'system') */
  source: string;
  /** Unique event ID for deduplication */
  eventId: string;
  /** Correlation ID for tracing across components */
  correlationId?: string;
}

// ─── Device Events ─────────────────────────────────────────────────

export interface DeviceRegisteredPayload {
  deviceId: string;
  deviceName: string;
  os: string;
  userId: string;
}

export interface DeviceOnlinePayload {
  deviceId: string;
  deviceName: string;
  /** How the device came online */
  reason: 'heartbeat' | 'reconnect' | 'initial_connection';
}

export interface DeviceOfflinePayload {
  deviceId: string;
  deviceName: string;
  reason: 'heartbeat_timeout' | 'agent_shutdown' | 'network_error' | 'kicked';
  /** How long the device was online (seconds) */
  onlineDuration?: number;
}

export interface DeviceStateUpdatePayload {
  deviceId: string;
  state: import('./device').DeviceState;
}

// ─── Command Events ────────────────────────────────────────────────

export interface CommandCreatedPayload {
  commandId: string;
  deviceId: string;
  userId: string;
  commandType: string;
  /** Original user input that triggered this command */
  originalInput?: string;
}

export interface CommandCompletedPayload {
  commandId: string;
  deviceId: string;
  commandType: string;
  /** Whether the result includes a file */
  hasFile: boolean;
  /** Execution time in ms */
  executionTimeMs: number;
}

export interface CommandFailedPayload {
  commandId: string;
  deviceId: string;
  commandType: string;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
}

// ─── Alert Events ──────────────────────────────────────────────────

export interface AlertPayload {
  deviceId: string;
  deviceName: string;
  metric: string;
  value: number;
  threshold: number;
  /** How long the condition has persisted (seconds) */
  durationSeconds?: number;
  /** Suggested action */
  suggestion?: string;
}

// ─── File Events ───────────────────────────────────────────────────

export interface FileDownloadProgressPayload {
  downloadId: string;
  deviceId: string;
  fileName: string;
  /** Bytes downloaded so far */
  downloadedBytes: number;
  /** Total file size (null if unknown) */
  totalBytes: number | null;
  /** Download speed in bytes/sec */
  speedBps: number;
  /** Progress percentage (0-100) */
  progressPercent: number;
  /** Estimated time remaining in seconds */
  etaSeconds: number | null;
}

// ─── Typed Event Map (for type-safe event handling) ─────────────────

/** Maps event types to their payload types */
export interface EventPayloadMap {
  'device:registered': DeviceRegisteredPayload;
  'device:online': DeviceOnlinePayload;
  'device:offline': DeviceOfflinePayload;
  'device:state_update': DeviceStateUpdatePayload;
  'device:config_updated': { deviceId: string };
  'device:unregistered': { deviceId: string };
  'command:created': CommandCreatedPayload;
  'command:queued': { commandId: string; deviceId: string };
  'command:delivered': { commandId: string; deviceId: string };
  'command:started': { commandId: string; deviceId: string };
  'command:completed': CommandCompletedPayload;
  'command:failed': CommandFailedPayload;
  'command:timeout': { commandId: string; deviceId: string };
  'command:cancelled': { commandId: string; deviceId: string; reason: string };
  'alert:cpu_high': AlertPayload;
  'alert:ram_high': AlertPayload;
  'alert:disk_low': AlertPayload;
  'alert:temp_high': AlertPayload;
  'alert:app_crash': AlertPayload & { appName: string; pid: number };
  'alert:network_down': { deviceId: string; deviceName: string; durationSeconds: number };
  'alert:agent_offline': { deviceId: string; deviceName: string; lastSeenAt: Date };
  'system:error': { code: string; message: string; stack?: string };
  'system:health_check': { status: 'healthy' | 'degraded' | 'unhealthy'; details: Record<string, unknown> };
  'system:rate_limit_exceeded': { userId: string; limit: number; window: string };
  'user:registered': { userId: string; username?: string };
  'user:device_linked': { userId: string; deviceId: string };
  'user:device_unlinked': { userId: string; deviceId: string };
  'file:download_started': { downloadId: string; deviceId: string; fileName: string; url: string };
  'file:download_progress': FileDownloadProgressPayload;
  'file:download_completed': { downloadId: string; deviceId: string; fileName: string; filePath: string; sizeBytes: number };
  'file:download_failed': { downloadId: string; deviceId: string; fileName: string; error: string };
  'file:upload_started': { uploadId: string; deviceId: string; fileName: string };
  'file:upload_completed': { uploadId: string; deviceId: string; fileName: string; sizeBytes: number };
}

/** Type-safe event with inferred payload */
export type TypedEvent<T extends EventType> = BaseEvent<EventPayloadMap[T]>;

// ─── Event Handler Type ────────────────────────────────────────────

/** Type-safe event handler callback */
export type EventHandler<T extends EventType> = (event: TypedEvent<T>) => void | Promise<void>;
