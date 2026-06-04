/**
 * Crypto Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateToken,
  generateNumericCode,
  hashString,
  generatePrefixedId,
  timingSafeEqual,
  maskSensitive,
} from '../utils/crypto';

describe('generateToken', () => {
  it('should generate a hex string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('should generate default 64 char hex (32 bytes)', () => {
    const token = generateToken();
    expect(token.length).toBe(64);
  });

  it('should generate custom length', () => {
    const token = generateToken(16);
    expect(token.length).toBe(32);
  });

  it('should generate unique tokens', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    expect(token1).not.toBe(token2);
  });
});

describe('generateNumericCode', () => {
  it('should generate default 6-digit code', () => {
    const code = generateNumericCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('should generate custom digit count', () => {
    const code = generateNumericCode(4);
    expect(code).toMatch(/^\d{4}$/);
  });

  it('should generate codes in valid range', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateNumericCode(6);
      const num = parseInt(code, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThanOrEqual(999999);
    }
  });
});

describe('hashString', () => {
  it('should generate consistent hash', () => {
    const hash1 = hashString('hello');
    const hash2 = hashString('hello');
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different inputs', () => {
    const hash1 = hashString('hello');
    const hash2 = hashString('world');
    expect(hash1).not.toBe(hash2);
  });

  it('should generate 64 char hex string', () => {
    const hash = hashString('test');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('generatePrefixedId', () => {
  it('should generate ID with prefix', () => {
    const id = generatePrefixedId('cmd');
    expect(id).toMatch(/^cmd_[0-9a-f]{8}$/);
  });

  it('should generate unique IDs', () => {
    const id1 = generatePrefixedId('cmd');
    const id2 = generatePrefixedId('cmd');
    expect(id1).not.toBe(id2);
  });
});

describe('timingSafeEqual', () => {
  it('should return true for equal strings', () => {
    expect(timingSafeEqual('hello', 'hello')).toBe(true);
  });

  it('should return false for different strings', () => {
    expect(timingSafeEqual('hello', 'world')).toBe(false);
  });

  it('should return false for different lengths', () => {
    expect(timingSafeEqual('hello', 'helloo')).toBe(false);
  });
});

describe('maskSensitive', () => {
  it('should mask middle of string', () => {
    expect(maskSensitive('abcdefgh1234')).toBe('abcd****1234');
  });

  it('should mask short strings completely', () => {
    expect(maskSensitive('abc')).toBe('****');
  });

  it('should respect visible chars parameter', () => {
    expect(maskSensitive('abcdefgh1234', 2)).toBe('ab****34');
  });
});
