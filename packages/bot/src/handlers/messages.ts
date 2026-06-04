/**
 * Message Handlers — Natural Language Processing
 *
 * Features:
 * - Rule-based intent matching (80% of cases, instant, zero cost)
 * - AI fallback for complex queries (Gemini API)
 * - Compound command detection
 * - Smart suggestions when intent is unclear
 * - Multi-device auto-selection
 * - Rich response formatting
 */

import type { Bot } from 'grammy';
import type { BotContext } from '../bot.js';
import { ServerClient } from '../client/server-client.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

const serverClient = new ServerClient(config.server.url);

// ─── Intent Pattern Matching ──────────────────────────────────────

interface IntentPattern {
  type: string;
  patterns: RegExp[];
  extractParams?: (text: string) => Record<string, unknown>;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Status
  {
    type: 'status',
    patterns: [
      /(máy tính|computer|pc|server).*(thế nào|status|trạng thái|ổn không|có sao không|how|sao rồi|ra sao|như nào|ok không|bình thường|ổn|tốt không)/i,
      /^(status|trạng thái|máy tính thế nào|máy tính sao rồi|máy tính ok không)$/i,
      /(kiểm tra|check|xem).*(máy tính|computer|pc|system|hệ thống)/i,
    ],
  },
  // Screenshot
  {
    type: 'screenshot',
    patterns: [
      /(chụp|screenshot|capture|màn hình|screen|ảnh|snap)/i,
      /(xem|show).*(màn hình|screen|desktop)/i,
    ],
  },
  // Process list
  {
    type: 'process_list',
    patterns: [
      /(tiến trình|process|task|đang chạy|running|app|chương trình)/i,
    ],
  },
  // Download
  {
    type: 'file_download',
    patterns: [
      /(tải|download|load|lấy|grab|tải về).*(https?:\/\/[^\s]+)/i,
      /(https?:\/\/[^\s]+).*(tải|download|về máy)/i,
    ],
    extractParams: (text) => {
      const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
      return { url: urlMatch?.[1] ?? '' };
    },
  },
  // File list
  {
    type: 'file_list',
    patterns: [
      /(file|thư mục|folder|directory|ls|dir|danh sách file)/i,
    ],
    extractParams: (text) => {
      const pathMatch = text.match(/(file|thư mục|folder)\s+(.+)/i);
      return { path: pathMatch?.[2]?.trim() ?? '.' };
    },
  },
  // Notify
  {
    type: 'notify',
    patterns: [
      /(thông báo|notify|nhắc|remind|alert|note|ghi chú)/i,
    ],
    extractParams: (text) => {
      const message = text.replace(/(thông báo|notify|nhắc|remind|alert|note|ghi chú)\s*/i, '').trim();
      return { title: 'RemoteOS', body: message || 'Notification' };
    },
  },
  // System info
  {
    type: 'system_info',
    patterns: [
      /(thông tin|info|system|hệ thống|specs|cấu hình|hardware)/i,
    ],
  },
  // Lock screen
  {
    type: 'lock_screen',
    patterns: [
      /(khóa|màn hình|lock|screen lock)/i,
    ],
  },
  // Kill process
  {
    type: 'process_kill',
    patterns: [
      /(kill|tắt|đóng|close|stop|end|terminate|diệt).*(process|tiến trình|app)/i,
    ],
    extractParams: (text) => {
      const nameMatch = text.match(/(kill|tắt|đóng|close|stop|end|terminate|diệt)\s+(.+)/i);
      return { name: nameMatch?.[2]?.trim() };
    },
  },
  // Volume
  {
    type: 'set_volume',
    patterns: [
      /(âm lượng|volume|loa|sound|tiếng).*(\d+|tăng|giảm|mute|tắt)/i,
    ],
    extractParams: (text) => {
      const numMatch = text.match(/(\d+)/);
      if (numMatch) return { level: parseInt(numMatch[1], 10) };
      if (/tăng|up|louder/i.test(text)) return { action: 'up' };
      if (/giảm|down|quieter/i.test(text)) return { action: 'down' };
      if (/mute|tắt tiếng/i.test(text)) return { action: 'mute' };
      return { level: 50 };
    },
  },
  // Clipboard
  {
    type: 'get_clipboard',
    patterns: [
      /(clipboard|bảng tạm|copy|paste|sao chép)/i,
    ],
  },
  // App Launch
  {
    type: 'app_launch',
    patterns: [
      /(mở|open|launch|chạy|start|run|khởi động)\s+(.+)/i,
    ],
    extractParams: (text) => {
      const match = text.match(/(mở|open|launch|chạy|start|run|khởi động)\s+(.+)/i);
      return { name: match?.[2]?.trim() ?? text };
    },
  },
  // App Close
  {
    type: 'app_close',
    patterns: [
      /(đóng|close|tắt|kill|stop|thoát|exit)\s+(.+)/i,
    ],
    extractParams: (text) => {
      const match = text.match(/(đóng|close|tắt|kill|stop|thoát|exit)\s+(.+)/i);
      return { name: match?.[2]?.trim() ?? text };
    },
  },
];

// ─── Intent Matching ──────────────────────────────────────────────

function matchIntent(text: string): { type: string; params?: Record<string, unknown> } | null {
  const lower = text.toLowerCase().trim();

  for (const pattern of INTENT_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(lower)) {
        const params = pattern.extractParams?.(text) ?? {};
        return { type: pattern.type, params };
      }
    }
  }

  // Bare URL → download
  const urlMatch = text.match(/^(https?:\/\/[^\s]+)$/i);
  if (urlMatch) {
    return { type: 'file_download', params: { url: urlMatch[1] } };
  }

  // Time/date questions → status (includes uptime)
  if (/(mấy giờ|what time|thời gian|ngày mấy|date|time|clock)/i.test(lower)) {
    return { type: 'status' };
  }

  // Greetings / general questions → status
  if (/(xin chào|hello|hi|hey|chào|yo|hế lô)/i.test(lower)) {
    return { type: 'status' };
  }

  return null;
}

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

// ─── Voice Message Handler ─────────────────────────────────────

async function handleVoiceMessage(ctx: any): Promise<void> {
  const voice = ctx.message.voice;
  if (!voice) return;

  logger.info({ userId: ctx.from?.id, duration: voice.duration }, 'Received voice message');

  // Send "processing" indicator
  await ctx.reply('🎤 Đang nghe...');

  try {
    // Get file from Telegram
    const file = await ctx.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;

    // Download audio file
    const axios = (await import('axios')).default;
    const audioResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const audioBuffer = Buffer.from(audioResponse.data);

    // Use Gemini API for speech-to-text (multimodal)
    const base64Audio = audioBuffer.toString('base64');

    // For now, use a simple approach - ask user to type
    // In production, integrate with Whisper API or Google Speech-to-Text
    await ctx.reply(
      '🎤 *Tính năng Voice Input*\n\n' +
      'Tôi đã nhận được tin nhắn voice của bạn!\n\n' +
      'Để sử dụng voice input, bạn có thể:\n' +
      '1. Gõ lệnh trực tiếp (nhanh hơn)\n' +
      '2. Sử dụng Telegram voice-to-text (nhấn giữ mic)\n\n' +
      '💡 *Tip:* Nhấn giữ nút mic trên Telegram, nói lệnh, và thả ra để gửi tự động.',
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    logger.error({ err }, 'Failed to process voice message');
    await ctx.reply('❌ Không thể xử lý tin nhắn voice. Thử gõ lệnh trực tiếp.');
  }
}

// ─── Photo Message Handler ─────────────────────────────────────

async function handlePhotoMessage(ctx: any): Promise<void> {
  const photos = ctx.message.photo;
  if (!photos || photos.length === 0) return;

  logger.info({ userId: ctx.from?.id }, 'Received photo message');

  await ctx.reply('📸 Đang phân tích ảnh...');

  try {
    // Get the largest photo
    const photo = photos[photos.length - 1];
    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;

    // Download photo
    const axios = (await import('axios')).default;
    const photoResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const photoBuffer = Buffer.from(photoResponse.data);
    const base64Photo = photoBuffer.toString('base64');

    // Use Gemini Vision API to analyze the image
    const caption = ctx.message.caption ?? 'Phân tích ảnh này và mô tả chi tiết những gì bạn thấy.';

    const geminiApiKey = process.env.GEMINI_API_KEY ?? '';
    const geminiModel = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

    const response = await axios.post(geminiUrl, {
      contents: [{
        parts: [
          { text: caption },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Photo,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }, { timeout: 30000 });

    const aiText = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (aiText) {
      // Split long responses
      const chunks = aiText.match(/.{1,4000}/gs) ?? [aiText];
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunk));
      }
    } else {
      await ctx.reply('🤔 Không thể phân tích ảnh.');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to process photo');
    await ctx.reply('❌ Không thể phân tích ảnh. Thử lại sau.');
  }
}

// ─── Main Message Handler ─────────────────────────────────────────

export function registerMessages(bot: Bot<BotContext>): void {
  // Handle voice messages
  bot.on('message:voice', handleVoiceMessage);

  // Handle photo messages
  bot.on('message:photo', handlePhotoMessage);

  // Handle text messages
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;

    // Skip commands
    if (text.startsWith('/')) return;

    // Skip if in special state
    if (ctx.session.state !== 'idle') return;

    logger.info({ userId: ctx.from?.id, text }, 'Received natural language message');

    // Auto-select device if not selected
    if (!ctx.session.selectedDeviceId) {
      try {
        const devices = await serverClient.listDevices();
        const onlineDevice = devices.find((d) => d.status === 'online');
        if (onlineDevice) {
          ctx.session.selectedDeviceId = onlineDevice.id;
          await ctx.reply(`📱 Đã tự chọn: *${onlineDevice.name}*`);
        } else {
          await ctx.reply(
            '⚠️ *Không có thiết bị nào đang online.*\n\n' +
            'Gõ `/devices` để xem danh sách.\n' +
            'Gõ `/register` để kết nối.',
          );
          return;
        }
      } catch {
        await ctx.reply('⚠️ Không thể kết nối server. Thử lại sau.');
        return;
      }
    }

    // Try local matching first, then AI fallback
    const intent = matchIntent(text);

    if (intent) {
      // Local match — execute directly
      await ctx.reply(`⚡ Đang thực hiện: *${intent.type}*...`);

      try {
        const result = await serverClient.sendCommand(
          ctx.session.selectedDeviceId!,
          intent.type,
          intent.params,
        );

        // Handle screenshot specially — send as photo
        if (intent.type === 'screenshot') {
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

        // Format response based on type
        const response = formatCommandResponse(intent.type, result);
        await ctx.reply(response, { parse_mode: 'Markdown' });
      } catch (err) {
        logger.error({ err, intent }, 'Failed to execute intent');
        await ctx.reply('❌ Lỗi: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
      return;
    }

    // No local match — use server AI (Gemini)
    await ctx.reply('🤖 Đang suy nghĩ...');

    try {
      const aiResult = await serverClient.interpretAndExecute(text, ctx.session.selectedDeviceId!);

      if (aiResult.success && aiResult.intent) {
        const source = aiResult.intent.source === 'ai' ? '🤖 AI' : '⚡';

        // Handle screenshot
        if (aiResult.intent.type === 'screenshot' && aiResult.result) {
          const output = aiResult.result as { imageData?: string };
          if (output.imageData) {
            const { InputFile } = await import('grammy');
            const imageBuffer = Buffer.from(output.imageData, 'base64');
            await ctx.replyWithPhoto(
              new InputFile(imageBuffer, 'screenshot.png'),
              { caption: `${source} 📸 Screenshot — RemoteOS` },
            );
            return;
          }
        }

        // Handle free_response — send AI's natural language response
        if (aiResult.intent.type === 'free_response') {
          const allChunks = aiResult.allChunks as string[] | undefined;
          if (allChunks && allChunks.length > 1) {
            // Send multiple messages for long responses
            for (const chunk of allChunks) {
              await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunk));
            }
          } else {
            const responseText = aiResult.formattedResponse ?? '🤖 Không có phản hồi.';
            await ctx.reply(responseText, { parse_mode: 'Markdown' }).catch(() => ctx.reply(responseText));
          }
          return;
        }

        // Handle clarification — show question with suggestion buttons
        if (aiResult.needsClarification) {
          const clarificationText = aiResult.formattedResponse ?? 'Bạn có thể nói rõ hơn không?';
          const suggestions = (aiResult.suggestions as string[]) ?? [];

          if (suggestions.length > 0) {
            // Create inline keyboard with suggestions
            const { InlineKeyboard } = await import('grammy');
            const keyboard = new InlineKeyboard();
            for (const suggestion of suggestions.slice(0, 4)) {
              keyboard.text(suggestion, `clarify:${suggestion}`).row();
            }
            keyboard.text('❌ Hủy', 'clarify:cancel');

            await ctx.reply(`🤔 ${clarificationText}`, {
              parse_mode: 'Markdown',
              reply_markup: keyboard,
            });
          } else {
            await ctx.reply(`🤔 ${clarificationText}`, { parse_mode: 'Markdown' });
          }
          return;
        }

        // Use formatted response from server
        if (aiResult.formattedResponse) {
          // For shell commands, show a nice confirmation instead of raw output
          if (aiResult.intent.type === 'shell') {
            const result = aiResult.result as { exitCode?: number; command?: string };
            if (result?.exitCode === 0) {
              await ctx.reply(`${source} ✅ Đã thực hiện thành công!\n\n💻 \`${result.command}\``);
            } else {
              await ctx.reply(`${source} ❌ Lệnh thất bại (exit: ${result?.exitCode})\n\n💻 \`${result?.command}\``);
            }
          } else {
            await ctx.reply(`${source} ${aiResult.formattedResponse}`, { parse_mode: 'Markdown' });
          }
        } else {
          await ctx.reply(`${source} ✅ Hoàn thành: ${aiResult.intent.type}`);
        }
      } else {
        // Show real error from server (quota, network, etc.)
        const errorMsg = aiResult.error ?? 'AI không hiểu yêu cầu.';
        await ctx.reply(`❌ ${errorMsg}`);
      }
    } catch (err) {
      logger.error({ err, text }, 'AI interpret failed');
      await ctx.reply('❌ Lỗi kết nối server. Thử lại sau.');
    }
  });
}

// ─── Response Formatting ──────────────────────────────────────────

function formatCommandResponse(type: string, output: unknown): string {
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

    case 'file_download': {
      return [
        '╔══════════════════════════════╗',
        '║   📥 DOWNLOAD COMPLETE        ║',
        '╚══════════════════════════════╝',
        '',
        `📄 File: ${data.fileName}`,
        `📦 Size: ${formatBytes(data.sizeBytes as number)}`,
        `📁 Path: ${data.filePath}`,
      ].join('\n');
    }

    case 'file_list': {
      const entries = data.entries as Array<{ name: string; type: string; sizeBytes: number }>;
      const lines: string[] = [
        `📁 *Thư mục: ${data.path}*`,
        `📊 ${data.total} items`,
        '',
      ];

      for (const entry of entries.slice(0, 20)) {
        const icon = entry.type === 'directory' ? '📁' : entry.type === 'symlink' ? '🔗' : '📄';
        const size = entry.type === 'directory' ? '' : ` (${formatBytes(entry.sizeBytes)})`;
        lines.push(`${icon} ${entry.name}${size}`);
      }

      return lines.join('\n');
    }

    case 'shell': {
      const exitCode = data.exitCode as number;
      const exitEmoji = exitCode === 0 ? '✅' : '❌';
      return [
        `${exitEmoji} *Shell Command* (exit: ${exitCode})`,
        '',
        '```',
        ((data.stdout || data.stderr || '(no output)') as string).slice(0, 3000),
        '```',
      ].join('\n');
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

    case 'notify':
      return '🔔 Đã gửi thông báo đến desktop!';

    case 'lock_screen':
      return '🔒 Đã khóa màn hình!';

    case 'app_launch': {
      const appName = data.appName as string;
      const success = data.success as boolean;
      const message = data.message as string;
      return success ? `🚀 Đã mở *${appName}*!` : `❌ ${message}`;
    }

    case 'app_close': {
      const appName = data.appName as string;
      const success = data.success as boolean;
      const message = data.message as string;
      return success ? `🛑 Đã đóng *${appName}*!` : `❌ ${message}`;
    }

    case 'app_list': {
      const apps = data.apps as string[];
      const lines = ['📱 *Ứng dụng có sẵn:*', ''];
      for (const app of apps.slice(0, 20)) {
        lines.push(`• ${app}`);
      }
      return lines.join('\n');
    }

    default:
      return `✅ Hoàn thành:\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 3000)}\n\`\`\``;
  }
}

// ─── Smart Suggestions ────────────────────────────────────────────

function getSmartSuggestions(text: string): string[] {
  const lower = text.toLowerCase();
  const suggestions: string[] = ['💡 *Thử một trong các cách sau:*\n'];

  if (/(máy|computer|pc)/i.test(lower)) {
    suggestions.push('• "máy tính thế nào?" → Xem trạng thái');
  }
  if (/(ảnh|image|screen|chụp)/i.test(lower)) {
    suggestions.push('• "chụp màn hình" → Chụp ảnh');
  }
  if (/(tải|download|link|url)/i.test(lower)) {
    suggestions.push('• "tải file này" + URL → Tải file');
  }
  if (/(process|app|chương trình)/i.test(lower)) {
    suggestions.push('• "tiến trình đang chạy" → Xem processes');
  }

  if (suggestions.length === 1) {
    suggestions.push(
      '• "máy tính thế nào?" — Xem trạng thái',
      '• "chụp màn hình" — Chụp ảnh màn hình',
      '• "tải file này" + link — Tải file về máy',
      '• Gõ /help để xem tất cả lệnh',
    );
  }

  return suggestions;
}
