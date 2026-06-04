/**
 * Formatting utilities for human-readable output
 */

/**
 * Format bytes to human-readable string
 * @example formatBytes(1536) → "1.5 KB"
 * @example formatBytes(1073741824) → "1 GB"
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return `-${formatBytes(-bytes, decimals)}`;

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Format seconds to human-readable duration
 * @example formatDuration(3661) → "1h 1m 1s"
 * @example formatDuration(90) → "1m 30s"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return `-${formatDuration(-seconds)}`;
  if (seconds < 1) return '<1s';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);

  return parts.join(' ');
}

/**
 * Format percentage with optional threshold coloring indicator
 * @example formatPercent(75.4) → "75.4%"
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a progress bar
 * @example formatProgressBar(60, 20) → "████████████░░░░░░░░"
 */
export function formatProgressBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Format file size with progress
 * @example formatFileProgress(500, 1000, 10) → "500 B / 1 KB"
 */
export function formatFileProgress(downloaded: number, total: number | null, decimals = 1): string {
  const downloadedStr = formatBytes(downloaded, decimals);
  if (total === null) return downloadedStr;
  return `${downloadedStr} / ${formatBytes(total, decimals)}`;
}

/**
 * Format download speed
 * @example formatSpeed(1048576) → "1 MB/s"
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Format ETA in seconds to human-readable
 * @example formatEta(125) → "2m 5s"
 */
export function formatEta(seconds: number | null): string {
  if (seconds === null) return 'calculating...';
  if (seconds < 0) return 'almost done';
  return formatDuration(seconds);
}

/**
 * Format system status as a visual card
 */
export function formatStatusCard(data: {
  cpu: number;
  ram: number;
  disk: number;
  uptime: string;
  processes: number;
}): string {
  const cpuBar = formatProgressBar(data.cpu);
  const ramBar = formatProgressBar(data.ram);
  const diskBar = formatProgressBar(data.disk);

  return [
    '┌─────────────────────────────────┐',
    '│  🖥️  System Status               │',
    '├─────────────────────────────────┤',
    `│  CPU   ${cpuBar} ${formatPercent(data.cpu, 0).padStart(5)} │`,
    `│  RAM   ${ramBar} ${formatPercent(data.ram, 0).padStart(5)} │`,
    `│  Disk  ${diskBar} ${formatPercent(data.disk, 0).padStart(5)} │`,
    '├─────────────────────────────────┤',
    `│  ⏱️  Uptime: ${data.uptime.padEnd(20)}│`,
    `│  📊 Processes: ${String(data.processes).padEnd(17)}│`,
    '└─────────────────────────────────┘',
  ].join('\n');
}

/**
 * Escape special characters for Telegram MarkdownV2
 */
export function escapeTelegramMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
