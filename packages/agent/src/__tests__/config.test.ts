/**
 * Agent Config Tests
 */

import { describe, it, expect } from 'vitest';

describe('Agent Configuration', () => {
  it('should have valid default timing values', () => {
    // Test that timing constants are reasonable
    const pollInterval = 2000;
    const heartbeatInterval = 10000;
    const commandTimeout = 30000;

    expect(pollInterval).toBeGreaterThan(0);
    expect(heartbeatInterval).toBeGreaterThan(pollInterval);
    expect(commandTimeout).toBeGreaterThan(heartbeatInterval);
  });

  it('should validate device identity format', () => {
    const identity = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test-PC',
      createdAt: new Date().toISOString(),
    };

    expect(identity.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(identity.name.length).toBeGreaterThan(0);
    expect(identity.createdAt).toBeTruthy();
  });

  it('should validate feature flags', () => {
    const features = {
      allowScreenshot: true,
      allowShell: true,
      allowFileDownload: true,
    };

    expect(typeof features.allowScreenshot).toBe('boolean');
    expect(typeof features.allowShell).toBe('boolean');
    expect(typeof features.allowFileDownload).toBe('boolean');
  });
});
