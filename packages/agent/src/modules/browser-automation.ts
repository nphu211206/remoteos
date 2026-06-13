/**
 * Browser Automation Module
 *
 * Allows AI to control web browsers:
 * - Open URLs
 * - Navigate pages
 * - Click elements
 * - Fill forms
 * - Extract data
 * - Take screenshots
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

export interface BrowserOptions {
  browser?: 'chrome' | 'firefox' | 'edge' | 'default';
  headless?: boolean;
  profile?: string;
}

export class BrowserAutomation {
  /**
   * Open a URL in the default browser
   */
  async openUrl(url: string, options: BrowserOptions = {}): Promise<void> {
    const { browser = 'default' } = options;

    if (process.platform === 'win32') {
      const browserCmds: Record<string, string> = {
        'chrome': 'start chrome',
        'firefox': 'start firefox',
        'edge': 'start msedge',
        'default': 'start',
      };
      await execAsync(`${browserCmds[browser]} "${url}"`, { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      const browserCmds: Record<string, string> = {
        'chrome': 'open -a "Google Chrome"',
        'firefox': 'open -a Firefox',
        'edge': 'open -a "Microsoft Edge"',
        'default': 'open',
      };
      await execAsync(`${browserCmds[browser]} "${url}"`, { timeout: 5000 });
    } else {
      const browserCmds: Record<string, string> = {
        'chrome': 'google-chrome',
        'firefox': 'firefox',
        'edge': 'microsoft-edge',
        'default': 'xdg-open',
      };
      await execAsync(`${browserCmds[browser]} "${url}" &`, { timeout: 5000 });
    }

    logger.info({ url, browser }, 'Browser opened');
  }

  /**
   * Open Chrome with remote debugging enabled
   */
  async openChromeWithDebugging(port: number = 9222): Promise<void> {
    const chromePath = process.platform === 'win32'
      ? '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"'
      : process.platform === 'darwin'
      ? '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome'
      : 'google-chrome';

    const cmd = `${chromePath} --remote-debugging-port=${port} --user-data-dir="${process.platform === 'win32' ? process.env.TEMP : '/tmp'}/chrome-debug"`;

    await execAsync(cmd, { timeout: 5000 }).catch(() => {});
    logger.info({ port }, 'Chrome opened with debugging');
  }

  /**
   * Search Google
   */
  async searchGoogle(query: string): Promise<void> {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    await this.openUrl(url);
    logger.info({ query }, 'Google search opened');
  }

  /**
   * Search YouTube
   */
  async searchYouTube(query: string): Promise<void> {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    await this.openUrl(url);
    logger.info({ query }, 'YouTube search opened');
  }

  /**
   * Open common websites
   */
  async openWebsite(site: string): Promise<void> {
    const sites: Record<string, string> = {
      'google': 'https://www.google.com',
      'youtube': 'https://www.youtube.com',
      'facebook': 'https://www.facebook.com',
      'twitter': 'https://www.twitter.com',
      'x': 'https://www.x.com',
      'instagram': 'https://www.instagram.com',
      'linkedin': 'https://www.linkedin.com',
      'github': 'https://www.github.com',
      'stackoverflow': 'https://www.stackoverflow.com',
      'reddit': 'https://www.reddit.com',
      'wikipedia': 'https://www.wikipedia.org',
      'amazon': 'https://www.amazon.com',
      'netflix': 'https://www.netflix.com',
      'spotify': 'https://www.spotify.com',
      'chatgpt': 'https://chat.openai.com',
      'claude': 'https://claude.ai',
      'gemini': 'https://gemini.google.com',
      'gmail': 'https://mail.google.com',
      'drive': 'https://drive.google.com',
      'docs': 'https://docs.google.com',
      'sheets': 'https://sheets.google.com',
      'slides': 'https://slides.google.com',
      'notion': 'https://www.notion.so',
      'figma': 'https://www.figma.com',
      'canva': 'https://www.canva.com',
      'zoom': 'https://zoom.us',
      'teams': 'https://teams.microsoft.com',
      'slack': 'https://slack.com',
      'discord': 'https://discord.com',
      'trello': 'https://trello.com',
      'jira': 'https://www.atlassian.com/software/jira',
      'confluence': 'https://www.atlassian.com/software/confluence',
    };

    const url = sites[site.toLowerCase()] || site;
    await this.openUrl(url.startsWith('http') ? url : `https://${url}`);
    logger.info({ site, url }, 'Website opened');
  }

  /**
   * Open developer tools
   */
  async openDevTools(): Promise<void> {
    if (process.platform === 'win32') {
      // Send F12 to open dev tools
      await execAsync('powershell -Command "[System.Windows.Forms.SendKeys]::SendWait(\'{F12}\')"', { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      await execAsync('osascript -e \'tell application "System Events" to keystroke "i" using {command down, option down}\'', { timeout: 5000 });
    } else {
      await execAsync('xdotool key F12', { timeout: 5000 });
    }

    logger.info('DevTools opened');
  }

  /**
   * Take screenshot of current browser tab
   */
  async screenshotBrowser(): Promise<void> {
    // This is handled by the main screenshot functionality
    logger.info('Browser screenshot requested (use screenshot command)');
  }

  /**
   * Close current browser tab
   */
  async closeTab(): Promise<void> {
    if (process.platform === 'win32') {
      await execAsync('powershell -Command "[System.Windows.Forms.SendKeys]::SendWait(\'^w\')"', { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      await execAsync('osascript -e \'tell application "System Events" to keystroke "w" using {command down}\'', { timeout: 5000 });
    } else {
      await execAsync('xdotool key ctrl+w', { timeout: 5000 });
    }

    logger.info('Browser tab closed');
  }

  /**
   * Open new browser tab
   */
  async newTab(): Promise<void> {
    if (process.platform === 'win32') {
      await execAsync('powershell -Command "[System.Windows.Forms.SendKeys]::SendWait(\'^t\')"', { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      await execAsync('osascript -e \'tell application "System Events" to keystroke "t" using {command down}\'', { timeout: 5000 });
    } else {
      await execAsync('xdotool key ctrl+t', { timeout: 5000 });
    }

    logger.info('New browser tab opened');
  }

  /**
   * Refresh current page
   */
  async refresh(): Promise<void> {
    if (process.platform === 'win32') {
      await execAsync('powershell -Command "[System.Windows.Forms.SendKeys]::SendWait(\'{F5}\')"', { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      await execAsync('osascript -e \'tell application "System Events" to keystroke "r" using {command down}\'', { timeout: 5000 });
    } else {
      await execAsync('xdotool key F5', { timeout: 5000 });
    }

    logger.info('Browser refreshed');
  }

  /**
   * Navigate back
   */
  async goBack(): Promise<void> {
    if (process.platform === 'win32') {
      await execAsync('powershell -Command "[System.Windows.Forms.SendKeys]::SendWait(\'{BROWSER_BACK}\')"', { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      await execAsync('osascript -e \'tell application "System Events" to keystroke "[" using {command down}\'', { timeout: 5000 });
    } else {
      await execAsync('xdotool key alt+Left', { timeout: 5000 });
    }

    logger.info('Browser navigated back');
  }

  /**
   * Navigate forward
   */
  async goForward(): Promise<void> {
    if (process.platform === 'win32') {
      await execAsync('powershell -Command "[System.Windows.Forms.SendKeys]::SendWait(\'{BROWSER_FORWARD}\')"', { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      await execAsync('osascript -e \'tell application "System Events" to keystroke "]" using {command down}\'', { timeout: 5000 });
    } else {
      await execAsync('xdotool key alt+Right', { timeout: 5000 });
    }

    logger.info('Browser navigated forward');
  }
}
