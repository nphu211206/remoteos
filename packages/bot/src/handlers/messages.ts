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
import type { DeviceSummary } from '@remoteos/shared';
import { formatBytes, formatProgressBar } from '@remoteos/shared/utils';
import { formatCommandResponse } from '../utils/formatters.js';
import { ServerClient } from '../client/server-client.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

/**
 * Stream AI response via SSE for real-time conversation
 */
async function streamAIResponse(
  text: string,
  onUpdate: (chunk: string) => Promise<void>,
): Promise<string> {
  try {
    const axios = (await import('axios')).default;
    const response = await axios.post(
      `${config.server.url}/api/v1/stream`,
      { text },
      { responseType: 'stream', timeout: 60000 }
    );

    let fullText = '';
    let lastUpdate = 0;

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.startsWith('data: ')) {
          try {
            const data = JSON.parse(text.slice(6));
            if (data.text) {
              fullText += data.text;
              // Update UI every 500ms to avoid rate limits
              if (Date.now() - lastUpdate > 500) {
                onUpdate(fullText);
                lastUpdate = Date.now();
              }
            }
            if (data.done) {
              resolve(fullText);
            }
          } catch {}
        }
      });

      response.data.on('end', () => resolve(fullText));
      response.data.on('error', (err: Error) => reject(err));
    });
  } catch (err) {
    logger.error({ err }, 'Streaming failed');
    throw err;
  }
}

const serverClient = new ServerClient(config.server.url);

// In-memory store for last command results per user (for context)
const lastCommandResults = new Map<string, { type: string; result: unknown; timestamp: number }>();

// ─── Voice Message Handler ─────────────────────────────────────

async function handleVoiceMessage(ctx: BotContext): Promise<void> {
  const voice = ctx.message?.voice;
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
    const base64Audio = audioBuffer.toString('base64');

    // Send to server for voice transcription
    const transcribeResponse = await axios.post(`${config.server.url}/api/v1/voice/transcribe`, {
      audioBase64: base64Audio,
      language: 'vi',
    }, { timeout: 30000 });

    const text = transcribeResponse.data?.text;

    if (!text) {
      await ctx.reply('❌ Không thể nhận diện giọng nói. Vui lòng thử lại.');
      return;
    }

    // Show transcribed text
    await ctx.reply(`🎤 Đã nhận diện: "${text}"\n\n⏳ Đang xử lý...`);

    // Process as text command using the main handler logic
    // Auto-select device if not selected
    if (!ctx.session.selectedDeviceId) {
      try {
        const devices = await serverClient.listDevices();
        const onlineDevice = devices.find((d: DeviceSummary) => d.status === 'online');
        if (onlineDevice) {
          ctx.session.selectedDeviceId = onlineDevice.id;
        } else {
          await ctx.reply('⚠️ Không có thiết bị online.');
          return;
        }
      } catch {
        await ctx.reply('⚠️ Không thể kết nối server.');
        return;
      }
    }

    // Send to AI directly — no local pattern matching
    const aiResult = await serverClient.interpretAndExecute(text, ctx.session.selectedDeviceId!);

    if (aiResult.success && aiResult.intent) {
      const source = aiResult.intent.source === 'ai' ? '🤖 AI' : '⚡';

      if (aiResult.formattedResponse) {
        await ctx.reply(`${source} ${aiResult.formattedResponse}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(`${source} ${aiResult.formattedResponse}`));
      } else {
        await ctx.reply(`${source} ✅ Hoàn thành: ${aiResult.intent.type}`);
      }
    } else {
      await ctx.reply(`❌ ${aiResult.error ?? 'AI không hiểu yêu cầu.'}`);
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to process voice message');

    // If voice service not configured, give helpful message
    if (message.includes('OPENAI_API_KEY') || message.includes('not configured')) {
      await ctx.reply(
        '🎤 *Tính năng Voice Input*\n\n' +
        'Server chưa cấu hình OpenAI API key.\n\n' +
        'Bạn có thể:\n' +
        '1. Gõ lệnh trực tiếp\n' +
        '2. Sử dụng Telegram voice-to-text (nhấn giữ mic)\n\n' +
        '💡 *Tip:* Nhấn giữ nút mic trên Telegram, nói lệnh, và thả ra.',
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply('❌ Không thể xử lý tin nhắn voice. Thử gõ lệnh trực tiếp.');
    }
  }
}

// ─── Photo Message Handler ─────────────────────────────────────

async function handlePhotoMessage(ctx: BotContext): Promise<void> {
  const photos = ctx.message?.photo;
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
    const caption = ctx.message?.caption ?? 'Phân tích ảnh này và mô tả chi tiết những gì bạn thấy.';

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
    const text = ctx.message?.text;
    if (!text) return;
    const chatId = ctx.chat?.id;

    // Skip commands
    if (text.startsWith('/')) return;
    if (!chatId) return;

    logger.info({ userId: ctx.from?.id, text, chatId }, 'Processing text message');

    // Use axios directly to send messages — most reliable with raw polling
    const axios = (await import('axios')).default;
    const TG_API = `https://api.telegram.org/bot${config.telegram.botToken}`;

    const sendMsg = async (msg: string) => {
      try {
        await axios.post(`${TG_API}/sendMessage`, {
          chat_id: chatId,
          text: msg,
        }, { timeout: 10000 });
        logger.info({ chatId, msgLen: msg.length }, 'Message sent');
      } catch (err) {
        logger.error({ err }, 'Failed to send message');
      }
    };

    const sendPhoto = async (base64: string, caption: string) => {
      try {
        // Convert base64 to buffer and send as photo
        const buffer = Buffer.from(base64, 'base64');
        const formData = new FormData();
        formData.append('chat_id', String(chatId));
        formData.append('caption', caption);
        formData.append('photo', new Blob([buffer], { type: 'image/png' }), 'screenshot.png');

        await axios.post(`${TG_API}/sendPhoto`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 30000,
        });
        logger.info({ chatId }, 'Photo sent');
      } catch (err) {
        logger.error({ err }, 'Failed to send photo');
      }
    };

    // Find online device (but don't block if offline — AI can still answer questions)
    let deviceId: string | null = null;
    try {
      const devices = await serverClient.listDevices();
      const onlineDevice = devices.find((d) => d.status === 'online');
      if (onlineDevice) {
        deviceId = onlineDevice.id;
        logger.info({ device: onlineDevice.name, id: deviceId }, 'Found online device');
      } else {
        logger.info('No online devices found — will try AI-only responses');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to list devices');
    }

    // Send ALL messages to AI — no local pattern matching
    logger.info('Sending to AI...');

    // Try streaming first for pure conversation
    if (!deviceId) {
      try {
        const thinkingMsg = await ctx.reply('🤖 Đang suy nghĩ...');
        const streamedText = await streamAIResponse(text, async (chunk) => {
          try {
            await ctx.api.editMessageText(chatId, thinkingMsg.message_id, chunk);
          } catch {}
        });
        if (streamedText) {
          // Final update
          try {
            await ctx.api.editMessageText(chatId, thinkingMsg.message_id, streamedText.slice(0, 4000));
          } catch {}
          return;
        }
      } catch (err) {
        logger.debug({ err }, 'Streaming failed, falling back to normal');
      }
    }

    try {
      // Build context from last command result
      const userId = String(ctx.from?.id || chatId);
      let context = '';
      const lastResult = lastCommandResults.get(userId);
      if (lastResult && Date.now() - lastResult.timestamp < 30 * 60 * 1000) {
        context = `Previous command: type=${lastResult.type}, result=${JSON.stringify(lastResult.result).slice(0, 2000)}`;
        logger.info({ lastType: lastResult.type }, 'Including last command context');
      }

      logger.info({ text, deviceId }, 'Calling AI interpret...');
      const aiResult = await serverClient.interpretAndExecute(text, deviceId ?? undefined, context);
      logger.info({ success: aiResult.success, type: aiResult.intent?.type }, 'AI result received');

      if (aiResult.success && aiResult.intent) {
        const source = aiResult.intent.source === 'ai' ? '🤖 AI' : '⚡';

        // Store AI result for context in follow-up requests
        lastCommandResults.set(userId, {
          type: aiResult.intent.type,
          result: aiResult.result,
          timestamp: Date.now(),
        });

        // Handle screenshot
        if (aiResult.intent.type === 'screenshot' && aiResult.result) {
          const output = aiResult.result as { imageData?: string };
          if (output.imageData) {
            await sendPhoto(output.imageData, `${source} 📸 Screenshot — RemoteOS`);
            return;
          }
        }

        // Handle agent_loop (multi-step execution)
        if (aiResult.intent.type === 'agent_loop') {
          const allChunks = aiResult.allChunks as string[] | undefined;
          if (allChunks && allChunks.length > 1) {
            for (const chunk of allChunks) {
              await sendMsg(chunk);
            }
          } else {
            const responseText = aiResult.formattedResponse ?? '✅ Đã hoàn thành!';
            await sendMsg(responseText);
          }
          return;
        }

        // Handle free_response (natural conversation)
        if (aiResult.intent.type === 'free_response') {
          const allChunks = aiResult.allChunks as string[] | undefined;
          if (allChunks && allChunks.length > 1) {
            for (const chunk of allChunks) {
              await sendMsg(chunk);
            }
          } else {
            const responseText = aiResult.formattedResponse ?? '🤖 Không có phản hồi.';
            await sendMsg(responseText);
          }
          return;
        }

        // Handle clarification
        if (aiResult.needsClarification) {
          const clarificationText = aiResult.formattedResponse ?? 'Bạn có thể nói rõ hơn không?';
          await sendMsg(`🤔 ${clarificationText}`);
          return;
        }

        // Use formatted response from server
        if (aiResult.formattedResponse) {
          if (aiResult.intent.type === 'shell') {
            const result = aiResult.result as { exitCode?: number; command?: string };
            if (result?.exitCode === 0) {
              await sendMsg(`${source} ✅ Đã thực hiện thành công!\n\n💻 ${result.command}`);
            } else {
              await sendMsg(`${source} ❌ Lệnh thất bại (exit: ${result?.exitCode})\n\n💻 ${result?.command}`);
            }
          } else {
            await sendMsg(`${source} ${aiResult.formattedResponse}`);
          }
        } else {
          await sendMsg(`${source} ✅ Hoàn thành: ${aiResult.intent.type}`);
        }
      } else {
        const errorMsg = aiResult.error ?? 'AI không hiểu yêu cầu.';
        await sendMsg(`❌ ${errorMsg}`);
      }
    } catch (err) {
      logger.error({ err, text }, 'AI interpret failed');
      await sendMsg('❌ Lỗi kết nối server. Thử lại sau.');
    }
  });
}


