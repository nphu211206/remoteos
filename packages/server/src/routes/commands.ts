/**
 * Command Routes
 *
 * Handles command creation, status queries, and result submission.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CommandResultRequest } from '@remoteos/shared';
import { commandCreateRequestSchema, commandResultRequestSchema } from '@remoteos/shared/validators';
import { CommandService } from '../services/command-service.js';
import { DeviceService } from '../services/device-service.js';
import { authMiddleware } from '../middleware/auth.js';
import { deviceAuthMiddleware } from '../middleware/device-auth.js';
import { logger } from '../config/logger.js';

const commandService = new CommandService();
const deviceService = new DeviceService();

export function registerCommandRoutes(server: FastifyInstance): void {
  /**
   * POST /commands
   * Create a new command to be executed on a device
   */
  server.post('/commands', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = commandCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid command data', details: parsed.error.flatten() },
      });
    }

    const userId = (req as FastifyRequest & { userId: string }).userId;
    const result = await commandService.create(userId, parsed.data);
    return reply.status(result.success ? 201 : 400).send(result);
  });

  /**
   * GET /commands/:id
   * Get command status and result
   */
  server.get<{ Params: { id: string } }>('/commands/:id', { preHandler: authMiddleware }, async (req, reply) => {
    const result = await commandService.getById(req.params.id);
    if (!result) {
      return reply.status(404).send({
        success: false,
        error: { code: 'COMMAND_NOT_FOUND', message: 'Command not found' },
      });
    }
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /commands/:id/result
   * Agent submits command execution result
   * Requires valid device session token
   */
  server.post<{ Params: { id: string } }>('/commands/:id/result', { preHandler: deviceAuthMiddleware }, async (req, reply) => {
    const parsed = commandResultRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid result data', details: parsed.error.flatten() },
      });
    }

    // Verify the command belongs to this device
    const commandData = await commandService.getById(req.params.id);
    if (commandData?.command && commandData.command.deviceId !== (req as FastifyRequest & { deviceId: string }).deviceId) {
      logger.warn({
        commandId: req.params.id,
        expectedDevice: commandData.command.deviceId,
        actualDevice: (req as FastifyRequest & { deviceId: string }).deviceId,
      }, 'Device attempted to submit result for another device\'s command');
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Command does not belong to this device' },
      });
    }

    const result = await commandService.submitResult(req.params.id, parsed.data as CommandResultRequest);
    return reply.send(result);
  });

  /**
   * POST /commands/:id/cancel
   * Cancel a pending command
   */
  server.post<{ Params: { id: string } }>('/commands/:id/cancel', { preHandler: authMiddleware }, async (req, reply) => {
    const userId = (req as FastifyRequest & { userId: string }).userId;
    const result = await commandService.cancel(req.params.id, userId);
    return reply.send(result);
  });
}
