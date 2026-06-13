/**
 * Screenshot Manager
 *
 * Captures the screen and returns the image as base64.
 * Uses platform-specific CLI tools for maximum compatibility.
 */

import { exec } from 'node:child_process';
import { readFile, unlink, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ScreenshotOutput } from '@remoteos/shared';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);
const readFileAsync = promisify(readFile);
const unlinkAsync = promisify(unlink);

export class ScreenshotManager {
  /**
   * Capture the current screen
   */
  async capture(): Promise<ScreenshotOutput> {
    const platform = process.platform;
    const tmpFile = join(tmpdir(), `remoteos-screenshot-${Date.now()}.png`);

    try {
      if (platform === 'win32') {
        await this.captureWindows(tmpFile);
      } else if (platform === 'darwin') {
        await this.captureMacOS(tmpFile);
      } else {
        await this.captureLinux(tmpFile);
      }

      const buffer = await readFileAsync(tmpFile);
      await unlinkAsync(tmpFile).catch(() => {});

      // Detect screen resolution
      let width = 1920;
      let height = 1080;
      try {
        const si = await import('systeminformation');
        const graphics = await si.default.graphics();
        if (graphics.displays && graphics.displays.length > 0) {
          width = graphics.displays[0]?.resolutionX ?? 1920;
          height = graphics.displays[0]?.resolutionY ?? 1080;
        }
      } catch {
        // Use default resolution
      }

      return {
        commandType: 'screenshot',
        imageData: buffer.toString('base64'),
        format: 'png',
        width,
        height,
        sizeBytes: buffer.length,
      };
    } catch (err) {
      await unlinkAsync(tmpFile).catch(() => {});
      logger.error({ err }, 'Screenshot capture failed');
      throw new Error(`Screenshot failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Windows: Use PowerShell to capture screen
   */
  private async captureWindows(outputPath: string): Promise<void> {
    // Ensure screenshots directory exists
    const dir = join(tmpdir(), 'remoteos');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen
      $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
      $bitmap.Save('${outputPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
      $graphics.Dispose()
      $bitmap.Dispose()
    `.trim().replace(/\n/g, '; ');

    await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 15000 });
  }

  /**
   * macOS: Use screencapture
   */
  private async captureMacOS(outputPath: string): Promise<void> {
    await execAsync(`screencapture -x "${outputPath}"`, { timeout: 10000 });
  }

  /**
   * Linux: Try multiple tools (scrot, gnome-screenshot, import)
   */
  private async captureLinux(outputPath: string): Promise<void> {
    const tools = [
      `scrot "${outputPath}"`,
      `gnome-screenshot -f "${outputPath}"`,
      `import -window root "${outputPath}"`,
    ];

    for (const tool of tools) {
      try {
        await execAsync(tool, { timeout: 10000 });
        return;
      } catch {
        continue;
      }
    }

    throw new Error('No screenshot tool available. Install scrot, gnome-screenshot, or imagemagick.');
  }
}
