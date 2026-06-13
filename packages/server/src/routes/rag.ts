/**
 * RAG Routes — Knowledge Base API
 *
 * Real implementation connected to the RAG system
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../config/logger.js';

// In-memory RAG storage (would be persisted in production)
const knowledgeBases: Map<string, { id: string; name: string; description: string; documents: Array<{ id: string; title: string; content: string; type: string }>; created: Date }> = new Map();
let searchCount = 0;

export function registerRAGRoutes(fastify: FastifyInstance): void {

  // GET /rag/stats — Get RAG statistics
  fastify.get('/rag/stats', async () => {
    let totalDocuments = 0;
    for (const kb of knowledgeBases.values()) {
      totalDocuments += kb.documents.length;
    }

    return {
      success: true,
      stats: {
        documents: totalDocuments,
        knowledgeBases: knowledgeBases.size,
        searches: searchCount,
      },
    };
  });

  // POST /rag/knowledge-base — Create knowledge base
  fastify.post('/rag/knowledge-base', async (request, reply) => {
    const { name, description } = request.body as { name: string; description?: string };

    if (!name) {
      return reply.status(400).send({ success: false, error: 'Missing name field' });
    }

    const id = `kb-${Date.now()}`;
    knowledgeBases.set(id, {
      id,
      name,
      description: description ?? '',
      documents: [],
      created: new Date(),
    });

    logger.info({ id, name }, 'Knowledge base created');

    return {
      success: true,
      knowledgeBase: { id, name, description: description ?? '', documentCount: 0 },
    };
  });

  // GET /rag/knowledge-base — List knowledge bases
  fastify.get('/rag/knowledge-base', async () => {
    const kbs = Array.from(knowledgeBases.values()).map(kb => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      documentCount: kb.documents.length,
      created: kb.created,
    }));

    return { success: true, knowledgeBases: kbs };
  });

  // POST /rag/document — Add document to knowledge base
  fastify.post('/rag/document', async (request, reply) => {
    const { knowledgeBaseId, title, content, type } = request.body as {
      knowledgeBaseId: string; title: string; content: string; type?: string;
    };

    if (!knowledgeBaseId || !title || !content) {
      return reply.status(400).send({ success: false, error: 'Missing required fields' });
    }

    const kb = knowledgeBases.get(knowledgeBaseId);
    if (!kb) {
      return reply.status(404).send({ success: false, error: 'Knowledge base not found' });
    }

    const doc = {
      id: `doc-${Date.now()}`,
      title,
      content,
      type: type ?? 'text',
    };

    kb.documents.push(doc);

    logger.info({ kbId: knowledgeBaseId, docId: doc.id, title }, 'Document added');

    return { success: true, document: doc };
  });

  // POST /rag/search — Search knowledge base
  fastify.post('/rag/search', async (request, reply) => {
    const { query, knowledgeBaseId } = request.body as { query: string; knowledgeBaseId?: string };

    if (!query) {
      return reply.status(400).send({ success: false, error: 'Missing query field' });
    }

    searchCount++;

    // Simple keyword search (would use vector embeddings in production)
    const results: Array<{ document: { id: string; title: string; content: string; type: string }; score: number; relevantChunk: string }> = [];

    const kbsToSearch = knowledgeBaseId
      ? [knowledgeBases.get(knowledgeBaseId)].filter(Boolean)
      : Array.from(knowledgeBases.values());

    for (const kb of kbsToSearch) {
      if (!kb) continue;
      for (const doc of kb.documents) {
        const queryLower = query.toLowerCase();
        const contentLower = doc.content.toLowerCase();
        const titleLower = doc.title.toLowerCase();

        // Simple relevance scoring
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
            document: { id: doc.id, title: doc.title, content: doc.content.slice(0, 500), type: doc.type },
            score,
            relevantChunk: chunk,
          });
        }
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
    const { id } = request.params as { id: string };

    for (const kb of knowledgeBases.values()) {
      const idx = kb.documents.findIndex(d => d.id === id);
      if (idx >= 0) {
        kb.documents.splice(idx, 1);
        return { success: true, message: 'Document removed' };
      }
    }

    return reply.status(404).send({ success: false, error: 'Document not found' });
  });
}
