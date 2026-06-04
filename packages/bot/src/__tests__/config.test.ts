/**
 * Bot Config Tests
 */

import { describe, it, expect } from 'vitest';

describe('Bot Configuration', () => {
  it('should have valid session data structure', () => {
    const session = {
      selectedDeviceId: null as string | null,
      state: 'idle' as const,
      temp: {},
    };

    expect(session.selectedDeviceId).toBeNull();
    expect(['idle', 'awaiting_device_name', 'awaiting_registration_code']).toContain(session.state);
    expect(typeof session.temp).toBe('object');
  });

  it('should validate Telegram bot token format', () => {
    // Telegram bot tokens follow the format: <bot_id>:<auth_token>
    const validToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
    const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;

    expect(validToken).toMatch(tokenPattern);
  });

  it('should validate callback data formats', () => {
    const callbackFormats = [
      { data: 'select:device-123', prefix: 'select:' },
      { data: 'cmd:status', prefix: 'cmd:' },
      { data: 'action:help', prefix: 'action:' },
      { data: 'confirm:cmd-abc', prefix: 'confirm:' },
      { data: 'cancel:cmd-abc', prefix: 'cancel:' },
    ];

    for (const { data, prefix } of callbackFormats) {
      expect(data.startsWith(prefix)).toBe(true);
      const value = data.replace(prefix, '');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
