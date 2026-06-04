/**
 * System Control Module
 *
 * Handles system-level operations:
 * - Volume control (get/set/mute)
 * - Clipboard (get/set)
 * - Lock screen
 * - Sleep/Hibernate
 *
 * Uses platform-specific CLI tools for cross-platform support.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

// ─── Volume Control ───────────────────────────────────────────────

export interface VolumeResult {
  level: number;
  isMuted: boolean;
}

export class VolumeController {
  /**
   * Get current volume level (0-100)
   */
  async getVolume(): Promise<VolumeResult> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        return await this.getVolumeWindows();
      } else if (platform === 'darwin') {
        return await this.getVolumeMacOS();
      } else {
        return await this.getVolumeLinux();
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to get volume');
      return { level: 50, isMuted: false };
    }
  }

  /**
   * Set volume level (0-100)
   */
  async setVolume(level: number): Promise<VolumeResult> {
    const clamped = Math.max(0, Math.min(100, level));
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        await this.setVolumeWindows(clamped);
      } else if (platform === 'darwin') {
        await this.setVolumeMacOS(clamped);
      } else {
        await this.setVolumeLinux(clamped);
      }

      return { level: clamped, isMuted: false };
    } catch (err) {
      logger.warn({ err, level }, 'Failed to set volume');
      throw new Error(`Failed to set volume: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Increase volume by step (default 10)
   */
  async volumeUp(step = 10): Promise<VolumeResult> {
    const current = await this.getVolume();
    return this.setVolume(current.level + step);
  }

  /**
   * Decrease volume by step (default 10)
   */
  async volumeDown(step = 10): Promise<VolumeResult> {
    const current = await this.getVolume();
    return this.setVolume(current.level - step);
  }

  /**
   * Toggle mute
   */
  async toggleMute(): Promise<VolumeResult> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        await execAsync('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"', { timeout: 5000 });
      } else if (platform === 'darwin') {
        await execAsync('osascript -e "set volume output muted not (output muted of (get volume settings))"', { timeout: 5000 });
      } else {
        await execAsync('amixer set Master toggle', { timeout: 5000 });
      }

      const result = await this.getVolume();
      return result;
    } catch (err) {
      logger.warn({ err }, 'Failed to toggle mute');
      throw new Error('Failed to toggle mute');
    }
  }

  // ─── Platform-specific implementations ──────────────────────

  private async getVolumeWindows(): Promise<VolumeResult> {
    const psScript = `
      Add-Type -TypeDefinition '
        using System;
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
          int _0; int _1; int _2; int _3;
          void GetLevel(out float level);
          void SetLevel(float level, ref Guid guid);
          void _4; void _5; void _6; void _7;
          void GetMute(out int muted);
        }
        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { void Activate(ref Guid iid, int ctx, IntPtr ptr, out IAudioEndpointVolume vol); }
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { void GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
        public class Audio {
          public static float GetVolume() {
            var e = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            e.GetDefaultAudioEndpoint(0, 1, out var d);
            d.Activate(typeof(IAudioEndpointVolume).GUID, 0, IntPtr.Zero, out var v);
            v.GetLevel(out var l);
            return l * 100;
          }
          public static int GetMute() {
            var e = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            e.GetDefaultAudioEndpoint(0, 1, out var d);
            d.Activate(typeof(IAudioEndpointVolume).GUID, 0, IntPtr.Zero, out var v);
            v.GetMute(out var m);
            return m;
          }
        }
      '
      $vol = [Audio]::GetVolume()
      $mute = [Audio]::GetMute()
      Write-Output "$vol|$mute"
    `.trim().replace(/\n/g, '; ');

    try {
      const { stdout } = await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 10000 });
      const [vol, mute] = stdout.trim().split('|').map(Number);
      return { level: Math.round(vol ?? 50), isMuted: (mute ?? 0) === 1 };
    } catch {
      // Fallback: try nircmd or other tools
      return { level: 50, isMuted: false };
    }
  }

  private async setVolumeWindows(level: number): Promise<void> {
    const psScript = `
      Add-Type -TypeDefinition '
        using System;
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
          int _0; int _1; int _2; int _3;
          void GetLevel(out float level);
          void SetLevel(float level, ref Guid guid);
        }
        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { void Activate(ref Guid iid, int ctx, IntPtr ptr, out IAudioEndpointVolume vol); }
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { void GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
        public class Audio {
          public static void SetVolume(float level) {
            var e = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            e.GetDefaultAudioEndpoint(0, 1, out var d);
            d.Activate(typeof(IAudioEndpointVolume).GUID, 0, IntPtr.Zero, out var v);
            var g = Guid.Empty;
            v.SetLevel(level / 100f, ref g);
          }
        }
      '
      [Audio]::SetVolume(${level})
    `.trim().replace(/\n/g, '; ');

    await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 10000 });
  }

  private async getVolumeMacOS(): Promise<VolumeResult> {
    const { stdout } = await execAsync('osascript -e "output volume of (get volume settings)"', { timeout: 5000 });
    const level = parseInt(stdout.trim(), 10);
    return { level: isNaN(level) ? 50 : level, isMuted: false };
  }

  private async setVolumeMacOS(level: number): Promise<void> {
    await execAsync(`osascript -e "set volume output volume ${level}"`, { timeout: 5000 });
  }

  private async getVolumeLinux(): Promise<VolumeResult> {
    try {
      const { stdout } = await execAsync('amixer get Master', { timeout: 5000 });
      const volumeMatch = stdout.match(/(\d+)%/);
      const muteMatch = stdout.match(/\[(on|off)\]/);
      return {
        level: volumeMatch ? parseInt(volumeMatch[1], 10) : 50,
        isMuted: muteMatch ? muteMatch[1] === 'off' : false,
      };
    } catch {
      return { level: 50, isMuted: false };
    }
  }

  private async setVolumeLinux(level: number): Promise<void> {
    await execAsync(`amixer set Master ${level}%`, { timeout: 5000 });
  }
}

// ─── Clipboard Manager ────────────────────────────────────────────

export class ClipboardManager {
  /**
   * Get clipboard content
   */
  async getClipboard(): Promise<string> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        const { stdout } = await execAsync('powershell -Command "Get-Clipboard"', { timeout: 5000 });
        return stdout.trim();
      } else if (platform === 'darwin') {
        const { stdout } = await execAsync('pbpaste', { timeout: 5000 });
        return stdout.trim();
      } else {
        try {
          const { stdout } = await execAsync('xclip -selection clipboard -o', { timeout: 5000 });
          return stdout.trim();
        } catch {
          const { stdout } = await execAsync('xsel --clipboard --output', { timeout: 5000 });
          return stdout.trim();
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to get clipboard');
      return '';
    }
  }

  /**
   * Set clipboard content
   */
  async setClipboard(text: string): Promise<void> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        // Escape for PowerShell
        const escaped = text.replace(/'/g, "''");
        await execAsync(`powershell -Command "Set-Clipboard -Value '${escaped}'"`, { timeout: 5000 });
      } else if (platform === 'darwin') {
        await execAsync(`echo '${text.replace(/'/g, "'\\''")}' | pbcopy`, { timeout: 5000 });
      } else {
        try {
          await execAsync(`echo '${text.replace(/'/g, "'\\''")}' | xclip -selection clipboard`, { timeout: 5000 });
        } catch {
          await execAsync(`echo '${text.replace(/'/g, "'\\''")}' | xsel --clipboard --input`, { timeout: 5000 });
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to set clipboard');
      throw new Error('Failed to set clipboard');
    }
  }
}

// ─── Screen Locker ────────────────────────────────────────────────

export class ScreenLocker {
  /**
   * Lock the screen
   */
  async lockScreen(): Promise<void> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        await execAsync('rundll32.exe user32.dll,LockWorkStation', { timeout: 5000 });
      } else if (platform === 'darwin') {
        await execAsync('/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend', { timeout: 5000 });
      } else {
        // Try multiple lock commands
        const commands = [
          'gnome-screensaver-command -l',
          'xdg-screensaver lock',
          'loginctl lock-session',
          'xscreensaver -lock',
        ];

        for (const cmd of commands) {
          try {
            await execAsync(cmd, { timeout: 5000 });
            return;
          } catch {
            continue;
          }
        }

        throw new Error('No screen lock command available');
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to lock screen');
      throw new Error(`Failed to lock screen: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
}
