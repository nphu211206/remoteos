/**
 * Server Client for Bot
 *
 * Communicates with the RemoteOS relay server API.
 */

import axios, { type AxiosInstance } from 'axios';
import type { DeviceSummary, CommandResult } from '@remoteos/shared';
import { logger } from '../config/logger.js';

export class ServerClient {
  private http: AxiosInstance;

  constructor(serverUrl: string) {
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
  async interpretAndExecute(text: string, deviceId?: string): Promise<{
    success: boolean;
    intent?: { type: string; params?: Record<string, unknown>; confidence: number; source: string };
    result?: unknown;
    formattedResponse?: string;
    allChunks?: string[];
    needsClarification?: boolean;
    suggestions?: string[];
    error?: string;
  }> {
    const response = await this.http.post('/interpret-and-execute', { text, deviceId });
    return response.data;
  }

  /**
   * Send a command to a device and wait for the result
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

    // Poll for result (simple approach — will be replaced with WebSocket)
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
}
