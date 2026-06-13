/**
 * Memory System Module
 *
 * Allows AI to remember user preferences and learn from interactions.
 * Persists across sessions using file-based storage.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { logger } from '../config/logger.js';

export interface UserMemory {
  userId: string;
  preferences: UserPreferences;
  interactions: Interaction[];
  context: Record<string, unknown>;
  lastUpdated: string;
}

export interface UserPreferences {
  language: string;
  codeStyle: string;
  preferredEditor: string;
  preferredBrowser: string;
  timezone: string;
  theme: 'light' | 'dark';
  notifications: boolean;
  autoExecute: boolean;
  customSettings: Record<string, unknown>;
}

export interface Interaction {
  timestamp: string;
  userInput: string;
  aiResponse: string;
  commandType: string;
  success: boolean;
  feedback?: string;
}

export class MemorySystem {
  private memoryDir: string;
  private memories: Map<string, UserMemory> = new Map();

  constructor() {
    this.memoryDir = join(homedir(), '.remoteos', 'memory');
  }

  /**
   * Initialize memory system
   */
  async init(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
    logger.info({ dir: this.memoryDir }, 'Memory system initialized');
  }

  /**
   * Load user memory from disk
   */
  async loadMemory(userId: string): Promise<UserMemory> {
    if (this.memories.has(userId)) {
      return this.memories.get(userId)!;
    }

    const filePath = join(this.memoryDir, `${userId}.json`);

    if (existsSync(filePath)) {
      try {
        const data = await readFile(filePath, 'utf-8');
        const memory = JSON.parse(data) as UserMemory;
        this.memories.set(userId, memory);
        return memory;
      } catch (err) {
        logger.error({ err, userId }, 'Failed to load memory');
      }
    }

    // Create new memory
    const newMemory: UserMemory = {
      userId,
      preferences: this.getDefaultPreferences(),
      interactions: [],
      context: {},
      lastUpdated: new Date().toISOString(),
    };

    this.memories.set(userId, newMemory);
    await this.saveMemory(userId);
    return newMemory;
  }

  /**
   * Save user memory to disk
   */
  async saveMemory(userId: string): Promise<void> {
    const memory = this.memories.get(userId);
    if (!memory) return;

    const filePath = join(this.memoryDir, `${userId}.json`);
    memory.lastUpdated = new Date().toISOString();

    await writeFile(filePath, JSON.stringify(memory, null, 2), 'utf-8');
    logger.debug({ userId }, 'Memory saved');
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId: string): Promise<UserPreferences> {
    const memory = await this.loadMemory(userId);
    return memory.preferences;
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, updates: Partial<UserPreferences>): Promise<void> {
    const memory = await this.loadMemory(userId);
    memory.preferences = { ...memory.preferences, ...updates };
    await this.saveMemory(userId);
    logger.info({ userId, updates }, 'Preferences updated');
  }

  /**
   * Record an interaction
   */
  async recordInteraction(userId: string, interaction: Interaction): Promise<void> {
    const memory = await this.loadMemory(userId);

    // Keep last 100 interactions
    memory.interactions.push(interaction);
    if (memory.interactions.length > 100) {
      memory.interactions = memory.interactions.slice(-100);
    }

    await this.saveMemory(userId);
  }

  /**
   * Get recent interactions
   */
  async getRecentInteractions(userId: string, count: number = 10): Promise<Interaction[]> {
    const memory = await this.loadMemory(userId);
    return memory.interactions.slice(-count);
  }

  /**
   * Update context
   */
  async updateContext(userId: string, key: string, value: unknown): Promise<void> {
    const memory = await this.loadMemory(userId);
    memory.context[key] = value;
    await this.saveMemory(userId);
  }

  /**
   * Get context
   */
  async getContext(userId: string, key: string): Promise<unknown> {
    const memory = await this.loadMemory(userId);
    return memory.context[key];
  }

  /**
   * Get all context
   */
  async getAllContext(userId: string): Promise<Record<string, unknown>> {
    const memory = await this.loadMemory(userId);
    return memory.context;
  }

  /**
   * Clear memory for user
   */
  async clearMemory(userId: string): Promise<void> {
    this.memories.delete(userId);
    const filePath = join(this.memoryDir, `${userId}.json`);
    if (existsSync(filePath)) {
      const { unlink } = await import('node:fs/promises');
      await unlink(filePath);
    }
    logger.info({ userId }, 'Memory cleared');
  }

  /**
   * Get memory summary for AI context
   */
  async getMemorySummary(userId: string): Promise<string> {
    const memory = await this.loadMemory(userId);

    const recentInteractions = memory.interactions.slice(-5);
    const interactionSummary = recentInteractions.map(i =>
      `- ${i.userInput} → ${i.success ? '✅' : '❌'} (${i.commandType})`
    ).join('\n');

    return `
USER MEMORY:
- Language: ${memory.preferences.language}
- Editor: ${memory.preferences.preferredEditor}
- Theme: ${memory.preferences.theme}
- Auto-execute: ${memory.preferences.autoExecute ? 'Yes' : 'No'}

RECENT INTERACTIONS:
${interactionSummary || 'No recent interactions'}

CONTEXT:
${JSON.stringify(memory.context, null, 2) || 'No context'}
`.trim();
  }

  /**
   * Learn from user behavior
   */
  async learnFromInteraction(userId: string, interaction: Interaction): Promise<void> {
    const memory = await this.loadMemory(userId);

    // Learn preferred language
    if (interaction.userInput.match(/^(tạo|create|viết|write)\s+(file|code)/i)) {
      const langMatch = interaction.userInput.match(/(python|javascript|typescript|java|c\+\+|html|css)/i);
      if (langMatch) {
        memory.preferences.codeStyle = langMatch[1].toLowerCase();
      }
    }

    // Learn preferred editor
    if (interaction.userInput.match(/(mở|open)\s+(vscode|notepad|sublime)/i)) {
      const editorMatch = interaction.userInput.match(/(vscode|notepad|sublime)/i);
      if (editorMatch) {
        memory.preferences.preferredEditor = editorMatch[1].toLowerCase();
      }
    }

    // Record interaction
    await this.recordInteraction(userId, interaction);
    await this.saveMemory(userId);
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      language: 'vi',
      codeStyle: 'python',
      preferredEditor: 'vscode',
      preferredBrowser: 'chrome',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      theme: 'dark',
      notifications: true,
      autoExecute: false,
      customSettings: {},
    };
  }
}
