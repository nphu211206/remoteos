/**
 * Schedule Routes — Automation Engine
 *
 * POST /api/v1/schedules — Create schedule
 * GET /api/v1/schedules — List schedules
 * DELETE /api/v1/schedules/:id — Delete schedule
 * POST /api/v1/schedules/:id/toggle — Toggle schedule
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SchedulerService, parseScheduleText } from '../services/scheduler-service.js';
import { AuthService } from '../services/auth-service.js';
import { logger } from '../config/logger.js';

const schedulerService = new SchedulerService();
const authService = new AuthService();

export function registerScheduleRoutes(server: FastifyInstance): void {

  // POST /schedules — Create schedule
  server.post('/schedules', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      name?: string;
      schedule?: string;
      cronExpression?: string;
      commandType?: string;
      commandParams?: Record<string, unknown>;
      deviceId?: string;
    };

    if (!body.name || !body.commandType || !body.deviceId) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: name, commandType, deviceId',
      });
    }

    // Parse cron expression from natural language or use provided one
    let cronExpression = body.cronExpression;
    if (!cronExpression && body.schedule) {
      cronExpression = parseScheduleText(body.schedule) ?? undefined;
    }
    if (!cronExpression) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid schedule. Use cron expression or natural language (e.g., "mỗi 8h sáng")',
      });
    }

    // Get default dev user
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

    try {
      const schedule = await schedulerService.create(defaultUser.id, {
        name: body.name,
        cronExpression,
        commandType: body.commandType,
        commandParams: body.commandParams,
        deviceId: body.deviceId,
      });

      return reply.send({
        success: true,
        schedule,
        formattedResponse: `✅ Đã tạo lịch: *${body.name}*\n⏰ ${body.schedule ?? cronExpression}\n🔧 ${body.commandType}`,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to create schedule');
      return reply.send({ success: false, error: 'Không thể tạo lịch.' });
    }
  });

  // GET /schedules — List schedules
  server.get('/schedules', async (req: FastifyRequest, reply: FastifyReply) => {
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

    try {
      const schedules = await schedulerService.listByUser(defaultUser.id);

      if (schedules.length === 0) {
        return reply.send({
          success: true,
          schedules: [],
          formattedResponse: '📅 Chưa có lịch nào. Dùng "tạo lịch" để bắt đầu.',
        });
      }

      const lines = schedules.map((s, i) => {
        const status = s.isActive ? '🟢' : '🔴';
        const lastRun = s.lastRunAt ? new Date(s.lastRunAt).toLocaleString('vi-VN') : 'Chưa chạy';
        return `${status} ${i + 1}. *${s.name}*\n   ⏰ ${s.cronExpression} | 🔧 ${s.commandType}\n   📊 Đã chạy: ${s.runCount} lần | Lần cuối: ${lastRun}`;
      });

      return reply.send({
        success: true,
        schedules,
        formattedResponse: `📅 *Danh sách lịch (${schedules.length}):*\n\n${lines.join('\n\n')}`,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to list schedules');
      return reply.send({ success: false, error: 'Không thể lấy danh sách lịch.' });
    }
  });

  // DELETE /schedules/:id — Delete schedule
  server.delete('/schedules/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

    try {
      const deleted = await schedulerService.delete(id, defaultUser.id);
      if (deleted) {
        return reply.send({ success: true, formattedResponse: '✅ Đã xóa lịch.' });
      }
      return reply.send({ success: false, error: 'Không tìm thấy lịch.' });
    } catch (err) {
      logger.error({ err }, 'Failed to delete schedule');
      return reply.send({ success: false, error: 'Không thể xóa lịch.' });
    }
  });

  // POST /schedules/:id/toggle — Toggle schedule
  server.post('/schedules/:id/toggle', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

    try {
      const schedule = await schedulerService.toggle(id, defaultUser.id);
      if (schedule) {
        const status = schedule.isActive ? 'bật' : 'tắt';
        return reply.send({
          success: true,
          schedule,
          formattedResponse: `✅ Đã ${status} lịch: *${schedule.name}*`,
        });
      }
      return reply.send({ success: false, error: 'Không tìm thấy lịch.' });
    } catch (err) {
      logger.error({ err }, 'Failed to toggle schedule');
      return reply.send({ success: false, error: 'Không thể thay đổi lịch.' });
    }
  });
}
