/**
 * Plugin Routes — Plugin Management API
 *
 * Real implementation for plugin lifecycle management
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../config/logger.js';

// Plugin registry
const plugins: Map<string, {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  status: 'installed' | 'available' | 'disabled';
  commands: string[];
  installedAt?: Date;
}> = new Map();

// Initialize built-in plugins
function initBuiltInPlugins() {
  const builtIn = [
    { id: 'data-analytics', name: 'Data Analytics', description: 'Phân tích dữ liệu, tạo biểu đồ', version: '1.0.0', author: 'RemoteOS', commands: ['generate_chart', 'analyze_statistics', 'data_export'] },
    { id: 'report-generator', name: 'Report Generator', description: 'Tạo báo cáo PDF/Word/Excel', version: '1.0.0', author: 'RemoteOS', commands: ['generate_report'] },
    { id: 'web-automation', name: 'Web Automation', description: 'Điều khiển trình duyệt tự động', version: '1.0.0', author: 'RemoteOS', commands: ['browser_launch', 'browser_goto', 'browser_click', 'browser_type'] },
    { id: 'security-suite', name: 'Security Suite', description: 'Mã hóa, audit log, rate limiting', version: '1.0.0', author: 'RemoteOS', commands: ['security_encrypt', 'security_decrypt'] },
    { id: 'voice-commands', name: 'Voice Commands', description: 'Điều khiển bằng giọng nói', version: '1.0.0', author: 'RemoteOS', commands: ['voice_transcribe'] },
    { id: 'vision-ai', name: 'Vision AI', description: 'Phân tích ảnh và màn hình', version: '1.0.0', author: 'RemoteOS', commands: ['screen_vision', 'analyze_image'] },
    { id: 'code-executor', name: 'Code Executor', description: 'Chạy code 12 ngôn ngữ', version: '1.0.0', author: 'RemoteOS', commands: ['execute_code'] },
    { id: 'file-processor', name: 'File Processor', description: 'Đọc Word/PDF/Excel', version: '1.0.0', author: 'RemoteOS', commands: ['process_file'] },
    { id: 'desktop-automation', name: 'Desktop Automation', description: 'Click, type, drag trên màn hình', version: '1.0.0', author: 'RemoteOS', commands: ['desktop_click', 'desktop_type', 'desktop_keys'] },
    { id: 'multi-device', name: 'Multi-Device', description: 'Quản lý nhiều thiết bị', version: '1.0.0', author: 'RemoteOS', commands: ['all_devices_status', 'batch_command'] },
  ];

  for (const p of builtIn) {
    plugins.set(p.id, { ...p, status: 'installed', installedAt: new Date() });
  }
}

initBuiltInPlugins();

export function registerPluginRoutes(fastify: FastifyInstance): void {

  // GET /plugins — List all plugins
  fastify.get('/plugins', async () => {
    const pluginList = Array.from(plugins.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      version: p.version,
      author: p.author,
      status: p.status,
      commands: p.commands,
      installedAt: p.installedAt,
    }));

    return {
      success: true,
      plugins: pluginList,
      installed: pluginList.filter(p => p.status === 'installed').length,
      available: pluginList.filter(p => p.status === 'available').length,
    };
  });

  // POST /plugins/:id/install — Install plugin
  fastify.post('/plugins/:id/install', async (request, reply) => {
    const { id } = request.params as { id: string };
    const plugin = plugins.get(id);

    if (!plugin) {
      return reply.status(404).send({ success: false, error: 'Plugin not found' });
    }

    if (plugin.status === 'installed') {
      return { success: true, message: 'Plugin already installed' };
    }

    plugin.status = 'installed';
    plugin.installedAt = new Date();

    logger.info({ pluginId: id }, 'Plugin installed');

    return { success: true, plugin };
  });

  // POST /plugins/:id/disable — Disable plugin
  fastify.post('/plugins/:id/disable', async (request, reply) => {
    const { id } = request.params as { id: string };
    const plugin = plugins.get(id);

    if (!plugin) {
      return reply.status(404).send({ success: false, error: 'Plugin not found' });
    }

    plugin.status = 'disabled';

    logger.info({ pluginId: id }, 'Plugin disabled');

    return { success: true, plugin };
  });

  // POST /plugins/:id/enable — Enable plugin
  fastify.post('/plugins/:id/enable', async (request, reply) => {
    const { id } = request.params as { id: string };
    const plugin = plugins.get(id);

    if (!plugin) {
      return reply.status(404).send({ success: false, error: 'Plugin not found' });
    }

    plugin.status = 'installed';

    logger.info({ pluginId: id }, 'Plugin enabled');

    return { success: true, plugin };
  });

  // GET /plugins/:id — Get plugin details
  fastify.get('/plugins/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const plugin = plugins.get(id);

    if (!plugin) {
      return reply.status(404).send({ success: false, error: 'Plugin not found' });
    }

    return { success: true, plugin };
  });
}
