/**
 * RAG Routes — Knowledge Base API
 *
 * SQLite-backed persistent RAG system with keyword search
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../config/logger.js';
import { getDatabase } from '../db/index.js';
import { sql } from 'drizzle-orm';

let initialized = false;

function ensureRAGTables(): void {
  if (initialized) return;
  try {
    const db = getDatabase();
    db.$client.exec(`
      CREATE TABLE IF NOT EXISTS rag_documents (
        id TEXT PRIMARY KEY,
        kb_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        doc_type TEXT DEFAULT 'text',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS rag_knowledge_bases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_rag_kb ON rag_documents(kb_id);
    `);
    initialized = true;
  } catch (err) {
    logger.error({ err }, 'Failed to initialize RAG tables');
  }
}

export function registerRAGRoutes(fastify: FastifyInstance): void {

  // GET /rag/stats — Get RAG statistics
  fastify.get('/rag/stats', async () => {
    ensureRAGTables();
    const db = getDatabase();

    const docCount = db.get(sql`SELECT COUNT(*) as count FROM rag_documents`) as { count: number };
    const kbCount = db.get(sql`SELECT COUNT(*) as count FROM rag_knowledge_bases`) as { count: number };

    return {
      success: true,
      stats: {
        documents: docCount.count,
        knowledgeBases: kbCount.count,
        searches: 0,
      },
    };
  });

  // POST /rag/knowledge-base — Create knowledge base
  fastify.post('/rag/knowledge-base', async (request, reply) => {
    ensureRAGTables();
    const { name, description } = request.body as { name: string; description?: string };

    if (!name) {
      return reply.status(400).send({ success: false, error: 'Missing name field' });
    }

    const id = `kb-${Date.now()}`;
    const db = getDatabase();
    db.run(sql`INSERT INTO rag_knowledge_bases (id, name, description) VALUES (${id}, ${name}, ${description ?? ''})`);

    logger.info({ id, name }, 'Knowledge base created');

    return {
      success: true,
      knowledgeBase: { id, name, description: description ?? '', documentCount: 0 },
    };
  });

  // GET /rag/knowledge-base — List knowledge bases
  fastify.get('/rag/knowledge-base', async () => {
    ensureRAGTables();
    const db = getDatabase();

    const kbs = db.all(sql`SELECT * FROM rag_knowledge_bases ORDER BY created_at DESC`) as Array<{
      id: string; name: string; description: string; created_at: string;
    }>;

    const result = kbs.map(kb => {
      const docCount = db.get(sql`SELECT COUNT(*) as count FROM rag_documents WHERE kb_id = ${kb.id}`) as { count: number };
      return {
        id: kb.id,
        name: kb.name,
        description: kb.description,
        documentCount: docCount.count,
        created: kb.created_at,
      };
    });

    return { success: true, knowledgeBases: result };
  });

  // POST /rag/document — Add document to knowledge base
  fastify.post('/rag/document', async (request, reply) => {
    ensureRAGTables();
    const { knowledgeBaseId, title, content, type } = request.body as {
      knowledgeBaseId: string; title: string; content: string; type?: string;
    };

    if (!knowledgeBaseId || !title || !content) {
      return reply.status(400).send({ success: false, error: 'Missing required fields' });
    }

    const db = getDatabase();
    const kb = db.get(sql`SELECT * FROM rag_knowledge_bases WHERE id = ${knowledgeBaseId}`) as { id: string } | undefined;
    if (!kb) {
      return reply.status(404).send({ success: false, error: 'Knowledge base not found' });
    }

    const docId = `doc-${Date.now()}`;
    db.run(sql`INSERT INTO rag_documents (id, kb_id, title, content, doc_type) VALUES (${docId}, ${knowledgeBaseId}, ${title}, ${content}, ${type ?? 'text'})`);

    logger.info({ kbId: knowledgeBaseId, docId, title }, 'Document added');

    return { success: true, document: { id: docId, title, content: content.slice(0, 500), type: type ?? 'text' } };
  });

  // POST /rag/search — Search knowledge base
  fastify.post('/rag/search', async (request, reply) => {
    ensureRAGTables();
    const { query, knowledgeBaseId } = request.body as { query: string; knowledgeBaseId?: string };

    if (!query) {
      return reply.status(400).send({ success: false, error: 'Missing query field' });
    }

    const db = getDatabase();
    const queryLower = query.toLowerCase();

    // Get documents to search
    let documents: Array<{ id: string; kb_id: string; title: string; content: string; doc_type: string }>;
    if (knowledgeBaseId) {
      documents = db.all(sql`SELECT * FROM rag_documents WHERE kb_id = ${knowledgeBaseId}`) as Array<{ id: string; kb_id: string; title: string; content: string; doc_type: string }>;
    } else {
      documents = db.all(sql`SELECT * FROM rag_documents`) as Array<{ id: string; kb_id: string; title: string; content: string; doc_type: string }>;
    }

    // Simple keyword search with relevance scoring
    const results: Array<{ document: { id: string; title: string; content: string; type: string }; score: number; relevantChunk: string }> = [];

    for (const doc of documents) {
      const contentLower = doc.content.toLowerCase();
      const titleLower = doc.title.toLowerCase();

      let score = 0;
      if (titleLower.includes(queryLower)) score += 0.5;
      if (contentLower.includes(queryLower)) score += 0.5;

      // Find relevant chunk
      const idx = contentLower.indexOf(queryLower);
      if (idx >= 0) {
        const start = Math.max(0, idx - 100);
        const end = Math.min(doc.content.length, idx + query.length + 100);
        const chunk = doc.content.slice(start, end);

        results.push({
          document: { id: doc.id, title: doc.title, content: doc.content.slice(0, 500), type: doc.doc_type },
          score,
          relevantChunk: chunk,
        });
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    return {
      success: true,
      results: results.slice(0, 10),
      totalResults: results.length,
    };
  });

  // DELETE /rag/document — Remove document
  fastify.delete('/rag/document/:id', async (request, reply) => {
    ensureRAGTables();
    const { id } = request.params as { id: string };

    const db = getDatabase();
    const result = db.run(sql`DELETE FROM rag_documents WHERE id = ${id}`);

    if (result.changes === 0) {
      return reply.status(404).send({ success: false, error: 'Document not found' });
    }

    return { success: true, message: 'Document removed' };
  });
}
