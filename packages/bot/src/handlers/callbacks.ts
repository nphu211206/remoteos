/**
 * Callback Query Handlers — Inline Keyboard Actions
 *
 * Handles all inline button presses with rich feedback.
 */

import type { Bot } from 'grammy';
import type { BotContext } from '../bot.js';
import { formatBytes, formatProgressBar } from '@remoteos/shared/utils';
import { mainMenuKeyboard } from '../utils/keyboards.js';
import { formatCommandResponse } from '../utils/formatters.js';
import { ServerClient } from '../client/server-client.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

const serverClient = new ServerClient(config.server.url);

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
