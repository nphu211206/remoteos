/**
 * Proactive AI Module
 *
 * Allows AI to:
 * - Suggest actions based on context
 * - Monitor systems and alert
 * - Automate repetitive tasks
 * - Learn patterns and optimize
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../config/logger.js';
import { SystemMonitor } from './system-monitor.js';
import { MemorySystem } from './memory-system.js';

const execAsync = promisify(exec);

export interface Suggestion {
  type: 'action' | 'warning' | 'optimization' | 'automation';
  title: string;
  description: string;
  command?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

export interface MonitoringRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  enabled: boolean;
  lastTriggered?: string;
}

export class ProactiveAI {
  private monitor: SystemMonitor;
  private memory: MemorySystem;
  private rules: MonitoringRule[] = [];

  constructor() {
    this.monitor = new SystemMonitor();
    this.memory = new MemorySystem();
  }

  /**
   * Analyze system and provide suggestions
   */
  async analyzeAndSuggest(): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const state = await this.monitor.collectState('self');

    // CPU high
    if (state.cpuUsage > 80) {
      suggestions.push({
        type: 'warning',
        title: 'CPU usage is high',
        description: `CPU usage is at ${state.cpuUsage.toFixed(1)}%. Consider closing unnecessary applications.`,
        command: 'process_list',
        priority: 'high',
        category: 'performance',
      });
    }

    // RAM high
    if (state.ramUsage > 85) {
      suggestions.push({
        type: 'warning',
        title: 'Memory usage is high',
        description: `RAM usage is at ${state.ramUsage.toFixed(1)}%. Consider closing memory-intensive applications.`,
        command: 'process_list',
        priority: 'high',
        category: 'performance',
      });
    }

    // Disk low
    if (state.diskUsage > 90) {
      suggestions.push({
        type: 'warning',
        title: 'Disk space is low',
        description: `Disk usage is at ${state.diskUsage.toFixed(1)}%. Consider cleaning up files.`,
        command: 'shell',
        priority: 'high',
        category: 'storage',
      });
    }

    // Temperature high
    if (state.cpuTemp && state.cpuTemp > 80) {
      suggestions.push({
        type: 'warning',
        title: 'CPU temperature is high',
        description: `CPU temperature is at ${state.cpuTemp}°C. Consider improving cooling.`,
        priority: 'critical',
        category: 'hardware',
      });
    }

    // Battery low
    if (state.batteryPercent !== null && state.batteryPercent < 20 && !state.isCharging) {
      suggestions.push({
        type: 'warning',
        title: 'Battery is low',
        description: `Battery is at ${state.batteryPercent}%. Consider plugging in.`,
        priority: 'high',
        category: 'power',
      });
    }

    // Many processes running
    if (state.processCount > 200) {
      suggestions.push({
        type: 'optimization',
        title: 'Many processes running',
        description: `${state.processCount} processes are running. Consider closing unnecessary ones.`,
        command: 'process_list',
        priority: 'medium',
        category: 'performance',
      });
    }

    // Suggest common actions
    suggestions.push({
      type: 'action',
      title: 'Quick actions available',
      description: 'You can ask me to: take a screenshot, check system status, open an app, or run any command.',
      priority: 'low',
      category: 'general',
    });

    return suggestions;
  }

  /**
   * Get smart suggestions based on context
   */
  async getContextualSuggestions(userId: string, lastCommand?: string): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    if (lastCommand) {
      // After file creation
      if (lastCommand === 'create_file') {
        suggestions.push({
          type: 'action',
          title: 'Run the file?',
          description: 'Would you like me to run the file you just created?',
          priority: 'medium',
          category: 'followup',
        });
      }

      // After screenshot
      if (lastCommand === 'screenshot') {
        suggestions.push({
          type: 'action',
          title: 'Analyze screenshot?',
          description: 'Would you like me to analyze what\'s on the screen?',
          priority: 'medium',
          category: 'followup',
        });
      }

      // After process list
      if (lastCommand === 'process_list') {
        suggestions.push({
          type: 'action',
          title: 'Kill a process?',
          description: 'Would you like me to kill any of the running processes?',
          priority: 'medium',
          category: 'followup',
        });
      }

      // After status check
      if (lastCommand === 'status') {
        suggestions.push({
          type: 'action',
          title: 'Optimize system?',
          description: 'Would you like me to suggest optimizations based on the current status?',
          priority: 'medium',
          category: 'followup',
        });
      }
    }

    return suggestions;
  }

  /**
   * Monitor system and alert on conditions
   */
  async startMonitoring(intervalMs: number = 30000): Promise<void> {
    logger.info({ intervalMs }, 'Starting proactive monitoring');

    setInterval(async () => {
      try {
        const state = await this.monitor.collectState('self');

        // Check rules
        for (const rule of this.rules) {
          if (!rule.enabled) continue;

          const shouldTrigger = this.evaluateRule(rule, state);
          if (shouldTrigger) {
            logger.warn({ rule: rule.name }, 'Monitoring rule triggered');
            rule.lastTriggered = new Date().toISOString();
            // Execute action (could be notification, command, etc.)
          }
        }
      } catch (err) {
        logger.error({ err }, 'Monitoring error');
      }
    }, intervalMs);
  }

  /**
   * Add monitoring rule
   */
  addRule(rule: MonitoringRule): void {
    this.rules.push(rule);
    logger.info({ rule: rule.name }, 'Monitoring rule added');
  }

  /**
   * Remove monitoring rule
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
    logger.info({ ruleId }, 'Monitoring rule removed');
  }

  /**
   * Evaluate if a rule should trigger
   */
  private evaluateRule(rule: MonitoringRule, state: any): boolean {
    // Simple condition evaluation
    // In production, this would be more sophisticated
    try {
      const condition = rule.condition.toLowerCase();

      if (condition.includes('cpu >')) {
        const threshold = parseInt(condition.match(/cpu > (\d+)/)?.[1] || '0');
        return state.cpuUsage > threshold;
      }

      if (condition.includes('ram >')) {
        const threshold = parseInt(condition.match(/ram > (\d+)/)?.[1] || '0');
        return state.ramUsage > threshold;
      }

      if (condition.includes('disk >')) {
        const threshold = parseInt(condition.match(/disk > (\d+)/)?.[1] || '0');
        return state.diskUsage > threshold;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get automation suggestions based on patterns
   */
  async getAutomationSuggestions(interactions: any[]): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // Find repeated commands
    const commandCounts: Record<string, number> = {};
    for (const interaction of interactions) {
      if (interaction.commandType) {
        commandCounts[interaction.commandType] = (commandCounts[interaction.commandType] || 0) + 1;
      }
    }

    // Suggest automation for frequently used commands
    for (const [command, count] of Object.entries(commandCounts)) {
      if (count >= 3) {
        suggestions.push({
          type: 'automation',
          title: `Automate "${command}"?`,
          description: `You've used "${command}" ${count} times. Would you like me to create a scheduled task?`,
          priority: 'medium',
          category: 'automation',
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate daily report
   */
  async generateDailyReport(): Promise<string> {
    const state = await this.monitor.collectState('self');
    const sysInfo = await this.monitor.collectSystemInfo();

    return `
📊 DAILY SYSTEM REPORT
======================

🖥️ System: ${sysInfo.hostname}
💻 OS: ${sysInfo.osVersion}
🔲 CPU: ${sysInfo.cpuModel} (${sysInfo.cpuCores} cores)
💾 RAM: ${sysInfo.totalRamGb} GB
💿 Disk: ${sysInfo.totalDiskGb} GB

Current Status:
- CPU: ${state.cpuUsage.toFixed(1)}%
- RAM: ${state.ramUsage.toFixed(1)}%
- Disk: ${state.diskUsage.toFixed(1)}%
- Processes: ${state.processCount}
- Uptime: ${Math.floor(state.uptimeSeconds / 3600)}h ${Math.floor((state.uptimeSeconds % 3600) / 60)}m
${state.cpuTemp ? `- CPU Temp: ${state.cpuTemp}°C` : ''}
${state.batteryPercent !== null ? `- Battery: ${state.batteryPercent}%` : ''}

Recommendations:
${state.cpuUsage > 80 ? '⚠️ CPU usage is high - consider closing unnecessary apps' : '✅ CPU usage is normal'}
${state.ramUsage > 85 ? '⚠️ RAM usage is high - consider closing memory-intensive apps' : '✅ RAM usage is normal'}
${state.diskUsage > 90 ? '⚠️ Disk space is low - consider cleanup' : '✅ Disk space is sufficient'}
    `.trim();
  }
}
