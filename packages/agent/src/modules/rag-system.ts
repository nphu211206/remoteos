/**
 * RAG System — Retrieval Augmented Generation
 *
 * Combines:
 * - Document ingestion (PDF, Word, text, code)
 * - Vector embeddings for semantic search
 * - Knowledge base management
 * - Context-aware AI responses
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { logger } from '../config/logger.js';

export interface Document {
  id: string;
  title: string;
  content: string;
  type: 'pdf' | 'docx' | 'txt' | 'md' | 'code' | 'json' | 'csv';
  path?: string;
  embedding?: number[];
  metadata: {
    source: string;
    created: Date;
    size: number;
    tags: string[];
  };
}

export interface SearchResult {
  document: Document;
  score: number;
  relevantChunk: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  documents: Document[];
  created: Date;
  updated: Date;
}

export class RAGSystem {
  private knowledgeBases: Map<string, KnowledgeBase> = new Map();
  private dataDir: string;

  constructor() {
    this.dataDir = join(homedir(), '.remoteos', 'rag');
  }

  /**
   * Initialize RAG system
   */
  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await this.loadKnowledgeBases();
    logger.info('RAG system initialized');
  }

  /**
   * Create knowledge base
   */
  async createKnowledgeBase(name: string, description: string): Promise<KnowledgeBase> {
    const kb: KnowledgeBase = {
      id: `kb-${Date.now()}`,
      name,
      description,
      documents: [],
      created: new Date(),
      updated: new Date(),
    };

    this.knowledgeBases.set(kb.id, kb);
    await this.saveKnowledgeBases();

    logger.info({ kbId: kb.id, name }, 'Knowledge base created');
    return kb;
  }

  /**
   * Add document to knowledge base
   */
  async addDocument(kbId: string, doc: Omit<Document, 'id' | 'embedding' | 'metadata'>): Promise<Document> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new Error(`Knowledge base not found: ${kbId}`);
    }

    const document: Document = {
      id: `doc-${Date.now()}`,
      ...doc,
      embedding: await this.generateEmbedding(doc.content),
      metadata: {
        source: doc.path || 'manual',
        created: new Date(),
        size: doc.content.length,
        tags: this.extractTags(doc.content),
      },
    };

    kb.documents.push(document);
    kb.updated = new Date();

    await this.saveKnowledgeBases();

    logger.info({ kbId, docId: document.id, title: doc.title }, 'Document added');
    return document;
  }

  /**
   * Ingest file into knowledge base
   */
  async ingestFile(kbId: string, filePath: string): Promise<Document> {
    const content = await readFile(filePath, 'utf-8');
    const ext = filePath.split('.').pop()?.toLowerCase() || 'txt';

    const typeMap: Record<string, Document['type']> = {
      'pdf': 'pdf',
      'docx': 'docx',
      'txt': 'txt',
      'md': 'md',
      'py': 'code',
      'js': 'code',
      'ts': 'code',
      'json': 'json',
      'csv': 'csv',
    };

    return await this.addDocument(kbId, {
      title: filePath.split('/').pop() || filePath,
      content,
      type: typeMap[ext] || 'txt',
      path: filePath,
    });
  }

  /**
   * Search knowledge base
   */
  async search(kbId: string, query: string, topK: number = 5): Promise<SearchResult[]> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new Error(`Knowledge base not found: ${kbId}`);
    }

    const queryEmbedding = await this.generateEmbedding(query);

    // Calculate similarities
    const results: SearchResult[] = [];

    for (const doc of kb.documents) {
      if (doc.embedding) {
        const score = this.cosineSimilarity(queryEmbedding, doc.embedding);

        // Find relevant chunk
        const chunk = this.findRelevantChunk(doc.content, query);

        results.push({
          document: doc,
          score,
          relevantChunk: chunk,
        });
      }
    }

    // Sort by score and return top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Search across all knowledge bases
   */
  async searchAll(query: string, topK: number = 10): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];

    for (const kb of this.knowledgeBases.values()) {
      const results = await this.search(kb.id, query, topK);
      allResults.push(...results);
    }

    // Sort by score and return top K
    allResults.sort((a, b) => b.score - a.score);
    return allResults.slice(0, topK);
  }

  /**
   * Generate context for AI from search results
   */
  generateContext(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'No relevant documents found.';
    }

    let context = 'Relevant information from knowledge base:\n\n';

    for (const result of results) {
      context += `--- ${result.document.title} (score: ${result.score.toFixed(2)}) ---\n`;
      context += result.relevantChunk + '\n\n';
    }

    return context;
  }

  /**
   * Generate embedding (simplified)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Simplified embedding: TF-IDF-like approach
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(256).fill(0);

    for (const word of words) {
      const hash = this.hashString(word);
      embedding[hash % 256] += 1;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / (magnitude || 1));
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
   * Find relevant chunk in document
   */
  private findRelevantChunk(content: string, query: string): string {
    const sentences = content.split(/[.!?\n]+/).filter(s => s.trim().length > 0);
    const queryWords = query.toLowerCase().split(/\s+/);

    let bestChunk = '';
    let bestScore = 0;

    // Sliding window of 3 sentences
    for (let i = 0; i < sentences.length - 2; i++) {
      const chunk = sentences.slice(i, i + 3).join('. ');
      const chunkLower = chunk.toLowerCase();

      let score = 0;
      for (const word of queryWords) {
        if (chunkLower.includes(word)) {
          score++;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestChunk = chunk;
      }
    }

    return bestChunk || content.substring(0, 500);
  }

  /**
   * Extract tags from content
   */
  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const lower = content.toLowerCase();

    if (lower.includes('code') || lower.includes('function') || lower.includes('class')) {
      tags.push('code');
    }
    if (lower.includes('data') || lower.includes('analysis') || lower.includes('statistics')) {
      tags.push('data');
    }
    if (lower.includes('api') || lower.includes('endpoint') || lower.includes('request')) {
      tags.push('api');
    }
    if (lower.includes('config') || lower.includes('settings') || lower.includes('configuration')) {
      tags.push('config');
    }

    return tags;
  }

  /**
   * Hash string to number
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Get knowledge base
   */
  getKnowledgeBase(kbId: string): KnowledgeBase | null {
    return this.knowledgeBases.get(kbId) || null;
  }

  /**
   * Get all knowledge bases
   */
  getAllKnowledgeBases(): KnowledgeBase[] {
    return Array.from(this.knowledgeBases.values());
  }

  /**
   * Delete document
   */
  async deleteDocument(kbId: string, docId: string): Promise<void> {
    const kb = this.knowledgeBases.get(kbId);
    if (kb) {
      kb.documents = kb.documents.filter(d => d.id !== docId);
      kb.updated = new Date();
      await this.saveKnowledgeBases();
    }
  }

  /**
   * Delete knowledge base
   */
  async deleteKnowledgeBase(kbId: string): Promise<void> {
    this.knowledgeBases.delete(kbId);
    await this.saveKnowledgeBases();
  }

  /**
   * Save knowledge bases to disk
   */
  private async saveKnowledgeBases(): Promise<void> {
    const data = JSON.stringify(Array.from(this.knowledgeBases.entries()), null, 2);
    await writeFile(join(this.dataDir, 'knowledge_bases.json'), data, 'utf-8');
  }

  /**
   * Load knowledge bases from disk
   */
  private async loadKnowledgeBases(): Promise<void> {
    const path = join(this.dataDir, 'knowledge_bases.json');
    if (existsSync(path)) {
      const data = await readFile(path, 'utf-8');
      const entries = JSON.parse(data);
      this.knowledgeBases = new Map(entries);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalKnowledgeBases: number;
    totalDocuments: number;
    totalSize: number;
  } {
    let totalDocuments = 0;
    let totalSize = 0;

    for (const kb of this.knowledgeBases.values()) {
      totalDocuments += kb.documents.length;
      totalSize += kb.documents.reduce((sum, doc) => sum + doc.metadata.size, 0);
    }

    return {
      totalKnowledgeBases: this.knowledgeBases.size,
      totalDocuments,
      totalSize,
    };
  }
}
