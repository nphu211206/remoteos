/**
 * Plugin Routes — Plugin Management API
 *
 * SQLite-backed plugin system with lifecycle management
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../config/logger.js';
import { getDatabase } from '../db/index.js';
import { sql } from 'drizzle-orm';

let initialized = false;

function ensurePluginTables(): void {
  if (initialized) return;
  try {
    const db = getDatabase();
    db.$client.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        version TEXT DEFAULT '1.0.0',
        author TEXT DEFAULT 'RemoteOS',
        status TEXT DEFAULT 'installed',
        commands TEXT DEFAULT '[]',
        config TEXT DEFAULT '{}',
        installed_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
    initialized = true;
  } catch (err) {
    logger.error({ err }, 'Failed to initialize plugin tables');
  }
}

// Built-in plugins
const BUILT_IN_PLUGINS = [
  { id: 'data-analytics', name: 'Data Analytics', description: 'Phân tích dữ liệu, tạo biểu đồ', version: '1.0.0', author: 'RemoteOS', commands: ['generate_chart', 'analyze_statistics', 'data_export'] },
  { id: 'report-generator', name: 'Report Generator', description: 'Tạo báo cáo PDF/Word/Excel', version: '1.0.0', author: 'RemoteOS', commands: ['generate_report'] },
  { id: 'web-automation', name: 'Web Automation', description: 'Điều khiển trình duyệt tự động', version: '1.0.0', author: 'RemoteOS', commands: ['browser_launch', 'browser_goto', 'browser_click', 'browser_type'] },
  { id: 'security-suite', name: 'Security Suite', description: 'Mã hóa, audit log, rate limiting', version: '1.0.0', author: 'RemoteOS', commands: ['security_encrypt', 'security_decrypt'] },
  { id: 'voice-commands', name: 'Voice Commands', description: 'Điều khiển bằng giọng nói', version: '1.0.0', author: 'RemoteOS', commands: ['voice_transcribe'] },
  { id: 'vision-ai', name: 'Vision AI', description: 'Phân tích ảnh và màn hình', version: '1.0.0', author: 'RemoteOS', commands: ['screen_vision', 'analyze_image'] },
  { id: 'code-executor', name: 'Code Executor', description: 'Chạy code 20+ ngôn ngữ', version: '1.0.0', author: 'RemoteOS', commands: ['execute_code'] },
  { id: 'file-processor', name: 'File Processor', description: 'Đọc Word/PDF/Excel', version: '1.0.0', author: 'RemoteOS', commands: ['process_file'] },
  { id: 'desktop-automation', name: 'Desktop Automation', description: 'Click, type, drag trên màn hình', version: '1.0.0', author: 'RemoteOS', commands: ['desktop_click', 'desktop_type', 'desktop_keys'] },
  { id: 'multi-device', name: 'Multi-Device', description: 'Quản lý nhiều thiết bị', version: '1.0.0', author: 'RemoteOS', commands: ['all_devices_status', 'batch_command'] },
  { id: 'image-generator', name: 'Image Generator', description: 'Tạo hình ảnh từ văn bản', version: '1.0.0', author: 'RemoteOS', commands: ['generate_image'] },
  { id: 'todo-manager', name: 'Todo Manager', description: 'Quản lý công việc', version: '1.0.0', author: 'RemoteOS', commands: ['manage_todo'] },
  { id: 'git-integration', name: 'Git Integration', description: 'Quản lý Git repositories', version: '1.0.0', author: 'RemoteOS', commands: ['git_operations'] },
  { id: 'weather-service', name: 'Weather Service', description: 'Thông tin thời tiết', version: '1.0.0', author: 'RemoteOS', commands: ['get_weather'] },
  { id: 'calculator', name: 'Calculator', description: 'Tính toán toán học', version: '1.0.0', author: 'RemoteOS', commands: ['calculate'] },
  { id: 'translator', name: 'Translator', description: 'Dịch thuật đa ngôn ngữ', version: '1.0.0', author: 'RemoteOS', commands: ['translate_text'] },
];

function initBuiltInPlugins() {
  ensurePluginTables();
  const db = getDatabase();

  for (const p of BUILT_IN_PLUGINS) {
    const existing = db.get(sql`SELECT id FROM plugins WHERE id = ${p.id}`) as { id: string } | undefined;
    if (!existing) {
      db.run(sql`INSERT INTO plugins (id, name, description, version, author, commands) VALUES (${p.id}, ${p.name}, ${p.description}, ${p.version}, ${p.author}, ${JSON.stringify(p.commands)})`);
    }
  }
}

initBuiltInPlugins();

export function registerPluginRoutes(fastify: FastifyInstance): void {

  // GET /plugins — List all plugins
  fastify.get('/plugins', async () => {
    ensurePluginTables();
    const db = getDatabase();

    const pluginList = db.all(sql`SELECT * FROM plugins ORDER BY status ASC, name ASC`) as Array<{
      id: string; name: string; description: string; version: string; author: string;
      status: string; commands: string; installed_at: string;
    }>;

    const result = pluginList.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      version: p.version,
      author: p.author,
      status: p.status,
      commands: JSON.parse(p.commands ?? '[]'),
      installedAt: p.installed_at,
    }));

    return {
      success: true,
      plugins: result,
      installed: result.filter(p => p.status === 'installed').length,
      available: result.filter(p => p.status === 'available').length,
    };
  });

  // POST /plugins/:id/install — Install plugin
  fastify.post('/plugins/:id/install', async (request, reply) => {
    ensurePluginTables();
    const { id } = request.params as { id: string };
    const db = getDatabase();

    const plugin = db.get(sql`SELECT * FROM plugins WHERE id = ${id}`) as { id: string; status: string } | undefined;
    if (!plugin) {
      return reply.status(404).send({ success: false, error: 'Plugin not found' });
    }

    if (plugin.status === 'installed') {
      return { success: true, message: 'Plugin already installed' };
    }

    db.run(sql`UPDATE plugins SET status = 'installed', updated_at = datetime('now') WHERE id = ${id}`);
    logger.info({ pluginId: id }, 'Plugin installed');

    return { success: true, plugin: { id, status: 'installed' } };
  });

  // POST /plugins/:id/disable — Disable plugin
  fastify.post('/plugins/:id/disable', async (request, reply) => {
    ensurePluginTables();
    const { id } = request.params as { id: string };
    const db = getDatabase();

    const plugin = db.get(sql`SELECT * FROM plugins WHERE id = ${id}`) as { id: string } | undefined;
    if (!plugin) {
      return reply.status(404).send({ success: false, error: 'Plugin not found' });
    }

    db.run(sql`UPDATE plugins SET status = 'disabled', updated_at = datetime('now') WHERE id = ${id}`);
    logger.info({ pluginId: id }, 'Plugin disabled');

    return { success: true, plugin: { id, status: 'disabled' } };
  });

  // POST /plugins/:id/enable — Enable plugin
  fastify.post('/plugins/:id/enable', async (request, reply) => {
    ensurePluginTables();
    const { id } = request.params as { id: string };
    const db = getDatabase();

    const plugin = db.get(sql`SELECT * FROM plugins WHERE id = ${id}`) as { id: string } | undefined;
    if (!plugin) {
      return reply.status(404).send({ success: false, error: 'Plugin not found' });
    }

    db.run(sql`UPDATE plugins SET status = 'installed', updated_at = datetime('now') WHERE id = ${id}`);
    logger.info({ pluginId: id }, 'Plugin enabled');

    return { success: true, plugin: { id, status: 'installed' } };
  });

  // GET /plugins/:id — Get plugin details
  fastify.get('/plugins/:id', async (request, reply) => {
    ensurePluginTables();
    const { id } = request.params as { id: string };
    const db = getDatabase();

    const plugin = db.get(sql`SELECT * FROM plugins WHERE id = ${id}`) as {
      id: string; name: string; description: string; version: string; author: string;
      status: string; commands: string; installed_at: string;
    } | undefined;

    if (!plugin) {
      return reply.status(404).send({ success: false, error: 'Plugin not found' });
    }

    return {
      success: true,
      plugin: {
        ...plugin,
        commands: JSON.parse(plugin.commands ?? '[]'),
      },
    };
  });
}
