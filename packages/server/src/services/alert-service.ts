/**
 * Alert Service — Proactive System Monitoring
 *
 * Monitors device state and sends Telegram alerts when thresholds are exceeded.
 * Features:
 * - CPU/RAM/Disk/Temperature monitoring
 * - Configurable thresholds per user
 * - Cooldown periods to prevent alert spam
 * - Rich alert messages with suggestions
 * - Alert history tracking
 */

import { eq, and } from 'drizzle-orm';
import axios from 'axios';
import { getDatabase, schema } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { formatProgressBar, formatPercent } from '@remoteos/shared/utils';

// ─── Alert Thresholds ─────────────────────────────────────────────

interface AlertThresholds {
  cpuHigh: number;
  ramHigh: number;
  diskLow: number;
  tempHigh: number;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  cpuHigh: 90,
  ramHigh: 90,
  diskLow: 10,
  tempHigh: 85,
};

// Cooldown in milliseconds
const COOLDOWN_MS = {
  cpu_high: 15 * 60 * 1000,      // 15 minutes
  ram_high: 15 * 60 * 1000,
  disk_low: 60 * 60 * 1000,      // 1 hour
  temp_high: 5 * 60 * 1000,
  agent_offline: 5 * 60 * 1000,
};

// ─── Alert Types ──────────────────────────────────────────────────

type AlertType = 'cpu_high' | 'ram_high' | 'disk_low' | 'temp_high' | 'agent_offline';

interface AlertState {
  lastFiredAt: Map<string, number>; // key: "alertType:deviceId"
}

// ─── Alert Service ────────────────────────────────────────────────

export class AlertService {
  private alertState: AlertState = {
    lastFiredAt: new Map(),
  };

  private thresholds: AlertThresholds = DEFAULT_THRESHOLDS;

  /**
   * Check all devices and fire alerts if needed
   */
  async checkAllDevices(): Promise<void> {
    try {
      const db = getDatabase();
      const devices = await db.query.devices.findMany({
        with: { state: true, user: true },
      });

      for (const device of devices) {
        if (!device.state) continue;

        // Check if agent is offline (no heartbeat for 30+ seconds)
        const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
        const now = Date.now();
        if (now - lastSeen > 30_000 && device.status !== 'offline') {
          await this.fireAlert('agent_offline', device.id, device.userId, {
            deviceName: device.name,
            lastSeenAt: device.lastSeenAt,
          });
          continue;
        }

        if (device.status === 'offline') continue;

        // Check CPU
        if (device.state.cpuUsage > this.thresholds.cpuHigh) {
          await this.fireAlert('cpu_high', device.id, device.userId, {
            deviceName: device.name,
            value: device.state.cpuUsage,
            threshold: this.thresholds.cpuHigh,
          });
        }

        // Check RAM
        if (device.state.ramUsage > this.thresholds.ramHigh) {
          await this.fireAlert('ram_high', device.id, device.userId, {
            deviceName: device.name,
            value: device.state.ramUsage,
            threshold: this.thresholds.ramHigh,
          });
        }

        // Check Disk
        const diskFree = 100 - device.state.diskUsage;
        if (diskFree < this.thresholds.diskLow) {
          await this.fireAlert('disk_low', device.id, device.userId, {
            deviceName: device.name,
            value: device.state.diskUsage,
            threshold: this.thresholds.diskLow,
          });
        }

        // Check Temperature
        if (device.state.cpuTemp && device.state.cpuTemp > this.thresholds.tempHigh) {
          await this.fireAlert('temp_high', device.id, device.userId, {
            deviceName: device.name,
            value: device.state.cpuTemp,
            threshold: this.thresholds.tempHigh,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, 'Alert check failed');
    }
  }

  /**
   * Fire an alert if cooldown has passed
   */
  private async fireAlert(
    type: AlertType,
    deviceId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const key = `${type}:${deviceId}`;
    const now = Date.now();
    const lastFired = this.alertState.lastFiredAt.get(key) ?? 0;
    const cooldown = COOLDOWN_MS[type] ?? 5 * 60 * 1000;

    if (now - lastFired < cooldown) return;

    this.alertState.lastFiredAt.set(key, now);

    // Get user's Telegram ID
    const db = getDatabase();
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user) return;

    const message = this.formatAlertMessage(type, data);
    await this.sendTelegramAlert(user.telegramId, message);

    logger.info({ type, deviceId, userId }, 'Alert fired');
  }

  /**
   * Format alert message based on type
   */
  private formatAlertMessage(type: AlertType, data: Record<string, unknown>): string {
    const deviceName = data.deviceName as string;

    switch (type) {
      case 'cpu_high': {
        const value = data.value as number;
        const threshold = data.threshold as number;
        return [
          '⚠️ *CPU ALERT*',
          '',
          `🖥️ Máy tính: *${deviceName}*`,
          `🔲 CPU đang ở *${value.toFixed(1)}%* (ngưỡng: ${threshold}%)`,
          '',
          formatProgressBar(value, 15) + ' ' + formatPercent(value),
          '',
          '💡 *Đề xuất:*',
          '• Đóng ứng dụng không cần thiết',
          '• Kiểm tra tiến trình bằng `/processes`',
          '• Chụp màn hình để xem đang chạy gì: `/screenshot`',
        ].join('\n');
      }

      case 'ram_high': {
        const value = data.value as number;
        const threshold = data.threshold as number;
        return [
          '⚠️ *RAM ALERT*',
          '',
          `🖥️ Máy tính: *${deviceName}*`,
          `💾 RAM đang ở *${value.toFixed(1)}%* (ngưỡng: ${threshold}%)`,
          '',
          formatProgressBar(value, 15) + ' ' + formatPercent(value),
          '',
          '💡 *Đề xuất:*',
          '• Đóng tab Chrome không cần thiết',
          '• Restart ứng dụng bị rò rỉ bộ nhớ',
          '• Xem tiến trình: `/processes`',
        ].join('\n');
      }

      case 'disk_low': {
        const value = data.value as number;
        return [
          '🔴 *DISK ALERT*',
          '',
          `🖥️ Máy tính: *${deviceName}*`,
          `💿 Disk gần đầy! Đã dùng *${value.toFixed(1)}%*`,
          '',
          formatProgressBar(value, 15) + ' ' + formatPercent(value),
          '',
          '💡 *Đề xuất:*',
          '• Xóa file tạm: Windows Settings → Storage',
          '• Dọn thùng rác',
          '• Gỡ ứng dụng không dùng',
        ].join('\n');
      }

      case 'temp_high': {
        const value = data.value as number;
        const threshold = data.threshold as number;
        return [
          '🌡️ *TEMPERATURE ALERT*',
          '',
          `🖥️ Máy tính: *${deviceName}*`,
          `🔥 CPU nhiệt độ: *${value}°C* (ngưỡng: ${threshold}°C)`,
          '',
          '💡 *Đề xuất:*',
          '• Kiểm tra quạt tản nhiệt',
          '• Đóng ứng dụng nặng (game, render)',
          '• Giảm tải CPU',
        ].join('\n');
      }

      case 'agent_offline': {
        return [
          '🔌 *AGENT OFFLINE*',
          '',
          `🖥️ Máy tính: *${deviceName}*`,
          `⏰ Mất kết nối từ server`,
          '',
          '💡 *Đề xuất:*',
          '• Kiểm tra máy tính có bật không',
          '• Kiểm tra kết nối mạng',
          '• Khởi động lại RemoteOS Agent',
        ].join('\n');
      }

      default:
        return `⚠️ Alert: ${type} on ${deviceName}`;
    }
  }

  /**
   * Send alert via Telegram
   */
  private async sendTelegramAlert(telegramId: number, text: string): Promise<void> {
    if (!config.telegram.botToken) return;

    try {
      await axios.post(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
        chat_id: telegramId,
        text,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      logger.error({ err, telegramId }, 'Failed to send Telegram alert');
    }
  }

  /**
   * Start periodic alert checking
   */
  startMonitoring(intervalMs = 30_000): void {
    logger.info({ intervalMs }, 'Starting alert monitoring');

    // First check after 10 seconds
    setTimeout(() => this.checkAllDevices(), 10_000);

    // Then check periodically
    setInterval(() => this.checkAllDevices(), intervalMs);
  }
}
