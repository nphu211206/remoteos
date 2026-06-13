/**
 * Security Middleware Tests
 */

import { describe, it, expect } from 'vitest';
import { detectInjection, sanitizeInput } from '../security.js';

describe('detectInjection', () => {
  it('should detect SQL injection patterns', () => {
    expect(detectInjection("SELECT * FROM users").safe).toBe(false);
    expect(detectInjection("'; DROP TABLE users; --").safe).toBe(false);
    expect(detectInjection("1 OR 1=1").safe).toBe(false);
    expect(detectInjection("UNION SELECT password FROM users").safe).toBe(false);
  });

  it('should detect XSS patterns', () => {
    expect(detectInjection('<script>alert("xss")</script>').safe).toBe(false);
    expect(detectInjection('javascript:alert(1)').safe).toBe(false);
    expect(detectInjection('<iframe src="evil.com">').safe).toBe(false);
    expect(detectInjection('<img onerror="alert(1)">').safe).toBe(false);
  });

  it('should allow safe input', () => {
    expect(detectInjection('Hello world').safe).toBe(true);
    expect(detectInjection('Tạo file hello.py').safe).toBe(true);
    expect(detectInjection('Máy tính thế nào?').safe).toBe(true);
  });
});

describe('sanitizeInput', () => {
  it('should remove angle brackets', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('should remove javascript: protocol', () => {
    expect(sanitizeInput('javascript:alert(1)')).toBe('alert(1)');
  });

  it('should remove event handlers', () => {
    expect(sanitizeInput('onerror=alert(1)')).toBe('alert(1)');
  });

  it('should preserve normal text', () => {
    expect(sanitizeInput('Hello world')).toBe('Hello world');
    expect(sanitizeInput('Tạo file hello.py')).toBe('Tạo file hello.py');
  });
});
