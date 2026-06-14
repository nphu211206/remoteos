/**
 * Conversation Memory — Persistent Context System
 *
 * Solves the critical "pronoun problem" in AI agents:
 *   User: "tạo file test.py" → AI creates file
 *   User: "chạy nó"          → AI needs to know "nó" = test.py
 *   User: "đọc file đó"      → AI needs to know "file đó" = test.py
 *
 * Architecture:
 *   - SQLite-backed persistent memory (survives restarts)
 *   - Per-user conversation history (last 50 turns)
 *   - Last action tracking with full context
 *   - Working directory awareness
 *   - Entity tracking (files, commands, results)
 *   - Auto-summarization for long conversations
 */

import { getDatabase } from '../db/index.js';
import { logger } from '../config/logger.js';
import { sql } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────

export interface ConversationTurn {
  id: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  /** Intent type if this was a command */
  intentType?: string;
  /** Command params if applicable */
  params?: Record<string, unknown>;
  /** Result summary (truncated) */
  resultSummary?: string;
  /** Files created/modified in this turn */
  filesAffected?: string[];
  /** Working directory at time of turn */
  workingDirectory?: string;
}

export interface LastAction {
  type: string;
  params: Record<string, unknown>;
  result?: unknown;
  resultSummary?: string;
  timestamp: string;
  /** Files created/modified in this action */
  filesAffected?: string[];
  /** Working directory at time of action */
  workingDirectory?: string;
}

export interface ConversationContext {
  /** Recent conversation turns */
  recentTurns: ConversationTurn[];
  /** Last executed action with full context */
  lastAction: LastAction | null;
  /** Second-to-last action (for "cái trước đó" references) */
  previousAction: LastAction | null;
  /** Current working directory */
  workingDirectory: string;
  /** Files recently mentioned/created/modified */
  recentFiles: string[];
  /** User's preferred language */
  language: string;
  /** Total interactions count */
  interactionCount: number;
}

// ─── Singleton ────────────────────────────────────────────────────

let memoryInstance: ConversationMemory | null = null;

export function getConversationMemory(): ConversationMemory {
  if (!memoryInstance) {
    memoryInstance = new ConversationMemory();
  }
  return memoryInstance;
}

// ─── Main Class ───────────────────────────────────────────────────

export class ConversationMemory {
  private initialized = false;

  /**
   * Initialize the conversation_context table if not exists
   */
  private ensureTable(): void {
    if (this.initialized) return;

    try {
      const db = getDatabase();
      db.$client.exec(`
        CREATE TABLE IF NOT EXISTS conversation_context (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          content TEXT NOT NULL,
          intent_type TEXT,
          params TEXT,
          result_summary TEXT,
          files_affected TEXT,
          working_directory TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_conversation_user
          ON conversation_context(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS user_entity_context (
          user_id TEXT PRIMARY KEY,
          last_action TEXT,
          previous_action TEXT,
          working_directory TEXT DEFAULT '',
          recent_files TEXT DEFAULT '[]',
          language TEXT DEFAULT 'vi',
          interaction_count INTEGER DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      this.initialized = true;
    } catch (err) {
      logger.error({ err }, 'Failed to initialize conversation memory tables');
    }
  }

  /**
   * Record a conversation turn
   */
  async recordTurn(turn: Omit<ConversationTurn, 'id' | 'timestamp'>): Promise<void> {
    this.ensureTable();

    try {
      const db = getDatabase();
      db.run(
        sql`INSERT INTO conversation_context (user_id, role, content, intent_type, params, result_summary, files_affected, working_directory)
            VALUES (${turn.userId}, ${turn.role}, ${turn.content}, ${turn.intentType ?? null}, ${turn.params ? JSON.stringify(turn.params) : null}, ${turn.resultSummary ?? null}, ${turn.filesAffected ? JSON.stringify(turn.filesAffected) : null}, ${turn.workingDirectory ?? null})`,
      );

      // Update interaction count (create row if not exists for new users)
      db.run(
        sql`INSERT INTO user_entity_context (user_id, interaction_count, updated_at)
            VALUES (${turn.userId}, 1, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              interaction_count = interaction_count + 1,
              updated_at = datetime('now')`,
      );

      // Trim old turns (keep last 50 per user)
      db.run(
        sql`DELETE FROM conversation_context
            WHERE user_id = ${turn.userId}
            AND id NOT IN (
              SELECT id FROM conversation_context
              WHERE user_id = ${turn.userId}
              ORDER BY created_at DESC
              LIMIT 50
            )`,
      );
    } catch (err) {
      logger.error({ err }, 'Failed to record conversation turn');
    }
  }

  /**
   * Update the last action context for pronoun resolution
   */
  async updateLastAction(userId: string, action: LastAction): Promise<void> {
    this.ensureTable();

    try {
      const db = getDatabase();

      // Get current last action to move it to previous
      const current = db.get(
        sql`SELECT last_action FROM user_entity_context WHERE user_id = ${userId}`,
      ) as { last_action: string | null } | undefined;

      const previousAction = current?.last_action ?? null;

      const actionJson = JSON.stringify(action);

      if (current) {
        db.run(
          sql`UPDATE user_entity_context
              SET last_action = ${actionJson},
                  previous_action = ${previousAction},
                  working_directory = ${action.workingDirectory ?? ''},
                  recent_files = ${JSON.stringify(action.filesAffected ?? [])},
                  updated_at = datetime('now')
              WHERE user_id = ${userId}`,
        );
      } else {
        db.run(
          sql`INSERT INTO user_entity_context (user_id, last_action, previous_action, working_directory, recent_files)
              VALUES (${userId}, ${actionJson}, ${previousAction}, ${action.workingDirectory ?? ''}, ${JSON.stringify(action.filesAffected ?? [])})`,
        );
      }
    } catch (err) {
      logger.error({ err }, 'Failed to update last action');
    }
  }

  /**
   * Get full conversation context for AI prompt injection
   */
  async getContext(userId: string): Promise<ConversationContext> {
    this.ensureTable();

    try {
      const db = getDatabase();

      // Get recent turns
      const turns = db.all(
        sql`SELECT * FROM conversation_context
            WHERE user_id = ${userId}
            ORDER BY created_at DESC
            LIMIT 20`,
      ) as Array<{
        id: number;
        user_id: string;
        role: string;
        content: string;
        intent_type: string | null;
        params: string | null;
        result_summary: string | null;
        files_affected: string | null;
        working_directory: string | null;
        created_at: string;
      }>;

      // Get entity context
      const entityCtx = db.get(
        sql`SELECT * FROM user_entity_context WHERE user_id = ${userId}`,
      ) as {
        last_action: string | null;
        previous_action: string | null;
        working_directory: string | null;
        recent_files: string | null;
        language: string | null;
        interaction_count: number | null;
      } | undefined;

      const lastAction: LastAction | null = entityCtx?.last_action
        ? JSON.parse(entityCtx.last_action)
        : null;
      const previousAction: LastAction | null = entityCtx?.previous_action
        ? JSON.parse(entityCtx.previous_action)
        : null;
      const recentFiles: string[] = entityCtx?.recent_files
        ? JSON.parse(entityCtx.recent_files)
        : [];

      // Merge files from last action
      if (lastAction?.filesAffected) {
        for (const f of lastAction.filesAffected) {
          if (!recentFiles.includes(f)) recentFiles.push(f);
        }
      }

      return {
        recentTurns: turns.reverse().map((t) => ({
          id: String(t.id),
          userId: t.user_id,
          role: t.role as 'user' | 'assistant' | 'system',
          content: t.content,
          timestamp: t.created_at,
          intentType: t.intent_type ?? undefined,
          params: t.params ? JSON.parse(t.params) : undefined,
          resultSummary: t.result_summary ?? undefined,
        })),
        lastAction,
        previousAction,
        workingDirectory: entityCtx?.working_directory ?? '',
        recentFiles: recentFiles.slice(0, 10),
        language: entityCtx?.language ?? 'vi',
        interactionCount: entityCtx?.interaction_count ?? 0,
      };
    } catch (err) {
      logger.error({ err }, 'Failed to get conversation context');
      return {
        recentTurns: [],
        lastAction: null,
        previousAction: null,
        workingDirectory: '',
        recentFiles: [],
        language: 'vi',
        interactionCount: 0,
      };
    }
  }

  /**
   * Get the last action for a user (convenience method)
   */
  async getLastAction(userId: string): Promise<LastAction | null> {
    const ctx = await this.getContext(userId);
    return ctx.lastAction;
  }

  /**
   * Resolve a pronoun/reference to an actual entity
   * Returns the resolved params or null if can't resolve
   */
  async resolveReference(
    userId: string,
    text: string,
  ): Promise<{ resolved: boolean; params?: Record<string, unknown>; context?: string } | null> {
    const ctx = await this.getContext(userId);
    if (!ctx.lastAction) return null;

    const lastAction = ctx.lastAction;
    const prevAction = ctx.previousAction;

    // Vietnamese pronouns and references (no \b — doesn't work with Vietnamese diacritics)
    const pronounPatterns = [
      // "nó", "cái đó", "file đó", "thư mục đó"
      { pattern: /(nó|cái đó|file đó|thư mục đó|folder đó|cái này|file này)/i, action: lastAction },
      // "cái trước đó", "file trước", "lệnh trước"
      { pattern: /(cái trước|file trước|lệnh trước|cái vừa rồi|file vừa rồi)/i, action: prevAction },
      // "vừa tạo", "vừa tìm", "vừa đọc", "vừa tải"
      { pattern: /(vừa tạo|vừa tìm|vừa đọc|vừa tải|chưa tạo|vừa sửa)/i, action: lastAction },
      // "kết quả", "output", "kết quả vừa rồi"
      { pattern: /(kết quả|output|kết quả vừa rồi|kết quả đó)/i, action: lastAction },
    ];

    for (const { pattern, action } of pronounPatterns) {
      if (pattern.test(text) && action) {
        // Build context from the referenced action
        const contextParts: string[] = [];

        if (action.type) contextParts.push(`Loại lệnh trước: ${action.type}`);
        if (action.params?.path) contextParts.push(`Path: ${action.params.path}`);
        if (action.params?.filename) contextParts.push(`File: ${action.params.filename}`);
        if (action.params?.command) contextParts.push(`Command: ${action.params.command}`);
        if (action.params?.pattern) contextParts.push(`Pattern tìm kiếm: ${action.params.pattern}`);
        if (action.params?.url) contextParts.push(`URL: ${action.params.url}`);
        if (action.resultSummary) contextParts.push(`Kết quả: ${action.resultSummary}`);
        if (action.filesAffected?.length) {
          contextParts.push(`File đã tác động: ${action.filesAffected.join(', ')}`);
        }

        return {
          resolved: true,
          params: action.params,
          context: contextParts.join('\n'),
        };
      }
    }

    // Check for implicit file references: "đọc nó", "chạy nó", "xóa nó"
    const implicitPatterns = [
      /(?:đọc|read|xem|cat)\s+(?:nó|thêm|tiếp)/i,
      /(?:chạy|run|execute)\s+(?:nó|thêm|tiếp)/i,
      /(?:xóa|delete|remove)\s+(?:nó|thêm|tiếp)/i,
      /(?:sửa|edit)\s+(?:nó|thêm|tiếp)/i,
      /(?:mở|open)\s+(?:nó|thêm|tiếp)/i,
    ];

    for (const pattern of implicitPatterns) {
      if (pattern.test(text) && lastAction) {
        return {
          resolved: true,
          params: lastAction.params,
          context: `Tham chiếu ngầm đến lệnh trước: ${lastAction.type} với params: ${JSON.stringify(lastAction.params)}`,
        };
      }
    }

    return null;
  }

  /**
   * Build context string for AI system prompt injection
   */
  async buildContextForAI(userId: string): Promise<string> {
    const ctx = await this.getContext(userId);

    if (ctx.interactionCount === 0) return '';

    const parts: string[] = [];

    // Last action context
    if (ctx.lastAction) {
      parts.push('## CONTEXT — LỆNH TRƯỚC ĐÓ:');
      parts.push(`- Loại: ${ctx.lastAction.type}`);
      if (ctx.lastAction.params?.path) parts.push(`- Path: ${ctx.lastAction.params.path}`);
      if (ctx.lastAction.params?.filename) parts.push(`- File: ${ctx.lastAction.params.filename}`);
      if (ctx.lastAction.params?.command) parts.push(`- Command: ${ctx.lastAction.params.command}`);
      if (ctx.lastAction.params?.pattern) parts.push(`- Pattern: ${ctx.lastAction.params.pattern}`);
      if (ctx.lastAction.params?.url) parts.push(`- URL: ${ctx.lastAction.params.url}`);
      if (ctx.lastAction.resultSummary) parts.push(`- Kết quả: ${ctx.lastAction.resultSummary}`);
      if (ctx.lastAction.filesAffected?.length) {
        parts.push(`- File đã tác động: ${ctx.lastAction.filesAffected.join(', ')}`);
      }
      parts.push('');
    }

    // Working directory
    if (ctx.workingDirectory) {
      parts.push(`## THƯ MỤC LÀM VIỆC HIỆN TẠI: ${ctx.workingDirectory}`);
      parts.push('');
    }

    // Recent files
    if (ctx.recentFiles.length > 0) {
      parts.push('## FILE GẦN ĐÂY:');
      for (const f of ctx.recentFiles.slice(0, 5)) {
        parts.push(`- ${f}`);
      }
      parts.push('');
    }

    // Recent conversation (last 15 turns for context)
    if (ctx.recentTurns.length > 0) {
      parts.push('## LỊCH SỬ GẦN ĐÂY (15 lượt cuối):');
      const last15 = ctx.recentTurns.slice(-15);
      for (const turn of last15) {
        const role = turn.role === 'user' ? '👤 User' : '🤖 AI';
        const content = turn.content.length > 200
          ? turn.content.slice(0, 200) + '...'
          : turn.content;
        parts.push(`${role}: ${content}`);
        if (turn.intentType) parts.push(`  → Intent: ${turn.intentType}`);
      }
      parts.push('');
    }

    // Pronoun resolution instructions
    parts.push('## QUY TẮC THAM CHIẾU:');
    parts.push('- Khi user nói "nó", "file đó", "cái đó" → tham chiếu đến kết quả/lệnh trước đó');
    parts.push('- Khi user nói "vừa tạo", "vừa tìm" → tham chiếu đến lệnh gần nhất');
    parts.push('- Khi user nói "đọc nó", "chạy nó" → áp dụng action mới lên đối tượng trước đó');
    parts.push('- Luôn suy luận từ context, KHÔNG hỏi lại user');
    parts.push('');

    return parts.join('\n');
  }

  /**
   * Clear all memory for a user (for /reset command)
   */
  async clearUserMemory(userId: string): Promise<void> {
    this.ensureTable();

    try {
      const db = getDatabase();
      db.run(sql`DELETE FROM conversation_context WHERE user_id = ${userId}`);
      db.run(sql`DELETE FROM user_entity_context WHERE user_id = ${userId}`);
      logger.info({ userId }, 'Cleared user conversation memory');
    } catch (err) {
      logger.error({ err }, 'Failed to clear user memory');
    }
  }
}
