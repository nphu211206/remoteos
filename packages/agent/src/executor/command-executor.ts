/**
 * Command Executor — Central Command Router
 *
 * Routes commands to the appropriate handler module.
 * Each command type has a dedicated handler for clean separation.
 *
 * Supported commands:
 * - System: status, system_info, lock_screen
 * - Processes: process_list, process_kill
 * - Screen: screenshot
 * - Files: file_download, file_list
 * - Shell: shell
 * - Control: set_volume, get_clipboard, set_clipboard
 * - Notifications: notify
 */

import type { Command, CommandOutput } from '@remoteos/shared';
import { logger } from '../config/logger.js';
import { SystemMonitor } from '../modules/system-monitor.js';
import { ProcessManager } from '../modules/process-manager.js';
import { ScreenshotManager } from '../modules/screenshot-manager.js';
import { FileManager } from '../modules/file-manager.js';
import { ShellExecutor } from '../modules/shell-executor.js';
import { NotificationManager } from '../modules/notification-manager.js';
import { VolumeController, ClipboardManager, ScreenLocker } from '../modules/system-control.js';
import { AppLauncher } from '../modules/app-launcher.js';
import { config } from '../config/index.js';

export class CommandExecutor {
  private monitor: SystemMonitor;
  private processManager: ProcessManager;
  private screenshotManager: ScreenshotManager;
  private fileManager: FileManager;
  private shellExecutor: ShellExecutor;
  private notificationManager: NotificationManager;
  private volumeController: VolumeController;
  private clipboardManager: ClipboardManager;
  private screenLocker: ScreenLocker;
  private appLauncher: AppLauncher;

  constructor() {
    this.monitor = new SystemMonitor();
    this.processManager = new ProcessManager();
    this.screenshotManager = new ScreenshotManager();
    this.fileManager = new FileManager();
    this.shellExecutor = new ShellExecutor();
    this.notificationManager = new NotificationManager();
    this.volumeController = new VolumeController();
    this.clipboardManager = new ClipboardManager();
    this.screenLocker = new ScreenLocker();
    this.appLauncher = new AppLauncher();
  }

  /**
   * Execute a command and return the output
   */
  async execute(command: Command): Promise<CommandOutput> {
    logger.info({ type: command.type, id: command.id }, 'Executing command');

    switch (command.type) {
      // ─── System Monitoring ───────────────────────────────────
      case 'status':
        return this.executeStatus(command);
      case 'system_info':
        return this.executeSystemInfo(command);

      // ─── Process Management ──────────────────────────────────
      case 'process_list':
        return this.processManager.listProcesses();
      case 'process_kill': {
        const killResult = await this.processManager.killProcess(command.params);
        return { commandType: 'process_kill', ...killResult };
      }

      // ─── Screen ──────────────────────────────────────────────
      case 'screenshot':
        return this.executeScreenshot(command);

      // ─── File Operations ─────────────────────────────────────
      case 'file_download':
        return this.fileManager.downloadFile(command.params);
      case 'file_list':
        return this.fileManager.listFiles(command.params);

      // ─── Shell ───────────────────────────────────────────────
      case 'shell':
        return this.executeShell(command);

      // ─── Notifications ───────────────────────────────────────
      case 'notify':
        return this.notificationManager.notify(command.params);

      // ─── App Management ──────────────────────────────────────
      case 'app_launch':
        return this.executeAppLaunch(command);
      case 'app_close':
        return this.executeAppClose(command);
      case 'app_list':
        return this.executeAppList();

      // ─── System Control ──────────────────────────────────────
      case 'lock_screen':
        return this.executeLockScreen();
      case 'set_volume':
        return this.executeSetVolume(command);
      case 'get_clipboard':
        return this.executeGetClipboard();
      case 'set_clipboard':
        return this.executeSetClipboard(command);

      // ─── Unknown ─────────────────────────────────────────────
      default:
        throw new Error(`Unknown command type: ${command.type}`);
    }
  }

  // ─── System Monitoring ──────────────────────────────────────────

  private async executeStatus(_command: Command): Promise<CommandOutput> {
    const state = await this.monitor.collectState('self');
    const sysInfo = await this.monitor.collectSystemInfo();

    return {
      commandType: 'status',
      cpu: {
        usage: state.cpuUsage,
        model: sysInfo.cpuModel,
        cores: sysInfo.cpuCores,
        speed: sysInfo.cpuSpeed,
      },
      ram: {
        usedGb: Math.round((state.ramUsage / 100) * sysInfo.totalRamGb * 10) / 10,
        totalGb: sysInfo.totalRamGb,
        usagePercent: state.ramUsage,
      },
      disk: {
        usedGb: Math.round((state.diskUsage / 100) * sysInfo.totalDiskGb * 10) / 10,
        totalGb: sysInfo.totalDiskGb,
        usagePercent: state.diskUsage,
      },
      network: {
        downMbps: state.networkDownMbps,
        upMbps: state.networkUpMbps,
        latencyMs: 0,
      },
      uptime: {
        seconds: state.uptimeSeconds,
        formatted: formatUptime(state.uptimeSeconds),
      },
      processes: {
        total: state.processCount,
        top5: [],
      },
      battery: {
        percent: state.batteryPercent,
        isCharging: state.isCharging,
      },
      temperature: {
        cpu: state.cpuTemp,
        gpu: state.gpuTemp,
      },
    };
  }

  private async executeSystemInfo(_command: Command): Promise<CommandOutput> {
    const info = await this.monitor.collectSystemInfo();
    return {
      commandType: 'system_info',
      ...info,
    };
  }

  // ─── Screen ─────────────────────────────────────────────────────

  private async executeScreenshot(command: Command): Promise<CommandOutput> {
    if (!config.features.allowScreenshot) {
      throw new Error('Screenshot is disabled by configuration');
    }
    return this.screenshotManager.capture();
  }

  // ─── Shell ──────────────────────────────────────────────────────

  private async executeShell(command: Command): Promise<CommandOutput> {
    if (!config.features.allowShell) {
      throw new Error('Shell execution is disabled by configuration');
    }

    const shellCommand = command.params.command as string;
    if (!shellCommand) {
      throw new Error('Missing required parameter: command');
    }

    return this.shellExecutor.execute(shellCommand);
  }

  // ─── System Control ─────────────────────────────────────────────

  private async executeLockScreen(): Promise<CommandOutput> {
    await this.screenLocker.lockScreen();
    return {
      commandType: 'lock_screen',
      success: true,
      message: 'Screen locked',
    };
  }

  private async executeSetVolume(command: Command): Promise<CommandOutput> {
    const params = command.params;

    if (typeof params.level === 'number') {
      const result = await this.volumeController.setVolume(params.level as number);
      return {
        commandType: 'set_volume',
        ...result,
      };
    }

    if (params.action === 'up') {
      const result = await this.volumeController.volumeUp((params.step as number) ?? 10);
      return { commandType: 'set_volume', ...result };
    }

    if (params.action === 'down') {
      const result = await this.volumeController.volumeDown((params.step as number) ?? 10);
      return { commandType: 'set_volume', ...result };
    }

    if (params.action === 'mute') {
      const result = await this.volumeController.toggleMute();
      return { commandType: 'set_volume', ...result };
    }

    // Default: get current volume
    const result = await this.volumeController.getVolume();
    return { commandType: 'set_volume', ...result };
  }

  private async executeGetClipboard(): Promise<CommandOutput> {
    const content = await this.clipboardManager.getClipboard();
    return {
      commandType: 'get_clipboard',
      content,
      length: content.length,
    };
  }

  private async executeSetClipboard(command: Command): Promise<CommandOutput> {
    const text = command.params.text as string;
    if (!text) {
      throw new Error('Missing required parameter: text');
    }

    await this.clipboardManager.setClipboard(text);
    return {
      commandType: 'set_clipboard',
      success: true,
      length: text.length,
    };
  }

  // ─── App Management ─────────────────────────────────────────────

  private async executeAppLaunch(command: Command): Promise<CommandOutput> {
    const appName = command.params.name as string || command.params.app as string;
    if (!appName) {
      throw new Error('Missing required parameter: name');
    }

    const result = await this.appLauncher.launch(appName);
    return {
      commandType: 'app_launch',
      ...result,
      appName,
    };
  }

  private async executeAppClose(command: Command): Promise<CommandOutput> {
    const appName = command.params.name as string || command.params.app as string;
    if (!appName) {
      throw new Error('Missing required parameter: name');
    }

    const result = await this.appLauncher.close(appName);
    return {
      commandType: 'app_close',
      ...result,
      appName,
    };
  }

  private async executeAppList(): Promise<CommandOutput> {
    const apps = this.appLauncher.getAvailableApps();
    return {
      commandType: 'app_list',
      apps,
      total: apps.length,
    };
  }
}

// ─── Utility ──────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}
