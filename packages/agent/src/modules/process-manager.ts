/**
 * Process Manager
 *
 * Lists and manages system processes.
 */

import si from 'systeminformation';
import type { ProcessListOutput } from '@remoteos/shared';

export class ProcessManager {
  /**
   * List running processes
   */
  async listProcesses(): Promise<ProcessListOutput> {
    const processes = await si.processes();

    const topProcesses = processes.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 50)
      .map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu * 100) / 100,
        ram: Math.round(p.memRss / (1024 * 1024) * 100) / 100,
        status: p.state,
        startedAt: p.started ? new Date(p.started).toISOString() : 'unknown',
      }));

    return {
      commandType: 'process_list',
      processes: topProcesses,
      total: processes.all,
    };
  }

  /**
   * Kill a process by PID or name
   */
  async killProcess(params: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    const pid = params.pid as number | undefined;
    const name = params.name as string | undefined;

    if (!pid && !name) {
      throw new Error('Either pid or name parameter is required');
    }

    // Safety check: don't kill critical system processes
    const blocked = ['system', 'init', 'kernel', 'svchost', 'csrss', 'lsass', 'services.exe'];
    if (name && blocked.some((b) => name.toLowerCase().includes(b))) {
      throw new Error(`Cannot kill system process: ${name}`);
    }

    try {
      if (pid) {
        process.kill(pid, 'SIGTERM');
        return { success: true, message: `Process ${pid} terminated` };
      }

      // Kill by name (platform-specific)
      const { execSync } = await import('node:child_process');
      const platform = process.platform;

      if (platform === 'win32') {
        execSync(`taskkill /IM ${name} /F`, { timeout: 5000 });
      } else {
        execSync(`pkill -f ${name}`, { timeout: 5000 });
      }

      return { success: true, message: `Process "${name}" terminated` };
    } catch (err) {
      throw new Error(`Failed to kill process: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
}
