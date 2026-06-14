/**
 * Command Handlers — Premium Telegram Bot Experience
 *
 * Features:
 * - Rich visual formatting with cards and progress bars
 * - Inline keyboard navigation
 * - Multi-device support with auto-selection
 * - Real-time feedback and progress indicators
 * - Error recovery with suggestions
 */

import type { Bot } from 'grammy';
import type { BotContext } from '../bot.js';
import { formatBytes, formatDuration, formatProgressBar } from '@remoteos/shared/utils';
import { mainMenuKeyboard } from '../utils/keyboards.js';
import { ServerClient } from '../client/server-client.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

const serverClient = new ServerClient(config.server.url);

function deviceSelectorKeyboard(devices: Array<{ id: string; name: string; status: string }>) {
  return {
    inline_keyboard: devices.map((d) => [{
      text: `${d.status === 'online' ? '🟢' : '🔴'} ${d.name}`,
      callback_data: `select:${d.id}`,
    }]),
  };
}

// ─── Command Registration ─────────────────────────────────────────

export function registerCommands(bot: Bot<BotContext>): void {
  /**
   * /start — Welcome message with animated intro
   */
  bot.command('start', async (ctx) => {
    const firstName = ctx.from?.first_name ?? 'User';
    logger.info({ userId: ctx.from?.id }, 'Handling /start command');

    await ctx.reply(
      `👋 *Xin chào ${firstName}! Chào mừng đến với RemoteOS!* 🚀\n\n` +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '_Your computer, anywhere._\n' +
      '_Just talk to it._\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '🖥️ RemoteOS cho phép bạn kiểm soát máy tính từ xa chỉ bằng tin nhắn.\n\n' +
      '*Bắt đầu trong 3 bước:*\n' +
      '1️⃣ Cài RemoteOS Agent trên máy tính\n' +
      '2️⃣ Nhập mã kết nối: `/register`\n' +
      '3️⃣ Bắt đầu ra lệnh!\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '💡 *Mẹo:* Gõ câu tự nhiên cũng được!\n' +
      '_Ví dụ: "máy tính thế nào?" hoặc "chụp màn hình"_',
      { reply_markup: mainMenuKeyboard() },
    );
  });

  /**
   * /help — Beautiful help card
   */
  bot.command('help', async (ctx) => {
    logger.info({ userId: ctx.from?.id }, 'Handling /help command');

    await ctx.reply(
      '╔══════════════════════════════╗\n' +
      '║   📖 DANH SÁCH LỆNH          ║\n' +
      '╚══════════════════════════════╝\n\n' +
      '*🖥️ Giám sát:*\n' +
      '  `/status` — Trạng thái máy tính\n' +
      '  `/screenshot` — Chụp màn hình\n' +
      '  `/processes` — Danh sách tiến trình\n\n' +
      '*📁 File:*\n' +
      '  `/download <url>` — Tải file về máy\n' +
      '  `/files [path]` — Xem thư mục\n\n' +
      '*⚡ Hệ thống:*\n' +
      '  `/notify <message>` — Ghi chú trên desktop\n\n' +
      '*🤖 AI:*\n' +
      '  `/ai` — Cấu hình AI provider\n' +
      '  `/ai setup` — Setup wizard\n\n' +
      '*🔧 Quản lý:*\n' +
      '  `/devices` — Danh sách thiết bị\n' +
      '  `/dashboard` — Tổng quan hệ thống\n' +
      '  `/register` — Đăng ký thiết bị mới\n' +
      '  `/menu` — Menu chính\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '💡 *Gõ câu tự nhiên cũng được!*\n' +
      '• "máy tính thế nào?" → Xem trạng thái\n' +
      '• "chụp màn hình" → Chụp ảnh\n' +
      '• "tải file này" + link → Tải file\n' +
      '• "tiến trình đang chạy" → Xem processes',
    );
  });

  /**
   * /menu — Main menu with inline keyboard
   */
  bot.command('menu', async (ctx) => {
    await ctx.reply(
      '🎮 *RemoteOS — Menu chính*\n\n' +
      'Chọn lệnh muốn thực hiện:',
      { reply_markup: mainMenuKeyboard() },
    );
  });

  /**
   * /status — System status with visual cards
   */
  bot.command('status', async (ctx) => {
    const deviceId = ctx.session.selectedDeviceId;
    if (!deviceId) {
      const devices = await serverClient.listDevices();
      const onlineDevice = devices.find((d) => d.status === 'online');
      if (onlineDevice) {
        ctx.session.selectedDeviceId = onlineDevice.id;
      } else {
        await ctx.reply(
          '⚠️ *Không có thiết bị nào đang online.*\n\n' +
          'Gõ `/devices` để xem danh sách.',
        );
        return;
      }
    }

    await ctx.reply('⏳ Đang lấy trạng thái...');

    try {
      const result = await serverClient.sendCommand(
        ctx.session.selectedDeviceId!,
        'status',
      );
      const output = result as Record<string, unknown>;
      const cpu = output.cpu as { usage: number; model: string; cores: number; speed: number };
      const ram = output.ram as { usedGb: number; totalGb: number; usagePercent: number };
      const disk = output.disk as { usedGb: number; totalGb: number; usagePercent: number };
      const network = output.network as { downMbps: number; upMbps: number };
      const uptime = output.uptime as { formatted: string };
      const processes = output.processes as { total: number };
      const temp = output.temperature as { cpu: number | null };
      const battery = output.battery as { percent: number | null; isCharging: boolean | null };

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

      if (battery.percent !== null) {
        const battEmoji = battery.isCharging ? '🔌' : battery.percent < 20 ? '🪫' : '🔋';
        lines.push(`${battEmoji} Battery: ${battery.percent}%${battery.isCharging ? ' (charging)' : ''}`);
      }

      if (cpu.model) {
        lines.push('', `💻 ${cpu.model} (${cpu.cores} cores @ ${cpu.speed} GHz)`);
      }

      await ctx.reply(lines.join('\n'), { reply_markup: mainMenuKeyboard() });
    } catch (err) {
      logger.error({ err }, 'Status command failed');
      await ctx.reply('❌ Lỗi: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  });

  /**
   * /screenshot — Capture and send screenshot
   */
  bot.command('screenshot', async (ctx) => {
    const deviceId = ctx.session.selectedDeviceId;
    if (!deviceId) {
      await ctx.reply('⚠️ Chưa chọn thiết bị. Gõ /devices để xem danh sách.');
      return;
    }

    await ctx.reply('📸 Đang chụp màn hình...');

    try {
      const result = await serverClient.sendCommand(deviceId, 'screenshot');
      const output = result as { imageData?: string; format?: string };

      if (output.imageData) {
        const { InputFile } = await import('grammy');
        const imageBuffer = Buffer.from(output.imageData, 'base64');
        await ctx.replyWithPhoto(
          new InputFile(imageBuffer, 'screenshot.png'),
          { caption: '📸 Screenshot — RemoteOS' },
        );
      } else {
        await ctx.reply('📸 Đã chụp màn hình!');
      }
    } catch (err) {
      logger.error({ err }, 'Screenshot failed');
      await ctx.reply('❌ Không thể chụp màn hình: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  });

  /**
   * /processes — Process list with visual formatting
   */
  bot.command('processes', async (ctx) => {
    const deviceId = ctx.session.selectedDeviceId;
    if (!deviceId) {
      await ctx.reply('⚠️ Chưa chọn thiết bị.');
      return;
    }

    await ctx.reply('⏳ Đang lấy danh sách tiến trình...');

    try {
      const result = await serverClient.sendCommand(deviceId, 'process_list');
      const output = result as {
        processes: Array<{ name: string; cpu: number; ram: number; pid: number; status: string }>;
        total: number;
      };

      const lines: string[] = [
        '╔══════════════════════════════╗',
        '║   🔧 RUNNING PROCESSES       ║',
        '╚══════════════════════════════╝',
        '',
        `📊 Total: ${output.total} processes`,
        '',
      ];

      const top = output.processes.slice(0, 12);
      for (let i = 0; i < top.length; i++) {
        const p = top[i]!;
        const cpuBar = formatProgressBar(Math.min(p.cpu, 100), 8);
        const rank = String(i + 1).padStart(2, ' ');
        lines.push(
          `${rank}. *${p.name}* (PID: ${p.pid})`,
          `    CPU ${cpuBar} ${p.cpu.toFixed(1)}% | RAM: ${formatBytes(p.ram * 1024 * 1024)}`,
        );
      }

      if (output.processes.length > 12) {
        lines.push('', `... và ${output.processes.length - 12} tiến trình khác`);
      }

      await ctx.reply(lines.join('\n'));
    } catch (err) {
      logger.error({ err }, 'Process list failed');
      await ctx.reply('❌ Lỗi: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  });

  /**
   * /devices — Device list with status indicators
   */
  bot.command('devices', async (ctx) => {
    logger.info({ userId: ctx.from?.id }, 'Handling /devices command');
    try {
      const devices = await serverClient.listDevices();

      if (devices.length === 0) {
        await ctx.reply(
          '📭 *Chưa có thiết bị nào.*\n\n' +
          'Để kết nối:\n' +
          '1️⃣ Cài RemoteOS Agent\n' +
          '2️⃣ Gõ `/register` để lấy mã\n' +
          '3️⃣ Nhập mã vào Agent',
        );
        return;
      }

      const lines: string[] = [
        '╔══════════════════════════════╗',
        '║   📱 THIẾT BỊ                ║',
        '╚══════════════════════════════╝',
        '',
      ];

      devices.forEach((d, i) => {
        const statusEmoji = d.status === 'online' ? '🟢' : '🔴';
        const cpuStr = d.cpuUsage !== null ? `CPU: ${d.cpuUsage}%` : '';
        const ramStr = d.ramUsage !== null ? `RAM: ${d.ramUsage}%` : '';
        const stats = [cpuStr, ramStr].filter(Boolean).join(' | ');
        lines.push(`${i + 1}. ${statusEmoji} *${d.name}*`);
        if (stats) lines.push(`   ${stats}`);
      });

      await ctx.reply(lines.join('\n'), {
        reply_markup: deviceSelectorKeyboard(devices),
      });
    } catch (err) {
      logger.error({ err }, 'Devices command failed');
      await ctx.reply('❌ Lỗi: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  });

  /**
   * /download — Download file from URL
   */
  bot.command('download', async (ctx) => {
    const deviceId = ctx.session.selectedDeviceId;
    if (!deviceId) {
      await ctx.reply('⚠️ Chưa chọn thiết bị.');
      return;
    }

    const url = ctx.match;
    if (!url) {
      await ctx.reply('❓ Sử dụng: /download <url>');
      return;
    }

    await ctx.reply(`📥 Đang tải: ${url}...`);

    try {
      const result = await serverClient.sendCommand(deviceId, 'file_download', { url });
      const output = result as { fileName: string; filePath: string; sizeBytes: number; durationMs: number };

      await ctx.reply(
        '╔══════════════════════════════╗\n' +
        '║   📥 DOWNLOAD COMPLETE        ║\n' +
        '╚══════════════════════════════╝\n\n' +
        `📄 File: ${output.fileName}\n` +
        `📦 Size: ${formatBytes(output.sizeBytes)}\n` +
        `📁 Path: ${output.filePath}\n` +
        `⏱️ Time: ${formatDuration((output.durationMs || 0) / 1000)}`,
      );
    } catch (err) {
      await ctx.reply('❌ Lỗi: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  });

  /**
   * /files — List files in directory
   */
  bot.command('files', async (ctx) => {
    const deviceId = ctx.session.selectedDeviceId;
    if (!deviceId) {
      await ctx.reply('⚠️ Chưa chọn thiết bị.');
      return;
    }

    const path = ctx.match || '.';

    try {
      const result = await serverClient.sendCommand(deviceId, 'file_list', { path });
      const output = result as {
        entries: Array<{ name: string; type: string; sizeBytes: number }>;
        path: string;
        total: number;
      };

      const lines: string[] = [
        `📁 *Thư mục: ${output.path}*`,
        `📊 ${output.total} items`,
        '',
      ];

      for (const entry of output.entries.slice(0, 25)) {
        const icon = entry.type === 'directory' ? '📁' : entry.type === 'symlink' ? '🔗' : '📄';
        const size = entry.type === 'directory' ? '' : ` (${formatBytes(entry.sizeBytes)})`;
        lines.push(`${icon} ${entry.name}${size}`);
      }

      if (output.entries.length > 25) {
        lines.push('', `... và ${output.entries.length - 25} items khác`);
      }

      await ctx.reply(lines.join('\n'));
    } catch (err) {
      await ctx.reply('❌ Lỗi: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  });

  /**
   * /notify — Send desktop notification
   */
  bot.command('notify', async (ctx) => {
    const deviceId = ctx.session.selectedDeviceId;
    if (!deviceId) {
      await ctx.reply('⚠️ Chưa chọn thiết bị.');
      return;
    }

    const message = ctx.match;
    if (!message) {
      await ctx.reply('❓ Sử dụng: /notify <message>');
      return;
    }

    try {
      await serverClient.sendCommand(deviceId, 'notify', {
        title: 'RemoteOS',
        body: message,
      });
      await ctx.reply('🔔 Đã gửi thông báo đến desktop!');
    } catch (err) {
      await ctx.reply('❌ Lỗi: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  });

  // NOTE: /ai handler is in ai-settings.ts (with proper server integration)

  /**
   * /dashboard — System overview
   */
  bot.command('dashboard', async (ctx) => {
    logger.info({ userId: ctx.from?.id }, 'Handling /dashboard command');
    try {
      const devices = await serverClient.listDevices();

      if (devices.length === 0) {
        await ctx.reply('📭 Chưa có thiết bị. Gõ /register để kết nối.');
        return;
      }

      const lines: string[] = [
        '╔══════════════════════════════════╗',
        '║   🎯 REMOTEOS DASHBOARD          ║',
        '╚══════════════════════════════════╝',
        '',
      ];

      for (const device of devices) {
        const statusEmoji = device.status === 'online' ? '🟢' : '🔴';
        lines.push(`${statusEmoji} *${device.name}* (${device.os})`);

        if (device.status === 'online' && device.cpuUsage !== null) {
          const cpuBar = formatProgressBar(device.cpuUsage, 10);
          const ramBar = formatProgressBar(device.ramUsage ?? 0, 10);
          lines.push(`   CPU ${cpuBar} ${device.cpuUsage.toFixed(1)}%`);
          lines.push(`   RAM ${ramBar} ${(device.ramUsage ?? 0).toFixed(1)}%`);
        }

        if (device.lastSeenAt) {
          const lastSeen = new Date(device.lastSeenAt);
          const ago = Math.floor((Date.now() - lastSeen.getTime()) / 1000);
          if (ago < 60) {
            lines.push(`   ⏰ Hoạt động: ${ago}s trước`);
          } else if (ago < 3600) {
            lines.push(`   ⏰ Hoạt động: ${Math.floor(ago / 60)}m trước`);
          }
        }

        lines.push('');
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 *Lệnh nhanh:*');
      lines.push('• `/status` — Chi tiết hệ thống');
      lines.push('• `/screenshot` — Chụp màn hình');
      lines.push('• `/processes` — Tiến trình');

      await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard(),
      });
    } catch (err) {
      logger.error({ err }, 'Dashboard failed');
      await ctx.reply('❌ Không thể lấy dashboard.');
    }
  });
}
