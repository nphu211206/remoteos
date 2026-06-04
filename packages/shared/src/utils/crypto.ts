/**
 * Cryptographic utility functions
 *
 * Note: These are convenience wrappers. For production security,
 * use the native crypto module directly with proper key management.
 */

import { randomBytes, createHash } from 'node:crypto';

/**
 * Generate a cryptographically secure random string
 * @param length - Number of bytes (output will be hex, so 2x length chars)
 */
export function generateToken(length = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a short numeric code (for device pairing)
 * @param digits - Number of digits (default 6)
 */
export function generateNumericCode(digits = 6): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

/**
 * SHA-256 hash a string (for non-security-critical uses like cache keys)
 */
export function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Generate a prefixed ID (for human-readable identification)
 * @example generatePrefixedId('cmd') → "cmd_a1b2c3d4"
 */
export function generatePrefixedId(prefix: string): string {
  const random = randomBytes(4).toString('hex');
  return `${prefix}_${random}`;
}

/**
 * Constant-time string comparison (prevents timing attacks)
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i]! ^ bufB[i]!;
  }
  return result === 0;
}

/**
 * Mask a sensitive string for display
 * @example maskToken("abcdefgh1234") → "abcd****1234"
 */
export function maskSensitive(value: string, visibleChars = 4): string {
  if (value.length <= visibleChars * 2) return '****';
  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  return `${start}****${end}`;
}
