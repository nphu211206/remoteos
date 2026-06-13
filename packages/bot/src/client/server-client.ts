/**
 * Server Client for Bot
 *
 * Communicates with the RemoteOS relay server API.
 * Supports both HTTP polling and WebSocket for real-time results.
 */

import axios, { type AxiosInstance } from 'axios';
import type { DeviceSummary, CommandResult } from '@remoteos/shared';
import { logger } from '../config/logger.js';

export class ServerClient {
  private http: AxiosInstance;
  private serverUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ws: any = null;
  private wsReady = false;
  private pendingCommands = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    this.http = axios.create({
      baseURL: `${serverUrl}/api/v1`,
      timeout: 60_000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'RemoteOS-Bot/0.1.0',
      },
    });
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket(userId: string): void {
    try {
      const wsUrl = this.serverUrl.replace('http', 'ws') + `/ws?type=bot&id=${userId}`;

      // Use native WebSocket or dynamic import ws
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WS = typeof WebSocket !== 'undefined' ? WebSocket : require('ws');
      if (!WS) {
        logger.warn('WebSocket not available, using HTTP polling');
        return;
      }

      this.ws = new WS(wsUrl);

      this.ws.on('open', () => {
        this.wsReady = true;
        logger.info({ userId }, 'WebSocket connected');
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'command:completed' && msg.commandId) {
            const pending = this.pendingCommands.get(msg.commandId);
            if (pending) {
              pending.resolve(msg.result);
              this.pendingCommands.delete(msg.commandId);
            }
          }
        } catch (err) {
          logger.error({ err }, 'WebSocket message parse error');
        }
      });

      this.ws.on('close', () => {
        this.wsReady = false;
        logger.warn('WebSocket disconnected');
        // Reject all pending commands
        for (const [id, pending] of this.pendingCommands) {
          pending.reject(new Error('WebSocket disconnected'));
          this.pendingCommands.delete(id);
        }
      });

      this.ws.on('error', (err: Error) => {
        logger.error({ err }, 'WebSocket error');
        this.wsReady = false;
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to connect WebSocket, using HTTP polling');
    }
  }

  /**
   * List all devices for the current user
   */
  async listDevices(): Promise<DeviceSummary[]> {
    const response = await this.http.get<{ data: { devices: DeviceSummary[] } }>('/devices');
    return response.data.data.devices;
  }

  /**
   * Interpret natural language text via server AI
   */
  async interpret(text: string): Promise<{
    success: boolean;
    intent?: { type: string; params?: Record<string, unknown>; confidence: number; source: string };
    suggestions?: string[];
  }> {
    const response = await this.http.post('/interpret', { text });
    return response.data;
  }

  /**
   * Interpret AND execute in one call
   */
  async interpretAndExecute(text: string, deviceId?: string, context?: string): Promise<{
    success: boolean;
    intent?: { type: string; params?: Record<string, unknown>; confidence: number; source: string };
    result?: unknown;
    formattedResponse?: string;
    allChunks?: string[];
    needsClarification?: boolean;
    suggestions?: string[];
    error?: string;
  }> {
    const response = await this.http.post('/interpret-and-execute', { text, deviceId, context });
    return response.data;
  }

  /**
   * Send a command to a device and wait for the result
   * Uses WebSocket for real-time if available, falls back to HTTP polling
   */
  async sendCommand(
    deviceId: string,
    type: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    // Create command
    const createResponse = await this.http.post<{
      success: boolean;
      command?: { id: string };
      data?: { command?: { id: string } };
      error?: { message: string };
    }>(
      '/commands',
      { deviceId, type, params },
    );

    // Handle both response formats (direct or wrapped)
    const commandId = createResponse.data.command?.id
      ?? createResponse.data.data?.command?.id;

    if (!commandId) {
      throw new Error('Failed to create command: ' + JSON.stringify(createResponse.data));
    }

    // Try WebSocket first for real-time result
    if (this.wsReady && this.ws) {
      try {
        const result = await this.waitForResultViaWebSocket(commandId, 120_000);
        return result;
      } catch (err) {
        logger.warn({ err, commandId }, 'WebSocket wait failed, falling back to polling');
      }
    }

    // Fallback: HTTP polling
    return this.pollForResult(commandId);
  }

  /**
   * Wait for command result via WebSocket (real-time)
   */
  private waitForResultViaWebSocket(commandId: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Command timed out via WebSocket'));
      }, timeoutMs);

      this.pendingCommands.set(commandId, {
        resolve: (result: unknown) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      // Notify server to start watching this command
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({
          type: 'command:watch',
          commandId,
        }));
      }
    });
  }

  /**
   * Poll for command result via HTTP (fallback)
   */
  private async pollForResult(commandId: string): Promise<unknown> {
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const detailResponse = await this.http.get<{
        success: boolean;
        data?: { result: CommandResult | null; command: { status: string } };
        command?: { status: string };
        result?: CommandResult | null;
      }>(`/commands/${commandId}`);

      const data = detailResponse.data;
      // Handle both response formats
      const result = data.result ?? data.data?.result ?? null;
      const command = data.command ?? data.data?.command;

      if (result) {
        if (result.status === 'completed') {
          return result.output;
        }
        if (result.status === 'failed') {
          throw new Error(result.error?.message ?? 'Command failed');
        }
      }

      if (command?.status === 'cancelled') {
        throw new Error('Command was cancelled');
      }
    }

    throw new Error('Command timed out waiting for result');
  }

  /**
   * Set user AI configuration
   */
  async setUserAIConfig(config: { provider?: string; model?: string; apiKey?: string }): Promise<void> {
    await this.http.post('/user-ai-config', config);
  }

  /**
   * Delete user AI configuration
   */
  async deleteUserAIConfig(): Promise<void> {
    await this.http.delete('/user-ai-config');
  }
}
