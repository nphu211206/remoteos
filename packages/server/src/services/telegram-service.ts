/**
 * Telegram Service — Premium Chat Experience
 *
 * Features:
 * - Rich message formatting with visual cards
 * - Inline keyboard navigation
 * - Natural language understanding (rule-based + AI)
 * - Multi-device support with device selector
 * - Progress indicators and real-time feedback
 * - Context-aware follow-up handling
 * - Bilingual support (Vietnamese + English)
 */

import type { FastifyRequest } from 'fastify';
import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { formatProgressBar, formatPercent } from '@remoteos/shared/utils';
import { AuthService } from './auth-service.js';
import { DeviceService } from './device-service.js';
import { CommandService } from './command-service.js';
import { AIService } from './ai-service.js';

const authService = new AuthService();
const deviceService = new DeviceService();
const commandService = new CommandService();
const aiService = new AIService();

// ─── Types ────────────────────────────────────────────────────────

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
  date: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: { chat: { id: number }; message_id: number };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// ─── Inline Keyboard Builders ─────────────────────────────────────

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
        { text: '🔒 Lock Screen', callback_data: 'cmd:lock_screen' },
        { text: '🔔 Notify', callback_data: 'action:notify' },
      ],
      [
        { text: '📱 Devices', callback_data: 'action:devices' },
        { text: '❓ Help', callback_data: 'action:help' },
      ],
    ],
  };
}

function deviceSelectorKeyboard(devices: Array<{ id: string; name: string; status: string }>) {
  return {
    inline_keyboard: devices.map((d) => [{
      text: `${d.status === 'online' ? '🟢' : '🔴'} ${d.name}`,
      callback_data: `select:${d.id}`,
    }]),
  };
}

function confirmKeyboard(commandId: string) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Xác nhận', callback_data: `confirm:${commandId}` },
        { text: '❌ Hủy', callback_data: `cancel:${commandId}` },
      ],
    ],
  };
}

// ─── Telegram Service ─────────────────────────────────────────────

export class TelegramService {
  private botToken: string;

  constructor() {
    this.botToken = config.telegram.botToken;
  }

  /**
   * Process an incoming Telegram update
   */
  async processUpdate(update: TelegramUpdate): Promise<void> {
    try {
      if (update.message?.text) {
        await this.handleMessage(update.message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
      }
    } catch (err) {
      logger.error({ err, updateId: update.update_id }, 'Failed to process update');
    }
  }

  // ─── Message Handling ──────────────────────────────────────────

  private async handleMessage(message: TelegramMessage): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from.id;
    const text = message.text ?? '';

    logger.info({ userId, chatId, text }, 'Received message');

    // Find or create user
    const user = await authService.findOrCreateUser(userId, {
      username: message.from.username,
      firstName: message.from.first_name,
      language: message.from.language_code,
    });

    // Handle commands
    if (text.startsWith('/')) {
      await this.handleCommand(chatId, user.id, text);
      return;
    }

    // Handle natural language
    await this.handleNaturalLanguage(chatId, user.id, text);
  }

  // ─── Command Handlers ──────────────────────────────────────────

  private async handleCommand(chatId: number, userId: string, text: string): Promise<void> {
    const [command, ...args] = text.split(' ');
    const cmd = command?.toLowerCase();

    switch (cmd) {
      case '/start':
        await this.handleStart(chatId, message_from_firstName(args));
        break;
      case '/help':
        await this.handleHelp(chatId);
        break;
      case '/menu':
        await this.handleMenu(chatId);
        break;
      case '/devices':
        await this.handleDevices(chatId, userId);
        break;
      case '/register':
        await this.handleRegister(chatId, userId, args[0]);
        break;
      case '/status':
        await this.handleStatus(chatId, userId);
        break;
      case '/screenshot':
        await this.handleScreenshot(chatId, userId);
        break;
      case '/processes':
        await this.handleProcesses(chatId, userId);
        break;
      case '/download':
        await this.handleDownload(chatId, userId, args.join(' '));
        break;
      case '/files':
        await this.handleFiles(chatId, userId, args.join(' '));
        break;
      case '/notify':
        await this.handleNotify(chatId, userId, args.join(' '));
        break;
      case '/dashboard':
        await this.handleDashboard(chatId, userId);
        break;
      default:
        await this.sendMessage(chatId,
          '❓ Lệnh không xác định.\n\nGõ /help để xem danh sách lệnh.',
          { replyMarkup: mainMenuKeyboard() },
        );
    }
  }

  private async handleStart(chatId: number, firstName?: string): Promise<void> {
    const name = firstName ?? 'bạn';
    await this.sendMessage(chatId, [
      `👋 *Xin chào ${name}! Chào mừng đến với RemoteOS!*`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '_Your computer, anywhere._',
      '_Just talk to it._ 🚀',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '🖥️ RemoteOS cho phép bạn kiểm soát máy tính từ xa chỉ bằng tin nhắn.',
      '',
      '*Bắt đầu trong 3 bước:*',
      '1️⃣ Cài RemoteOS Agent trên máy tính',
      '2️⃣ Nhập mã kết nối: `/register`',
      '3️⃣ Bắt đầu ra lệnh!',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '💡 *Mẹo:* Bạn có thể gõ câu tự nhiên thay vì lệnh!',
      '_Ví dụ: "máy tính thế nào?" hoặc "chụp màn hình"_',
    ].join('\n'), { replyMarkup: mainMenuKeyboard() });
  }

  private async handleHelp(chatId: number): Promise<void> {
    await this.sendMessage(chatId, [
      '╔══════════════════════════════╗',
      '║   📖 DANH SÁCH LỆNH          ║',
      '╚══════════════════════════════╝',
      '',
      '*🖥️ Giám sát:*',
      '  `/status` — Trạng thái máy tính',
      '  `/screenshot` — Chụp màn hình',
      '  `/processes` — Danh sách tiến trình',
      '',
      '*📁 File:*',
      '  `/download <url>` — Tải file về máy',
      '  `/files [path]` — Xem thư mục',
      '',
      '*⚡ Hệ thống:*',
      '  `/notify <message>` — Ghi chú trên desktop',
      '',
      '*🔧 Quản lý:*',
      '  `/devices` — Danh sách thiết bị',
      '  `/register` — Đăng ký thiết bị mới',
      '  `/menu` — Menu chính',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '💡 *Gõ câu tự nhiên cũng được!*',
      '• "máy tính thế nào?" → Xem trạng thái',
      '• "chụp màn hình" → Chụp ảnh',
      '• "tải file này" + link → Tải file',
      '• "tiến trình đang chạy" → Xem processes',
    ].join('\n'));
  }

  private async handleMenu(chatId: number): Promise<void> {
    await this.sendMessage(chatId, [
      '🎮 *RemoteOS — Menu chính*',
      '',
      'Chọn lệnh muốn thực hiện:',
    ].join('\n'), { replyMarkup: mainMenuKeyboard() });
  }

  private async handleDevices(chatId: number, userId: string): Promise<void> {
    try {
      const devices = await deviceService.listByUser(userId);

      if (devices.length === 0) {
        await this.sendMessage(chatId, [
          '📭 *Chưa có thiết bị nào.*',
          '',
          'Để kết nối thiết bị:',
          '1️⃣ Cài RemoteOS Agent trên máy tính',
          '2️⃣ Gõ `/register` để lấy mã kết nối',
          '3️⃣ Nhập mã vào Agent',
        ].join('\n'));
        return;
      }

      const lines = devices.map((d, i) => {
        const emoji = d.status === 'online' ? '🟢' : '🔴';
        const cpu = d.cpuUsage !== null ? `CPU: ${d.cpuUsage}%` : '';
        const ram = d.ramUsage !== null ? `RAM: ${d.ramUsage}%` : '';
        const stats = [cpu, ram].filter(Boolean).join(' | ');
        return `${i + 1}. ${emoji} *${d.name}* (${d.os})\n   ${stats}`;
      });

      await this.sendMessage(chatId, [
        '╔══════════════════════════════╗',
        '║   📱 THIẾT BỊ                ║',
        '╚══════════════════════════════╝',
        '',
        ...lines,
      ].join('\n'), {
        replyMarkup: deviceSelectorKeyboard(devices),
      });
    } catch (err) {
      logger.error({ err }, 'Failed to list devices');
      await this.sendMessage(chatId, '❌ Không thể lấy danh sách thiết bị.');
    }
  }

  private async handleRegister(chatId: number, userId: string, code?: string): Promise<void> {
    if (code) {
      // Validate code
      const result = await authService.validateRegistrationToken(code);
      if (result.valid) {
        await this.sendMessage(chatId, '✅ Mã hợp lệ! Agent đang kết nối...');
      } else {
        await this.sendMessage(chatId, `❌ Mã không hợp lệ: ${result.error}`);
      }
      return;
    }

    // Generate new registration token
    const token = await authService.generateRegistrationToken(userId);
    await this.sendMessage(chatId, [
      '╔══════════════════════════════╗',
      '║   🔑 MÃ ĐĂNG KÝ              ║',
      '╚══════════════════════════════╝',
      '',
      `Mã: \`${token}\``,
      '',
      '⏰ Có hiệu lực trong 5 phút',
      '',
      '*Hướng dẫn:*',
      '1. Mở RemoteOS Agent trên máy tính',
      '2. Nhập mã này khi được yêu cầu',
      '3. Agent sẽ tự động kết nối',
    ].join('\n'));
  }

  private async handleStatus(chatId: number, userId: string): Promise<void> {
    const device = await this.getOnlineDevice(chatId, userId);
    if (!device) return;

    await this.sendMessage(chatId, '⏳ Đang lấy trạng thái...');

    try {
      const result = await commandService.create(userId, {
        deviceId: device.id,
        type: 'status',
      });

      if (!result.success) {
        await this.sendMessage(chatId, `❌ Lỗi: ${result.error}`);
        return;
      }

      const cmdResult = await commandService.waitForResult(result.command!.id, 30_000);

      if (!cmdResult) {
        await this.sendMessage(chatId, '⏰ Lệnh hết thời gian chờ.');
        return;
      }

      if (cmdResult.status === 'failed') {
        await this.sendMessage(chatId, `❌ Lỗi: ${cmdResult.error?.message}`);
        return;
      }

      const response = aiService.formatResponse('status', cmdResult.output);
      await this.sendMessage(chatId, response, { replyMarkup: mainMenuKeyboard() });
    } catch (err) {
      logger.error({ err }, 'Status command failed');
      await this.sendMessage(chatId, '❌ Không thể lấy trạng thái.');
    }
  }

  private async handleScreenshot(chatId: number, userId: string): Promise<void> {
    const device = await this.getOnlineDevice(chatId, userId);
    if (!device) return;

    await this.sendMessage(chatId, '📸 Đang chụp màn hình...');

    try {
      const result = await commandService.create(userId, {
        deviceId: device.id,
        type: 'screenshot',
      });

      if (!result.success) {
        await this.sendMessage(chatId, `❌ Lỗi: ${result.error}`);
        return;
      }

      const cmdResult = await commandService.waitForResult(result.command!.id, 30_000);

      if (!cmdResult || cmdResult.status === 'failed') {
        await this.sendMessage(chatId, `❌ ${cmdResult?.error?.message ?? 'Timeout'}`);
        return;
      }

      const output = cmdResult.output as { imageData?: string; format?: string };
      if (output.imageData) {
        await this.sendPhoto(chatId, Buffer.from(output.imageData, 'base64'), '📸 Screenshot');
      } else {
        await this.sendMessage(chatId, '📸 Đã chụp màn hình!');
      }
    } catch (err) {
      logger.error({ err }, 'Screenshot failed');
      await this.sendMessage(chatId, '❌ Không thể chụp màn hình.');
    }
  }

  private async handleProcesses(chatId: number, userId: string): Promise<void> {
    const device = await this.getOnlineDevice(chatId, userId);
    if (!device) return;

    await this.sendMessage(chatId, '⏳ Đang lấy danh sách tiến trình...');

    try {
      const result = await commandService.create(userId, {
        deviceId: device.id,
        type: 'process_list',
      });

      if (!result.success) {
        await this.sendMessage(chatId, `❌ Lỗi: ${result.error}`);
        return;
      }

      const cmdResult = await commandService.waitForResult(result.command!.id, 30_000);

      if (!cmdResult || cmdResult.status === 'failed') {
        await this.sendMessage(chatId, `❌ ${cmdResult?.error?.message ?? 'Timeout'}`);
        return;
      }

      const response = aiService.formatResponse('process_list', cmdResult.output);
      await this.sendMessage(chatId, response);
    } catch (err) {
      logger.error({ err }, 'Process list failed');
      await this.sendMessage(chatId, '❌ Không thể lấy danh sách tiến trình.');
    }
  }

  private async handleDownload(chatId: number, userId: string, url: string): Promise<void> {
    if (!url) {
      await this.sendMessage(chatId, '❓ Sử dụng: `/download <url>`');
      return;
    }

    const device = await this.getOnlineDevice(chatId, userId);
    if (!device) return;

    await this.sendMessage(chatId, `📥 Đang tải: ${url}...`);

    try {
      const result = await commandService.create(userId, {
        deviceId: device.id,
        type: 'file_download',
        params: { url },
      });

      if (!result.success) {
        await this.sendMessage(chatId, `❌ Lỗi: ${result.error}`);
        return;
      }

      const cmdResult = await commandService.waitForResult(result.command!.id, 300_000);

      if (!cmdResult || cmdResult.status === 'failed') {
        await this.sendMessage(chatId, `❌ ${cmdResult?.error?.message ?? 'Timeout'}`);
        return;
      }

      const response = aiService.formatResponse('file_download', cmdResult.output);
      await this.sendMessage(chatId, response);
    } catch (err) {
      logger.error({ err }, 'Download failed');
      await this.sendMessage(chatId, '❌ Không thể tải file.');
    }
  }

  private async handleFiles(chatId: number, userId: string, path: string): Promise<void> {
    const device = await this.getOnlineDevice(chatId, userId);
    if (!device) return;

    try {
      const result = await commandService.create(userId, {
        deviceId: device.id,
        type: 'file_list',
        params: { path: path || '.' },
      });

      if (!result.success) {
        await this.sendMessage(chatId, `❌ Lỗi: ${result.error}`);
        return;
      }

      const cmdResult = await commandService.waitForResult(result.command!.id, 30_000);

      if (!cmdResult || cmdResult.status === 'failed') {
        await this.sendMessage(chatId, `❌ ${cmdResult?.error?.message ?? 'Timeout'}`);
        return;
      }

      const response = aiService.formatResponse('file_list', cmdResult.output);
      await this.sendMessage(chatId, response);
    } catch (err) {
      logger.error({ err }, 'File list failed');
      await this.sendMessage(chatId, '❌ Không thể lấy danh sách file.');
    }
  }

  private async handleNotify(chatId: number, userId: string, message: string): Promise<void> {
    if (!message) {
      await this.sendMessage(chatId, '❓ Sử dụng: `/notify <message>`');
      return;
    }

    const device = await this.getOnlineDevice(chatId, userId);
    if (!device) return;

    try {
      const result = await commandService.create(userId, {
        deviceId: device.id,
        type: 'notify',
        params: { title: 'RemoteOS', body: message },
      });

      if (!result.success) {
        await this.sendMessage(chatId, `❌ Lỗi: ${result.error}`);
        return;
      }

      const cmdResult = await commandService.waitForResult(result.command!.id, 15_000);

      if (cmdResult?.status === 'completed') {
        await this.sendMessage(chatId, '🔔 Đã gửi thông báo đến desktop!');
      } else {
        await this.sendMessage(chatId, `❌ ${cmdResult?.error?.message ?? 'Timeout'}`);
      }
    } catch (err) {
      logger.error({ err }, 'Notify failed');
      await this.sendMessage(chatId, '❌ Không thể gửi thông báo.');
    }
  }

  /**
   * /dashboard — Comprehensive system overview
   */
  private async handleDashboard(chatId: number, userId: string): Promise<void> {
    const devices = await deviceService.listByUser(userId);

    if (devices.length === 0) {
      await this.sendMessage(chatId, '📭 Chưa có thiết bị. Gõ `/register` để kết nối.');
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

    // Quick actions
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('💡 *Lệnh nhanh:*');
    lines.push('• `/status` — Chi tiết hệ thống');
    lines.push('• `/screenshot` — Chụp màn hình');
    lines.push('• `/processes` — Tiến trình');

    await this.sendMessage(chatId, lines.join('\n'), { replyMarkup: mainMenuKeyboard() });
  }

  // ─── Natural Language Processing ────────────────────────────────

  private async handleNaturalLanguage(chatId: number, userId: string, text: string): Promise<void> {
    // Get user's devices
    const devices = await deviceService.listByUser(userId);
    const onlineDevice = devices.find((d) => d.status === 'online');

    if (!onlineDevice) {
      await this.sendMessage(chatId, [
        '⚠️ *Không có thiết bị nào đang online.*',
        '',
        'Gõ `/devices` để xem danh sách.',
        'Gõ `/register` để kết nối thiết bị mới.',
      ].join('\n'));
      return;
    }

    // Try compound intents first
    const compound = aiService.detectCompoundIntents(text);

    if (compound.isCompound && compound.intents.length > 1) {
      // Execute multiple commands sequentially
      await this.sendMessage(chatId, `⏳ Đang thực hiện ${compound.intents.length} lệnh...`);

      const responses: string[] = [];
      for (const intent of compound.intents) {
        try {
          const result = await commandService.create(userId, {
            deviceId: onlineDevice.id,
            type: intent.type,
            params: intent.params,
          });

          if (result.success) {
            const cmdResult = await commandService.waitForResult(result.command!.id, 30_000);
            if (cmdResult?.status === 'completed') {
              responses.push(aiService.formatResponse(intent.type, cmdResult.output));
            } else {
              responses.push(`❌ ${intent.type}: ${cmdResult?.error?.message ?? 'Timeout'}`);
            }
          }
        } catch (err) {
          responses.push(`❌ ${intent.type}: Error`);
        }
      }

      await this.sendMessage(chatId, responses.join('\n\n━━━━━━━━━━━━━━━━━━\n\n'));
      return;
    }

    // Single intent — try rule-based first, then AI fallback
    const intent = aiService.matchIntent(text);

    if (intent && intent.confidence >= 0.8) {
      await this.executeIntent(chatId, userId, onlineDevice.id, intent);
      return;
    }

    // Low confidence or no match — try AI
    await this.sendMessage(chatId, '🤖 Đang suy nghĩ...');

    const aiIntent = await aiService.interpretWithUserAI(text, userId);

    if (aiIntent && aiIntent.confidence >= 0.5) {
      // Handle free_response — send AI's natural language response directly
      if (aiIntent.type === 'free_response' && aiIntent.response) {
        const chunks = aiService.getFreeResponseChunks(aiIntent.response);
        for (const chunk of chunks) {
          await this.sendMessage(chatId, chunk);
        }
        return;
      }

      await this.executeIntent(chatId, userId, onlineDevice.id, aiIntent);
      return;
    }

    // Nothing works — generate friendly response
    const friendlyResponse = await aiService.generateFriendlyResponse(text);

    if (friendlyResponse) {
      await this.sendMessage(chatId, friendlyResponse);
    } else {
      const suggestions = aiService.getSuggestions(text);
      await this.sendMessage(chatId, [
        '🤔 Tôi chưa hiểu ý bạn.',
        '',
        ...suggestions,
      ].join('\n'), { replyMarkup: mainMenuKeyboard() });
    }
  }

  /**
   * Execute a matched intent
   */
  private async executeIntent(chatId: number, userId: string, deviceId: string, intent: { type: string; params?: Record<string, unknown>; source: string }): Promise<void> {
    const sourceEmoji = intent.source === 'ai' ? '🤖' : '⚡';
    await this.sendMessage(chatId, `${sourceEmoji} Đang thực hiện: ${intent.type}...`);

    try {
      const result = await commandService.create(userId, {
        deviceId,
        type: intent.type,
        params: intent.params,
      });

      if (!result.success) {
        await this.sendMessage(chatId, `❌ Lỗi: ${result.error}`);
        return;
      }

      const cmdResult = await commandService.waitForResult(result.command!.id, 30_000);

      if (!cmdResult) {
        await this.sendMessage(chatId, '⏰ Lệnh hết thời gian chờ.');
        return;
      }

      if (cmdResult.status === 'failed') {
        await this.sendMessage(chatId, `❌ Lỗi: ${cmdResult.error?.message}`);
        return;
      }

      // Handle screenshot specially (send as photo)
      if (intent.type === 'screenshot') {
        const output = cmdResult.output as { imageData?: string };
        if (output.imageData) {
          await this.sendPhoto(chatId, Buffer.from(output.imageData, 'base64'), '📸 Screenshot');
          return;
        }
      }

      const response = aiService.formatResponse(intent.type, cmdResult.output);
      await this.sendMessage(chatId, response);
    } catch (err) {
      logger.error({ err, type: intent.type }, 'Command execution failed');
      await this.sendMessage(chatId, '❌ Đã xảy ra lỗi khi thực hiện lệnh.');
    }
  }

  // ─── Callback Query Handling ────────────────────────────────────

  private async handleCallbackQuery(callbackQuery: TelegramCallbackQuery): Promise<void> {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message?.chat.id;

    if (!chatId || !data) return;

    logger.info({ userId: callbackQuery.from.id, data }, 'Callback query');

    try {
      // Device selection
      if (data.startsWith('select:')) {
        const deviceId = data.replace('select:', '');
        await this.answerCallbackQuery(callbackQuery.id, '✅ Đã chọn thiết bị');
        await this.sendMessage(chatId, `📱 Đã chọn thiết bị: \`${deviceId}\``);
        return;
      }

      // Command execution from inline keyboard
      if (data.startsWith('cmd:')) {
        const commandType = data.replace('cmd:', '');
        await this.answerCallbackQuery(callbackQuery.id, '⏳ Đang thực thi...');

        const userId = (await authService.findOrCreateUser(callbackQuery.from.id, {
          username: callbackQuery.from.username,
          firstName: callbackQuery.from.first_name,
        })).id;

        const devices = await deviceService.listByUser(userId);
        const onlineDevice = devices.find((d) => d.status === 'online');

        if (!onlineDevice) {
          await this.sendMessage(chatId, '⚠️ Không có thiết bị online.');
          return;
        }

        await this.executeIntent(chatId, userId, onlineDevice.id, {
          type: commandType,
          source: 'rule',
        });
        return;
      }

      // Action handlers
      if (data.startsWith('action:')) {
        const action = data.replace('action:', '');
        await this.answerCallbackQuery(callbackQuery.id);

        switch (action) {
          case 'devices':
            await this.handleDevices(chatId, (await authService.findOrCreateUser(callbackQuery.from.id, { firstName: callbackQuery.from.first_name })).id);
            break;
          case 'help':
            await this.handleHelp(chatId);
            break;
          case 'notify':
            await this.sendMessage(chatId, '💡 Gõ `/notify <message>` để gửi thông báo.');
            break;
        }
        return;
      }

      // Confirmation
      if (data.startsWith('confirm:')) {
        const commandId = data.replace('confirm:', '');
        await this.answerCallbackQuery(callbackQuery.id, '✅ Đã xác nhận');
        await this.sendMessage(chatId, `✅ Lệnh \`${commandId}\` đã được xác nhận.`);
        return;
      }

      if (data.startsWith('cancel:')) {
        const commandId = data.replace('cancel:', '');
        await this.answerCallbackQuery(callbackQuery.id, '❌ Đã hủy');
        await this.sendMessage(chatId, `❌ Lệnh \`${commandId}\` đã bị hủy.`);
        return;
      }

      await this.answerCallbackQuery(callbackQuery.id, '❓ Unknown action');
    } catch (err) {
      logger.error({ err, data }, 'Callback handler error');
      await this.answerCallbackQuery(callbackQuery.id, '❌ Lỗi xảy ra');
    }
  }

  // ─── Helper Methods ─────────────────────────────────────────────

  private async getOnlineDevice(chatId: number, userId: string) {
    const devices = await deviceService.listByUser(userId);
    const onlineDevice = devices.find((d) => d.status === 'online');

    if (!onlineDevice) {
      await this.sendMessage(chatId, [
        '⚠️ *Không có thiết bị nào đang online.*',
        '',
        'Gõ `/devices` để xem danh sách.',
        'Gõ `/register` để kết nối thiết bị mới.',
      ].join('\n'));
      return null;
    }

    return onlineDevice;
  }

  // ─── Telegram API Methods ──────────────────────────────────────

  async sendMessage(chatId: number, text: string, options?: {
    parseMode?: 'Markdown' | 'HTML';
    replyMarkup?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.botToken) {
      logger.warn({ chatId }, 'No bot token configured, skipping message');
      return;
    }

    // Split long messages (Telegram limit: 4096 chars)
    const chunks = this.splitMessage(text, 4000);

    for (const chunk of chunks) {
      try {
        await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
          chat_id: chatId,
          text: chunk,
          parse_mode: options?.parseMode ?? 'Markdown',
          reply_markup: options?.replyMarkup,
        });
      } catch (err) {
        // If Markdown fails, try without parse_mode
        if (axios.isAxiosError(err) && err.response?.data?.description?.includes('parse')) {
          try {
            await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
              chat_id: chatId,
              text: chunk,
              reply_markup: options?.replyMarkup,
            });
          } catch (retryErr) {
            logger.error({ err: retryErr, chatId }, 'Failed to send message (retry)');
          }
        } else {
          logger.error({ err, chatId }, 'Failed to send Telegram message');
        }
      }
    }
  }

  async sendPhoto(chatId: number, photo: Buffer, caption?: string): Promise<void> {
    if (!this.botToken) return;

    try {
      const formData = new FormData();
      formData.append('chat_id', String(chatId));
      formData.append('photo', new Blob([photo], { type: 'image/png' }), 'screenshot.png');
      if (caption) formData.append('caption', caption);

      await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendPhoto`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
    } catch (err) {
      logger.error({ err, chatId }, 'Failed to send photo');
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    if (!this.botToken) return;

    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to answer callback query');
    }
  }

  /**
   * Split a long message into chunks at line boundaries
   */
  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      // Find last newline before maxLength
      let splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt === -1 || splitAt < maxLength / 2) {
        splitAt = maxLength;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    if (remaining) chunks.push(remaining);
    return chunks;
  }
}

// ─── Utility ──────────────────────────────────────────────────────

function message_from_firstName(args: string[]): string | undefined {
  return undefined; // firstName comes from the message object, not args
}
