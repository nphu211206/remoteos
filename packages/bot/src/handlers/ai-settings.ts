/**
 * AI Settings Handler — Real implementation
 *
 * Handles /ai command for configuring user's AI provider.
 * Actually connects to server API to save/load configs.
 */

import type { Bot } from 'grammy';
import type { BotContext } from '../bot.js';
import { ServerClient } from '../client/server-client.js';
import { logger } from '../config/logger.js';

const serverClient = new ServerClient('http://localhost:3000');

// Provider info with correct links
const PROVIDERS: Record<string, { name: string; icon: string; link: string; models: string[] }> = {
  gemini: {
    name: 'Google Gemini',
    icon: '🔮',
    link: 'https://aistudio.google.com/apikey',
    models: ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-pro'],
  },
  openai: {
    name: 'OpenAI',
    icon: '🤖',
    link: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  anthropic: {
    name: 'Anthropic Claude',
    icon: '🧠',
    link: 'https://console.anthropic.com/settings/keys',
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-8'],
  },
  local: {
    name: 'Local LLM (Ollama)',
    icon: '💻',
    link: 'https://ollama.ai/download',
    models: ['llama3', 'mistral', 'codellama'],
  },
};

export function registerAISettings(bot: Bot<BotContext>): void {
  // /ai — Show current config or setup wizard
  bot.command('ai', async (ctx) => {
    const args = ctx.match?.trim() ?? '';
    const userId = String(ctx.from?.id ?? 0);

    // /ai — Show current config
    if (!args || args === 'status') {
      try {
        // Try to get config from server
        const response = await fetch(`http://localhost:3000/api/v1/users/${userId}/ai-config`);
        const data = await response.json() as { success: boolean; config?: { provider: string; model: string; isActive: boolean } };

        if (data.success && data.config) {
          const provider = PROVIDERS[data.config.provider] ?? PROVIDERS.gemini;
          await ctx.reply(
            '╔══════════════════════════════╗\n' +
            '║   🤖 AI CONFIGURATION        ║\n' +
            '╚══════════════════════════════╝\n\n' +
            `📱 Provider: ${provider.icon} ${provider.name}\n` +
            `🧠 Model: ${data.config.model}\n` +
            `🔑 Status: ${data.config.isActive ? '✅ Active' : '❌ Inactive'}\n\n` +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            '*Lệnh:*\n' +
            '• `/ai setup` — Thay đổi cấu hình\n' +
            '• `/ai test` — Test kết nối\n' +
            '• `/ai reset` — Xóa cấu hình',
          );
        } else {
          // No config yet
          await ctx.reply(
            '╔══════════════════════════════╗\n' +
            '║   🤖 AI CONFIGURATION        ║\n' +
            '╚══════════════════════════════╝\n\n' +
            '📱 Provider: Gemini (default)\n' +
            '🧠 Model: gemini-3.1-flash-lite\n' +
            '💰 Cost: Free tier (500 req/day)\n' +
            '🔑 Status: ✅ Active\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            '💡 Muốn dùng AI riêng?\n' +
            'Gõ `/ai setup` để cấu hình!',
          );
        }
      } catch (err) {
        logger.error({ err }, 'Failed to get AI config');
        await ctx.reply('❌ Lỗi khi lấy cấu hình AI.');
      }
      return;
    }

    // /ai setup — Start setup wizard
    if (args === 'setup') {
      ctx.session.aiSetupStep = 'choose_provider';
      await ctx.reply(
        '🤖 *Setup AI Provider*\n\n' +
        'Chọn AI provider bạn muốn sử dụng:\n\n' +
        '1️⃣ *Gemini* — Free tier, 500 req/ngày\n' +
        '2️⃣ *OpenAI* — GPT-4o, GPT-4o Mini\n' +
        '3️⃣ *Claude* — Sonnet, Haiku, Opus\n' +
        '4️⃣ *Local* — Ollama, LM Studio\n\n' +
        'Gõ tên provider: `gemini`, `openai`, `anthropic`, hoặc `local`',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    // /ai test — Test AI connection
    if (args === 'test') {
      await ctx.reply('🧪 Đang test kết nối AI...');
      try {
        const response = await fetch('http://localhost:3000/api/v1/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'hello' }),
        });
        const data = await response.json() as { success: boolean; error?: string };

        if (data.success) {
          await ctx.reply('✅ Kết nối AI thành công!');
        } else {
          await ctx.reply(`❌ Lỗi: ${data.error ?? 'Không xác định'}`);
        }
      } catch (err) {
        await ctx.reply('❌ Không thể kết nối server.');
      }
      return;
    }

    // /ai reset — Reset to default
    if (args === 'reset') {
      try {
        await fetch(`http://localhost:3000/api/v1/users/${userId}/ai-config`, {
          method: 'DELETE',
        });
        await ctx.reply('🔄 Đã xóa cấu hình AI. Sử dụng Gemini default.');
      } catch (err) {
        await ctx.reply('❌ Lỗi khi xóa cấu hình.');
      }
      return;
    }

    // /ai provider <name> — Set provider
    if (args.startsWith('provider ')) {
      const provider = args.replace('provider ', '').trim().toLowerCase();
      if (!PROVIDERS[provider]) {
        await ctx.reply('❌ Provider không hợp lệ. Chọn: gemini, openai, anthropic, local');
        return;
      }

      ctx.session.aiSetupStep = 'enter_key';
      ctx.session.aiProvider = provider;

      const info = PROVIDERS[provider];
      await ctx.reply(
        `${info.icon} Đã chọn *${info.name}*\n\n` +
        `Nhập API key của bạn:\n` +
        `(Lấy từ: ${info.link})\n\n` +
        'Gõ: `/ai key <api-key>`',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    // /ai key <key> — Set API key
    if (args.startsWith('key ')) {
      const key = args.replace('key ', '').trim();
      if (key.length < 10) {
        await ctx.reply('❌ API key quá ngắn.');
        return;
      }

      ctx.session.aiApiKey = key;
      ctx.session.aiSetupStep = 'choose_model';

      const provider = ctx.session.aiProvider ?? 'gemini';
      const info = PROVIDERS[provider];
      const models = info.models.map((m, i) => `${i + 1}️⃣ ${m}`).join('\n');

      await ctx.reply(
        `🔑 Đã lưu API key!\n\n` +
        `Chọn model:\n${models}\n\n` +
        'Gõ tên model hoặc số thứ tự.',
      );
      return;
    }

    // /ai model <model> — Set model and save
    if (args.startsWith('model ')) {
      const model = args.replace('model ', '').trim();
      const provider = ctx.session.aiProvider ?? 'gemini';
      const apiKey = ctx.session.aiApiKey ?? '';

      if (!apiKey) {
        await ctx.reply('❌ Chưa nhập API key. Gõ `/ai key <key>` trước.');
        return;
      }

      // Save to server
      try {
        const response = await fetch(`http://localhost:3000/api/v1/users/${userId}/ai-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey, model }),
        });
        const data = await response.json() as { success: boolean; error?: string };

        if (data.success) {
          const info = PROVIDERS[provider];
          await ctx.reply(
            '╔══════════════════════════════╗\n' +
            '║   ✅ AI CONFIGURED           ║\n' +
            '╚══════════════════════════════╝\n\n' +
            `📱 Provider: ${info.icon} ${info.name}\n` +
            `🧠 Model: ${model}\n` +
            `🔑 API Key: ${apiKey.slice(0, 4)}****${apiKey.slice(-4)}\n\n` +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            'Bây giờ bạn có thể gõ bất cứ lệnh nào!\n' +
            'AI sẽ hiểu và máy tính sẽ làm.',
          );

          // Clear session
          ctx.session.aiSetupStep = undefined;
          ctx.session.aiProvider = undefined;
          ctx.session.aiApiKey = undefined;
        } else {
          await ctx.reply(`❌ Lỗi: ${data.error ?? 'Không lưu được'}`);
        }
      } catch (err) {
        await ctx.reply('❌ Lỗi kết nối server.');
      }
      return;
    }

    // Unknown subcommand
    await ctx.reply(
      '❓ Sử dụng:\n' +
      '• `/ai` — Xem cấu hình\n' +
      '• `/ai setup` — Setup wizard\n' +
      '• `/ai test` — Test kết nối\n' +
      '• `/ai reset` — Xóa cấu hình',
    );
  });
}
