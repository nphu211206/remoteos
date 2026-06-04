/**
 * Server Client
 *
 * HTTP client for communicating with the RemoteOS relay server.
 * Handles retries, timeouts, and error mapping.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type {
  DeviceRegisterRequest,
  DeviceRegisterResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  PollRequest,
  PollResponse,
  CommandResultRequest,
} from '@remoteos/shared';
import { logger } from '../config/logger.js';

export class ServerClient {
  private http: AxiosInstance;

  constructor(serverUrl: string) {
    this.http = axios.create({
      baseURL: `${serverUrl}/api/v1`,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'RemoteOS-Agent/0.1.0',
      },
    });

    // Response interceptor for logging
    this.http.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        logger.error({
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
        }, 'Server request failed');
        throw error;
      },
    );
  }

  /**
   * Register the agent with the server
   */
  async register(request: DeviceRegisterRequest): Promise<DeviceRegisterResponse> {
    const response = await this.http.post<DeviceRegisterResponse>(
      '/devices/register',
      request,
    );
    return response.data;
  }

  /**
   * Send heartbeat with current device state
   */
  async heartbeat(request: HeartbeatRequest): Promise<HeartbeatResponse> {
    const response = await this.http.post<HeartbeatResponse>(
      '/device/heartbeat',
      request,
    );
    return response.data;
  }

  /**
   * Poll for pending commands
   */
  async poll(request: PollRequest): Promise<PollResponse> {
    const response = await this.http.post<{ success: boolean; data: PollResponse }>(
      '/device/poll',
      request,
    );
    return response.data.data;
  }

  /**
   * Submit command execution result
   */
  async submitResult(commandId: string, request: CommandResultRequest): Promise<void> {
    await this.http.post(
      `/commands/${commandId}/result`,
      request,
    );
  }
}
