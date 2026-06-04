/**
 * Multi-Device Routes
 *
 * GET /api/v1/devices/all/status — Get all device status
 * POST /api/v1/devices/batch — Execute batch command
 * POST /api/v1/devices/groups — Create device group
 * GET /api/v1/devices/groups — List device groups
 * POST /api/v1/devices/groups/:name/execute — Execute on group
 * DELETE /api/v1/devices/groups/:id — Delete group
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MultiDeviceService } from '../services/multi-device-service.js';
import { AuthService } from '../services/auth-service.js';
import { logger } from '../config/logger.js';

const multiDeviceService = new MultiDeviceService();
const authService = new AuthService();

export function registerMultiDeviceRoutes(server: FastifyInstance): void {

  // GET /devices/all/status — Get all device status
  server.get('/devices/all/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

    try {
      const statuses = await multiDeviceService.getAllDeviceStatus(defaultUser.id);

      const online = statuses.filter(d => d.status === 'online').length;
      const offline = statuses.filter(d => d.status !== 'online').length;

      const lines = statuses.map(d => {
        const icon = d.status === 'online' ? '🟢' : '🔴';
        return `${icon} ${d.name} (${d.os})`;
      });

      return reply.send({
        success: true,
        devices: statuses,
        summary: { total: statuses.length, online, offline },
        formattedResponse: `📱 *Tất cả thiết bị (${statuses.length}):*\n\n${lines.join('\n')}\n\n🟢 Online: ${online} | 🔴 Offline: ${offline}`,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to get all device status');
      return reply.send({ success: false, error: 'Không thể lấy trạng thái thiết bị.' });
    }
  });

  // POST /devices/batch — Execute batch command
  server.post('/devices/batch', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      deviceIds?: string[];
      allOnline?: boolean;
      commandType?: string;
      commandParams?: Record<string, unknown>;
    };

    if (!body.commandType) {
      return reply.status(400).send({ success: false, error: 'Missing commandType' });
    }

    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

    try {
      let results;

      if (body.allOnline) {
        results = await multiDeviceService.executeOnAll(
          defaultUser.id,
          body.commandType,
          body.commandParams,
        );
      } else if (body.deviceIds && body.deviceIds.length > 0) {
        results = await multiDeviceService.executeBatch(
          defaultUser.id,
          body.deviceIds,
          body.commandType,
          body.commandParams,
        );
      } else {
        return reply.status(400).send({ success: false, error: 'Provide deviceIds or allOnline: true' });
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      const lines = results.map(r => {
        const icon = r.success ? '✅' : '❌';
        const detail = r.success ? 'OK' : r.error;
        return `${icon} ${r.deviceName}: ${detail}`;
      });

      return reply.send({
        success: true,
        results,
        summary: { total: results.length, success: successCount, failed: failCount },
        formattedResponse: `🔧 *Batch Command: ${body.commandType}*\n\n${lines.join('\n')}\n\n✅ ${successCount} thành công | ❌ ${failCount} thất bại`,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to execute batch command');
      return reply.send({ success: false, error: 'Không thể thực thi batch command.' });
    }
  });

  // POST /devices/groups — Create device group
  server.post('/devices/groups', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      name?: string;
      description?: string;
      deviceIds?: string[];
    };

    if (!body.name || !body.deviceIds) {
      return reply.status(400).send({ success: false, error: 'Missing name or deviceIds' });
    }

    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

    try {
      const group = await multiDeviceService.createGroup(
        defaultUser.id,
        body.name,
        body.description ?? '',
        body.deviceIds,
      );

      return reply.send({
        success: true,
        group,
        formattedResponse: `✅ Đã tạo nhóm: *${body.name}*\n📱 ${body.deviceIds.length} thiết bị`,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to create device group');
      return reply.send({ success: false, error: 'Không thể tạo nhóm.' });
    }
  });

  // GET /devices/groups — List device groups
  server.get('/devices/groups', async (req: FastifyRequest, reply: FastifyReply) => {
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

    try {
      const groups = await multiDeviceService.listGroups(defaultUser.id);

      if (groups.length === 0) {
        return reply.send({
          success: true,
          groups: [],
          formattedResponse: '📱 Chưa có nhóm nào. Dùng "tạo nhóm thiết bị" để bắt đầu.',
        });
      }

      const lines = groups.map(g => {
        return `📁 *${g.name}*\n   📝 ${g.description || 'Không có mô tả'}\n   📱 ${g.deviceIds.length} thiết bị`;
      });

      return reply.send({
        success: true,
        groups,
        formattedResponse: `📱 *Danh sách nhóm (${groups.length}):*\n\n${lines.join('\n\n')}`,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to list device groups');
      return reply.send({ success: false, error: 'Không thể lấy danh sách nhóm.' });
    }
  });

  // POST /devices/groups/:name/execute — Execute on group
  server.post('/devices/groups/:name/execute', async (req: FastifyRequest, reply: FastifyReply) => {
    const { name } = req.params as { name: string };
    const body = req.body as {
      commandType?: string;
      commandParams?: Record<string, unknown>;
    };

    if (!body.commandType) {
      return reply.status(400).send({ success: false, error: 'Missing commandType' });
    }

    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

    try {
      const results = await multiDeviceService.executeOnGroup(
        defaultUser.id,
        name,
        body.commandType,
        body.commandParams,
      );

      if (results.length === 0) {
        return reply.send({ success: false, error: `Không tìm thấy nhóm "${name}" hoặc không có thiết bị online.` });
      }

      const successCount = results.filter(r => r.success).length;
      const lines = results.map(r => {
        const icon = r.success ? '✅' : '❌';
        return `${icon} ${r.deviceName}`;
      });

      return reply.send({
        success: true,
        results,
        formattedResponse: `🔧 *Execute on group "${name}":*\n\n${lines.join('\n')}\n\n✅ ${successCount}/${results.length} thành công`,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to execute on group');
      return reply.send({ success: false, error: 'Không thể thực thi trên nhóm.' });
    }
  });

  // DELETE /devices/groups/:id — Delete group
  server.delete('/devices/groups/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

    try {
      const deleted = await multiDeviceService.deleteGroup(id, defaultUser.id);
      return reply.send({
        success: deleted,
        formattedResponse: deleted ? '✅ Đã xóa nhóm.' : '❌ Không tìm thấy nhóm.',
      });
    } catch (err) {
      logger.error({ err }, 'Failed to delete group');
      return reply.send({ success: false, error: 'Không thể xóa nhóm.' });
    }
  });
}
