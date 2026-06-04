/**
 * Callback Query Handlers — Inline Keyboard Actions
 *
 * Handles all inline button presses with rich feedback.
 */

import type { Bot } from 'grammy';
import type { BotContext } from '../bot.js';
import { ServerClient } from '../client/server-client.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

const serverClient = new ServerClient(config.server.url);

// ─── Formatting Helpers ───────────────────────────────────────────

function makeProgressBar(percent: number, width = 15): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🖥️ Status', callback_data: 'cmd:status' },
        { text: '📸 Screenshot', callback_data: 'cmd:screenshot' },
      ],
      [
        { text: '🔧 Processes', callback_data: 'cmd:process_list' },
        { text: '💻 System Info', callback_data: 'cmd:system_info' },
      ],
      [
        { text: '📁 Files', callback_data: 'cmd:file_list' },
        { text: '📋 Clipboard', callback_data: 'cmd:get_clipboard' },
      ],
      [
        { text: '🔒 Lock', callback_data: 'cmd:lock_screen' },
        { text: '🔔 Notify', callback_data: 'action:notify' },
      ],
      [
        { text: '📱 Devices', callback_data: 'action:devices' },
        { text: '❓ Help', callback_data: 'action:help' },
      ],
    ],
  };
}

// ─── Response Formatting ──────────────────────────────────────────

function formatCommandResponse(type: string, output: unknown): string {
  if (!output) return '✅ Hoàn thành';
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
        `🔲 CPU   ${makeProgressBar(cpu.usage)} ${cpu.usage.toFixed(1)}%`,
        `💾 RAM   ${makeProgressBar(ram.usagePercent)} ${ram.usedGb}/${ram.totalGb} GB`,
        `💿 Disk  ${makeProgressBar(disk.usagePercent)} ${disk.usedGb}/${disk.totalGb} GB`,
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
        const cpuBar = makeProgressBar(Math.min(p.cpu, 100), 8);
        lines.push(
          `${i + 1}. *${p.name}* (PID: ${p.pid})`,
          `    CPU ${cpuBar} ${p.cpu.toFixed(1)}% | RAM: ${formatBytes(p.ram * 1024 * 1024)}`,
        );
      }
      return lines.join('\n');
    }

    case 'system_info': {
      return [
        '╔══════════════════════════════╗',
        '║   💻 SYSTEM INFO              ║',
        '╚══════════════════════════════╝',
        '',
        `🖥️ OS: ${data.osVersion}`,
        `🏠 Hostname: ${data.hostname}`,
        `🔲 CPU: ${data.cpuModel} (${data.cpuCores} cores)`,
        `💾 RAM: ${data.totalRamGb} GB`,
        `💿 Disk: ${data.totalDiskGb} GB`,
        data.gpuModel ? `🎮 GPU: ${data.gpuModel}` : '',
      ].filter(Boolean).join('\n');
    }

    case 'file_list': {
      const entries = data.entries as Array<{ name: string; type: string; sizeBytes: number }>;
      const lines: string[] = [`📁 *Thư mục: ${data.path}*\n📊 ${data.total} items\n`];
      for (const entry of entries.slice(0, 20)) {
        const icon = entry.type === 'directory' ? '📁' : entry.type === 'symlink' ? '🔗' : '📄';
        const size = entry.type === 'directory' ? '' : ` (${formatBytes(entry.sizeBytes)})`;
        lines.push(`${icon} ${entry.name}${size}`);
      }
      return lines.join('\n');
    }

    case 'get_clipboard': {
      const content = data.content as string;
      if (!content) return '📋 Clipboard trống';
      return `📋 *Clipboard:*\n\`\`\`\n${content.slice(0, 500)}\n\`\`\``;
    }

    case 'lock_screen':
      return '🔒 Đã khóa màn hình!';

    default:
      return `✅ Hoàn thành:\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 3000)}\n\`\`\``;
  }
}

// ─── Handler Registration ─────────────────────────────────────────

export function registerCallbackQueries(bot: Bot<BotContext>): void {
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    try {
      // ─── Device Selection ───────────────────────────────────
      if (data.startsWith('select:')) {
        const deviceId = data.replace('select:', '');
        ctx.session.selectedDeviceId = deviceId;
        await ctx.answerCallbackQuery({ text: '✅ Đã chọn thiết bị' });
        await ctx.editMessageText(`📱 Đã chọn thiết bị: \`${deviceId}\``, {
          parse_mode: 'Markdown',
        });
        return;
      }

      // ─── Command Execution ──────────────────────────────────
      if (data.startsWith('cmd:')) {
        const commandType = data.replace('cmd:', '');
        const deviceId = ctx.session.selectedDeviceId;

        if (!deviceId) {
          // Try auto-select
          try {
            const devices = await serverClient.listDevices();
            const onlineDevice = devices.find((d) => d.status === 'online');
            if (onlineDevice) {
              ctx.session.selectedDeviceId = onlineDevice.id;
            } else {
              await ctx.answerCallbackQuery({ text: '⚠️ Không có thiết bị online' });
              return;
            }
          } catch {
            await ctx.answerCallbackQuery({ text: '⚠️ Lỗi kết nối' });
            return;
          }
        }

        await ctx.answerCallbackQuery({ text: '⏳ Đang thực thi...' });

        try {
          const result = await serverClient.sendCommand(
            ctx.session.selectedDeviceId!,
            commandType,
          );

          // Handle screenshot specially — send as photo
          if (commandType === 'screenshot') {
            const output = result as { imageData?: string; format?: string };
            if (output.imageData) {
              const { InputFile } = await import('grammy');
              const imageBuffer = Buffer.from(output.imageData, 'base64');
              await ctx.replyWithPhoto(
                new InputFile(imageBuffer, 'screenshot.png'),
                { caption: '📸 Screenshot — RemoteOS' },
              );
              return;
            }
          }

          // Format and send response
          const response = formatCommandResponse(commandType, result);
          await ctx.reply(response, { parse_mode: 'Markdown' });
        } catch (err) {
          logger.error({ err, commandType }, 'Callback command failed');
          await ctx.reply('❌ Lỗi: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
        return;
      }

      // ─── Action Handlers ────────────────────────────────────
      if (data.startsWith('action:')) {
        const action = data.replace('action:', '');
        await ctx.answerCallbackQuery();

        switch (action) {
          case 'devices': {
            try {
              const devices = await serverClient.listDevices();
              if (devices.length === 0) {
                await ctx.reply('📭 Chưa có thiết bị. Gõ /register');
                return;
              }
              const lines = devices.map((d, i) => {
                const emoji = d.status === 'online' ? '🟢' : '🔴';
                return `${i + 1}. ${emoji} *${d.name}*`;
              });
              await ctx.reply(['📱 *Thiết bị:*\n', ...lines].join('\n'), {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: devices.map((d) => [{
                    text: `${d.status === 'online' ? '🟢' : '🔴'} ${d.name}`,
                    callback_data: `select:${d.id}`,
                  }]),
                },
              });
            } catch (err) {
              await ctx.reply('❌ Không thể lấy danh sách thiết bị.');
            }
            break;
          }

          case 'help': {
            await ctx.reply(
              '📖 *Danh sách lệnh:*\n\n' +
              '/status — Trạng thái\n' +
              '/screenshot — Chụp màn hình\n' +
              '/processes — Tiến trình\n' +
              '/download — Tải file\n' +
              '/files — Xem thư mục\n' +
              '/notify — Thông báo\n' +
              '/devices — Thiết bị\n' +
              '/menu — Menu chính',
              { parse_mode: 'Markdown' },
            );
            break;
          }

          case 'notify': {
            await ctx.reply('💡 Gõ `/notify <message>` để gửi thông báo.');
            break;
          }
        }
        return;
      }

      // ─── Confirmation ───────────────────────────────────────
      if (data.startsWith('confirm:')) {
        const commandId = data.replace('confirm:', '');
        await ctx.answerCallbackQuery({ text: '✅ Đã xác nhận' });
        await ctx.reply(`✅ Lệnh \`${commandId}\` đã được xác nhận.`, {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (data.startsWith('cancel:')) {
        const commandId = data.replace('cancel:', '');
        await ctx.answerCallbackQuery({ text: '❌ Đã hủy' });
        await ctx.reply(`❌ Lệnh \`${commandId}\` đã bị hủy.`, {
          parse_mode: 'Markdown',
        });
        return;
      }

      // ─── Clarification Response ───────────────────────────────
      if (data.startsWith('clarify:')) {
        const answer = data.replace('clarify:', '');

        if (answer === 'cancel') {
          await ctx.answerCallbackQuery({ text: '❌ Đã hủy' });
          await ctx.reply('❌ Đã hủy yêu cầu.');
          return;
        }

        await ctx.answerCallbackQuery({ text: `✅ ${answer}` });
        await ctx.reply(`🤖 Đang xử lý: *${answer}*...`, { parse_mode: 'Markdown' });

        // Send the clarification answer as a new command
        try {
          const aiResult = await serverClient.interpretAndExecute(answer, ctx.session.selectedDeviceId ?? undefined);

          if (aiResult.success && aiResult.formattedResponse) {
            await ctx.reply(`✅ ${aiResult.formattedResponse}`, { parse_mode: 'Markdown' }).catch(() =>
              ctx.reply(`✅ ${aiResult.formattedResponse}`)
            );
          } else {
            await ctx.reply(`❌ ${aiResult.error ?? 'Không thể thực hiện.'}`);
          }
        } catch (err) {
          logger.error({ err, answer }, 'Clarification execution failed');
          await ctx.reply('❌ Lỗi khi thực hiện.');
        }
        return;
      }

      // Unknown callback
      await ctx.answerCallbackQuery({ text: '❓ Unknown action' });
    } catch (err) {
      logger.error({ err, data }, 'Callback handler error');
      await ctx.answerCallbackQuery({ text: '❌ Lỗi xảy ra' });
    }
  });
}
