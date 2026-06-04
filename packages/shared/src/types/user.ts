/**
 * User and authentication type definitions for RemoteOS.
 *
 * Users are identified by their Telegram account.
 * Authentication flows: Telegram OAuth, Device Token, API Key.
 */

// ─── User ──────────────────────────────────────────────────────────

/** User subscription tier */
export type UserTier = 'free' | 'pro' | 'team' | 'enterprise';

/** User account status */
export type UserStatus = 'active' | 'suspended' | 'deleted';

/** Registered user */
export interface User {
  /** Internal user ID (UUID) */
  id: string;
  /** Telegram user ID (primary identifier) */
  telegramId: number;
  /** Telegram username (may be null) */
  telegramUsername: string | null;
  /** Display name */
  displayName: string;
  /** Subscription tier */
  tier: UserTier;
  /** Account status */
  status: UserStatus;
  /** Preferred language */
  language: string;
  /** Timezone (e.g., "Asia/Ho_Chi_Minh") */
  timezone: string;
  /** When the user registered */
  createdAt: Date;
  /** Last activity timestamp */
  lastActiveAt: Date;
  /** User preferences */
  preferences: UserPreferences;
}

/** User-configurable preferences */
export interface UserPreferences {
  /** Language code (vi, en, etc.) */
  language: string;
  /** Whether to receive proactive alerts */
  alertsEnabled: boolean;
  /** Quiet hours (no notifications) */
  quietHoursStart: string | null; // "22:00"
  quietHoursEnd: string | null;   // "08:00"
  /** Default command timeout in seconds */
  defaultTimeoutSeconds: number;
  /** Whether to show confirmation for dangerous commands */
  confirmDangerousCommands: boolean;
  /** Theme preference (for future web dashboard) */
  theme: 'light' | 'dark' | 'auto';
}

// ─── User-Device Relationship ──────────────────────────────────────

/** Link between a user and a device */
export interface UserDeviceLink {
  userId: string;
  deviceId: string;
  /** User-given alias for this device */
  alias: string;
  /** Whether this is the user's primary device */
  isPrimary: boolean;
  /** Permissions granted */
  permissions: DevicePermission[];
  /** When the link was created */
  linkedAt: Date;
}

/** Permissions a user has on a device */
export type DevicePermission =
  | 'status.read'       // View system status
  | 'process.read'      // List processes
  | 'process.manage'    // Kill processes
  | 'file.read'         // List/read files
  | 'file.write'        // Download/create files
  | 'file.delete'       // Delete files
  | 'screenshot'        // Take screenshots
  | 'shell.execute'     // Run shell commands
  | 'app.manage'        // Launch/close apps
  | 'system.control'    // Lock, volume, clipboard
  | 'power.manage'      // Sleep, hibernate
  | 'admin';            // Full access

// ─── Session ───────────────────────────────────────────────────────

/** Active user session */
export interface Session {
  /** Session ID (UUID) */
  id: string;
  /** User ID */
  userId: string;
  /** Device ID this session is bound to */
  deviceId: string;
  /** Session token (JWT) */
  token: string;
  /** When the session was created */
  createdAt: Date;
  /** When the session expires */
  expiresAt: Date;
  /** Session metadata */
  metadata: {
    /** IP address at session creation */
    ip: string;
    /** User agent string */
    userAgent?: string;
    /** Telegram chat ID */
    telegramChatId?: number;
  };
}

// ─── API Key (for programmatic access) ─────────────────────────────

/** API key for external integrations */
export interface ApiKey {
  /** Key ID (UUID) */
  id: string;
  /** User who owns this key */
  userId: string;
  /** Key name/label */
  name: string;
  /** Hashed key value (never store plaintext) */
  keyHash: string;
  /** Key prefix (first 8 chars, for identification) */
  keyPrefix: string;
  /** Scopes/permissions */
  scopes: string[];
  /** When the key was created */
  createdAt: Date;
  /** When the key expires (null = never) */
  expiresAt: Date | null;
  /** Last time this key was used */
  lastUsedAt: Date | null;
  /** Whether the key is active */
  isActive: boolean;
}

// ─── Audit Log ─────────────────────────────────────────────────────

/** Audit log entry for security tracking */
export interface AuditLogEntry {
  /** Log entry ID (UUID) */
  id: string;
  /** User who performed the action */
  userId: string;
  /** Device affected */
  deviceId: string | null;
  /** Action performed */
  action: AuditAction;
  /** Action details */
  details: Record<string, unknown>;
  /** IP address */
  ip: string;
  /** Timestamp */
  timestamp: Date;
  /** Whether the action was successful */
  success: boolean;
  /** Failure reason (if applicable) */
  failureReason?: string;
}

/** Auditable actions */
export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'device.register'
  | 'device.unregister'
  | 'device.connect'
  | 'device.disconnect'
  | 'command.execute'
  | 'command.cancel'
  | 'file.download'
  | 'file.upload'
  | 'file.delete'
  | 'settings.update'
  | 'api_key.create'
  | 'api_key.revoke'
  | 'security.alert'
  | 'security.rate_limit'
  | 'security.auth_failure';
