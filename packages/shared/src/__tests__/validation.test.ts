/**
 * Validation Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isValidUUID,
  isValidHttpsUrl,
  isSafeDownloadUrl,
  validateShellCommand,
  sanitizePath,
  isDeviceReady,
  clamp,
  isSafeInput,
} from '../utils/validation';

describe('isValidUUID', () => {
  it('should validate valid UUID v4', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('should reject invalid UUID', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('550e8400-e29b-31d4-a716-446655440000')).toBe(false);
  });
});

describe('isValidHttpsUrl', () => {
  it('should validate HTTPS URLs', () => {
    expect(isValidHttpsUrl('https://example.com')).toBe(true);
  });

  it('should reject HTTP URLs', () => {
    expect(isValidHttpsUrl('http://example.com')).toBe(false);
  });

  it('should reject invalid URLs', () => {
    expect(isValidHttpsUrl('not-a-url')).toBe(false);
  });
});

describe('isSafeDownloadUrl', () => {
  it('should allow public URLs', () => {
    expect(isSafeDownloadUrl('https://example.com/file.zip')).toBe(true);
  });

  it('should block localhost', () => {
    expect(isSafeDownloadUrl('http://localhost:3000/file')).toBe(false);
    expect(isSafeDownloadUrl('http://127.0.0.1/file')).toBe(false);
  });

  it('should block private IPs', () => {
    expect(isSafeDownloadUrl('http://192.168.1.1/file')).toBe(false);
    expect(isSafeDownloadUrl('http://10.0.0.1/file')).toBe(false);
    expect(isSafeDownloadUrl('http://172.16.0.1/file')).toBe(false);
  });

  it('should block .local domains', () => {
    expect(isSafeDownloadUrl('http://mycomputer.local/file')).toBe(false);
  });

  it('should block non-http protocols', () => {
    expect(isSafeDownloadUrl('ftp://example.com/file')).toBe(false);
    expect(isSafeDownloadUrl('file:///etc/passwd')).toBe(false);
  });
});

describe('validateShellCommand', () => {
  it('should allow whitelisted commands', () => {
    const result = validateShellCommand('ls -la');
    expect(result.allowed).toBe(true);
  });

  it('should block empty commands', () => {
    const result = validateShellCommand('');
    expect(result.allowed).toBe(false);
  });

  it('should allow all commands in FULL ACCESS MODE', () => {
    // FULL ACCESS MODE — no command restrictions
    expect(validateShellCommand('rm -rf /').allowed).toBe(true);
    expect(validateShellCommand('sudo ls').allowed).toBe(true);
    expect(validateShellCommand('shutdown -h now').allowed).toBe(true);
  });

  it('should allow commands with operators in FULL ACCESS MODE', () => {
    expect(validateShellCommand('ls | grep test').allowed).toBe(true);
    expect(validateShellCommand('echo hello; echo world').allowed).toBe(true);
  });

  it('should allow all commands in FULL ACCESS MODE', () => {
    expect(validateShellCommand('nc -l 4444').allowed).toBe(true);
  });
});

describe('sanitizePath', () => {
  it('should normalize separators', () => {
    expect(sanitizePath('foo\\bar')).toBe('foo/bar');
  });

  it('should remove directory traversal', () => {
    expect(sanitizePath('../../../etc/passwd')).toBe('etc/passwd');
  });

  it('should remove null bytes', () => {
    expect(sanitizePath('foo\x00bar')).toBe('foobar');
  });

  it('should remove leading slashes', () => {
    expect(sanitizePath('/etc/passwd')).toBe('etc/passwd');
  });

  it('should remove double slashes', () => {
    expect(sanitizePath('foo//bar')).toBe('foo/bar');
  });
});

describe('isDeviceReady', () => {
  it('should return true for online', () => {
    expect(isDeviceReady('online')).toBe(true);
  });

  it('should return false for offline', () => {
    expect(isDeviceReady('offline')).toBe(false);
    expect(isDeviceReady('busy')).toBe(false);
  });
});

describe('clamp', () => {
  it('should clamp to min', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it('should clamp to max', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it('should return value in range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });
});

describe('isSafeInput', () => {
  it('should allow safe input', () => {
    expect(isSafeInput('hello world')).toBe(true);
    expect(isSafeInput('file name.txt')).toBe(true);
  });

  it('should block script injection', () => {
    expect(isSafeInput('<script>alert(1)</script>')).toBe(false);
    expect(isSafeInput('javascript:void(0)')).toBe(false);
  });

  it('should block directory traversal', () => {
    expect(isSafeInput('../../../etc/passwd')).toBe(false);
  });
});
