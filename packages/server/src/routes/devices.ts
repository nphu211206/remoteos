/**
 * Device Routes
 *
 * Handles device registration, listing, and agent communication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { HeartbeatRequest, PollRequest } from '@remoteos/shared';
import { deviceRegisterRequestSchema, heartbeatRequestSchema, pollRequestSchema } from '@remoteos/shared/validators';
import { DeviceService } from '../services/device-service.js';
import { CommandService } from '../services/command-service.js';
import { AuthService } from '../services/auth-service.js';
import { authMiddleware } from '../middleware/auth.js';
import { deviceAuthMiddleware } from '../middleware/device-auth.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

const deviceService = new DeviceService();
const commandService = new CommandService();
const authService = new AuthService();

export function registerDeviceRoutes(server: FastifyInstance): void {
  /**
   * POST /devices/register
   * Agent calls this to register/pair with the server
   * Requires valid registration code
   */
  server.post('/devices/register', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = deviceRegisterRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid registration data', details: parsed.error.flatten() },
      });
    }

    // Validate registration token
    if (parsed.data.registrationToken !== config.security.registrationCode) {
      logger.warn({ token: parsed.data.registrationToken }, 'Invalid registration token attempt');
      return reply.status(403).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid registration token' },
      });
    }

    // Ensure a default dev user exists (for local development)
    const defaultUser = await authService.findOrCreateUser(0, {
      firstName: 'Dev User',
      language: 'vi',
    });

    const result = await deviceService.register(parsed.data, defaultUser.id);
    return reply.status(result.success ? 200 : 400).send(result);
  });

  /**
   * GET /devices
   * List all devices for the authenticated user
   */
  server.get('/devices', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as FastifyRequest & { userId: string }).userId;
    const devices = await deviceService.listByUser(userId);
    return reply.send({ success: true, data: { devices } });
  });

  /**
   * GET /devices/:id
   * Get detailed device info
   */
  server.get<{ Params: { id: string } }>('/devices/:id', { preHandler: authMiddleware }, async (req, reply) => {
    const device = await deviceService.getById(req.params.id);
    if (!device) {
      return reply.status(404).send({
        success: false,
        error: { code: 'DEVICE_NOT_FOUND', message: 'Device not found' },
      });
    }
    return reply.send({ success: true, data: device });
  });

  /**
   * POST /device/heartbeat
   * Agent sends periodic heartbeat with system state
   * Requires valid session token
   */
  server.post('/device/heartbeat', { preHandler: deviceAuthMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = heartbeatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid heartbeat data' },
      });
    }

    const result = await deviceService.handleHeartbeat(parsed.data as HeartbeatRequest);
    return reply.send(result);
  });

  /**
   * POST /device/poll
   * Agent polls for pending commands
   * Requires valid session token
   */
  server.post('/device/poll', { preHandler: deviceAuthMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = pollRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid poll data' },
      });
    }

    const result = await commandService.pollForDevice(parsed.data as PollRequest);
    return reply.send({ success: true, data: result });
  });
}
