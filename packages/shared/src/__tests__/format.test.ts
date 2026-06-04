/**
 * Format Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatDuration,
  formatPercent,
  formatProgressBar,
  formatFileProgress,
  formatSpeed,
  formatEta,
  truncate,
} from '../utils/format';

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500.0 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });

  it('should format terabytes', () => {
    expect(formatBytes(1099511627776)).toBe('1.0 TB');
  });

  it('should handle negative values', () => {
    expect(formatBytes(-1024)).toBe('-1.0 KB');
  });

  it('should respect decimal places', () => {
    expect(formatBytes(1536, 2)).toBe('1.50 KB');
    expect(formatBytes(1536, 0)).toBe('2 KB');
  });
});

describe('formatDuration', () => {
  it('should format seconds', () => {
    expect(formatDuration(30)).toBe('30s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1m 30s');
  });

  it('should format hours, minutes, seconds', () => {
    expect(formatDuration(3661)).toBe('1h 1m 1s');
  });

  it('should format large hours', () => {
    expect(formatDuration(90061)).toBe('25h 1m 1s');
  });

  it('should handle zero', () => {
    expect(formatDuration(0)).toBe('<1s');
  });

  it('should handle negative values', () => {
    expect(formatDuration(-30)).toBe('-30s');
  });

  it('should handle sub-second', () => {
    expect(formatDuration(0.5)).toBe('<1s');
  });
});

describe('formatPercent', () => {
  it('should format percentage', () => {
    expect(formatPercent(75.4)).toBe('75.4%');
  });

  it('should format with custom decimals', () => {
    expect(formatPercent(75.456, 2)).toBe('75.46%');
  });

  it('should handle zero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('should handle 100', () => {
    expect(formatPercent(100)).toBe('100.0%');
  });
});

describe('formatProgressBar', () => {
  it('should create progress bar at 0%', () => {
    expect(formatProgressBar(0, 10)).toBe('░░░░░░░░░░');
  });

  it('should create progress bar at 100%', () => {
    expect(formatProgressBar(100, 10)).toBe('██████████');
  });

  it('should create progress bar at 50%', () => {
    expect(formatProgressBar(50, 10)).toBe('█████░░░░░');
  });

  it('should use default width of 20', () => {
    const bar = formatProgressBar(50);
    expect(bar.length).toBe(20);
    expect(bar).toBe('██████████░░░░░░░░░░');
  });

  it('should handle partial fill', () => {
    expect(formatProgressBar(30, 10)).toBe('███░░░░░░░');
  });
});

describe('formatFileProgress', () => {
  it('should format with known total', () => {
    expect(formatFileProgress(500, 1000)).toBe('500.0 B / 1000.0 B');
  });

  it('should format with unknown total', () => {
    expect(formatFileProgress(500, null)).toBe('500.0 B');
  });
});

describe('formatSpeed', () => {
  it('should format bytes per second', () => {
    expect(formatSpeed(1048576)).toBe('1.0 MB/s');
  });
});

describe('formatEta', () => {
  it('should format ETA', () => {
    expect(formatEta(125)).toBe('2m 5s');
  });

  it('should handle null', () => {
    expect(formatEta(null)).toBe('calculating...');
  });

  it('should handle negative', () => {
    expect(formatEta(-1)).toBe('almost done');
  });
});

describe('truncate', () => {
  it('should not truncate short text', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should truncate long text', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('should handle exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});
