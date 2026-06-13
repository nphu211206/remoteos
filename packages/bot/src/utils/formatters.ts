/**
 * Shared formatting utilities for Telegram bot
 */

import { formatProgressBar, formatBytes } from '@remoteos/shared/utils';

/**
 * Format command output for Telegram display
 */
export function formatCommandResponse(type: string, output: unknown): string {
  if (!output) return '✅ Hoàn thành (không có kết quả)';

  const data = output as Record<string, unknown>;

  switch (type) {
    case 'status': {
      const cpu = data.cpu as { usage: number; model: string; cores: number };
      const ram = data.ram as { usedGb: number; totalGb: number; usagePercent: number };
      const disk = data.disk as { usedGb: number; totalGb: number; usagePercent: number };
      const uptime = data.uptime as { formatted: string };
      const processes = data.processes as { total: number };
      const temp = data.temperature as { cpu: number | null };

      const lines: string[] = [
        '╔══════════════════════════════╗',
        '║   🖥️  SYSTEM STATUS           ║',
        '╚══════════════════════════════╝',
        '',
        `🔲 CPU   ${formatProgressBar(cpu.usage)} ${cpu.usage.toFixed(1)}%`,
        `💾 RAM   ${formatProgressBar(ram.usagePercent)} ${ram.usedGb}/${ram.totalGb} GB`,
        `💿 Disk  ${formatProgressBar(disk.usagePercent)} ${disk.usedGb}/${disk.totalGb} GB`,
        '',
        `⏱️ Uptime: ${uptime.formatted}`,
        `📊 Processes: ${processes.total}`,
      ];

      if (temp.cpu !== null) {
        const tempEmoji = temp.cpu > 80 ? '🔴' : temp.cpu > 60 ? '🟡' : '🟢';
        lines.push(`${tempEmoji} CPU Temp: ${temp.cpu}°C`);
      }

      return lines.join('\n');
    }

    case 'process_list': {
      const procs = data.processes as Array<{ name: string; cpu: number; ram: number; pid: number }>;
      const total = data.total as number;

      const lines: string[] = [
        '╔══════════════════════════════╗',
        '║   🔧 RUNNING PROCESSES       ║',
        '╚══════════════════════════════╝',
        '',
        `📊 Total: ${total} processes`,
        '',
      ];

      for (let i = 0; i < Math.min(procs.length, 10); i++) {
        const p = procs[i]!;
        const cpuBar = formatProgressBar(Math.min(p.cpu, 100), 8);
        lines.push(`${i + 1}. *${p.name}* (PID: ${p.pid})`);
        lines.push(`   CPU ${cpuBar} ${p.cpu.toFixed(1)}% | RAM: ${formatBytes(p.ram * 1024 * 1024)}`);
      }

      if (procs.length > 10) {
        lines.push(`\n... và ${procs.length - 10} processes khác`);
      }

      return lines.join('\n');
    }

    case 'file_list': {
      const entries = data.entries as Array<{ name: string; type: string; sizeBytes: number }>;
      const path = data.path as string;

      const lines: string[] = [
        `📁 *${path}*`,
        '',
      ];

      for (const entry of entries.slice(0, 20)) {
        const icon = entry.type === 'directory' ? '📁' : '📄';
        const size = entry.type === 'directory' ? '' : ` (${formatBytes(entry.sizeBytes)})`;
        lines.push(`${icon} ${entry.name}${size}`);
      }

      if (entries.length > 20) {
        lines.push(`\n... và ${entries.length - 20} items khác`);
      }

      return lines.join('\n');
    }

    case 'screenshot':
      return '📸 Đã chụp màn hình thành công!';

    case 'notify':
      return '🔔 Đã gửi thông báo!';

    case 'lock_screen':
      return '🔒 Đã khóa màn hình!';

    case 'sleep':
      return '💤 Máy tính đang ngủ...';

    case 'hibernate':
      return '💤 Máy tính đang hibernate...';

    default:
      return `✅ Hoàn thành: ${type}`;
  }
}
