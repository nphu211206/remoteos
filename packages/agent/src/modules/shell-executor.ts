/**
 * Shell Executor
 *
 * Executes shell commands with security validation.
 * Uses PowerShell on Windows for proper Unicode and command support.
 */

import { exec } from 'node:child_process';
import type { ShellOutput } from '@remoteos/shared';
import { validateShellCommand } from '@remoteos/shared/utils';
import { logger } from '../config/logger.js';

export class ShellExecutor {
  /**
   * Execute a shell command (after validation)
   * Timeout: 60 seconds for coding tasks
   * Uses PowerShell on Windows for proper Unicode support
   */
  async execute(command: string): Promise<ShellOutput> {
    // Validate against whitelist/blacklist
    const validation = validateShellCommand(command);
    if (!validation.allowed) {
      throw new Error(`Command blocked: ${validation.reason}`);
    }

    logger.info({ command }, 'Executing shell command');

    const startTime = Date.now();
    const timeoutMs = 60_000; // 60 seconds for coding tasks

    // On Windows, use PowerShell for proper Unicode support
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : undefined;
    const shellArgs = isWindows ? ['-NoProfile', '-NonInteractive', '-Command'] : undefined;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command timed out after 60 seconds'));
      }, timeoutMs);

      // Fix PowerShell compatibility: convert && to ; and || to ;
      let finalCommand = command;
      if (isWindows) {
        finalCommand = command
          .replace(/&&/g, ';')
          .replace(/\|\|/g, '; ');
      }

      exec(finalCommand, {
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024, // 5MB for code output
        windowsHide: true,
        shell: shell,
      }, (error, stdout, stderr) => {
        clearTimeout(timeout);
        const durationMs = Date.now() - startTime;

        if (error && error.killed) {
          reject(new Error('Command timed out'));
          return;
        }

        resolve({
          commandType: 'shell',
          command,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: error?.code ?? 0,
          durationMs,
        });
      });
    });
  }
}
