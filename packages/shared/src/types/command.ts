/**
 * Command-related type definitions for RemoteOS.
 *
 * Commands are the core unit of work: user intent → server → agent → result.
 * Each command has a type, parameters, lifecycle, and result.
 */

// ─── Command Lifecycle ─────────────────────────────────────────────

/** Command execution status (state machine) */
export type CommandStatus =
  | 'created'    // Just created, not yet queued
  | 'queued'     // In the agent's command queue
  | 'delivered'  // Sent to agent, awaiting execution
  | 'executing'  // Agent is running the command
  | 'completed'  // Successfully finished
  | 'failed'     // Execution failed
  | 'timeout'    // Exceeded timeout
  | 'cancelled'  // Cancelled by user or system

/** Command priority affects queue ordering */
export type CommandPriority = 'low' | 'normal' | 'high' | 'critical';

// ─── Command Types ─────────────────────────────────────────────────

/** All supported command types */
export type CommandType =
  // System monitoring
  | 'status'           // Get full system status
  | 'system_info'      // Get detailed hardware/software info
  | 'process_list'     // List running processes
  | 'process_kill'     // Kill a process by PID/name

  // Screen
  | 'screenshot'       // Take screenshot
  | 'screen_record'    // Record screen (future)

  // File operations
  | 'file_list'        // List files in directory
  | 'file_info'        // Get file metadata
  | 'file_download'    // Download file from URL to device
  | 'file_upload'      // Upload file from device to user
  | 'file_search'      // Search for files by name/pattern
  | 'file_delete'      // Delete a file (requires confirmation)

  // Shell
  | 'shell'            // Execute whitelisted shell command

  // Applications
  | 'app_list'         // List installed applications
  | 'app_launch'       // Launch an application
  | 'app_close'        // Close an application

  // Notifications
  | 'notify'           // Show desktop notification

  // System control
  | 'lock_screen'      // Lock the screen
  | 'set_volume'       // Set system volume
  | 'get_clipboard'    // Get clipboard content
  | 'set_clipboard'    // Set clipboard content

  // Power
  | 'sleep'            // Put device to sleep
  | 'hibernate'        // Hibernate device

  // Custom
  | 'custom'           // User-defined command (plugins)

/** Danger level determines confirmation requirements */
export type CommandDangerLevel = 'safe' | 'moderate' | 'dangerous' | 'critical';

// ─── Command Definition ────────────────────────────────────────────

/** Metadata for a command type (used in help, validation) */
export interface CommandDefinition {
  type: CommandType;
  /** Human-readable name */
  name: string;
  /** Description of what this command does */
  description: string;
  /** Required parameters */
  requiredParams: string[];
  /** Optional parameters */
  optionalParams: string[];
  /** Danger level */
  dangerLevel: CommandDangerLevel;
  /** Whether this command requires confirmation */
  requiresConfirmation: boolean;
  /** Maximum execution time in ms */
  defaultTimeoutMs: number;
  /** Whether this command produces a file output */
  producesFile: boolean;
  /** Tier required (null = available to all) */
  requiredTier: string | null;
  /** Icon/emoji for UI */
  icon: string;
}

// ─── Command Instance ──────────────────────────────────────────────

/** A specific command to be executed */
export interface Command {
  /** Unique command ID (UUID v4) */
  id: string;
  /** Target device ID */
  deviceId: string;
  /** User who initiated the command (Telegram user ID) */
  userId: string;
  /** Command type */
  type: CommandType;
  /** Command-specific parameters */
  params: Record<string, unknown>;
  /** Priority level */
  priority: CommandPriority;
  /** Maximum execution time in milliseconds */
  timeoutMs: number;
  /** Current status */
  status: CommandStatus;
  /** When the command was created */
  createdAt: Date;
  /** When the command was sent to agent */
  deliveredAt: Date | null;
  /** When execution started */
  startedAt: Date | null;
  /** When the command expires if not executed */
  expiresAt: Date;
  /** Idempotency key (prevent duplicate execution) */
  idempotencyKey?: string;
  /** Parent command ID (for multi-step commands) */
  parentCommandId?: string;
  /** Metadata from the AI interpretation */
  aiMetadata?: {
    /** Original user input */
    originalInput: string;
    /** Whether AI was used to interpret */
    aiInterpreted: boolean;
    /** Confidence score (0-1) */
    confidence: number;
    /** AI model used */
    model?: string;
  };
}

/** Result of command execution */
export interface CommandResult {
  /** Command ID this result belongs to */
  commandId: string;
  /** Device ID that executed */
  deviceId: string;
  /** Final status */
  status: Extract<CommandStatus, 'completed' | 'failed' | 'timeout'>;
  /** Output data (structure depends on command type) */
  output?: CommandOutput;
  /** Error details if failed */
  error?: CommandError;
  /** Actual execution time in milliseconds */
  executionTimeMs: number;
  /** When the result was generated */
  executedAt: Date;
}

/** Error information for failed commands */
export interface CommandError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Whether the command can be retried */
  retryable: boolean;
  /** Stack trace (only in development) */
  stack?: string;
}

// ─── Command Output Types (per command type) ───────────────────────

/** Base output interface */
interface BaseCommandOutput {
  commandType: CommandType;
}

/** System status output */
export interface StatusOutput extends BaseCommandOutput {
  commandType: 'status';
  cpu: { usage: number; model: string; cores: number; speed: number };
  ram: { usedGb: number; totalGb: number; usagePercent: number };
  disk: { usedGb: number; totalGb: number; usagePercent: number };
  network: { downMbps: number; upMbps: number; latencyMs: number };
  uptime: { seconds: number; formatted: string };
  processes: { total: number; top5: Array<{ name: string; cpu: number; ram: number }> };
  battery: { percent: number | null; isCharging: boolean | null };
  temperature: { cpu: number | null; gpu: number | null };
}

/** Screenshot output */
export interface ScreenshotOutput extends BaseCommandOutput {
  commandType: 'screenshot';
  /** Base64-encoded image or file path */
  imageData: string;
  /** Image format */
  format: 'png' | 'jpeg';
  /** Image dimensions */
  width: number;
  height: number;
  /** File size in bytes */
  sizeBytes: number;
}

/** Process list output */
export interface ProcessListOutput extends BaseCommandOutput {
  commandType: 'process_list';
  processes: Array<{
    pid: number;
    name: string;
    cpu: number;
    ram: number;
    status: string;
    startedAt: string;
  }>;
  total: number;
}

/** File download output */
export interface FileDownloadOutput extends BaseCommandOutput {
  commandType: 'file_download';
  url: string;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  durationMs: number;
}

/** File list output */
export interface FileListOutput extends BaseCommandOutput {
  commandType: 'file_list';
  path: string;
  entries: Array<{
    name: string;
    type: 'file' | 'directory' | 'symlink';
    sizeBytes: number;
    modifiedAt: string;
    permissions: string;
  }>;
  total: number;
}

/** Shell output */
export interface ShellOutput extends BaseCommandOutput {
  commandType: 'shell';
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

/** Notify output */
export interface NotifyOutput extends BaseCommandOutput {
  commandType: 'notify';
  title: string;
  body: string;
  delivered: boolean;
}

/** Union of all command outputs */
export type CommandOutput =
  | StatusOutput
  | ScreenshotOutput
  | ProcessListOutput
  | FileDownloadOutput
  | FileListOutput
  | ShellOutput
  | NotifyOutput
  | { commandType: string; [key: string]: unknown };

// ─── Polling ───────────────────────────────────────────────────────

/** Agent → Server: Poll for pending commands */
export interface PollRequest {
  deviceId: string;
  sessionToken: string;
  /** Last command ID the agent received (for dedup) */
  lastCommandId?: string;
}

/** Server → Agent: Commands waiting to be executed */
export interface PollResponse {
  hasCommands: boolean;
  commands: Command[];
  serverTime: Date;
}

/** Agent → Server: Submit command result */
export interface CommandResultRequest {
  deviceId: string;
  sessionToken: string;
  result: CommandResult;
}
