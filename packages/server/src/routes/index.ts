/**
 * Route Registration
 *
 * Centralizes all route registration for the Fastify server.
 */

import type { FastifyInstance } from 'fastify';
import { registerDeviceRoutes } from './devices.js';
import { registerCommandRoutes } from './commands.js';
import { registerWebhookRoutes } from './webhooks.js';
import { registerInterpretRoutes } from './interpret.js';
import { registerUserSettingsRoutes } from './user-settings.js';
import { registerCreateFileRoutes } from './create-file.js';
import { registerScheduleRoutes } from './schedules.js';
import { registerMultiDeviceRoutes } from './multi-device.js';
import { registerVoiceRoutes } from './voice.js';
import { registerAnalyticsRoutes } from './analytics.js';
import { registerRAGRoutes } from './rag.js';
import { registerPluginRoutes } from './plugins.js';
import { registerWorkflowRoutes } from './workflows.js';

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  // All API routes are prefixed with /api/v1
  await server.register(
    async (api) => {
      registerDeviceRoutes(api);
      registerCommandRoutes(api);
      registerWebhookRoutes(api);
      registerInterpretRoutes(api);
      registerUserSettingsRoutes(api);
      registerCreateFileRoutes(api);
      registerScheduleRoutes(api);
      registerMultiDeviceRoutes(api);
      registerVoiceRoutes(api);
      registerAnalyticsRoutes(api);
      registerRAGRoutes(api);
      registerPluginRoutes(api);
      registerWorkflowRoutes(api);
    },
    { prefix: '/api/v1' },
  );
}
