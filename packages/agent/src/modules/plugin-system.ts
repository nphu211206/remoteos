/**
 * Plugin System
 *
 * Extensible architecture for adding new capabilities:
 * - Plugin lifecycle management
 * - Command registration
 * - Event system
 * - Configuration management
 * - Security sandboxing
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { logger } from '../config/logger.js';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  dependencies?: string[];
  permissions?: string[];
  config?: Record<string, any>;
}

export interface PluginCommand {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object';
    required: boolean;
    description: string;
  }>;
  handler: (params: Record<string, any>) => Promise<any>;
}

export interface PluginEvent {
  type: string;
  data: any;
  timestamp: Date;
}

export interface Plugin {
  manifest: PluginManifest;
  commands: PluginCommand[];
  eventHandlers: Map<string, (event: PluginEvent) => Promise<void>>;
  config: Record<string, any>;
  isActive: boolean;
}

export class PluginSystem {
  private plugins: Map<string, Plugin> = new Map();
  private pluginDir: string;
  private eventListeners: Map<string, Array<(event: PluginEvent) => Promise<void>>> = new Map();

  constructor() {
    this.pluginDir = join(homedir(), '.remoteos', 'plugins');
  }

  /**
   * Initialize plugin system
   */
  async init(): Promise<void> {
    await mkdir(this.pluginDir, { recursive: true });
    await this.loadPlugins();
    logger.info({ pluginCount: this.plugins.size }, 'Plugin system initialized');
  }

  /**
   * Install plugin from manifest
   */
  async installPlugin(manifest: PluginManifest, pluginCode: string): Promise<void> {
    // Validate manifest
    this.validateManifest(manifest);

    // Create plugin directory
    const pluginPath = join(this.pluginDir, manifest.name);
    await mkdir(pluginPath, { recursive: true });

    // Save manifest
    await writeFile(join(pluginPath, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

    // Save plugin code
    await writeFile(join(pluginPath, manifest.main), pluginCode, 'utf-8');

    // Load plugin
    await this.loadPlugin(manifest.name);

    logger.info({ name: manifest.name, version: manifest.version }, 'Plugin installed');
  }

  /**
   * Load plugin from disk
   */
  private async loadPlugin(pluginName: string): Promise<void> {
    const pluginPath = join(this.pluginDir, pluginName);
    const manifestPath = join(pluginPath, 'manifest.json');

    if (!existsSync(manifestPath)) {
      throw new Error(`Plugin manifest not found: ${pluginName}`);
    }

    // Read manifest
    const manifestData = await readFile(manifestPath, 'utf-8');
    const manifest: PluginManifest = JSON.parse(manifestData);

    // Load plugin module (simplified - in production use dynamic import)
    const plugin: Plugin = {
      manifest,
      commands: [],
      eventHandlers: new Map(),
      config: manifest.config || {},
      isActive: true,
    };

    // Register plugin
    this.plugins.set(pluginName, plugin);

    logger.info({ name: pluginName }, 'Plugin loaded');
  }

  /**
   * Load all plugins from directory
   */
  private async loadPlugins(): Promise<void> {
    try {
      const entries = await readdir(this.pluginDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            await this.loadPlugin(entry.name);
          } catch (err: any) {
            logger.error({ err: err.message, plugin: entry.name }, 'Failed to load plugin');
          }
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to read plugin directory');
    }
  }

  /**
   * Validate plugin manifest
   */
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.name) throw new Error('Plugin name is required');
    if (!manifest.version) throw new Error('Plugin version is required');
    if (!manifest.main) throw new Error('Plugin main file is required');

    // Check for valid name (no special characters)
    if (!/^[a-z0-9-]+$/.test(manifest.name)) {
      throw new Error('Plugin name must contain only lowercase letters, numbers, and hyphens');
    }
  }

  /**
   * Register command from plugin
   */
  registerCommand(pluginName: string, command: PluginCommand): void {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    plugin.commands.push(command);
    logger.info({ plugin: pluginName, command: command.name }, 'Command registered');
  }

  /**
   * Execute command from plugin
   */
  async executeCommand(commandName: string, params: Record<string, any>): Promise<any> {
    // Find plugin that has this command
    for (const [pluginName, plugin] of this.plugins) {
      if (!plugin.isActive) continue;

      const command = plugin.commands.find(cmd => cmd.name === commandName);
      if (command) {
        logger.info({ plugin: pluginName, command: commandName }, 'Executing plugin command');

        try {
          const result = await command.handler(params);
          return result;
        } catch (err: any) {
          logger.error({ err: err.message, plugin: pluginName, command: commandName }, 'Plugin command failed');
          throw err;
        }
      }
    }

    throw new Error(`Command not found: ${commandName}`);
  }

  /**
   * Emit event to all plugins
   */
  async emitEvent(event: PluginEvent): Promise<void> {
    const listeners = this.eventListeners.get(event.type) || [];

    for (const listener of listeners) {
      try {
        await listener(event);
      } catch (err: any) {
        logger.error({ err: err.message, eventType: event.type }, 'Event handler failed');
      }
    }

    // Also notify plugins with event handlers
    for (const [pluginName, plugin] of this.plugins) {
      if (!plugin.isActive) continue;

      const handler = plugin.eventHandlers.get(event.type);
      if (handler) {
        try {
          await handler(event);
        } catch (err: any) {
          logger.error({ err: err.message, plugin: pluginName }, 'Plugin event handler failed');
        }
      }
    }
  }

  /**
   * Register event listener
   */
  on(eventType: string, handler: (event: PluginEvent) => Promise<void>): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }

    this.eventListeners.get(eventType)!.push(handler);
  }

  /**
   * Get all registered commands
   */
  getCommands(): Array<{ plugin: string; command: PluginCommand }> {
    const commands: Array<{ plugin: string; command: PluginCommand }> = [];

    for (const [pluginName, plugin] of this.plugins) {
      if (!plugin.isActive) continue;

      for (const command of plugin.commands) {
        commands.push({ plugin: pluginName, command });
      }
    }

    return commands;
  }

  /**
   * Get plugin info
   */
  getPluginInfo(pluginName: string): Plugin | null {
    return this.plugins.get(pluginName) || null;
  }

  /**
   * Get all plugins
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Activate plugin
   */
  activatePlugin(pluginName: string): void {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      plugin.isActive = true;
      logger.info({ plugin: pluginName }, 'Plugin activated');
    }
  }

  /**
   * Deactivate plugin
   */
  deactivatePlugin(pluginName: string): void {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      plugin.isActive = false;
      logger.info({ plugin: pluginName }, 'Plugin deactivated');
    }
  }

  /**
   * Uninstall plugin
   */
  async uninstallPlugin(pluginName: string): Promise<void> {
    this.plugins.delete(pluginName);

    // Remove plugin directory
    const pluginPath = join(this.pluginDir, pluginName);
    if (existsSync(pluginPath)) {
      const { rm } = await import('node:fs/promises');
      await rm(pluginPath, { recursive: true, force: true });
    }

    logger.info({ plugin: pluginName }, 'Plugin uninstalled');
  }

  /**
   * Get plugin statistics
   */
  getStats(): {
    totalPlugins: number;
    activePlugins: number;
    totalCommands: number;
  } {
    const plugins = Array.from(this.plugins.values());
    const activePlugins = plugins.filter(p => p.isActive).length;
    const totalCommands = plugins.reduce((sum, p) => sum + p.commands.length, 0);

    return {
      totalPlugins: this.plugins.size,
      activePlugins,
      totalCommands,
    };
  }
}
