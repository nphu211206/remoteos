/**
 * Validation helper utilities
 */

import {
  ALLOWED_SHELL_COMMANDS,
  BLOCKED_SHELL_PATTERNS,
  UUID_REGEX,
} from '../constants';

/**
 * Check if a string is a valid UUID v4
 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Check if a string is a valid URL (https only)
 */
export function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if a URL is safe to download from (not localhost, not private IP)
 */
export function isSafeDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // Block localhost and private IPs
    const hostname = parsed.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.endsWith('.local')
    ) {
      return false;
    }

    // Check 172.16.0.0/12 range properly
    if (hostname.startsWith('172.')) {
      const secondOctet = parseInt(hostname.split('.')[1] ?? '0');
      if (secondOctet >= 16 && secondOctet <= 31) {
        return false; // 172.16.0.0 - 172.31.255.255
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a shell command — SAFETY MODE
 * Blocks truly dangerous commands while allowing normal usage.
 */
export function validateShellCommand(command: string): {
  allowed: boolean;
  reason?: string;
} {
  const trimmed = command.trim();

  // Block empty commands
  if (!trimmed) {
    return { allowed: false, reason: 'Empty command' };
  }

  // Block excessively long commands
  if (trimmed.length > 10000) {
    return { allowed: false, reason: 'Command too long (max 10000 characters)' };
  }

  // Block truly destructive commands
  const destructivePatterns = [
    { pattern: /rm\s+-rf\s+\/\s*$/i, reason: 'Cannot delete root filesystem' },
    { pattern: /rm\s+-rf\s+\/\*/i, reason: 'Cannot delete all system files' },
    { pattern: /format\s+[a-z]:\s*$/i, reason: 'Cannot format disk drives' },
    { pattern: /mkfs\./i, reason: 'Cannot create new filesystem (destructive)' },
    { pattern: /dd\s+if=.*of=\/dev\//i, reason: 'Cannot write directly to devices' },
    { pattern: /:\(\)\s*\{\s*:\|:\&\s*\};:/i, reason: 'Fork bomb detected' },
    { pattern: /shutdown\s+\/[sf]\s*$/i, reason: 'Use sleep/hibernate commands instead' },
  ];

  for (const { pattern, reason } of destructivePatterns) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason };
    }
  }

  // Allow everything else
  return { allowed: true };
}

/**
 * Sanitize a file path (prevent directory traversal)
 */
export function sanitizePath(path: string): string {
  // Remove null bytes
  let sanitized = path.replace(/\0/g, '');

  // Normalize separators
  sanitized = sanitized.replace(/\\/g, '/');

  // Remove leading slashes (prevent absolute path access)
  sanitized = sanitized.replace(/^\/+/, '');

  // Remove directory traversal (multiple passes for nested traversals)
  sanitized = sanitized.replace(/\.\.\//g, '');
  sanitized = sanitized.replace(/\.\.\\/g, '');
  sanitized = sanitized.replace(/\.\./g, '');

  // Remove double slashes
  sanitized = sanitized.replace(/\/+/g, '/');

  // Remove special characters that could be used for injection
  sanitized = sanitized.replace(/[;&|`$(){}[\]!#]/g, '');

  return sanitized;
}

/**
 * Check if a device status indicates it can receive commands
 */
export function isDeviceReady(status: string): boolean {
  return status === 'online';
}

/**
 * Validate and clamp a number within bounds
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if a string contains only safe characters (no injection)
 */
export function isSafeInput(value: string): boolean {
  // Block common injection patterns
  const dangerous = [
    '<script', '</script',
    'javascript:',
    'onerror=',
    'onclick=',
    '../',
    '..\\',
    '\x00',
  ];

  const lower = value.toLowerCase();
  return !dangerous.some((pattern) => lower.includes(pattern));
}
