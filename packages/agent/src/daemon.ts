/**
 * Agent Daemon — Core Orchestrator
 *
 * Manages the agent lifecycle:
 * 1. Register with server (with retry)
 * 2. Start heartbeat loop
 * 3. Start command polling loop
 * 4. Execute commands and return results
 */

import type { Command, CommandResult } from '@remoteos/shared';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { ServerClient } from './client/server-client.js';
import { SystemMonitor } from './modules/system-monitor.js';
import { CommandExecutor } from './executor/command-executor.js';

const MAX_REGISTER_RETRIES = 10;
const REGISTER_RETRY_DELAY_MS = 3000;

export class AgentDaemon {
  private client: ServerClient;
  private monitor: SystemMonitor;
  private executor: CommandExecutor;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sessionToken: string | null = null;
  private isRunning = false;

  constructor() {
    this.client = new ServerClient(config.server.url);
    this.monitor = new SystemMonitor();
    this.executor = new CommandExecutor();
  }

  /**
   * Start the agent daemon
   */
  async start(): Promise<void> {
    logger.info('Agent daemon starting...');

    // Step 1: Collect system info
    const sysInfo = await this.monitor.collectSystemInfo();
    logger.info({
      os: sysInfo.os,
      hostname: sysInfo.hostname,
      cpuModel: sysInfo.cpuModel,
      totalRamGb: sysInfo.totalRamGb,
    }, 'System info collected');

    // Step 2: Register with server (with retry)
    await this.registerWithRetry();

    // Step 3: Start heartbeat loop
    this.startHeartbeat();

    // Step 4: Start command polling loop
    this.startPolling();

    this.isRunning = true;
    logger.info('✅ Agent daemon started successfully');
    logger.info('   Polling for commands every ' + config.timing.pollIntervalMs + 'ms');
    logger.info('   Heartbeat every ' + config.timing.heartbeatIntervalMs + 'ms');
  }

  /**
   * Stop the agent daemon
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    logger.info('Agent daemon stopped');
  }

  /**
   * Register with retry logic
   */
  private async registerWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_REGISTER_RETRIES; attempt++) {
      try {
        logger.info({ attempt, max: MAX_REGISTER_RETRIES }, 'Registering with server...');
        await this.register();
        return; // Success
      } catch (err) {
        const isLastAttempt = attempt === MAX_REGISTER_RETRIES;
        const isConnectionError = err instanceof Error && (
          err.message.includes('ECONNREFUSED') ||
          err.message.includes('fetch failed') ||
          err.message.includes('Network Error')
        );

        if (isLastAttempt) {
          logger.fatal({ err }, '❌ Failed to register after all retries');
          logger.fatal('   Make sure the server is running: pnpm dev:server');
          process.exit(1);
        }

        if (isConnectionError) {
          logger.warn(
            { attempt, max: MAX_REGISTER_RETRIES, delayMs: REGISTER_RETRY_DELAY_MS },
            '⚠️ Server not ready, retrying...',
          );
        } else {
          logger.warn(
            { attempt, max: MAX_REGISTER_RETRIES, delayMs: REGISTER_RETRY_DELAY_MS, err },
            '⚠️ Registration failed, retrying...',
          );
        }

        await new Promise((resolve) => setTimeout(resolve, REGISTER_RETRY_DELAY_MS));
      }
    }
  }

  /**
   * Register with the relay server
   */
  private async register(): Promise<void> {
    const sysInfo = await this.monitor.collectSystemInfo();

    const response = await this.client.register({
      device: {
        id: config.device.id,
        name: config.device.name,
        os: sysInfo.os,
        osVersion: sysInfo.osVersion,
        hostname: sysInfo.hostname,
        agentVersion: '0.1.0',
        localIp: sysInfo.localIp,
        cpuModel: sysInfo.cpuModel,
        cpuCores: sysInfo.cpuCores,
        totalRamGb: sysInfo.totalRamGb,
        totalDiskGb: sysInfo.totalDiskGb,
      },
      registrationToken: config.server.registrationCode,
    });

    if (!response.success) {
      throw new Error('Registration failed: ' + response.error);
    }

    this.sessionToken = response.sessionToken!;
    logger.info({ deviceId: response.deviceId }, '✅ Registered successfully');
  }

  /**
   * Start the heartbeat loop
   */
  private startHeartbeat(): void {
    const sendHeartbeat = async () => {
      if (!this.sessionToken) return;

      try {
        const state = await this.monitor.collectState(config.device.id);
        await this.client.heartbeat({
          deviceId: config.device.id,
          sessionToken: this.sessionToken,
          state,
        });
      } catch (err) {
        logger.warn({ err }, 'Heartbeat failed');
      }
    };

    // Send first heartbeat immediately
    sendHeartbeat();

    // Then schedule recurring
    this.heartbeatTimer = setInterval(sendHeartbeat, config.timing.heartbeatIntervalMs);
  }

  /**
   * Start the command polling loop
   */
  private startPolling(): void {
    this.pollTimer = setInterval(async () => {
      if (!this.sessionToken) return;

      try {
        const response = await this.client.poll({
          deviceId: config.device.id,
          sessionToken: this.sessionToken,
        });

        if (response.hasCommands) {
          logger.info({ count: response.commands.length }, '📥 Received commands');
          for (const command of response.commands) {
            // Execute each command (non-blocking)
            this.executeCommand(command).catch((err) => {
              logger.error({ err, commandId: command.id }, 'Command execution error');
            });
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Poll failed');
      }
    }, config.timing.pollIntervalMs);
  }

  /**
   * Execute a single command and submit the result
   */
  private async executeCommand(command: Command): Promise<void> {
    const startTime = Date.now();
    logger.info({ commandId: command.id, type: command.type }, '⚡ Executing command');

    let result: CommandResult;

    try {
      const output = await this.executor.execute(command);
      result = {
        commandId: command.id,
        deviceId: config.device.id,
        status: 'completed',
        output,
        executionTimeMs: Date.now() - startTime,
        executedAt: new Date(),
      };
    } catch (err) {
      result = {
        commandId: command.id,
        deviceId: config.device.id,
        status: 'failed',
        error: {
          code: 'EXECUTION_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
          retryable: false,
        },
        executionTimeMs: Date.now() - startTime,
        executedAt: new Date(),
      };
    }

    // Submit result back to server
    if (this.sessionToken) {
      try {
        await this.client.submitResult(command.id, {
          deviceId: config.device.id,
          sessionToken: this.sessionToken,
          result,
        });
        logger.info({
          commandId: command.id,
          status: result.status,
          executionTimeMs: result.executionTimeMs,
        }, '📤 Command result submitted');
      } catch (err) {
        logger.error({ err, commandId: command.id }, 'Failed to submit command result');
      }
    }
  }
}
