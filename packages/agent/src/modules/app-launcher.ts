/**
 * App Launcher Module
 *
 * Launches applications on the host machine.
 * Supports:
 * - Windows: Start Menu apps, .exe paths, URL protocols
 * - macOS: open -a
 * - Linux: xdg-open, gtk-launch
 *
 * Features:
 * - Common app name mapping (garena, chrome, vscode, etc.)
 * - Fuzzy matching for app names
 * - Launch via shell command
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

// ─── Common App Mappings ──────────────────────────────────────────

const APP_MAPPINGS: Record<string, Record<string, string>> = {
  win32: {
    // Browsers
    'chrome': 'start chrome',
    'google chrome': 'start chrome',
    'firefox': 'start firefox',
    'edge': 'start msedge',
    'microsoft edge': 'start msedge',
    'brave': 'start brave',
    'opera': 'start opera',

    // Development
    'vscode': 'start code',
    'visual studio code': 'start code',
    'code': 'start code',
    'sublime': 'start sublime_text',
    'notepad++': 'start notepad++',
    'git': 'start git-bash',

    // Gaming
    'garena': 'start "" "C:\\Program Files (x86)\\Garena\\Garena\\Garena.exe"',
    'steam': 'start steam',
    'epic': 'start com.epicgames.launcher',
    'epic games': 'start com.epicgames.launcher',
    'origin': 'start origin',
    'ea': 'start origin',
    'battle.net': 'start battle.net',
    'blizzard': 'start battle.net',
    'roblox': 'start roblox',
    'minecraft': 'start minecraft',
    'league of legends': 'start "" "C:\\Riot Games\\Riot Client\\RiotClientServices.exe"',
    'lol': 'start "" "C:\\Riot Games\\Riot Client\\RiotClientServices.exe"',
    'valorant': 'start "" "C:\\Riot Games\\Riot Client\\RiotClientServices.exe"',

    // Communication
    'discord': 'start discord',
    'telegram': 'start telegram',
    'zalo': 'start zalo',
    'skype': 'start skype',
    'teams': 'start msteams',
    'zoom': 'start zoom',

    // Media
    'spotify': 'start spotify',
    'vlc': 'start vlc',
    'mpc': 'start mpc-hc64',
    'photoshop': 'start photoshop',
    'illustrator': 'start illustrator',
    'premiere': 'start premiere',

    // Office
    'word': 'start winword',
    'excel': 'start excel',
    'powerpoint': 'start powerpnt',
    'outlook': 'start outlook',
    'onenote': 'start onenote',

    // Utilities
    'calculator': 'start calc',
    'notepad': 'start notepad',
    'explorer': 'start explorer',
    'task manager': 'start taskmgr',
    'cmd': 'start cmd',
    'terminal': 'start wt',
    'powershell': 'start powershell',

    // Files & URLs
    'downloads': 'start "" "%USERPROFILE%\\Downloads"',
    'documents': 'start "" "%USERPROFILE%\\Documents"',
    'desktop': 'start "" "%USERPROFILE%\\Desktop"',
  },
  darwin: {
    'chrome': 'open -a "Google Chrome"',
    'firefox': 'open -a Firefox',
    'safari': 'open -a Safari',
    'vscode': 'open -a "Visual Studio Code"',
    'code': 'open -a "Visual Studio Code"',
    'terminal': 'open -a Terminal',
    'finder': 'open -a Finder',
    'spotify': 'open -a Spotify',
    'discord': 'open -a Discord',
    'telegram': 'open -a Telegram',
    'slack': 'open -a Slack',
    'zoom': 'open -a zoom.us',
    'calculator': 'open -a Calculator',
    'notes': 'open -a Notes',
  },
  linux: {
    'chrome': 'google-chrome',
    'firefox': 'firefox',
    'vscode': 'code',
    'code': 'code',
    'terminal': 'gnome-terminal',
    'files': 'nautilus',
    'spotify': 'spotify',
    'discord': 'discord',
    'telegram': 'telegram-desktop',
    'calculator': 'gnome-calculator',
    'settings': 'gnome-control-center',
    'gimp': 'gimp',
    'vlc': 'vlc',
  },
};

// ─── App Launcher ─────────────────────────────────────────────────

export class AppLauncher {
  /**
   * Launch an application by name
   */
  async launch(appName: string): Promise<{ success: boolean; message: string }> {
    const platform = process.platform as 'win32' | 'darwin' | 'linux';
    const normalized = appName.toLowerCase().trim();

    logger.info({ appName: normalized, platform }, 'Attempting to launch app');

    // Check common app mappings first
    const platformMappings = APP_MAPPINGS[platform] ?? {};

    // Try exact match
    if (platformMappings[normalized]) {
      return this.executeCommand(platformMappings[normalized], normalized);
    }

    // Try partial match
    for (const [key, command] of Object.entries(platformMappings)) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return this.executeCommand(command, normalized);
      }
    }

    // Try direct execution (user might provide full path or command)
    if (platform === 'win32') {
      return this.executeCommand(`start "" "${normalized}"`, normalized);
    } else if (platform === 'darwin') {
      return this.executeCommand(`open -a "${normalized}"`, normalized);
    } else {
      return this.executeCommand(normalized, normalized);
    }
  }

  /**
   * List available apps (for suggestions)
   */
  getAvailableApps(): string[] {
    const platform = process.platform as 'win32' | 'darwin' | 'linux';
    const mappings = APP_MAPPINGS[platform] ?? {};
    return Object.keys(mappings).sort();
  }

  /**
   * Execute the launch command
   */
  private async executeCommand(command: string, appName: string): Promise<{ success: boolean; message: string }> {
    try {
      logger.info({ command, appName }, 'Launching app');
      await execAsync(command, { timeout: 10_000, windowsHide: false });
      return { success: true, message: `Đã mở ${appName}` };
    } catch (err) {
      logger.warn({ err, command, appName }, 'Failed to launch app');
      return {
        success: false,
        message: `Không thể mở ${appName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Close an application by name
   */
  async close(appName: string): Promise<{ success: boolean; message: string }> {
    const platform = process.platform;
    const normalized = appName.toLowerCase().trim();

    try {
      if (platform === 'win32') {
        // Try to find and kill the process
        const { stdout } = await execAsync('tasklist /FO CSV /NH', { timeout: 10_000 });
        const lines = stdout.split('\n');
        const matchingProcs = lines.filter((line) =>
          line.toLowerCase().includes(normalized),
        );

        if (matchingProcs.length === 0) {
          return { success: false, message: `Không tìm thấy tiến trình ${appName}` };
        }

        // Kill matching processes
        for (const line of matchingProcs.slice(0, 5)) {
          const parts = line.split(',');
          if (parts.length >= 2) {
            const pid = parts[1]?.replace(/"/g, '');
            if (pid) {
              await execAsync(`taskkill /F /PID ${pid}`, { timeout: 5000 });
            }
          }
        }

        return { success: true, message: `Đã đóng ${appName}` };
      } else if (platform === 'darwin') {
        await execAsync(`pkill -f "${normalized}"`, { timeout: 5000 });
        return { success: true, message: `Đã đóng ${appName}` };
      } else {
        await execAsync(`pkill -f "${normalized}"`, { timeout: 5000 });
        return { success: true, message: `Đã đóng ${appName}` };
      }
    } catch (err) {
      return {
        success: false,
        message: `Không thể đóng ${appName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }
}
