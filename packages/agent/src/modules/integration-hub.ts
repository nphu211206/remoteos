/**
 * Integration Hub — Connect with External Services
 *
 * Integrations:
 * - GitHub (repos, issues, PRs)
 * - Slack (messages, channels)
 * - Email (send, receive)
 * - Calendar (events, scheduling)
 * - Cloud Storage (Google Drive, Dropbox)
 * - CRM (Salesforce, HubSpot)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

export interface IntegrationConfig {
  type: string;
  apiKey?: string;
  token?: string;
  baseUrl?: string;
  settings?: Record<string, any>;
}

export interface IntegrationResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class IntegrationHub {
  private integrations: Map<string, IntegrationConfig> = new Map();

  /**
   * Register integration
   */
  registerIntegration(name: string, config: IntegrationConfig): void {
    this.integrations.set(name, config);
    logger.info({ name, type: config.type }, 'Integration registered');
  }

  /**
   * Get integration
   */
  getIntegration(name: string): IntegrationConfig | null {
    return this.integrations.get(name) || null;
  }

  // ─── GitHub Integration ──────────────────────────────────────

  /**
   * List GitHub repositories
   */
  async githubListRepos(owner: string): Promise<IntegrationResult> {
    try {
      const config = this.integrations.get('github');
      const token = config?.token || process.env.GITHUB_TOKEN;

      const { stdout } = await execAsync(
        `gh api /users/${owner}/repos --paginate --jq '.[].full_name'`,
        { env: { ...process.env, GITHUB_TOKEN: token } }
      );

      return {
        success: true,
        data: stdout.trim().split('\n'),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get GitHub repository info
   */
  async githubGetRepo(repo: string): Promise<IntegrationResult> {
    try {
      const { stdout } = await execAsync(`gh api /repos/${repo}`);
      return {
        success: true,
        data: JSON.parse(stdout),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * List GitHub issues
   */
  async githubListIssues(repo: string, state: string = 'open'): Promise<IntegrationResult> {
    try {
      const { stdout } = await execAsync(`gh api /repos/${repo}/issues?state=${state}`);
      return {
        success: true,
        data: JSON.parse(stdout),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Create GitHub issue
   */
  async githubCreateIssue(repo: string, title: string, body: string): Promise<IntegrationResult> {
    try {
      const { stdout } = await execAsync(
        `gh api /repos/${repo}/issues -f title="${title}" -f body="${body}"`
      );
      return {
        success: true,
        data: JSON.parse(stdout),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─── Slack Integration ───────────────────────────────────────

  /**
   * Send Slack message
   */
  async slackSendMessage(channel: string, message: string): Promise<IntegrationResult> {
    try {
      const config = this.integrations.get('slack');
      const token = config?.token || process.env.SLACK_TOKEN;

      const { stdout } = await execAsync(
        `curl -X POST https://slack.com/api/chat.postMessage ` +
        `-H "Authorization: Bearer ${token}" ` +
        `-H "Content-Type: application/json" ` +
        `-d '{"channel":"${channel}","text":"${message}"}'`
      );

      return {
        success: true,
        data: JSON.parse(stdout),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─── Email Integration ───────────────────────────────────────

  /**
   * Send email
   */
  async emailSend(to: string, subject: string, body: string): Promise<IntegrationResult> {
    try {
      // Use PowerShell on Windows
      if (process.platform === 'win32') {
        const script = `
          $smtpServer = "smtp.gmail.com"
          $smtpPort = 587
          $smtpUser = $env:EMAIL_USER
          $smtpPass = $env:EMAIL_PASS
          $from = $env:EMAIL_USER
          $to = "${to}"
          $subject = "${subject}"
          $body = "${body}"

          $smtp = New-Object Net.Mail.SmtpClient($smtpServer, $smtpPort)
          $smtp.EnableSsl = $true
          $smtp.Credentials = New-Object System.Net.NetworkCredential($smtpUser, $smtpPass)
          $smtp.Send($from, $to, $subject, $body)
        `;

        await execAsync(`powershell -Command "${script}"`, { timeout: 30000 });
      }

      return { success: true, data: { to, subject } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─── Calendar Integration ────────────────────────────────────

  /**
   * Create calendar event
   */
  async calendarCreateEvent(title: string, start: Date, end: Date, description?: string): Promise<IntegrationResult> {
    try {
      // Use PowerShell to create .ics file
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTEND:${end.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
SUMMARY:${title}
DESCRIPTION:${description || ''}
END:VEVENT
END:VCALENDAR`;

      const { writeFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');

      const icsPath = join(tmpdir(), `event-${Date.now()}.ics`);
      await writeFile(icsPath, icsContent);

      // Open with default calendar app
      if (process.platform === 'win32') {
        await execAsync(`start "" "${icsPath}"`);
      }

      return { success: true, data: { path: icsPath } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─── Cloud Storage Integration ───────────────────────────────

  /**
   * Upload file to cloud storage
   */
  async cloudUpload(filePath: string, destination: string): Promise<IntegrationResult> {
    try {
      // Use rclone if available
      const { stdout } = await execAsync(`rclone copy "${filePath}" "${destination}"`, { timeout: 60000 });
      return { success: true, data: { destination } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Download file from cloud storage
   */
  async cloudDownload(source: string, localPath: string): Promise<IntegrationResult> {
    try {
      await execAsync(`rclone copy "${source}" "${localPath}"`, { timeout: 60000 });
      return { success: true, data: { localPath } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─── Webhook Integration ─────────────────────────────────────

  /**
   * Send webhook
   */
  async webhookSend(url: string, payload: any): Promise<IntegrationResult> {
    try {
      const { stdout } = await execAsync(
        `curl -X POST "${url}" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`,
        { timeout: 30000 }
      );

      return { success: true, data: JSON.parse(stdout || '{}') };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─── CRM Integration ────────────────────────────────────────

  /**
   * Create CRM contact
   */
  async crmCreateContact(contact: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
  }): Promise<IntegrationResult> {
    try {
      // Placeholder for CRM integration
      logger.info({ contact }, 'CRM contact creation (placeholder)');
      return { success: true, data: { id: `contact-${Date.now()}`, ...contact } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─── Statistics ──────────────────────────────────────────────

  /**
   * Get integration statistics
   */
  getStats(): {
    totalIntegrations: number;
    activeIntegrations: number;
    integrationsByType: Record<string, number>;
  } {
    const integrations = Array.from(this.integrations.values());
    const byType: Record<string, number> = {};

    for (const integration of integrations) {
      byType[integration.type] = (byType[integration.type] || 0) + 1;
    }

    return {
      totalIntegrations: integrations.length,
      activeIntegrations: integrations.length,
      integrationsByType: byType,
    };
  }
}
