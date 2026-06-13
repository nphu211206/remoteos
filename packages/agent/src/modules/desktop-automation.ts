/**
 * Desktop Automation Module
 *
 * Allows AI to interact with the desktop:
 * - Click at specific coordinates
 * - Type text
 * - Press keyboard shortcuts
 * - Move mouse
 * - Drag and drop
 * - Scroll
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

export interface ClickOptions {
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
  doubleClick?: boolean;
}

export interface TypeOptions {
  text: string;
  delay?: number; // ms between keystrokes
}

export interface KeyCombo {
  keys: string[]; // e.g., ['ctrl', 'c'], ['alt', 'tab'], ['win', 'r']
}

export class DesktopAutomation {
  /**
   * Click at specific coordinates
   */
  async click(options: ClickOptions): Promise<void> {
    const { x, y, button = 'left', doubleClick = false } = options;

    if (process.platform === 'win32') {
      // Use PowerShell with System.Windows.Forms
      const clickType = doubleClick ? 'doubleclick' : 'click';
      const btn = button === 'right' ? 'right' : 'left';

      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
        Start-Sleep -Milliseconds 50
        ${btn === 'right' ? `
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        ` : `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Mouse {
            [DllImport("user32.dll")]
            public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
            public const int MOUSEEVENTF_LEFTDOWN = 0x02;
            public const int MOUSEEVENTF_LEFTUP = 0x04;
            public const int MOUSEEVENTF_RIGHTDOWN = 0x08;
            public const int MOUSEEVENTF_RIGHTUP = 0x10;
          }
"@
        [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 50
        [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        ${doubleClick ? `
        Start-Sleep -Milliseconds 50
        [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 50
        [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        ` : ''}
        `}
      `;

      await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      // macOS: use cliclick or osascript
      try {
        const clickCmd = doubleClick ? 'dc' : 'c';
        await execAsync(`cliclick ${clickCmd}:${x},${y}`, { timeout: 5000 });
      } catch {
        // Fallback to osascript
        await execAsync(`osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`, { timeout: 5000 });
      }
    } else {
      // Linux: use xdotool
      const btn = button === 'right' ? '3' : button === 'middle' ? '2' : '1';
      await execAsync(`xdotool mousemove ${x} ${y} click ${btn}${doubleClick ? ' click ' + btn : ''}`, { timeout: 5000 });
    }

    logger.info({ x, y, button, doubleClick }, 'Desktop click executed');
  }

  /**
   * Type text at current cursor position
   */
  async type(options: TypeOptions): Promise<void> {
    const { text, delay = 0 } = options;

    if (process.platform === 'win32') {
      // Use PowerShell SendKeys
      // Escape special characters for SendKeys
      const escaped = text
        .replace(/\{/g, '{{}')
        .replace(/\}/g, '{}}')
        .replace(/\(/g, '{(}')
        .replace(/\)/g, '{)}')
        .replace(/\+/g, '{+}')
        .replace(/\^/g, '{^}')
        .replace(/%/g, '{%}')
        .replace(/~/g, '{~}');

      if (delay > 0) {
        // Type character by character with delay
        for (const char of escaped) {
          await execAsync(`powershell -Command "[System.Windows.Forms.SendKeys]::SendWait('${char}')"`, { timeout: 5000 });
          await new Promise(r => setTimeout(r, delay));
        }
      } else {
        await execAsync(`powershell -Command "[System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`, { timeout: 5000 });
      }
    } else if (process.platform === 'darwin') {
      // macOS: use osascript
      await execAsync(`osascript -e 'tell application "System Events" to keystroke "${text.replace(/"/g, '\\"')}"'`, { timeout: 5000 });
    } else {
      // Linux: use xdotool
      await execAsync(`xdotool type --clearmodifiers "${text}"`, { timeout: 5000 });
    }

    logger.info({ textLength: text.length, delay }, 'Desktop type executed');
  }

  /**
   * Press keyboard shortcut
   */
  async pressKeys(combo: KeyCombo): Promise<void> {
    const { keys } = combo;

    if (process.platform === 'win32') {
      // Map keys to SendKeys format
      const keyMap: Record<string, string> = {
        'ctrl': '^',
        'alt': '%',
        'shift': '+',
        'win': '^{ESC}',
        'enter': '{ENTER}',
        'tab': '{TAB}',
        'esc': '{ESC}',
        'escape': '{ESC}',
        'backspace': '{BACKSPACE}',
        'delete': '{DELETE}',
        'del': '{DELETE}',
        'space': ' ',
        'up': '{UP}',
        'down': '{DOWN}',
        'left': '{LEFT}',
        'right': '{RIGHT}',
        'home': '{HOME}',
        'end': '{END}',
        'pageup': '{PGUP}',
        'pagedown': '{PGDN}',
        'f1': '{F1}',
        'f2': '{F2}',
        'f3': '{F3}',
        'f4': '{F4}',
        'f5': '{F5}',
        'f6': '{F6}',
        'f7': '{F7}',
        'f8': '{F8}',
        'f9': '{F9}',
        'f10': '{F10}',
        'f11': '{F11}',
        'f12': '{F12}',
      };

      let sendKeysStr = '';
      for (const key of keys) {
        const lower = key.toLowerCase();
        if (keyMap[lower]) {
          sendKeysStr += keyMap[lower];
        } else {
          sendKeysStr += lower;
        }
      }

      await execAsync(`powershell -Command "[System.Windows.Forms.SendKeys]::SendWait('${sendKeysStr}')"`, { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      // macOS: use osascript
      const keyMap: Record<string, string> = {
        'ctrl': 'control',
        'alt': 'option',
        'shift': 'shift',
        'win': 'command',
        'enter': 'return',
        'tab': 'tab',
        'esc': 'escape',
        'space': 'space',
      };

      const modifiers = keys.slice(0, -1).map(k => keyMap[k.toLowerCase()] || k);
      const mainKey = keys[keys.length - 1].toLowerCase();

      const modStr = modifiers.map(m => `${m} down`).join(', ');
      await execAsync(
        `osascript -e 'tell application "System Events" to keystroke "${mainKey}" using {${modStr}}'`,
        { timeout: 5000 }
      );
    } else {
      // Linux: use xdotool
      const keyMap: Record<string, string> = {
        'ctrl': 'ctrl',
        'alt': 'alt',
        'shift': 'shift',
        'win': 'super',
        'enter': 'Return',
        'tab': 'Tab',
        'esc': 'Escape',
        'space': 'space',
      };

      const xdoKeys = keys.map(k => keyMap[k.toLowerCase()] || k).join('+');
      await execAsync(`xdotool key ${xdoKeys}`, { timeout: 5000 });
    }

    logger.info({ keys }, 'Desktop key combo executed');
  }

  /**
   * Move mouse to coordinates
   */
  async moveMouse(x: number, y: number): Promise<void> {
    if (process.platform === 'win32') {
      await execAsync(
        `powershell -Command "[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})"`,
        { timeout: 5000 }
      );
    } else if (process.platform === 'darwin') {
      await execAsync(`cliclick m:${x},${y}`, { timeout: 5000 });
    } else {
      await execAsync(`xdotool mousemove ${x} ${y}`, { timeout: 5000 });
    }

    logger.info({ x, y }, 'Mouse moved');
  }

  /**
   * Drag from one position to another
   */
  async drag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
    if (process.platform === 'win32') {
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${fromX}, ${fromY})
        Start-Sleep -Milliseconds 100
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Mouse {
            [DllImport("user32.dll")]
            public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
          }
"@
        [Mouse]::mouse_event(0x02, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 100
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${toX}, ${toY})
        Start-Sleep -Milliseconds 100
        [Mouse]::mouse_event(0x04, 0, 0, 0, 0)
      `;
      await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      await execAsync(`cliclick dd:${fromX},${fromY} du:${toX},${toY}`, { timeout: 5000 });
    } else {
      await execAsync(`xdotool mousemove ${fromX} ${fromY} mousedown 1 mousemove ${toX} ${toY} mouseup 1`, { timeout: 5000 });
    }

    logger.info({ fromX, fromY, toX, toY }, 'Drag executed');
  }

  /**
   * Scroll at current position
   */
  async scroll(amount: number, direction: 'up' | 'down' = 'down'): Promise<void> {
    const scrollAmount = direction === 'down' ? -Math.abs(amount) : Math.abs(amount);

    if (process.platform === 'win32') {
      await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{${scrollAmount > 0 ? 'UP' : 'DOWN'}}')"`,
        { timeout: 5000 }
      );
    } else if (process.platform === 'darwin') {
      await execAsync(`cliclick "kd:ctrl;${scrollAmount > 0 ? 'kp:arrow-up' : 'kp:arrow-down'};ku:ctrl"`, { timeout: 5000 });
    } else {
      await execAsync(`xdotool click ${scrollAmount > 0 ? '4' : '5'}`, { timeout: 5000 });
    }

    logger.info({ amount, direction }, 'Scroll executed');
  }

  /**
   * Get current mouse position
   */
  async getMousePosition(): Promise<{ x: number; y: number }> {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(
        'powershell -Command "[System.Windows.Forms.Cursor]::Position | Select-Object X,Y | ConvertTo-Json"',
        { timeout: 5000 }
      );
      const parsed = JSON.parse(stdout);
      return { x: parsed.X, y: parsed.Y };
    } else if (process.platform === 'darwin') {
      const { stdout } = await execAsync('cliclick p', { timeout: 5000 });
      const [x, y] = stdout.trim().split(',').map(Number);
      return { x, y };
    } else {
      const { stdout } = await execAsync('xdotool getmouselocation', { timeout: 5000 });
      const match = stdout.match(/x:(\d+)\s+y:(\d+)/);
      return match ? { x: parseInt(match[1]), y: parseInt(match[2]) } : { x: 0, y: 0 };
    }
  }
}
