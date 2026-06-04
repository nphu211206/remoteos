/**
 * Notification Manager
 *
 * Shows desktop notifications on the agent machine.
 * Uses platform-specific CLI tools for cross-platform support.
 */

import { exec } from 'node:child_process';
import type { NotifyOutput } from '@remoteos/shared';
import { logger } from '../config/logger.js';

export class NotificationManager {
  /**
   * Show a desktop notification
   */
  async notify(params: Record<string, unknown>): Promise<NotifyOutput> {
    const title = (params.title as string) ?? 'RemoteOS';
    const body = (params.body as string) ?? '';

    logger.info({ title, body }, 'Showing notification');

    try {
      const platform = process.platform;

      if (platform === 'win32') {
        // Windows: PowerShell notification
        const escapedBody = body.replace(/'/g, "''");
        const escapedTitle = title.replace(/'/g, "''");
        const psScript = `
          [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
          [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
          $template = '<toast><visual><binding template="ToastText02"><text id="1">${escapedTitle}</text><text id="2">${escapedBody}</text></binding></visual></toast>'
          $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
          $xml.LoadXml($template)
          $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
          [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("RemoteOS").Show($toast)
        `;
        exec(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ';')}"`, { timeout: 5000 });
      } else if (platform === 'darwin') {
        // macOS: osascript
        const escapedBody = body.replace(/"/g, '\\"');
        const escapedTitle = title.replace(/"/g, '\\"');
        exec(`osascript -e 'display notification "${escapedBody}" with title "${escapedTitle}"'`, { timeout: 5000 });
      } else {
        // Linux: notify-send
        exec(`notify-send "${title}" "${body}"`, { timeout: 5000 });
      }

      return {
        commandType: 'notify',
        title,
        body,
        delivered: true,
      };
    } catch (err) {
      logger.warn({ err }, 'Failed to show notification');
      return {
        commandType: 'notify',
        title,
        body,
        delivered: false,
      };
    }
  }
}
