/**
 * API request/response type definitions for RemoteOS.
 *
 * Standardizes all HTTP communication between components.
 * Follows JSON:API-like conventions with consistent envelope.
 */

// ─── API Envelope ──────────────────────────────────────────────────

/** Standard success response envelope */
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    /** Request ID for tracing */
    requestId: string;
    /** Response timestamp */
    timestamp: string;
    /** Pagination info (if applicable) */
    pagination?: PaginationMeta;
  };
}

/** Standard error response envelope */
export interface ApiError {
  success: false;
  error: {
    /** Machine-readable error code */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Additional error details */
    details?: Record<string, unknown>;
    /** Stack trace (only in development) */
    stack?: string;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

/** Combined response type */
export type ApiResult<T = unknown> = ApiResponse<T> | ApiError;

// ─── Pagination ────────────────────────────────────────────────────

export interface PaginationMeta {
  /** Current page (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total items */
  totalItems: number;
  /** Total pages */
  totalPages: number;
  /** Whether there's a next page */
  hasNext: boolean;
  /** Whether there's a previous page */
  hasPrevious: boolean;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

// ─── API Endpoints ─────────────────────────────────────────────────

/** POST /api/v1/webhook/telegram */
export namespace WebhookTelegram {
  export interface Request {
    /** Raw Telegram Update object */
    update: Record<string, unknown>;
  }
  export interface Response {
    ok: boolean;
  }
}

/** POST /api/v1/devices/register */
export namespace DeviceRegister {
  export type Request = import('./device').DeviceRegisterRequest;
  export type Response = import('./device').DeviceRegisterResponse;
}

/** GET /api/v1/devices */
export namespace DeviceList {
  export interface Response {
    devices: import('./device').DeviceSummary[];
  }
}

/** GET /api/v1/devices/:id */
export namespace DeviceDetail {
  export interface Response {
    device: import('./device').DeviceInfo;
    state: import('./device').DeviceState | null;
    lastSeenAt: Date | null;
  }
}

/** POST /api/v1/commands */
export namespace CommandCreate {
  export interface Request {
    deviceId: string;
    type: import('./command').CommandType;
    params?: Record<string, unknown>;
    priority?: import('./command').CommandPriority;
    timeoutMs?: number;
  }
  export interface Response {
    command: import('./command').Command;
    /** Estimated wait time in ms */
    estimatedWaitMs: number;
  }
}

/** GET /api/v1/commands/:id */
export namespace CommandDetail {
  export interface Response {
    command: import('./command').Command;
    result: import('./command').CommandResult | null;
  }
}

/** POST /api/v1/device/poll */
export namespace DevicePoll {
  export type Request = import('./command').PollRequest;
  export type Response = import('./command').PollResponse;
}

/** POST /api/v1/device/heartbeat */
export namespace DeviceHeartbeat {
  export type Request = import('./device').HeartbeatRequest;
  export type Response = import('./device').HeartbeatResponse;
}

/** POST /api/v1/commands/:id/result */
export namespace CommandResultSubmit {
  export type Request = import('./command').CommandResultRequest;
  export interface Response {
    acknowledged: boolean;
  }
}

/** GET /api/v1/health */
export namespace HealthCheck {
  export interface Response {
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    uptime: number;
    /** Number of connected devices */
    connectedDevices: number;
    /** Number of active commands */
    activeCommands: number;
    /** Database status */
    database: 'connected' | 'disconnected';
    /** Redis status (if configured) */
    redis?: 'connected' | 'disconnected';
  }
}
