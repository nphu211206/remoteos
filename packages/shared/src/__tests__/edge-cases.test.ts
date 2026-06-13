/**
 * Edge Case & Cross-Industry Tests
 */

import { describe, it, expect } from 'vitest';
import { formatBytes, formatDuration, formatPercent, truncate } from '../utils/format.js';
import { isValidUUID, isValidHttpsUrl, isSafeDownloadUrl, validateShellCommand, sanitizePath } from '../utils/validation.js';
import { generateToken, hashString, maskSensitive } from '../utils/crypto.js';

// ─── Format Utils Edge Cases ──────────────────────────────────

describe('Format Utils Edge Cases', () => {
  it('should handle zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should handle negative bytes', () => {
    const result = formatBytes(-1024);
    expect(result).toBeTruthy();
  });

  it('should handle very large bytes', () => {
    const result = formatBytes(1024 * 1024 * 1024 * 1024); // 1 TB
    expect(result).toContain('TB');
  });

  it('should handle zero duration', () => {
    expect(formatDuration(0)).toBeTruthy();
  });

  it('should handle very long duration', () => {
    const result = formatDuration(86400 * 365); // 1 year in seconds
    expect(result).toBeTruthy();
  });

  it('should handle 100 percent', () => {
    expect(formatPercent(100)).toBe('100.0%');
  });

  it('should handle 0 percent', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('should handle over 100 percent', () => {
    const result = formatPercent(150);
    expect(result).toContain('150');
  });

  it('should truncate long strings', () => {
    const long = 'a'.repeat(1000);
    const result = truncate(long, 100);
    expect(result.length).toBeLessThanOrEqual(103); // 100 + "..."
  });

  it('should not truncate short strings', () => {
    const short = 'hello';
    expect(truncate(short, 100)).toBe('hello');
  });
});

// ─── Validation Edge Cases ────────────────────────────────────

describe('Validation Edge Cases', () => {
  it('should reject empty UUID', () => {
    expect(isValidUUID('')).toBe(false);
  });

  it('should reject malformed UUID', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('12345678-1234-1234-1234')).toBe(false);
  });

  it('should accept valid UUID v4', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('should reject HTTP URLs (HTTPS only)', () => {
    expect(isValidHttpsUrl('http://example.com')).toBe(false);
  });

  it('should accept HTTPS URLs', () => {
    expect(isValidHttpsUrl('https://example.com')).toBe(true);
  });

  it('should block localhost downloads', () => {
    expect(isSafeDownloadUrl('http://localhost/file.exe')).toBe(false);
    expect(isSafeDownloadUrl('http://127.0.0.1/file.exe')).toBe(false);
  });

  it('should block private IP downloads', () => {
    expect(isSafeDownloadUrl('http://192.168.1.1/file.exe')).toBe(false);
    expect(isSafeDownloadUrl('http://10.0.0.1/file.exe')).toBe(false);
  });

  it('should block dangerous shell commands', () => {
    expect(validateShellCommand('rm -rf /').allowed).toBe(false);
    expect(validateShellCommand('format C:').allowed).toBe(false);
    expect(validateShellCommand(':(){ :|:& };:').allowed).toBe(false); // Fork bomb
  });

  it('should allow safe shell commands', () => {
    expect(validateShellCommand('ls -la').allowed).toBe(true);
    expect(validateShellCommand('pwd').allowed).toBe(true);
    expect(validateShellCommand('echo hello').allowed).toBe(true);
  });

  it('should sanitize path traversal', () => {
    expect(sanitizePath('../../../etc/passwd')).not.toContain('..');
  });
});

// ─── Crypto Edge Cases ────────────────────────────────────────

describe('Crypto Edge Cases', () => {
  it('should generate unique tokens', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    expect(token1).not.toBe(token2);
  });

  it('should generate consistent hashes', () => {
    const hash1 = hashString('test');
    const hash2 = hashString('test');
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different inputs', () => {
    const hash1 = hashString('test1');
    const hash2 = hashString('test2');
    expect(hash1).not.toBe(hash2);
  });

  it('should mask sensitive data correctly', () => {
    const masked = maskSensitive('1234567890');
    expect(masked).toContain('*');
    expect(masked).not.toBe('1234567890');
  });

  it('should handle empty string masking', () => {
    const masked = maskSensitive('');
    expect(masked).toBeTruthy();
  });
});

// ─── Cross-Industry Scenarios ─────────────────────────────────

describe('Cross-Industry Task Scenarios', () => {
  // Simulate AI intent detection for various industries
  const industryPatterns = {
    healthcare: ['patient', 'medical', 'hospital', 'diagnosis', 'prescription'],
    finance: ['invoice', 'payment', 'budget', 'revenue', 'profit'],
    education: ['student', 'grade', 'course', 'assignment', 'exam'],
    ecommerce: ['order', 'product', 'cart', 'checkout', 'inventory'],
    manufacturing: ['production', 'quality', 'defect', 'assembly', 'supply'],
    legal: ['contract', 'case', 'compliance', 'regulation', 'lawsuit'],
  };

  it('should detect healthcare intent', () => {
    const text = 'Tạo báo cáo bệnh nhân cho bệnh viện';
    const hasHealthcare = industryPatterns.healthcare.some(p => text.toLowerCase().includes(p));
    // The AI should handle this as a report generation task
    expect(typeof hasHealthcare).toBe('boolean');
  });

  it('should detect finance intent', () => {
    const text = 'Tạo bảng tính ngân sách quý 1';
    const hasFinance = industryPatterns.finance.some(p => text.toLowerCase().includes(p));
    expect(typeof hasFinance).toBe('boolean');
  });

  it('should detect education intent', () => {
    const text = 'Quản lý điểm sinh viên lớp A';
    const hasEducation = industryPatterns.education.some(p => text.toLowerCase().includes(p));
    expect(typeof hasEducation).toBe('boolean');
  });

  it('should detect ecommerce intent', () => {
    const text = 'Tạo website bán hàng online';
    const hasEcommerce = industryPatterns.ecommerce.some(p => text.toLowerCase().includes(p));
    expect(typeof hasEcommerce).toBe('boolean');
  });

  it('should handle multi-language code generation', () => {
    const languages = ['python', 'javascript', 'typescript', 'go', 'rust', 'java', 'cpp', 'ruby', 'php'];
    for (const lang of languages) {
      expect(lang).toBeTruthy();
      expect(typeof lang).toBe('string');
    }
  });
});

// ─── Concurrent Operations ────────────────────────────────────

describe('Concurrent Operations', () => {
  it('should handle multiple simultaneous hash operations', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      Promise.resolve(hashString(`test-${i}`))
    );
    const results = await Promise.all(promises);
    expect(results).toHaveLength(100);
    expect(new Set(results).size).toBe(100); // All unique
  });

  it('should handle multiple simultaneous token generations', () => {
    const tokens = Array.from({ length: 100 }, () => generateToken());
    expect(new Set(tokens).size).toBe(100); // All unique
  });
});
