/**
 * Screen Vision Module
 *
 * Allows AI to "see" and understand the screen.
 * Combines screenshot + OCR + AI analysis.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

export interface ScreenAnalysis {
  screenshotPath: string;
  base64Image: string;
  timestamp: string;
  resolution: { width: number; height: number };
}

export class ScreenVision {
  private tempDir: string;

  constructor() {
    this.tempDir = join(tmpdir(), 'remoteos-vision');
  }

  /**
   * Capture screen and return base64 for AI analysis
   */
  async captureForAI(): Promise<ScreenAnalysis> {
    await mkdir(this.tempDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screen-${timestamp}.png`;
    const filepath = join(this.tempDir, filename);

    // Capture screenshot
    if (process.platform === 'win32') {
      // Windows: use PowerShell
      await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds"`,
        { timeout: 5000 }
      ).catch(() => {});

      // Use nircmd or native method
      try {
        await execAsync(`nircmd savescreenshot "${filepath}"`, { timeout: 5000 });
      } catch {
        // Fallback: use PowerShell with .NET
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $screen = [System.Windows.Forms.Screen]::PrimaryScreen
          $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
          $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
          $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
          $bitmap.Save("${filepath.replace(/\\/g, '\\\\')}")
          $graphics.Dispose()
          $bitmap.Dispose()
        `;
        await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 10000 });
      }
    } else if (process.platform === 'darwin') {
      await execAsync(`screencapture -x "${filepath}"`, { timeout: 5000 });
    } else {
      await execAsync(`scrot "${filepath}"`, { timeout: 5000 }).catch(async () => {
        await execAsync(`gnome-screenshot -f "${filepath}"`, { timeout: 5000 });
      });
    }

    // Read and convert to base64
    const imageBuffer = await readFile(filepath);
    const base64Image = imageBuffer.toString('base64');

    // Get resolution
    const resolution = await this.getResolution();

    logger.info({ filepath, size: imageBuffer.length }, 'Screen captured for AI vision');

    return {
      screenshotPath: filepath,
      base64Image,
      timestamp: new Date().toISOString(),
      resolution,
    };
  }

  /**
   * Get screen resolution
   */
  async getResolution(): Promise<{ width: number; height: number }> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(
          'powershell -Command "[System.Windows.Forms.Screen]::PrimaryScreen.Bounds | Select-Object Width,Height | ConvertTo-Json"',
          { timeout: 5000 }
        );
        const parsed = JSON.parse(stdout);
        return { width: parsed.Width || 1920, height: parsed.Height || 1080 };
      } else if (process.platform === 'darwin') {
        const { stdout } = await execAsync("system_profiler SPDisplaysDataType | grep Resolution", { timeout: 5000 });
        const match = stdout.match(/(\d+)\s*x\s*(\d+)/);
        return match ? { width: parseInt(match[1]), height: parseInt(match[2]) } : { width: 1920, height: 1080 };
      } else {
        const { stdout } = await execAsync("xdpyinfo | grep dimensions", { timeout: 5000 });
        const match = stdout.match(/(\d+)\s*x\s*(\d+)/);
        return match ? { width: parseInt(match[1]), height: parseInt(match[2]) } : { width: 1920, height: 1080 };
      }
    } catch {
      return { width: 1920, height: 1080 };
    }
  }

  /**
   * Analyze screenshot with AI (send to Gemini Vision)
   */
  async analyzeWithAI(base64Image: string, prompt: string, apiKey: string): Promise<string> {
    const axios = (await import('axios')).default;
    const model = 'gemini-2.5-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await axios.post(url, {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/png',
              data: base64Image,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }, { timeout: 30000 });

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Không thể phân tích ảnh';
  }

  /**
   * Find UI element on screen by description
   */
  async findElement(base64Image: string, description: string, apiKey: string): Promise<{
    found: boolean;
    x?: number;
    y?: number;
    confidence?: number;
    description?: string;
  }> {
    const prompt = `Analyze this screenshot and find the UI element described as: "${description}"

Return ONLY a JSON object with this format:
{
  "found": true/false,
  "x": <x coordinate in pixels>,
  "y": <y coordinate in pixels>,
  "confidence": <0.0 to 1.0>,
  "description": "<what you see at that location>"
}

If the element is not found, return: {"found": false}

Be precise with coordinates. The screen resolution is 1920x1080.`;

    const result = await this.analyzeWithAI(base64Image, prompt, apiKey);

    try {
      // Extract JSON from response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {}

    return { found: false };
  }

  /**
   * Read text from screen using OCR-like AI analysis
   */
  async readScreenText(base64Image: string, apiKey: string): Promise<string> {
    const prompt = `Read ALL text visible in this screenshot. Return the text exactly as it appears, preserving formatting and layout. Include:
- Window titles
- Menu items
- Button labels
- Input field contents
- Error messages
- Status bar text
- Any other visible text

Return the complete text content.`;

    return this.analyzeWithAI(base64Image, prompt, apiKey);
  }

  /**
   * Describe what's happening on screen
   */
  async describeScreen(base64Image: string, apiKey: string): Promise<string> {
    const prompt = `Describe what is happening on this computer screen in detail. Include:
1. What application(s) are open
2. What the user appears to be doing
3. Any important information visible
4. Current state of the system
5. Any errors or notifications

Be thorough and specific.`;

    return this.analyzeWithAI(base64Image, prompt, apiKey);
  }
}
