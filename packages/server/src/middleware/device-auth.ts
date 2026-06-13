/**
 * Device Authentication Middleware
 *
 * Validates session token for agent endpoints.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { DeviceService } from '../services/device-service.js';

const deviceService = new DeviceService();

/**
 * Device auth middleware — validates session token for agent endpoints
 */
export async function deviceAuthMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionToken = (req.body as Record<string, unknown>)?.sessionToken as string;
  if (!sessionToken) {
    reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Session token required' },
    });
    return;
  }

  // Verify the session token against registered devices
  const device = await deviceService.verifySession(sessionToken);
  if (!device) {
    reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session token' },
    });
    return;
  }

  // Attach device info to request
  (req as FastifyRequest & { deviceId: string }).deviceId = device.id;
}
