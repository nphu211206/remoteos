/**
 * RemoteOS Discord Bot
 *
 * Features:
 * - Slash commands for all RemoteOS functions
 * - Natural language processing via AI
 * - Rich embeds for responses
 * - Device management
 * - File operations
 */

import { Client, GatewayIntentBits, Events, SlashCommandBuilder, REST, Routes, EmbedBuilder } from 'discord.js';
import axios from 'axios';

// ─── Configuration ─────────────────────────────────────────────

const DISCORD_TOKEN = process.env.DISCORD_TOKEN ?? '';
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const API_BASE = `${SERVER_URL}/api/v1`;

// ─── API Client ────────────────────────────────────────────────

async function api(path: string, options?: any) {
  try {
    const response = await axios(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      timeout: 120000,
    });
    return response.data;
  } catch (err: any) {
    console.error(`API Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── Slash Commands ────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Xem trạng thái máy tính'),

  new SlashCommandBuilder()
    .setName('screenshot')
    .setDescription('Chụp màn hình máy tính'),

  new SlashCommandBuilder()
    .setName('processes')
    .setDescription('Xem danh sách tiến trình'),

  new SlashCommandBuilder()
    .setName('devices')
    .setDescription('Xem danh sách thiết bị'),

  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Hỏi AI bất cứ điều gì')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Câu hỏi hoặc lệnh')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('create')
    .setDescription('Tạo file code')
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Mô tả file cần tạo')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Tìm kiếm trên web')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Từ khóa tìm kiếm')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Xem danh sách lệnh'),
];

// ─── Register Commands ─────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands('YOUR_CLIENT_ID'), // Replace with your bot's client ID
      { body: commands.map(cmd => cmd.toJSON()) },
    );
    console.log('Slash commands registered!');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// ─── Create Embed ──────────────────────────────────────────────

function createEmbed(title: string, description: string, color: number = 0x667eea): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: 'RemoteOS — Your computer, anywhere' });
}

// ─── Main Bot ──────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Discord bot ready! Logged in as ${c.user.tag}`);
  registerCommands();
});

// Handle slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Defer reply for long operations
  await interaction.deferReply();

  try {
    switch (commandName) {
      case 'status': {
        const data = await api('/interpret-and-execute', {
          method: 'POST',
          data: { text: 'máy tính thế nào' },
        });

        if (data?.success) {
          const embed = createEmbed('🖥️ System Status', data.formattedResponse ?? 'OK');
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply(`❌ ${data?.error ?? 'Không thể lấy trạng thái.'}`);
        }
        break;
      }

      case 'screenshot': {
        const data = await api('/interpret-and-execute', {
          method: 'POST',
          data: { text: 'chụp màn hình' },
        });

        if (data?.success) {
          const embed = createEmbed('📸 Screenshot', 'Đã chụp màn hình thành công!');
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply(`❌ ${data?.error ?? 'Không thể chụp màn hình.'}`);
        }
        break;
      }

      case 'processes': {
        const data = await api('/interpret-and-execute', {
          method: 'POST',
          data: { text: 'xem tiến trình' },
        });

        if (data?.success) {
          const embed = createEmbed('🔧 Running Processes', data.formattedResponse ?? 'OK');
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply(`❌ ${data?.error ?? 'Không thể lấy danh sách tiến trình.'}`);
        }
        break;
      }

      case 'devices': {
        const data = await api('/devices');

        if (data?.data?.devices) {
          const devices = data.data.devices;
          const lines = devices.map((d: any) => {
            const icon = d.status === 'online' ? '🟢' : '🔴';
            return `${icon} ${d.name} (${d.os})`;
          });

          const embed = createEmbed('📱 Devices', lines.join('\n') ?? 'Không có thiết bị.');
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply('❌ Không thể lấy danh sách thiết bị.');
        }
        break;
      }

      case 'ask': {
        const question = interaction.options.getString('question', true);
        const data = await api('/interpret-and-execute', {
          method: 'POST',
          data: { text: question },
        });

        if (data?.success) {
          const response = data.formattedResponse ?? data.result?.response ?? 'OK';
          // Discord has 4096 char limit for embeds
          const truncated = response.length > 4000 ? response.slice(0, 4000) + '...' : response;
          const embed = createEmbed('🤖 AI Response', truncated);
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply(`❌ ${data?.error ?? 'AI không hiểu yêu cầu.'}`);
        }
        break;
      }

      case 'create': {
        const description = interaction.options.getString('description', true);
        const data = await api('/interpret-and-execute', {
          method: 'POST',
          data: { text: `tạo file ${description}` },
        });

        if (data?.success) {
          const embed = createEmbed('✅ File Created', data.formattedResponse ?? 'OK', 0x22c55e);
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply(`❌ ${data?.error ?? 'Không thể tạo file.'}`);
        }
        break;
      }

      case 'search': {
        const query = interaction.options.getString('query', true);
        const data = await api('/interpret-and-execute', {
          method: 'POST',
          data: { text: `tìm kiếm ${query}` },
        });

        if (data?.success) {
          const embed = createEmbed('🔍 Search Results', data.formattedResponse ?? 'Không có kết quả.');
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply(`❌ ${data?.error ?? 'Không thể tìm kiếm.'}`);
        }
        break;
      }

      case 'help': {
        const embed = createEmbed('📖 RemoteOS Commands', [
          '`/status` — Xem trạng thái máy tính',
          '`/screenshot` — Chụp màn hình',
          '`/processes` — Xem tiến trình',
          '`/devices` — Xem thiết bị',
          '`/ask <question>` — Hỏi AI',
          '`/create <description>` — Tạo file code',
          '`/search <query>` — Tìm kiếm web',
          '`/help` — Xem hướng dẫn',
          '',
          '**Hoặc gõ trực tiếp:**',
          '• "máy tính thế nào?" → Xem status',
          '• "chụp màn hình" → Screenshot',
          '• "tạo file Python calculator" → Tạo code',
          '• "tìm kiếm AI market 2025" → Web search',
        ].join('\n'));
        await interaction.editReply({ embeds: [embed] });
        break;
      }
    }
  } catch (err) {
    console.error('Command error:', err);
    await interaction.editReply('❌ Đã xảy ra lỗi. Thử lại sau.');
  }
});

// Handle natural language messages
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return; // Use ! prefix for natural language

  const text = message.content.slice(1).trim();
  if (!text) return;

  // Send "thinking" indicator
  const thinkingMsg = await message.reply('🤖 Đang suy nghĩ...');

  try {
    const data = await api('/interpret-and-execute', {
      method: 'POST',
      data: { text },
    });

    if (data?.success) {
      const response = data.formattedResponse ?? '✅ Hoàn thành!';
      const truncated = response.length > 2000 ? response.slice(0, 2000) + '...' : response;
      await thinkingMsg.edit(truncated);
    } else {
      await thinkingMsg.edit(`❌ ${data?.error ?? 'AI không hiểu yêu cầu.'}`);
    }
  } catch (err) {
    console.error('Message error:', err);
    await thinkingMsg.edit('❌ Lỗi kết nối server.');
  }
});

// ─── Start Bot ─────────────────────────────────────────────────

if (!DISCORD_TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN environment variable');
  process.exit(1);
}

client.login(DISCORD_TOKEN).catch((err) => {
  console.error('❌ Failed to login:', err.message);
  process.exit(1);
});
