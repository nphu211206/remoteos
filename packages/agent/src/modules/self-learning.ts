/**
 * Self-Learning System
 *
 * AI that learns and improves from interactions:
 * - Vector memory for semantic search
 * - Pattern recognition
 * - User profiling
 * - Predictive assistance
 * - Continuous improvement
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { logger } from '../config/logger.js';

export interface Memory {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    type: 'interaction' | 'solution' | 'preference' | 'pattern';
    userId?: string;
    timestamp: Date;
    tags: string[];
    importance: number; // 0-1
  };
}

export interface UserProfile {
  userId: string;
  preferences: {
    language: string;
    codingStyle: string;
    preferredTools: string[];
    workingHours: { start: number; end: number };
    skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  };
  patterns: {
    commonCommands: string[];
    frequentTopics: string[];
    errorPatterns: string[];
    successPatterns: string[];
  };
  history: {
    totalInteractions: number;
    successfulInteractions: number;
    averageResponseTime: number;
    lastActive: Date;
  };
}

export interface Prediction {
  action: string;
  confidence: number;
  reasoning: string;
}

export class SelfLearningSystem {
  private memoryDir: string;
  private memories: Map<string, Memory> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();
  private embeddings: Map<string, number[]> = new Map();

  constructor() {
    this.memoryDir = join(homedir(), '.remoteos', 'learning');
  }

  /**
   * Initialize learning system
   */
  async init(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
    await this.loadMemories();
    await this.loadUserProfiles();
    logger.info('Self-learning system initialized');
  }

  /**
   * Store memory with embedding
   */
  async storeMemory(memory: Memory): Promise<void> {
    // Generate embedding (simplified - in production use OpenAI Ada-2)
    const embedding = await this.generateEmbedding(memory.content);
    memory.embedding = embedding;

    // Store in memory
    this.memories.set(memory.id, memory);

    // Persist to disk
    await this.saveMemories();

    logger.debug({ id: memory.id, type: memory.metadata.type }, 'Memory stored');
  }

  /**
   * Search memories by semantic similarity
   */
  async searchMemories(query: string, topK: number = 5): Promise<Memory[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    // Calculate similarities
    const similarities: Array<{ memory: Memory; score: number }> = [];

    for (const memory of this.memories.values()) {
      if (memory.embedding) {
        const similarity = this.cosineSimilarity(queryEmbedding, memory.embedding);
        similarities.push({ memory, score: similarity });
      }
    }

    // Sort by similarity and return top K
    similarities.sort((a, b) => b.score - a.score);
    return similarities.slice(0, topK).map(s => s.memory);
  }

  /**
   * Learn from interaction
   */
  async learnFromInteraction(interaction: {
    userId: string;
    input: string;
    output: string;
    success: boolean;
    feedback?: string;
  }): Promise<void> {
    // 1. Store interaction as memory
    await this.storeMemory({
      id: `interaction-${Date.now()}`,
      content: `User: ${interaction.input}\nAI: ${interaction.output}`,
      metadata: {
        type: 'interaction',
        userId: interaction.userId,
        timestamp: new Date(),
        tags: this.extractTags(interaction.input),
        importance: interaction.success ? 0.8 : 0.4,
      },
    });

    // 2. Update user profile
    await this.updateUserProfile(interaction.userId, interaction);

    // 3. Extract patterns
    if (interaction.success) {
      await this.extractSuccessPattern(interaction);
    } else {
      await this.extractErrorPattern(interaction);
    }

    logger.info({ userId: interaction.userId, success: interaction.success }, 'Learned from interaction');
  }

  /**
   * Generate embedding for text (simplified)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Simplified embedding: hash-based
    // In production, use OpenAI Ada-2 or similar
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(128).fill(0);

    for (const word of words) {
      const hash = this.hashString(word);
      embedding[hash % 128] += 1;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Hash string to number
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Extract tags from text
   */
  private extractTags(text: string): string[] {
    const tags: string[] = [];
    const lower = text.toLowerCase();

    // Code-related
    if (lower.includes('code') || lower.includes('script') || lower.includes('program')) {
      tags.push('code');
    }

    // File-related
    if (lower.includes('file') || lower.includes('document')) {
      tags.push('file');
    }

    // System-related
    if (lower.includes('system') || lower.includes('process')) {
      tags.push('system');
    }

    // Web-related
    if (lower.includes('web') || lower.includes('browser') || lower.includes('url')) {
      tags.push('web');
    }

    return tags;
  }

  /**
   * Update user profile
   */
  private async updateUserProfile(userId: string, interaction: any): Promise<void> {
    let profile = this.userProfiles.get(userId);

    if (!profile) {
      profile = {
        userId,
        preferences: {
          language: 'en',
          codingStyle: 'standard',
          preferredTools: [],
          workingHours: { start: 9, end: 17 },
          skillLevel: 'intermediate',
        },
        patterns: {
          commonCommands: [],
          frequentTopics: [],
          errorPatterns: [],
          successPatterns: [],
        },
        history: {
          totalInteractions: 0,
          successfulInteractions: 0,
          averageResponseTime: 0,
          lastActive: new Date(),
        },
      };
    }

    // Update history
    profile.history.totalInteractions++;
    if (interaction.success) {
      profile.history.successfulInteractions++;
    }
    profile.history.lastActive = new Date();

    // Update patterns
    const tags = this.extractTags(interaction.input);
    for (const tag of tags) {
      if (!profile.patterns.frequentTopics.includes(tag)) {
        profile.patterns.frequentTopics.push(tag);
      }
    }

    this.userProfiles.set(userId, profile);
    await this.saveUserProfiles();
  }

  /**
   * Extract success pattern
   */
  private async extractSuccessPattern(interaction: any): Promise<void> {
    const pattern = {
      id: `success-${Date.now()}`,
      content: `Successful: ${interaction.input} -> ${interaction.output}`,
      metadata: {
        type: 'pattern' as const,
        userId: interaction.userId,
        timestamp: new Date(),
        tags: ['success', ...this.extractTags(interaction.input)],
        importance: 0.9,
      },
    };

    await this.storeMemory(pattern);
  }

  /**
   * Extract error pattern
   */
  private async extractErrorPattern(interaction: any): Promise<void> {
    const pattern = {
      id: `error-${Date.now()}`,
      content: `Failed: ${interaction.input} -> Error: ${interaction.output}`,
      metadata: {
        type: 'pattern' as const,
        userId: interaction.userId,
        timestamp: new Date(),
        tags: ['error', ...this.extractTags(interaction.input)],
        importance: 0.7,
      },
    };

    await this.storeMemory(pattern);
  }

  /**
   * Predict next action
   */
  async predictNextAction(userId: string, context: string): Promise<Prediction[]> {
    const predictions: Prediction[] = [];

    // Get user profile
    const profile = this.userProfiles.get(userId);

    // Search similar memories
    const similarMemories = await this.searchMemories(context, 3);

    // Generate predictions based on patterns
    if (profile) {
      // Predict based on common commands
      for (const command of profile.patterns.commonCommands.slice(0, 3)) {
        predictions.push({
          action: command,
          confidence: 0.7,
          reasoning: 'Based on your common commands',
        });
      }
    }

    // Predict based on similar memories
    for (const memory of similarMemories) {
      if (memory.metadata.type === 'interaction') {
        predictions.push({
          action: memory.content.split('\n')[0]?.replace('User: ', '') || '',
          confidence: 0.6,
          reasoning: 'Based on similar past interactions',
        });
      }
    }

    // Sort by confidence
    predictions.sort((a, b) => b.confidence - a.confidence);

    return predictions.slice(0, 5);
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    return this.userProfiles.get(userId) || null;
  }

  /**
   * Save memories to disk
   */
  private async saveMemories(): Promise<void> {
    const data = JSON.stringify(Array.from(this.memories.entries()), null, 2);
    await writeFile(join(this.memoryDir, 'memories.json'), data, 'utf-8');
  }

  /**
   * Load memories from disk
   */
  private async loadMemories(): Promise<void> {
    const path = join(this.memoryDir, 'memories.json');
    if (existsSync(path)) {
      const data = await readFile(path, 'utf-8');
      const entries = JSON.parse(data);
      this.memories = new Map(entries);
    }
  }

  /**
   * Save user profiles to disk
   */
  private async saveUserProfiles(): Promise<void> {
    const data = JSON.stringify(Array.from(this.userProfiles.entries()), null, 2);
    await writeFile(join(this.memoryDir, 'profiles.json'), data, 'utf-8');
  }

  /**
   * Load user profiles from disk
   */
  private async loadUserProfiles(): Promise<void> {
    const path = join(this.memoryDir, 'profiles.json');
    if (existsSync(path)) {
      const data = await readFile(path, 'utf-8');
      const entries = JSON.parse(data);
      this.userProfiles = new Map(entries);
    }
  }

  /**
   * Get learning statistics
   */
  getStats(): {
    totalMemories: number;
    totalUsers: number;
    averageImportance: number;
  } {
    const memories = Array.from(this.memories.values());
    const avgImportance = memories.length > 0
      ? memories.reduce((sum, m) => sum + m.metadata.importance, 0) / memories.length
      : 0;

    return {
      totalMemories: this.memories.size,
      totalUsers: this.userProfiles.size,
      averageImportance: avgImportance,
    };
  }
}
