/**
 * Screen Understanding Engine
 *
 * Advanced computer vision capabilities:
 * - Element detection (buttons, inputs, links, images)
 * - Auto-click on detected elements
 * - Form auto-fill
 * - UI flow automation
 * - Real-time screen monitoring
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from '../config/logger.js';
import { ScreenVision } from './screen-vision.js';
import { DesktopAutomation } from './desktop-automation.js';

const execAsync = promisify(exec);

export interface ScreenElement {
  type: 'button' | 'input' | 'link' | 'image' | 'text' | 'menu' | 'dialog' | 'checkbox' | 'dropdown';
  bounds: { x: number; y: number; width: number; height: number };
  text: string;
  confidence: number;
  attributes: Record<string, string>;
}

export interface UIStep {
  action: 'click' | 'type' | 'select' | 'wait' | 'scroll' | 'keypress';
  target: string;
  value?: string;
  expected?: string;
  timeout?: number;
}

export interface FormField {
  name: string;
  type: 'text' | 'email' | 'password' | 'number' | 'select' | 'checkbox' | 'radio';
  selector?: string;
  label?: string;
  value?: string;
}

export interface ScreenEvent {
  type: 'error' | 'notification' | 'dialog' | 'loading' | 'success';
  message: string;
  timestamp: Date;
  screenshot?: string;
}

export class ScreenUnderstanding {
  private screenVision: ScreenVision;
  private desktopAutomation: DesktopAutomation;
  private apiKey: string;
  private isMonitoring: boolean = false;

  constructor(apiKey: string = '') {
    this.screenVision = new ScreenVision();
    this.desktopAutomation = new DesktopAutomation();
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
  }

  /**
   * Detect all UI elements on screen
   */
  async detectElements(): Promise<ScreenElement[]> {
    // Capture screenshot
    const analysis = await this.screenVision.captureForAI();

    // Send to AI for element detection
    const prompt = `Analyze this screenshot and detect ALL visible UI elements. For each element, provide:
1. Type (button, input, link, image, text, menu, dialog, checkbox, dropdown)
2. Exact pixel coordinates (x, y, width, height)
3. Text content
4. Confidence (0.0 to 1.0)

Return a JSON array of elements:
[
  {
    "type": "button",
    "bounds": {"x": 100, "y": 200, "width": 150, "height": 40},
    "text": "Login",
    "confidence": 0.95,
    "attributes": {"color": "blue", "enabled": "true"}
  }
]

Be precise with coordinates. Screen resolution: ${analysis.resolution.width}x${analysis.resolution.height}`;

    const response = await this.screenVision.analyzeWithAI(analysis.base64Image, prompt, this.apiKey);

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to parse elements');
    }

    return [];
  }

  /**
   * Find element by text or description
   */
  async findElement(description: string): Promise<ScreenElement | null> {
    const elements = await this.detectElements();

    // Search by text match
    const textMatch = elements.find(el =>
      el.text.toLowerCase().includes(description.toLowerCase())
    );

    if (textMatch) {
      return textMatch;
    }

    // Search by type
    const typeMatch = elements.find(el =>
      el.type.toLowerCase() === description.toLowerCase()
    );

    return typeMatch || null;
  }

  /**
   * Click on element by description
   */
  async clickElement(description: string): Promise<boolean> {
    const element = await this.findElement(description);

    if (!element) {
      logger.warn({ description }, 'Element not found');
      return false;
    }

    // Calculate center coordinates
    const x = element.bounds.x + element.bounds.width / 2;
    const y = element.bounds.y + element.bounds.height / 2;

    // Click
    await this.desktopAutomation.click({ x, y });

    logger.info({ description, x, y }, 'Element clicked');
    return true;
  }

  /**
   * Fill form automatically
   */
  async fillForm(formData: Record<string, string>): Promise<void> {
    // Detect form fields
    const elements = await this.detectElements();
    const inputs = elements.filter(el => el.type === 'input' || el.type === 'dropdown');

    for (const [name, value] of Object.entries(formData)) {
      // Find matching input
      const input = inputs.find(el =>
        el.text.toLowerCase().includes(name.toLowerCase()) ||
        el.attributes.placeholder?.toLowerCase().includes(name.toLowerCase())
      );

      if (input) {
        // Click on input
        const x = input.bounds.x + input.bounds.width / 2;
        const y = input.bounds.y + input.bounds.height / 2;
        await this.desktopAutomation.click({ x, y });

        // Type value
        await this.desktopAutomation.type({ text: value });

        logger.info({ name, value }, 'Form field filled');
      }
    }
  }

  /**
   * Automate UI flow
   */
  async automateFlow(steps: UIStep[]): Promise<void> {
    for (const step of steps) {
      logger.info({ step }, 'Executing UI step');

      switch (step.action) {
        case 'click':
          await this.clickElement(step.target);
          break;

        case 'type':
          await this.clickElement(step.target);
          if (step.value) {
            await this.desktopAutomation.type({ text: step.value });
          }
          break;

        case 'select':
          await this.clickElement(step.target);
          if (step.value) {
            await this.desktopAutomation.type({ text: step.value });
            await this.desktopAutomation.pressKeys({ keys: ['enter'] });
          }
          break;

        case 'wait':
          await new Promise(resolve => setTimeout(resolve, step.timeout || 1000));
          break;

        case 'scroll':
          await this.desktopAutomation.scroll(3, 'down');
          break;

        case 'keypress':
          if (step.value) {
            await this.desktopAutomation.pressKeys({ keys: [step.value] });
          }
          break;
      }

      // Wait for screen to stabilize
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Monitor screen for events
   */
  async startMonitoring(callback: (event: ScreenEvent) => void): Promise<void> {
    this.isMonitoring = true;

    while (this.isMonitoring) {
      try {
        const analysis = await this.screenVision.captureForAI();
        const events = await this.detectEvents(analysis.base64Image);

        for (const event of events) {
          callback(event);
        }
      } catch (err) {
        logger.error({ err }, 'Screen monitoring error');
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
  }

  /**
   * Detect events on screen
   */
  private async detectEvents(base64Image: string): Promise<ScreenEvent[]> {
    const prompt = `Analyze this screenshot and detect any notable events:
- Error messages or dialogs
- Notifications or alerts
- Loading indicators
- Success messages
- Dialog boxes requiring user input

Return a JSON array of events:
[
  {
    "type": "error|notification|dialog|loading|success",
    "message": "Description of the event",
    "timestamp": "ISO timestamp"
  }
]

If no events detected, return empty array: []`;

    const response = await this.screenVision.analyzeWithAI(base64Image, prompt, this.apiKey);

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const events = JSON.parse(jsonMatch[0]);
        return events.map((e: any) => ({
          ...e,
          timestamp: new Date(),
        }));
      }
    } catch (err) {
      logger.error({ err }, 'Failed to parse events');
    }

    return [];
  }

  /**
   * Get screen summary
   */
  async getScreenSummary(): Promise<string> {
    const analysis = await this.screenVision.captureForAI();
    return this.screenVision.describeScreen(analysis.base64Image, this.apiKey);
  }

  /**
   * Read text from screen
   */
  async readScreenText(): Promise<string> {
    const analysis = await this.screenVision.captureForAI();
    return this.screenVision.readScreenText(analysis.base64Image, this.apiKey);
  }
}
