/**
 * System Monitor
 *
 * Collects hardware and software information from the host machine.
 * Uses `systeminformation` for cross-platform compatibility.
 */

import os from 'node:os';
import si from 'systeminformation';
import type { DeviceState, DeviceOS } from '@remoteos/shared';
import { logger } from '../config/logger.js';

/** Static system info (collected once at startup) */
export interface SystemInfo {
  os: DeviceOS;
  osVersion: string;
  hostname: string;
  localIp: string;
  cpuModel: string;
  cpuCores: number;
  cpuSpeed: number;
  totalRamGb: number;
  totalDiskGb: number;
  gpuModel: string | null;
}

export class SystemMonitor {
  private cachedSystemInfo: SystemInfo | null = null;

  /**
   * Detect the current operating system
   */
  private detectOS(): DeviceOS {
    const platform = os.platform();
    switch (platform) {
      case 'win32': return 'windows';
      case 'darwin': return 'macos';
      case 'linux': return 'linux';
      default: return 'unknown';
    }
  }

  /**
   * Collect static system information (cached after first call)
   */
  async collectSystemInfo(): Promise<SystemInfo> {
    if (this.cachedSystemInfo) return this.cachedSystemInfo;

    try {
      const [cpu, mem, diskLayout, osInfo, graphics] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.diskLayout(),
        si.osInfo(),
        si.graphics(),
      ]);

      // Get primary disk size
      const totalDiskBytes = diskLayout.reduce((sum, d) => sum + (d.size || 0), 0);

      // Get local IP
      const interfaces = os.networkInterfaces();
      let localIp = '127.0.0.1';
      for (const [, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
          if (!addr.internal && addr.family === 'IPv4') {
            localIp = addr.address;
            break;
          }
        }
        if (localIp !== '127.0.0.1') break;
      }

      // Get GPU model
      const gpuModel = graphics.controllers.length > 0
        ? graphics.controllers[0]?.model ?? null
        : null;

      this.cachedSystemInfo = {
        os: this.detectOS(),
        osVersion: `${osInfo.distro ?? os.type()} ${osInfo.release ?? os.release()}`,
        hostname: os.hostname(),
        localIp,
        cpuModel: cpu.brand || cpu.manufacturer || 'Unknown',
        cpuCores: cpu.cores,
        cpuSpeed: cpu.speed,
        totalRamGb: Math.round(mem.total / (1024 * 1024 * 1024) * 10) / 10,
        totalDiskGb: Math.round(totalDiskBytes / (1024 * 1024 * 1024)),
        gpuModel,
      };

      logger.info(this.cachedSystemInfo, 'System info collected');
      return this.cachedSystemInfo;
    } catch (err) {
      logger.error({ err }, 'Failed to collect system info');
      // Fallback to basic os module
      return {
        os: this.detectOS(),
        osVersion: `${os.type()} ${os.release()}`,
        hostname: os.hostname(),
        localIp: '127.0.0.1',
        cpuModel: os.cpus()[0]?.model ?? 'Unknown',
        cpuCores: os.cpus().length,
        cpuSpeed: os.cpus()[0]?.speed ?? 0,
        totalRamGb: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10,
        totalDiskGb: 0,
        gpuModel: null,
      };
    }
  }

  /**
   * Collect real-time device state
   */
  async collectState(deviceId: string): Promise<DeviceState> {
    try {
      const [cpuLoad, mem, fsSize, networkStats, processes, battery, cpuTemp] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.processes(),
        si.battery().catch(() => ({ percent: null, isCharging: null })),
        si.cpuTemperature().catch(() => ({ main: null })),
      ]);

      // Get primary filesystem usage
      const primaryFs = fsSize[0];
      const diskUsedPercent = primaryFs ? primaryFs.use : 0;

      // Get network speed (sum of all interfaces)
      const netDown = networkStats.reduce((sum, n) => sum + (n.rx_sec || 0), 0);
      const netUp = networkStats.reduce((sum, n) => sum + (n.tx_sec || 0), 0);

      // Get GPU temperature
      let gpuTemp: number | null = null;
      try {
        const graphics = await si.graphics();
        if (graphics.controllers && graphics.controllers.length > 0) {
          gpuTemp = graphics.controllers[0]?.temperatureGpu ?? null;
        }
      } catch {
        // GPU temp not available on this system
      }

      return {
        deviceId,
        status: 'online',
        cpuUsage: Math.round(cpuLoad.currentLoad * 10) / 10,
        ramUsage: Math.round((1 - mem.available / mem.total) * 1000) / 10,
        diskUsage: Math.round(diskUsedPercent * 10) / 10,
        cpuTemp: cpuTemp.main ?? null,
        gpuTemp,
        networkDownMbps: Math.round(netDown / (1024 * 1024) * 100) / 100,
        networkUpMbps: Math.round(netUp / (1024 * 1024) * 100) / 100,
        uptimeSeconds: Math.floor(os.uptime()),
        processCount: processes.all,
        batteryPercent: battery.percent,
        isCharging: battery.isCharging,
        timestamp: new Date(),
      };
    } catch (err) {
      logger.error({ err }, 'Failed to collect state, returning fallback');
      return {
        deviceId,
        status: 'online',
        cpuUsage: 0,
        ramUsage: 0,
        diskUsage: 0,
        cpuTemp: null,
        gpuTemp: null,
        networkDownMbps: 0,
        networkUpMbps: 0,
        uptimeSeconds: Math.floor(os.uptime()),
        processCount: 0,
        batteryPercent: null,
        isCharging: null,
        timestamp: new Date(),
      };
    }
  }
}
