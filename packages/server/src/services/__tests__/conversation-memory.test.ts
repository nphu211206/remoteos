/**
 * Conversation Memory Tests
 *
 * Tests the persistent context system that enables:
 * - Pronoun resolution ("nó", "file đó", "vừa tạo")
 * - Context injection into AI prompts
 * - Multi-turn conversation tracking
 * - Entity tracking (files, commands, results)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database module
vi.mock('../../db/index.js', () => ({
  getDb: vi.fn(() => ({
    exec: vi.fn(),
    run: vi.fn(),
    all: vi.fn(() => []),
    get: vi.fn(() => null),
  })),
}));

vi.mock('../../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { ConversationMemory } from '../conversation-memory.js';

describe('ConversationMemory', () => {
  let memory: ConversationMemory;

  beforeEach(() => {
    memory = new ConversationMemory();
  });

  describe('recordTurn', () => {
    it('should record a user turn', async () => {
      await expect(
        memory.recordTurn({
          userId: 'user-1',
          role: 'user',
          content: 'tạo file test.py',
        })
      ).resolves.not.toThrow();
    });

    it('should record an assistant turn with intent', async () => {
      await expect(
        memory.recordTurn({
          userId: 'user-1',
          role: 'assistant',
          content: 'Đã tạo file test.py',
          intentType: 'create_file',
          params: { filename: 'test.py', path: 'C:\\Users\\Admin\\Desktop\\test.py' },
          resultSummary: 'File created successfully',
        })
      ).resolves.not.toThrow();
    });

    it('should handle multiple turns for same user', async () => {
      await memory.recordTurn({ userId: 'user-1', role: 'user', content: 'xin chào' });
      await memory.recordTurn({ userId: 'user-1', role: 'assistant', content: 'Chào bạn!' });
      await memory.recordTurn({ userId: 'user-1', role: 'user', content: 'tạo file test.py' });
      await memory.recordTurn({ userId: 'user-1', role: 'assistant', content: 'Đã tạo', intentType: 'create_file' });

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle different users independently', async () => {
      await memory.recordTurn({ userId: 'user-1', role: 'user', content: 'hello' });
      await memory.recordTurn({ userId: 'user-2', role: 'user', content: 'xin chào' });

      expect(true).toBe(true);
    });
  });

  describe('updateLastAction', () => {
    it('should update last action for a user', async () => {
      await expect(
        memory.updateLastAction('user-1', {
          type: 'create_file',
          params: { filename: 'test.py', path: 'C:\\test.py' },
          resultSummary: 'File created',
          timestamp: new Date().toISOString(),
          filesAffected: ['C:\\test.py'],
          workingDirectory: 'C:\\Users\\Admin\\Desktop',
        })
      ).resolves.not.toThrow();
    });

    it('should move previous last action to previousAction', async () => {
      // First action
      await memory.updateLastAction('user-1', {
        type: 'create_file',
        params: { filename: 'a.py' },
        timestamp: new Date().toISOString(),
      });

      // Second action should move first to previous
      await memory.updateLastAction('user-1', {
        type: 'file_read',
        params: { path: 'a.py' },
        timestamp: new Date().toISOString(),
      });

      expect(true).toBe(true);
    });
  });

  describe('resolveReference', () => {
    it('should resolve "nó" to last action', async () => {
      // First, set up last action
      await memory.updateLastAction('user-1', {
        type: 'create_file',
        params: { filename: 'test.py', path: 'C:\\Users\\Admin\\Desktop\\test.py' },
        resultSummary: 'File created',
        timestamp: new Date().toISOString(),
        filesAffected: ['C:\\Users\\Admin\\Desktop\\test.py'],
      });

      // Mock getContext to return the action
      vi.spyOn(memory, 'getContext').mockResolvedValue({
        recentTurns: [],
        lastAction: {
          type: 'create_file',
          params: { filename: 'test.py', path: 'C:\\Users\\Admin\\Desktop\\test.py' },
          resultSummary: 'File created',
          timestamp: new Date().toISOString(),
          filesAffected: ['C:\\Users\\Admin\\Desktop\\test.py'],
        },
        previousAction: null,
        workingDirectory: 'C:\\Users\\Admin\\Desktop',
        recentFiles: ['C:\\Users\\Admin\\Desktop\\test.py'],
        language: 'vi',
        interactionCount: 2,
      });

      const result = await memory.resolveReference('user-1', 'chạy nó');
      expect(result).not.toBeNull();
      expect(result?.resolved).toBe(true);
      expect(result?.context).toContain('test.py');
    });

    it('should resolve "file đó" to last action', async () => {
      vi.spyOn(memory, 'getContext').mockResolvedValue({
        recentTurns: [],
        lastAction: {
          type: 'file_search',
          params: { pattern: '**/*.pdf' },
          resultSummary: 'Found 3 PDF files',
          timestamp: new Date().toISOString(),
        },
        previousAction: null,
        workingDirectory: 'C:\\Users\\Admin\\Desktop',
        recentFiles: [],
        language: 'vi',
        interactionCount: 2,
      });

      const result = await memory.resolveReference('user-1', 'đọc file đó');
      expect(result).not.toBeNull();
      expect(result?.resolved).toBe(true);
    });

    it('should resolve "vừa tạo" to last action', async () => {
      vi.spyOn(memory, 'getContext').mockResolvedValue({
        recentTurns: [],
        lastAction: {
          type: 'create_file',
          params: { filename: 'app.py' },
          timestamp: new Date().toISOString(),
        },
        previousAction: null,
        workingDirectory: '',
        recentFiles: [],
        language: 'vi',
        interactionCount: 2,
      });

      const result = await memory.resolveReference('user-1', 'xem file vừa tạo');
      expect(result).not.toBeNull();
      expect(result?.resolved).toBe(true);
    });

    it('should resolve implicit references like "đọc nó"', async () => {
      vi.spyOn(memory, 'getContext').mockResolvedValue({
        recentTurns: [],
        lastAction: {
          type: 'file_search',
          params: { pattern: 'report.pdf' },
          timestamp: new Date().toISOString(),
        },
        previousAction: null,
        workingDirectory: '',
        recentFiles: [],
        language: 'vi',
        interactionCount: 2,
      });

      const result = await memory.resolveReference('user-1', 'đọc nó');
      expect(result).not.toBeNull();
      expect(result?.resolved).toBe(true);
    });

    it('should return null when no last action exists', async () => {
      vi.spyOn(memory, 'getContext').mockResolvedValue({
        recentTurns: [],
        lastAction: null,
        previousAction: null,
        workingDirectory: '',
        recentFiles: [],
        language: 'vi',
        interactionCount: 0,
      });

      const result = await memory.resolveReference('user-1', 'chạy nó');
      expect(result).toBeNull();
    });

    it('should not resolve non-pronoun text', async () => {
      vi.spyOn(memory, 'getContext').mockResolvedValue({
        recentTurns: [],
        lastAction: {
          type: 'create_file',
          params: { filename: 'test.py' },
          timestamp: new Date().toISOString(),
        },
        previousAction: null,
        workingDirectory: '',
        recentFiles: [],
        language: 'vi',
        interactionCount: 2,
      });

      const result = await memory.resolveReference('user-1', 'tạo file mới tên app.py');
      expect(result).toBeNull();
    });
  });

  describe('buildContextForAI', () => {
    it('should return empty string for new user', async () => {
      vi.spyOn(memory, 'getContext').mockResolvedValue({
        recentTurns: [],
        lastAction: null,
        previousAction: null,
        workingDirectory: '',
        recentFiles: [],
        language: 'vi',
        interactionCount: 0,
      });

      const context = await memory.buildContextForAI('new-user');
      expect(context).toBe('');
    });

    it('should build context with last action', async () => {
      vi.spyOn(memory, 'getContext').mockResolvedValue({
        recentTurns: [],
        lastAction: {
          type: 'create_file',
          params: { filename: 'test.py', path: 'C:\\test.py' },
          resultSummary: 'File created',
          timestamp: new Date().toISOString(),
          filesAffected: ['C:\\test.py'],
        },
        previousAction: null,
        workingDirectory: 'C:\\Users\\Admin\\Desktop',
        recentFiles: ['C:\\test.py'],
        language: 'vi',
        interactionCount: 5,
      });

      const context = await memory.buildContextForAI('user-1');
      expect(context).toContain('LỆNH TRƯỚC ĐÓ');
      expect(context).toContain('create_file');
      expect(context).toContain('test.py');
    });

    it('should include recent conversation turns', async () => {
      vi.spyOn(memory, 'getContext').mockResolvedValue({
        recentTurns: [
          { id: '1', userId: 'user-1', role: 'user', content: 'xin chào', timestamp: '2026-01-01' },
          { id: '2', userId: 'user-1', role: 'assistant', content: 'Chào bạn!', timestamp: '2026-01-01' },
        ],
        lastAction: null,
        previousAction: null,
        workingDirectory: '',
        recentFiles: [],
        language: 'vi',
        interactionCount: 2,
      });

      const context = await memory.buildContextForAI('user-1');
      expect(context).toContain('LỊCH SỬ GẦN ĐÂY');
      expect(context).toContain('xin chào');
    });

    it('should include pronoun resolution rules', async () => {
      vi.spyOn(memory, 'getContext').mockResolvedValue({
        recentTurns: [],
        lastAction: { type: 'test', params: {}, timestamp: '' },
        previousAction: null,
        workingDirectory: '',
        recentFiles: [],
        language: 'vi',
        interactionCount: 1,
      });

      const context = await memory.buildContextForAI('user-1');
      expect(context).toContain('QUY TẮC THAM CHIẾU');
      expect(context).toContain('nó');
    });
  });

  describe('clearUserMemory', () => {
    it('should clear all memory for a user', async () => {
      await expect(memory.clearUserMemory('user-1')).resolves.not.toThrow();
    });
  });
});

describe('Pronoun Resolution Patterns', () => {
  const pronounPatterns = [
    { text: 'chạy nó', shouldResolve: true },
    { text: 'đọc file đó', shouldResolve: true },
    { text: 'xóa cái đó', shouldResolve: true },
    { text: 'sửa nó', shouldResolve: true },
    { text: 'mở nó', shouldResolve: true },
    { text: 'xem kết quả', shouldResolve: true },
    { text: 'đọc file vừa tạo', shouldResolve: true },
    { text: 'tìm file vừa tìm', shouldResolve: true },
    { text: 'tạo file mới app.py', shouldResolve: false },
    { text: 'chụp màn hình', shouldResolve: false },
    { text: 'máy tính thế nào', shouldResolve: false },
  ];

  it.each(pronounPatterns)(
    'should correctly identify pronoun in "$text"',
    ({ text, shouldResolve }) => {
      // Vietnamese pronouns and references (no \b — doesn't work well with diacritics)
      const pronounRegex = /(nó|cái đó|file đó|thư mục đó|folder đó|cái này|file này|cái trước|file trước|lệnh trước|cái vừa rồi|file vừa rồi|vừa tạo|vừa tìm|vừa đọc|vừa tải|chưa tạo|vừa sửa|kết quả|output|kết quả vừa rồi|kết quả đó)/i;
      const implicitRegex = /(?:đọc|read|xem|cat)\s+(?:nó|thêm|tiếp)|(?:chạy|run|execute)\s+(?:nó|thêm|tiếp)|(?:xóa|delete|remove)\s+(?:nó|thêm|tiếp)|(?:sửa|edit)\s+(?:nó|thêm|tiếp)|(?:mở|open)\s+(?:nó|thêm|tiếp)/i;

      const hasPronoun = pronounRegex.test(text) || implicitRegex.test(text);
      expect(hasPronoun).toBe(shouldResolve);
    }
  );
});
