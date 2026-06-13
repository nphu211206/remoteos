/**
 * Browser Engine — Full Web Automation
 *
 * Puppeteer-based browser control:
 * - Navigate to URLs
 * - Click elements
 * - Fill forms
 * - Extract data
 * - Take screenshots
 * - Handle authentication
 * - Multi-tab management
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

export interface BrowserConfig {
  headless?: boolean;
  proxy?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

export interface PageInfo {
  url: string;
  title: string;
  content: string;
  screenshot?: string;
}

export interface ElementInfo {
  selector: string;
  text: string;
  tagName: string;
  attributes: Record<string, string>;
  bounds: { x: number; y: number; width: number; height: number };
}

export class BrowserEngine {
  private browser: any = null;
  private page: any = null;
  private puppeteer: any = null;

  /**
   * Initialize browser
   */
  async launch(config: BrowserConfig = {}): Promise<void> {
    try {
      // Dynamic import puppeteer
      this.puppeteer = await import('puppeteer');

      this.browser = await this.puppeteer.default.launch({
        headless: config.headless ?? true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
      });

      this.page = await this.browser.newPage();

      if (config.viewport) {
        await this.page.setViewport(config.viewport);
      }

      if (config.userAgent) {
        await this.page.setUserAgent(config.userAgent);
      }

      logger.info('Browser launched');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to launch browser');
      throw new Error(`Browser launch failed: ${err.message}. Install puppeteer: npm install puppeteer`);
    }
  }

  /**
   * Navigate to URL
   */
  async goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void> {
    if (!this.page) await this.launch();

    await this.page.goto(url, {
      waitUntil: options?.waitUntil || 'networkidle2',
      timeout: options?.timeout || 30000,
    });

    logger.info({ url }, 'Navigated to URL');
  }

  /**
   * Get current page info
   */
  async getPageInfo(): Promise<PageInfo> {
    if (!this.page) throw new Error('Browser not launched');

    const url = this.page.url();
    const title = await this.page.title();
    const content = await this.page.content();

    return { url, title, content };
  }

  /**
   * Click on element
   */
  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    await this.page.waitForSelector(selector, { timeout: 5000 });
    await this.page.click(selector);

    logger.info({ selector }, 'Clicked element');
  }

  /**
   * Click by text content
   */
  async clickByText(text: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    const elements = await this.page.$$('button, a, input[type="submit"]');

    for (const element of elements) {
      const elementText = await this.page.evaluate((el: any) => el.textContent, element);
      if (elementText && elementText.includes(text)) {
        await element.click();
        logger.info({ text }, 'Clicked element by text');
        return;
      }
    }

    throw new Error(`Element with text "${text}" not found`);
  }

  /**
   * Type text into input
   */
  async type(selector: string, text: string, options?: { delay?: number }): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    await this.page.waitForSelector(selector, { timeout: 5000 });
    await this.page.type(selector, text, { delay: options?.delay || 50 });

    logger.info({ selector, textLength: text.length }, 'Typed text');
  }

  /**
   * Select dropdown option
   */
  async select(selector: string, value: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    await this.page.select(selector, value);

    logger.info({ selector, value }, 'Selected option');
  }

  /**
   * Get text content
   */
  async getText(selector: string): Promise<string> {
    if (!this.page) throw new Error('Browser not launched');

    return await this.page.$eval(selector, (el: any) => el.textContent);
  }

  /**
   * Get attribute value
   */
  async getAttribute(selector: string, attribute: string): Promise<string> {
    if (!this.page) throw new Error('Browser not launched');

    return await this.page.$eval(selector, (el: any, attr: string) => el.getAttribute(attr), attribute);
  }

  /**
   * Wait for element
   */
  async waitForSelector(selector: string, timeout: number = 5000): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    await this.page.waitForSelector(selector, { timeout });
  }

  /**
   * Wait for navigation
   */
  async waitForNavigation(options?: { waitUntil?: string; timeout?: number }): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    await this.page.waitForNavigation({
      waitUntil: options?.waitUntil || 'networkidle2',
      timeout: options?.timeout || 30000,
    });
  }

  /**
   * Take screenshot
   */
  async screenshot(options?: { path?: string; fullPage?: boolean }): Promise<string> {
    if (!this.page) throw new Error('Browser not launched');

    const path = options?.path || join(tmpdir(), `screenshot-${Date.now()}.png`);
    await this.page.screenshot({ path, fullPage: options?.fullPage ?? false });

    logger.info({ path }, 'Screenshot taken');
    return path;
  }

  /**
   * Extract data from page
   */
  async extractData(selector: string): Promise<any[]> {
    if (!this.page) throw new Error('Browser not launched');

    return await this.page.$$eval(selector, (elements: any[]) =>
      elements.map(el => ({
        text: el.textContent?.trim(),
        href: el.getAttribute('href'),
        src: el.getAttribute('src'),
        alt: el.getAttribute('alt'),
      }))
    );
  }

  /**
   * Extract table data
   */
  async extractTable(selector: string): Promise<{ headers: string[]; rows: string[][] }> {
    if (!this.page) throw new Error('Browser not launched');

    const headers: string[] = await this.page.$$eval(`${selector} th`, (ths: any[]) =>
      ths.map((th: any) => th.textContent?.trim())
    );

    const rows: string[][] = await this.page.$$eval(`${selector} tr`, (trs: any[]) =>
      trs.map((tr: any) => {
        const cells = tr.querySelectorAll('td');
        return Array.from(cells).map((cell: any) => cell.textContent?.trim());
      })
    );

    return { headers, rows };
  }

  /**
   * Scroll page
   */
  async scroll(direction: 'up' | 'down', amount: number = 3): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    const scrollAmount = direction === 'down' ? amount * 100 : -amount * 100;

    await this.page.evaluate((y: number) => {
      (globalThis as any).window?.scrollBy(0, y);
    }, scrollAmount);

    logger.info({ direction, amount }, 'Scrolled page');
  }

  /**
   * Execute JavaScript in page
   */
  async evaluate(fn: Function, ...args: any[]): Promise<any> {
    if (!this.page) throw new Error('Browser not launched');

    return await this.page.evaluate(fn, ...args);
  }

  /**
   * Handle authentication
   */
  async authenticate(url: string, credentials: { username: string; password: string }): Promise<void> {
    await this.goto(url);

    // Try common login selectors
    const usernameSelectors = ['#username', '#email', 'input[name="username"]', 'input[name="email"]', 'input[type="email"]'];
    const passwordSelectors = ['#password', 'input[name="password"]', 'input[type="password"]'];
    const submitSelectors = ['#submit', 'button[type="submit"]', 'input[type="submit"]', 'button:contains("Login")', 'button:contains("Sign in")'];

    // Find and fill username
    for (const selector of usernameSelectors) {
      try {
        await this.type(selector, credentials.username);
        break;
      } catch (err) {
        logger.debug({ err, selector }, 'Username selector not found, trying next');
      }
    }

    // Find and fill password
    for (const selector of passwordSelectors) {
      try {
        await this.type(selector, credentials.password);
        break;
      } catch (err) {
        logger.debug({ err, selector }, 'Password selector not found, trying next');
      }
    }

    // Find and click submit
    for (const selector of submitSelectors) {
      try {
        await this.click(selector);
        break;
      } catch (err) {
        logger.debug({ err, selector }, 'Submit selector not found, trying next');
      }
    }

    await this.waitForNavigation();

    logger.info('Authentication completed');
  }

  /**
   * Open new tab
   */
  async newTab(): Promise<void> {
    if (!this.browser) throw new Error('Browser not launched');

    this.page = await this.browser.newPage();
    logger.info('New tab opened');
  }

  /**
   * Switch to tab
   */
  async switchTab(index: number): Promise<void> {
    if (!this.browser) throw new Error('Browser not launched');

    const pages = await this.browser.pages();
    if (index < pages.length) {
      this.page = pages[index];
      logger.info({ index }, 'Switched to tab');
    }
  }

  /**
   * Close current tab
   */
  async closeTab(): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    await this.page.close();
    this.page = null;
    logger.info('Tab closed');
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      logger.info('Browser closed');
    }
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.browser !== null && this.page !== null;
  }
}
