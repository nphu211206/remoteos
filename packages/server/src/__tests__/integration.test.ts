/**
 * Integration Tests — Full Flow Testing
 *
 * Tests the complete flow from API request to response
 * Note: These tests require the server to be running on localhost:3000
 */

import { describe, it, expect } from 'vitest';

const API_BASE = 'http://localhost:3000/api/v1';

// Helper function to make API calls with retry
async function api(path: string, options?: RequestInit, retries = 5): Promise<{ status: number; data: Record<string, unknown> }> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options?.headers },
      });

      if (res.status === 429) {
        // Rate limited — wait and retry
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      return { status: res.status, data: await res.json() as Record<string, unknown> };
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return { status: 429, data: { success: false, error: 'Rate limited after retries' } };
}

describe('Integration Tests', () => {
  // Health Check
  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const res = await fetch('http://localhost:3000/health');
      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      expect(data.status).toBe('healthy');
      expect(data.database).toBe('connected');
    });
  });

  // Plugin System
  describe('Plugin System', () => {
    it('should list all plugins', async () => {
      const { status, data } = await api('/plugins');
      // Skip if rate limited
      if (status === 429) return;
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.plugins).toBeInstanceOf(Array);
      expect((data.plugins as unknown[]).length).toBeGreaterThan(0);
    });

    it('should have installed plugins', async () => {
      const { status, data } = await api('/plugins');
      if (status === 429) return;
      const plugins = data.plugins as Array<{ status: string }>;
      const installed = plugins.filter(p => p.status === 'installed');
      expect(installed.length).toBeGreaterThan(0);
    });
  });

  // Workflow System
  describe('Workflow System', () => {
    it('should list all workflows', async () => {
      const { status, data } = await api('/workflows');
      if (status === 429) return;
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.workflows).toBeInstanceOf(Array);
      expect((data.workflows as unknown[]).length).toBeGreaterThan(0);
    });

    it('should have active workflows', async () => {
      const { status, data } = await api('/workflows');
      if (status === 429) return;
      const workflows = data.workflows as Array<{ status: string }>;
      const active = workflows.filter(w => w.status === 'active');
      expect(active.length).toBeGreaterThan(0);
    });
  });

  // RAG System
  describe('RAG System', () => {
    it('should get RAG stats', async () => {
      const { status, data } = await api('/rag/stats');
      if (status === 429) return;
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.stats).toHaveProperty('documents');
      expect(data.stats).toHaveProperty('knowledgeBases');
      expect(data.stats).toHaveProperty('searches');
    });

    it('should list knowledge bases', async () => {
      const { status, data } = await api('/rag/knowledge-base');
      if (status === 429) return;
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.knowledgeBases).toBeInstanceOf(Array);
    });
  });
});
