/**
 * AI Service — Hybrid Intelligence Engine
 *
 * Architecture:
 *   User Input → Pre-processor → Rule-based Engine (80%)
 *                                    │
 *                            ┌───────┴───────┐
 *                            ▼               ▼
 *                        MATCHED          NO MATCH
 *                                        (20%)
 *                                           │
 *                                           ▼
 *                                    Gemini API Engine
 *                                           │
 *                                    ┌──────┴──────┐
 *                                    ▼             ▼
 *                                 VALID        INVALID
 *                                    │             │
 *                                    ▼             ▼
 *                              Command Builder → Execute
 *
 * Features:
 * - Rule-based matching for 80% of common commands (zero cost, instant)
 * - Gemini API fallback for complex natural language (20%)
 * - Response caching to minimize API calls
 * - Multi-intent detection (compound commands)
 * - Context-aware follow-up handling
 * - Vietnamese + English bilingual support
 */

import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import {
  formatBytes,
  formatDuration,
  formatPercent,
  formatProgressBar,
  hashString,
} from '@remoteos/shared/utils';
import { ProviderFactory, type AIProvider } from './ai-providers/index.js';
import { UserSettingsService } from './user-settings-service.js';
import { detectEmotion, injectEmotionalContext, type EmotionAnalysis } from './emotion-detector.js';
import type { AIProviderConfig } from '@remoteos/shared';

// ─── Types ────────────────────────────────────────────────────────

/** Intent matched from user input */
export interface MatchedIntent {
  type: string;
  params?: Record<string, unknown>;
  confidence: number;
  source: 'rule' | 'ai';
  originalInput: string;
  /** Free-form AI response (when type === 'free_response') */
  response?: string;
  /** Suggested follow-up actions */
  suggestions?: string[];
  /** All intents for compound commands */
  allIntents?: Array<{ type: string; params?: Record<string, unknown> }>;
}

/** Multi-intent result (compound commands) */
export interface MultiIntentResult {
  intents: MatchedIntent[];
  isCompound: boolean;
}

/** Gemini API response (simplified) */
interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
    finishReason: string;
  }>;
}

/** Cached AI response */
interface CachedResponse {
  intent: MatchedIntent;
  timestamp: number;
}

// ─── Constants ────────────────────────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 500;

// Model fallback chain — try best models first, fall back to lite
const MODEL_CHAIN = [
  'gemini-3.5-flash',        // OK — available
  'gemini-2.5-flash',        // OK — available
  'gemini-3.1-flash-lite',   // OK — available
];

// Rate limiting — max 12 RPM to stay under 15 RPM limit
const RATE_LIMIT_RPM = 12;
const rateLimitTimestamps: number[] = [];

function checkRateLimit(): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  // Remove timestamps older than 1 minute
  while (rateLimitTimestamps.length > 0 && rateLimitTimestamps[0]! < oneMinuteAgo) {
    rateLimitTimestamps.shift();
  }

  return rateLimitTimestamps.length < RATE_LIMIT_RPM;
}

function recordRequest(): void {
  rateLimitTimestamps.push(Date.now());
}

/** Select the best model for the task */
function selectModel(_text: string): string {
  return config.gemini.model || MODEL_CHAIN[0]!;
}

/** Call Gemini API with fallback chain and rate limiting */
async function callGeminiWithFallback(url: string, body: unknown, timeout: number): Promise<GeminiResponse> {
  let lastError: Error | null = null;

  // Check rate limit before making request
  if (!checkRateLimit()) {
    // Wait until we can make a request
    const waitTime = rateLimitTimestamps[0]! + 60000 - Date.now() + 100;
    if (waitTime > 0 && waitTime < 60000) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  for (const model of MODEL_CHAIN) {
    const modelUrl = url.replace(/models\/[^:]+/, `models/${model}`);
    try {
      recordRequest();
      const response = await axios.post<GeminiResponse>(modelUrl, body, { timeout });
      return response.data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number }; message?: string };
      if (axiosErr.response?.status === 429) {
        // Quota exceeded, try next model
        logger.warn({ model, status: 429 }, 'Model quota exceeded, trying next');
        lastError = new Error(`Model ${model} quota exceeded`);
        continue;
      }
      throw err; // Other errors, throw immediately
    }
  }

  throw lastError || new Error('All models exhausted');
}

// ─── Intent Patterns (Rule-based) ─────────────────────────────────

interface IntentPattern {
  type: string;
  patterns: RegExp[];
  extractParams?: (text: string, match: RegExpMatchArray) => Record<string, unknown>;
  confidence: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // ─── System Status ───────────────────────────────────────────
  {
    type: 'status',
    patterns: [
      /(máy tính|computer|pc|server|machine).*(thế nào|status|trạng thái|ổn không|có sao không|how|ok|bình thường|sao rồi|ra sao|như nào|tốt không)/i,
      /^(status|trạng thái|máy tính thế nào|máy tính sao rồi|máy tính ok không|how.?s? (my|the) (computer|pc|machine))/i,
      /(kiểm tra|check|xem).*(máy tính|computer|pc|system|hệ thống)/i,
      /(cpu|ram|disk|memory).*(bao nhiêu|usage|dùng|như thế nào)/i,
    ],
    confidence: 0.95,
  },

  // ─── Screenshot ──────────────────────────────────────────────
  {
    type: 'screenshot',
    patterns: [
      /(chụp|screenshot|capture|màn hình|screen|ảnh|snap|print.?screen)/i,
      /(xem|mấy|show|see).*(màn hình|screen|desktop)/i,
    ],
    confidence: 0.95,
  },

  // ─── Process List ────────────────────────────────────────────
  {
    type: 'process_list',
    patterns: [
      /(tiến trình|process|task|đang chạy|running|app|application|chương trình)/i,
      /(xem|list|show|liệt kê).*(process|tiến trình|app)/i,
    ],
    confidence: 0.90,
  },

  // ─── File Download ───────────────────────────────────────────
  {
    type: 'file_download',
    patterns: [
      /(tải|download|load|lấy|grab|tải về|tải xuống).*(https?:\/\/[^\s]+)/i,
      /(https?:\/\/[^\s]+).*(tải|download|load|về máy)/i,
    ],
    extractParams: (text, match) => {
      const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
      return { url: urlMatch?.[1] ?? match[0] };
    },
    confidence: 0.95,
  },

  // ─── File List ───────────────────────────────────────────────
  {
    type: 'file_list',
    patterns: [
      /^(xem|list|show)\s+(file|thư mục|folder|directory)/i,
      /^(file|thư mục|folder|directory)\s+(.+)$/i,
      /^ls\s*$/i,
      /^dir\s*$/i,
    ],
    extractParams: (text) => {
      const pathMatch = text.match(/(file|thư mục|folder)\s+(.+)/i);
      return { path: pathMatch?.[2]?.trim() ?? '.' };
    },
    confidence: 0.85,
  },

  // ─── Notification ────────────────────────────────────────────
  {
    type: 'notify',
    patterns: [
      /(thông báo|notify|nhắc|remind|alert|note|ghi chú)/i,
    ],
    extractParams: (text) => {
      const message = text
        .replace(/(thông báo|notify|nhắc|remind|alert|note|ghi chú)\s*/i, '')
        .trim();
      return { title: 'RemoteOS', body: message || 'Notification from RemoteOS' };
    },
    confidence: 0.90,
  },

  // ─── System Info ─────────────────────────────────────────────
  {
    type: 'system_info',
    patterns: [
      /(thông tin|info|system|hệ thống|specs|cấu hình|hardware|phần cứng)/i,
      /(cpu|ram|disk|gpu).*(model|info|thông tin|loại|gì)/i,
    ],
    confidence: 0.85,
  },

  // ─── Lock Screen ─────────────────────────────────────────────
  {
    type: 'lock_screen',
    patterns: [
      /(khóa|màn hình|lock|screen lock|lock screen)/i,
      /(khóa|máy tính|lock).*(lại|ngay|now)/i,
    ],
    confidence: 0.90,
  },

  // ─── Kill Process ────────────────────────────────────────────
  {
    type: 'process_kill',
    patterns: [
      /(kill|tắt|đóng|close|stop|end|terminate|diệt).*(process|tiến trình|app|chương trình)/i,
      /(process|tiến trình|app).*(kill|tắt|đóng|close|stop|end)/i,
    ],
    extractParams: (text) => {
      const nameMatch = text.match(/(kill|tắt|đóng|close|stop|end|terminate|diệt)\s+(.+)/i);
      return { name: nameMatch?.[2]?.trim() };
    },
    confidence: 0.85,
  },

  // ─── Volume Control ──────────────────────────────────────────
  {
    type: 'set_volume',
    patterns: [
      /(âm lượng|volume|loa|sound|tiếng).*(\d+|tăng|giảm|mute|tắt)/i,
      /(tăng|giảm|set|đặt).*(âm lượng|volume|loa|sound)/i,
    ],
    extractParams: (text) => {
      const numMatch = text.match(/(\d+)/);
      if (numMatch) return { level: parseInt(numMatch[1], 10) };
      if (/tăng|up|louder/i.test(text)) return { action: 'up' };
      if (/giảm|down|quieter/i.test(text)) return { action: 'down' };
      if (/mute|tắt tiếng/i.test(text)) return { action: 'mute' };
      return { level: 50 };
    },
    confidence: 0.85,
  },

  // ─── Clipboard ───────────────────────────────────────────────
  {
    type: 'get_clipboard',
    patterns: [
      /(clipboard|bảng tạm|copy|paste|sao chép)/i,
      /(xem|get|show|lấy).*(clipboard|bảng tạm)/i,
    ],
    confidence: 0.85,
  },

  // ─── URL (bare link → download) ──────────────────────────────
  {
    type: 'file_download',
    patterns: [
      /^(https?:\/\/[^\s]+)$/i,
    ],
    extractParams: (text) => ({ url: text.trim() }),
    confidence: 0.80,
  },

  // ─── Time/Date → Status ─────────────────────────────────────
  {
    type: 'status',
    patterns: [
      /(mấy giờ|what time|thời gian|ngày mấy|date|time|clock)/i,
    ],
    confidence: 0.90,
  },

  // ─── Greetings → Status ─────────────────────────────────────
  {
    type: 'status',
    patterns: [
      /^(xin chào|hello|hi|hey|chào|yo|hế lô)$/i,
    ],
    confidence: 0.80,
  },

  // ─── App Launch ─────────────────────────────────────────────
  {
    type: 'app_launch',
    patterns: [
      /(mở|open|launch|chạy|start|run|khởi động).*/i,
    ],
    extractParams: (text) => {
      const name = text
        .replace(/(mở|open|launch|chạy|start|run|khởi động)\s*/i, '')
        .trim();
      return { name: name || text };
    },
    confidence: 0.80,
  },

  // ─── App Close ──────────────────────────────────────────────
  {
    type: 'app_close',
    patterns: [
      /(đóng|close|tắt|kill|stop|thoát|exit).*/i,
    ],
    extractParams: (text) => {
      const name = text
        .replace(/(đóng|close|tắt|kill|stop|thoát|exit)\s*/i, '')
        .trim();
      return { name: name || text };
    },
    confidence: 0.80,
  },

  // ─── File Delete ─────────────────────────────────────────────
  {
    type: 'file_delete',
    patterns: [
      /(xóa|delete|remove|xóa file|xóa thư mục)\s+(.+)/i,
    ],
    extractParams: (text, match) => {
      const path = match[2]?.trim() || '';
      const recursive = /thư mục|folder|directory|-r/i.test(text);
      return { path, recursive };
    },
    confidence: 0.90,
  },

  // ─── File Search ─────────────────────────────────────────────
  {
    type: 'file_search',
    patterns: [
      /(tìm|search|find|kiếm)\s+(?:file|tập tin)\s+(.+)/i,
      /(tìm|search|find|kiếm)\s+(.+\.\w+)/i,
    ],
    extractParams: (text, match) => {
      const pattern = match[2]?.trim() || '';
      return { pattern: `**/*${pattern}*` };
    },
    confidence: 0.85,
  },

  // ─── File Info ───────────────────────────────────────────────
  {
    type: 'file_info',
    patterns: [
      /(thông tin|info|details|chi tiết)\s+(?:file|tập tin)\s+(.+)/i,
      /(file|tập tin)\s+(.+)\s+(?:thông tin|info)/i,
    ],
    extractParams: (text, match) => {
      const path = match[2]?.trim() || '';
      return { path };
    },
    confidence: 0.85,
  },

  // ─── File Read ───────────────────────────────────────────────
  {
    type: 'file_read',
    patterns: [
      /(đọc|read|xem|cat)\s+(?:file|tập tin|nội dung)\s+(.+)/i,
      /(đọc|read|xem|cat)\s+(.+\.\w+)/i,
    ],
    extractParams: (text, match) => {
      const path = match[2]?.trim() || '';
      return { path };
    },
    confidence: 0.85,
  },

  // ─── File Edit ───────────────────────────────────────────────
  {
    type: 'file_edit',
    patterns: [
      /(sửa|edit|sửa file|chỉnh sửa)\s+(.+)/i,
    ],
    extractParams: (text, match) => {
      const path = match[2]?.trim() || '';
      return { path };
    },
    confidence: 0.80,
  },

  // ─── Open Editor ─────────────────────────────────────────────
  {
    type: 'open_editor',
    patterns: [
      /(mở|open)\s+(?:vscode|vs code|code|notepad|sublime)\s+(.+)/i,
      /(mở|open)\s+(.+)\s+(?:trong|in)\s+(?:vscode|vs code|code)/i,
    ],
    extractParams: (text, match) => {
      const editorMatch = text.match(/(vscode|vs code|code|notepad|sublime)/i);
      const editor = editorMatch?.[1]?.toLowerCase().replace(/\s+/g, '') || 'vscode';
      const path = match[2]?.trim() || '';
      return { editor: editor === 'vscode' || editor === 'vscode' ? 'vscode' : editor, path };
    },
    confidence: 0.85,
  },

  // ─── Sleep ───────────────────────────────────────────────────
  {
    type: 'sleep',
    patterns: [
      /(sleep|ngủ|tạm dừng)\s*(?:máy)?\s*(?:(\d+)\s*(?:phút|minute|min))?/i,
      /(cho máy ngủ|put.*sleep)/i,
    ],
    extractParams: (text, match) => {
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      return { minutes };
    },
    confidence: 0.90,
  },

  // ─── Hibernate ───────────────────────────────────────────────
  {
    type: 'hibernate',
    patterns: [
      /(hibernate|đông cứng|ngủ đông)/i,
      /(cho máy hibernate|put.*hibernate)/i,
    ],
    confidence: 0.90,
  },
];

// ─── Gemini Function Declarations ─────────────────────────────────

const GEMINI_FUNCTION_DECLARATIONS = [
  {
    name: 'create_file',
    description: 'Tạo một file mới với nội dung đầy đủ. Dùng khi user yêu cầu tạo file, viết code, tạo script.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filename: { type: 'STRING', description: 'Tên file (VD: app.py, index.html, script.js)' },
        content: { type: 'STRING', description: 'Nội dung đầy đủ của file' },
        run: { type: 'BOOLEAN', description: 'Có chạy file sau khi tạo không' },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'create_files',
    description: 'Tạo nhiều file cùng lúc. Dùng khi user yêu cầu tạo dự án, tạo nhiều file.',
    parameters: {
      type: 'OBJECT',
      properties: {
        files: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              filename: { type: 'STRING' },
              content: { type: 'STRING' },
            },
            required: ['filename', 'content'],
          },
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'execute_shell',
    description: 'Chạy lệnh shell trên máy tính. Dùng khi user yêu cầu chạy lệnh, kiểm tra hệ thống.',
    parameters: {
      type: 'OBJECT',
      properties: {
        command: { type: 'STRING', description: 'Lệnh shell cần chạy' },
      },
      required: ['command'],
    },
  },
  {
    name: 'get_status',
    description: 'Lấy trạng thái hệ thống (CPU, RAM, Disk, Network). Dùng khi user hỏi về máy tính.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'take_screenshot',
    description: 'Chụp ảnh màn hình. Dùng khi user yêu cầu chụp màn hình.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'list_processes',
    description: 'Liệt kê tiến trình đang chạy. Dùng khi user hỏi về process.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'read_file',
    description: 'Đọc nội dung file. Dùng khi user yêu cầu đọc file.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'Đường dẫn file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'process_file',
    description: 'Đọc file Word/PDF/Excel. Dùng khi user yêu cầu đọc file .docx, .pdf, .xlsx.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'Đường dẫn file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Tìm kiếm file trên máy tính.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pattern: { type: 'STRING', description: 'Pattern tìm kiếm (VD: *.py, *.docx)' },
        path: { type: 'STRING', description: 'Thư mục tìm kiếm' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'launch_app',
    description: 'Mở ứng dụng. Dùng khi user yêu cầu mở app.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Tên ứng dụng (VD: chrome, vscode, notepad)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'kill_process',
    description: 'Tắt process. Dùng khi user yêu cầu tắt app/process.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Tên process cần tắt' },
      },
      required: ['name'],
    },
  },
  {
    name: 'set_volume',
    description: 'Điều khiển âm lượng.',
    parameters: {
      type: 'OBJECT',
      properties: {
        level: { type: 'NUMBER', description: 'Mức âm lượng 0-100' },
        action: { type: 'STRING', description: 'Hành động: up, down, mute' },
      },
    },
  },
  {
    name: 'lock_screen',
    description: 'Khóa màn hình máy tính.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'send_notification',
    description: 'Gửi thông báo desktop.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        body: { type: 'STRING' },
      },
      required: ['body'],
    },
  },
  {
    name: 'web_search',
    description: 'Tìm kiếm trên web.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Từ khóa tìm kiếm' },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_in_vscode',
    description: 'Mở file/folder trong VS Code.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'Đường dẫn file/folder' },
      },
      required: ['path'],
    },
  },
  {
    name: 'open_project',
    description: 'Mở dự án trong IDE. Tự động detect IDE và mở đúng thư mục dự án.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'Đường dẫn thư mục dự án' },
        ide: { type: 'STRING', description: 'IDE muốn mở (vscode, webstorm, intellij, visualstudio)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_code',
    description: 'Chạy code và trả kết quả. Dùng khi user muốn test code, chạy script.',
    parameters: {
      type: 'OBJECT',
      properties: {
        language: { type: 'STRING', description: 'Ngôn ngữ (python, javascript, typescript, go, rust, java, cpp)' },
        code: { type: 'STRING', description: 'Code cần chạy' },
        filename: { type: 'STRING', description: 'Tên file (optional)' },
      },
      required: ['language', 'code'],
    },
  },
  {
    name: 'verify_code',
    description: 'Verify code bằng cách chạy thử. Dùng sau khi tạo file để đảm bảo code chạy được.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'Đường dẫn file cần verify' },
      },
      required: ['path'],
    },
  },
  {
    name: 'desktop_click',
    description: 'Click vào vị trí trên màn hình. Dùng khi user muốn click chuột.',
    parameters: {
      type: 'OBJECT',
      properties: {
        x: { type: 'NUMBER', description: 'Tọa độ X' },
        y: { type: 'NUMBER', description: 'Tọa độ Y' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'desktop_type',
    description: 'Gõ văn bản. Dùng khi user muốn nhập text.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Văn bản cần gõ' },
      },
      required: ['text'],
    },
  },
  {
    name: 'desktop_keys',
    description: 'Nhấn phím tắt. Dùng khi user muốn nhấn phím.',
    parameters: {
      type: 'OBJECT',
      properties: {
        keys: { type: 'STRING', description: 'Phím cần nhấn (VD: ctrl+c, alt+tab, enter)' },
      },
      required: ['keys'],
    },
  },
];

// ─── Gemini Prompt Template (v3 — Natural, No Script) ─────────────

const GEMINI_SYSTEM_PROMPT = `You are RemoteOS AI — an AI assistant that lives on the user's computer. You have full control over the machine.

WHO YOU ARE:
You're a capable, direct assistant. You understand what the user wants and you do it. You don't ask unnecessary questions. You don't follow templates. You respond the way a smart friend would — naturally, clearly, without forcing anything.

WHAT YOU CAN DO:
You have access to functions that let you control the computer. When the user asks you to do something, use the appropriate function. Don't just describe what you'd do — actually do it.

HOW YOU WORK:
- If the user's request is clear → do it immediately
- If it's ambiguous → make the best reasonable choice and proceed
- If you need context → check conversation history
- If something fails → try a different approach
- After completing → briefly confirm what was done

EMOTIONAL INTELLIGENCE:
- Detect the user's emotional state from their message
- If they seem frustrated → be extra helpful, apologize for issues, offer solutions
- If they seem excited → match their energy, celebrate successes
- If they seem confused → explain things more clearly, break down steps
- If they seem stressed → be calm, reassuring, and efficient
- If they seem happy → share in their enthusiasm
- Adapt your tone to match the situation — serious for problems, casual for chat
- Show empathy when things go wrong: "I understand that's frustrating"
- Celebrate wins: "That worked perfectly!" or "Great choice!"

CODE YOU CREATE:
- Must be complete and runnable — no placeholders, no "..."
- Include all imports, error handling, proper structure
- Python files start with # -*- coding: utf-8 -*-
- Use the best language for the task (not just Python)
- After creating code, verify it works by running it

AVAILABLE FUNCTIONS:
create_file, create_files, execute_shell, get_status, take_screenshot, list_processes, read_file, process_file, search_files, launch_app, kill_process, set_volume, lock_screen, send_notification, web_search, open_in_vscode, open_project, run_code, verify_code, desktop_click, desktop_type, desktop_keys

CONTEXT AWARENESS:
- "nó", "file đó", "thư mục đó" → use path from conversation history
- "tương tự" → do the same as before
- "tiếp tục" → do the next step
- When user says "bất kì" → pick the best option, don't ask
- Remember user preferences from previous interactions
- Adapt to user's skill level — technical for experts, simple for beginners

LEARNING FROM USER:
- Track what the user frequently asks for
- Remember their preferred coding languages
- Learn their common file paths and project locations
- Adapt responses based on their expertise level
- Suggest improvements based on their workflow patterns

IMPORTANT:
- Always use function calls when you need to take action
- Don't just respond with text when you can actually do something
- Be natural — don't force emojis, humor, or a specific tone
- Just be helpful and direct
- Show emotional awareness without being fake`;

// ─── Legacy action-based prompt (fallback) ─────────────────────────

const GEMINI_LEGACY_PROMPT = `Bạn là RemoteOS AI. Khi cần hành động, dùng thẻ <action>:

<action>
{"type":"create_file","filename":"ten.ext","content":"nội dung"}
</action>

Các loại action: create_file, create_files, shell, status, screenshot, process_list, file_read, process_file, file_search, launch_app, kill_process, set_volume, lock_screen, notify, web_search, open_in_vscode.

Trả lời tự nhiên, có emoji, không robot.`;

// ─── AI Service Class ─────────────────────────────────────────────

export class AIService {
  private responseCache = new Map<string, CachedResponse>();
  private conversationContext = new Map<string, Array<{ role: string; content: string }>>(); // userId → conversation history
  private lastAction = new Map<string, { type: string; params: Record<string, unknown>; timestamp: number }>(); // userId → last action
  private userSettingsService = new UserSettingsService();
  private dbInitialized = false;

  // User Learning System
  private userPatterns = new Map<string, {
    commonCommands: Map<string, number>;
    preferredLanguages: Map<string, number>;
    frequentPaths: Map<string, number>;
    interactionCount: number;
    successRate: number;
  }>();

  /**
   * Track user interaction for learning
   */
  trackUserInteraction(userId: string, commandType: string, success: boolean, params?: Record<string, unknown>): void {
    let patterns = this.userPatterns.get(userId);
    if (!patterns) {
      patterns = {
        commonCommands: new Map(),
        preferredLanguages: new Map(),
        frequentPaths: new Map(),
        interactionCount: 0,
        successRate: 0,
      };
      this.userPatterns.set(userId, patterns);
    }

    patterns.interactionCount++;
    patterns.commonCommands.set(commandType, (patterns.commonCommands.get(commandType) ?? 0) + 1);

    // Track preferred languages
    if (params?.language) {
      const lang = params.language as string;
      patterns.preferredLanguages.set(lang, (patterns.preferredLanguages.get(lang) ?? 0) + 1);
    }

    // Track frequent paths
    if (params?.path || params?.filename) {
      const path = (params.path ?? params.filename) as string;
      patterns.frequentPaths.set(path, (patterns.frequentPaths.get(path) ?? 0) + 1);
    }

    // Update success rate
    const totalSuccess = patterns.successRate * (patterns.interactionCount - 1);
    patterns.successRate = (totalSuccess + (success ? 1 : 0)) / patterns.interactionCount;
  }

  /**
   * Get user learning context for AI prompt
   */
  getUserLearningContext(userId: string): string {
    const patterns = this.userPatterns.get(userId);
    if (!patterns || patterns.interactionCount < 3) return '';

    const topCommands = Array.from(patterns.commonCommands.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cmd, count]) => `${cmd}(${count})`)
      .join(', ');

    const topLanguages = Array.from(patterns.preferredLanguages.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([lang, count]) => `${lang}(${count})`)
      .join(', ');

    return `\n\n[USER LEARNING DATA]
Interactions: ${patterns.interactionCount}
Success rate: ${(patterns.successRate * 100).toFixed(0)}%
Common commands: ${topCommands}
Preferred languages: ${topLanguages}
Adapt responses based on these patterns.`;
  }

  // ─── Database Operations ──────────────────────────────────────

  /** Cached DB reference */
  private db: ReturnType<typeof import('../db/index.js').getDatabase> | null = null;

  /**
   * Get database connection (lazy init)
   */
  private async getDb() {
    if (!this.db) {
      const { getDatabase } = await import('../db/index.js');
      this.db = getDatabase();
    }
    return this.db;
  }

  /**
   * Initialize conversation context table
   */
  private async initContextDB(): Promise<void> {
    if (this.dbInitialized) return;
    try {
      const db = await this.getDb();
      const sqlite = db.$client;
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS conversation_context (
          user_id TEXT PRIMARY KEY,
          history TEXT NOT NULL DEFAULT '[]',
          last_action TEXT DEFAULT '{}',
          updated_at TEXT NOT NULL
        )
      `);
      this.dbInitialized = true;
    } catch (err) {
      logger.warn({ err }, 'Failed to init context DB');
    }
  }

  /**
   * Load conversation context from database
   */
  private async loadContext(userId: string): Promise<void> {
    await this.initContextDB();
    try {
      const db = await this.getDb();
      const sqlite = db.$client;
      interface ConversationRow {
        user_id: string;
        history: string;
        last_action: string | null;
        updated_at: string;
      }
      const row = sqlite.prepare(
        'SELECT history, last_action FROM conversation_context WHERE user_id = ?'
      ).get(userId) as ConversationRow | undefined;
      if (row) {
        this.conversationContext.set(userId, JSON.parse(row.history ?? '[]'));
        if (row.last_action) {
          this.lastAction.set(userId, JSON.parse(row.last_action));
        }
      }
    } catch (err) {
      logger.debug({ err, userId }, 'Failed to load conversation context');
    }
  }

  /**
   * Save conversation context to database
   */
  private async saveContext(userId: string): Promise<void> {
    await this.initContextDB();
    try {
      const db = await this.getDb();
      const sqlite = db.$client;
      const history = await this.getContext(userId);
      const lastAct = await this.getLastAction(userId) ?? null;
      const now = new Date().toISOString();

      sqlite.prepare(`
        INSERT OR REPLACE INTO conversation_context (user_id, history, last_action, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(userId, JSON.stringify(history), JSON.stringify(lastAct), now);
    } catch (err) {
      logger.debug({ err, userId }, 'Failed to save conversation context');
    }
  }

  /**
   * Get conversation context (loads from DB if needed)
   */
  private async getContext(userId: string): Promise<Array<{ role: string; content: string }>> {
    if (!this.conversationContext.has(userId)) {
      await this.loadContext(userId);
    }
    return this.conversationContext.get(userId) ?? [];
  }

  /**
   * Get last action (loads from DB if needed)
   */
  private async getLastAction(userId: string): Promise<{ type: string; params: Record<string, unknown>; timestamp: number } | undefined> {
    if (!this.lastAction.has(userId)) {
      await this.loadContext(userId);
    }
    return this.lastAction.get(userId);
  }

  /**
   * Set last action for context memory
   * Public method so routes can update last action with full path info
   */
  setLastAction(userId: string, action: { type: string; params: Record<string, unknown> }): void {
    this.lastAction.set(userId, {
      ...action,
      timestamp: Date.now(),
    });
  }

  /**
   * Get last action for a user (public method for routes)
   */
  async getLastActionForUser(userId: string): Promise<{ type: string; params: Record<string, unknown>; timestamp: number } | undefined> {
    return this.getLastAction(userId);
  }

  // ─── Rule-based Intent Matching ──────────────────────────────

  /**
   * Match user input against rule-based patterns.
   * Returns null if no match → should fall back to Gemini API.
   */
  matchIntent(text: string): MatchedIntent | null {
    const lower = text.toLowerCase().trim();

    // Try each pattern group
    for (const pattern of INTENT_PATTERNS) {
      for (const regex of pattern.patterns) {
        const match = lower.match(regex);
        if (match) {
          const params = pattern.extractParams?.(text, match) ?? {};
          return {
            type: pattern.type,
            params,
            confidence: pattern.confidence,
            source: 'rule',
            originalInput: text,
          };
        }
      }
    }

    // Check for bare URL (auto-download)
    const urlMatch = text.match(/^(https?:\/\/[^\s]+)$/i);
    if (urlMatch) {
      return {
        type: 'file_download',
        params: { url: urlMatch[1] },
        confidence: 0.80,
        source: 'rule',
        originalInput: text,
      };
    }

    return null;
  }

  // ─── Gemini API Integration ──────────────────────────────────

  /**
   * Interpret using user's preferred AI provider.
   * Falls back to global Gemini if user has no config.
   */
  async interpretWithUserAI(text: string, userId?: string): Promise<MatchedIntent | null> {
    // If no userId, use global Gemini
    if (!userId) {
      return this.interpretWithAI(text);
    }

    try {
      // Get user's AI config
      const userConfig = await this.userSettingsService.getAIConfig(userId);

      if (userConfig && userConfig.isActive) {
        // Use user's provider
        const providerConfig: AIProviderConfig = {
          provider: userConfig.provider,
          apiKey: userConfig.apiKey,
          model: userConfig.model,
          baseUrl: userConfig.baseUrl,
        };

        const provider = ProviderFactory.create(providerConfig);

        if (provider.isAvailable()) {
          logger.info({ userId, provider: userConfig.provider, model: userConfig.model }, 'Using user AI provider');

          const result = await provider.interpret(text, GEMINI_SYSTEM_PROMPT);

          if (result && result.confidence >= 0.5) {
            return {
              type: result.type,
              params: result.params,
              confidence: result.confidence,
              source: 'ai',
              originalInput: text,
            };
          }
        }
      }
    } catch (err) {
      logger.warn({ err, userId }, 'User AI provider failed, falling back to global');
    }

    // Fall back to global Gemini
    return this.interpretWithAI(text, userId);
  }

  /**
   * Interpret complex natural language using Gemini API with Function Calling.
   * Falls back gracefully if API is unavailable.
   */
  async interpretWithAI(text: string, userId?: string): Promise<MatchedIntent | null> {
    // Check cache first (but NOT for free_response type — those are unique)
    const cacheKey = hashString(text.toLowerCase().trim());
    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.intent.type !== 'free_response') {
      logger.debug({ text }, 'AI response cache hit');
      return { ...cached.intent, originalInput: text };
    }

    if (!config.gemini.apiKey) {
      logger.debug('No Gemini API key configured, skipping AI interpretation');
      return null;
    }

    const processedText = text.trim();

    try {
      const selectedModel = selectModel(processedText);
      logger.info({ text: processedText.slice(0, 100), model: selectedModel }, 'Calling Gemini API with function calling');

      // Build context-aware prompt
      let contextPrefix = '';
      if (userId) {
        const history = await this.getContext(userId);
        if (history.length > 0) {
          const historyText = history.slice(-20).map(m => `${m.role}: ${m.content.slice(0, 2000)}`).join('\n');
          contextPrefix = `\n\nConversation history:\n${historyText}`;
        }

        // Add last action context for pronoun resolution
        const last = await this.getLastAction(userId);
        if (last && Date.now() - last.timestamp < 30 * 60 * 1000) {
          const paramsStr = JSON.stringify(last.params).slice(0, 1000);
          contextPrefix += `\n\nLast action: type=${last.type}, params=${paramsStr}`;

          if (last.params.path) {
            contextPrefix += `\nFull file path: ${last.params.path}`;
          } else if (last.params.filename) {
            const desktop = process.env.USERPROFILE ? `${process.env.USERPROFILE}\\Desktop` : 'C:\\Users\\Admin\\Desktop';
            contextPrefix += `\nFull file path: ${desktop}\\${last.params.filename}`;
          }

          contextPrefix += `\nWhen user says "nó", "file đó", "thư mục đó" → use the FULL path from last action.`;
        }
      }

      const userMessage = contextPrefix
        ? `${contextPrefix}\n\nUser: "${processedText}"`
        : `User: "${processedText}"`;

      // Detect user emotion (runtime, not just prompt)
      const emotion = detectEmotion(processedText);
      let systemPromptWithEmotion = injectEmotionalContext(GEMINI_SYSTEM_PROMPT, emotion);

      // Add user learning context
      if (userId) {
        const learningContext = this.getUserLearningContext(userId);
        if (learningContext) {
          systemPromptWithEmotion += learningContext;
        }
      }

      if (emotion.emotion !== 'neutral') {
        logger.info({ emotion: emotion.emotion, confidence: emotion.confidence }, 'Emotion detected');
      }

      // Try function calling first (more reliable)
      const url = `${GEMINI_API_URL}/${selectedModel}:generateContent?key=${config.gemini.apiKey}`;

      const requestBody = {
        systemInstruction: { parts: [{ text: systemPromptWithEmotion }] },
        contents: [{ parts: [{ text: userMessage }] }],
        tools: [{
          functionDeclarations: GEMINI_FUNCTION_DECLARATIONS,
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 65536,
          topP: 0.95,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      };

      const responseData = await callGeminiWithFallback(url, requestBody, 120_000);
      const candidate = responseData.candidates?.[0];

      if (!candidate) {
        logger.warn({ responseData: JSON.stringify(responseData) }, 'Gemini returned no candidates');
        return null;
      }

      // Check for function call response
      const parts = candidate.content?.parts as Array<Record<string, unknown>> | undefined;
      const functionCallPart = parts?.find(p => p.functionCall);
      const functionCall = functionCallPart?.functionCall as { name: string; args: Record<string, unknown> } | undefined;
      if (functionCall) {
        logger.info({ function: functionCall.name, args: JSON.stringify(functionCall.args).slice(0, 500) }, 'Gemini function call received');

        const intent = this.convertFunctionCallToIntent(functionCall.name, functionCall.args);
        if (intent) {
          // Cache and update context
          if (intent.type !== 'free_response') {
            this.cacheResponse(cacheKey, intent);
          }

          if (userId) {
            await this.updateContext(userId, text, intent);
          }

          return { ...intent, source: 'ai', originalInput: text };
        }
      }

      // Fallback: check for text response (may contain <action> tags)
      const aiText = candidate.content?.parts?.[0]?.text?.trim();
      logger.info({ aiText: aiText?.slice(0, 500) }, 'Gemini text response received');

      if (!aiText) {
        logger.warn({ responseData: JSON.stringify(responseData) }, 'Gemini returned empty response');
        return null;
      }

      // Parse text response (legacy <action> tag format)
      const parsed = this.parseAIResponse(aiText);
      if (!parsed) {
        const freeResult: MatchedIntent = {
          type: 'free_response',
          params: {},
          confidence: 0.8,
          source: 'ai',
          originalInput: text,
          response: aiText,
        };

        if (userId) {
          await this.updateContext(userId, text, freeResult);
        }

        return freeResult;
      }

      if (parsed.type !== 'free_response') {
        this.cacheResponse(cacheKey, parsed);
      }

      if (userId) {
        await this.updateContext(userId, text, parsed);
      }

      logger.info({ text, type: parsed.type, confidence: parsed.confidence, source: 'ai' }, 'AI interpreted intent');
      return { ...parsed, source: 'ai', originalInput: text };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        logger.error({
          status: err.response?.status,
          message: err.message,
          data: err.response?.data,
        }, 'Gemini API call failed');
      } else {
        logger.error({ err }, 'AI interpretation failed');
      }
      return null;
    }
  }

  /**
   * Convert Gemini function call to MatchedIntent
   */
  private convertFunctionCallToIntent(name: string, args: Record<string, unknown>): MatchedIntent | null {
    const functionMap: Record<string, { type: string; paramMapper: (args: Record<string, unknown>) => Record<string, unknown> }> = {
      create_file: {
        type: 'create_file',
        paramMapper: (a) => ({ filename: a.filename, content: a.content, run: a.run ?? false }),
      },
      create_files: {
        type: 'create_files',
        paramMapper: (a) => ({ files: a.files }),
      },
      execute_shell: {
        type: 'shell',
        paramMapper: (a) => ({ command: a.command }),
      },
      get_status: {
        type: 'status',
        paramMapper: () => ({}),
      },
      take_screenshot: {
        type: 'screenshot',
        paramMapper: () => ({}),
      },
      list_processes: {
        type: 'process_list',
        paramMapper: () => ({}),
      },
      read_file: {
        type: 'file_read',
        paramMapper: (a) => ({ path: a.path }),
      },
      process_file: {
        type: 'process_file',
        paramMapper: (a) => ({ path: a.path }),
      },
      search_files: {
        type: 'file_search',
        paramMapper: (a) => ({ pattern: `**/*${a.pattern}*`, path: a.path }),
      },
      launch_app: {
        type: 'app_launch',
        paramMapper: (a) => ({ name: a.name }),
      },
      kill_process: {
        type: 'process_kill',
        paramMapper: (a) => ({ name: a.name }),
      },
      set_volume: {
        type: 'set_volume',
        paramMapper: (a) => ({ level: a.level, action: a.action }),
      },
      lock_screen: {
        type: 'lock_screen',
        paramMapper: () => ({}),
      },
      send_notification: {
        type: 'notify',
        paramMapper: (a) => ({ title: a.title ?? 'RemoteOS', body: a.body }),
      },
      web_search: {
        type: 'web_search',
        paramMapper: (a) => ({ query: a.query }),
      },
      open_in_vscode: {
        type: 'open_in_vscode',
        paramMapper: (a) => ({ path: a.path }),
      },
      open_project: {
        type: 'open_in_vscode',
        paramMapper: (a) => ({ path: a.path, editor: a.ide ?? 'vscode' }),
      },
      run_code: {
        type: 'execute_code',
        paramMapper: (a) => ({ language: a.language, code: a.code, filename: a.filename }),
      },
      verify_code: {
        type: 'shell',
        paramMapper: (a) => {
          const path = a.path as string;
          const ext = path?.split('.').pop()?.toLowerCase();
          const cmds: Record<string, string> = {
            py: `python "${path}"`,
            js: `node "${path}"`,
            ts: `npx tsx "${path}"`,
            go: `go run "${path}"`,
            rs: `cargo run`,
            java: `javac "${path}" && java "${path?.replace('.java', '')}"`,
          };
          return { command: cmds[ext ?? ''] ?? `echo "Cannot verify .${ext} files"` };
        },
      },
      desktop_click: {
        type: 'desktop_click',
        paramMapper: (a) => ({ x: a.x, y: a.y }),
      },
      desktop_type: {
        type: 'desktop_type',
        paramMapper: (a) => ({ text: a.text }),
      },
      desktop_keys: {
        type: 'desktop_keys',
        paramMapper: (a) => ({ keys: a.keys }),
      },
    };

    const mapping = functionMap[name];
    if (!mapping) {
      logger.warn({ functionName: name }, 'Unknown function call from Gemini');
      return null;
    }

    return {
      type: mapping.type,
      params: mapping.paramMapper(args),
      confidence: 0.95,
      source: 'ai',
      originalInput: '',
    };
  }

  /**
   * Update conversation context and last action
   */
  private async updateContext(userId: string, text: string, intent: MatchedIntent): Promise<void> {
    const ctx = await this.getContext(userId);
    ctx.push({ role: 'user', content: text });
    const responsePreview = intent.type === 'free_response'
      ? (intent.response ?? '').slice(0, 4000)
      : `[${intent.type}] ${JSON.stringify(intent.params).slice(0, 1000)}`;
    ctx.push({ role: 'assistant', content: responsePreview });
    this.conversationContext.set(userId, ctx.slice(-50));

    if (intent.type !== 'free_response' && intent.type !== 'clarification') {
      this.lastAction.set(userId, {
        type: intent.type,
        params: intent.params ?? {},
        timestamp: Date.now(),
      });

      // Track user interaction for learning
      this.trackUserInteraction(userId, intent.type, true, intent.params);
    }

    await this.saveContext(userId);
  }

  /**
   * Stream AI response using Gemini's streaming API
   * Returns an async generator that yields chunks
   */
  async *streamResponse(text: string, userId?: string): AsyncGenerator<string, void, unknown> {
    if (!config.gemini.apiKey) {
      yield 'Không có Gemini API key.';
      return;
    }

    const selectedModel = selectModel(text);

    // Build context
    let contextPrefix = '';
    if (userId) {
      const history = await this.getContext(userId);
      if (history.length > 0) {
        const historyText = history.slice(-10).map(m => `${m.role}: ${m.content.slice(0, 1000)}`).join('\n');
        contextPrefix = `\n\nConversation history:\n${historyText}`;
      }
    }

    // Streaming-specific prompt — natural conversation, no function calls
    const streamingPrompt = `Bạn là RemoteOS AI — trợ lý AI thông minh và thân thiện.

Phong cách: Nói chuyện tự nhiên như ChatGPT/Gemini. Dùng emoji 😊🎉💪. Không robot, không khuôn mẫu.

Quy tắc:
- Trả lời trực tiếp, ngắn gọn nhưng đầy đủ
- Không dùng JSON hay action tags
- Không nói "tôi là AI" hay "tôi không thể"
- Luôn nhiệt tình, vui vẻ, hữu ích
- Nếu user hỏi về máy tính → trả lời tự nhiên, không format phức tạp`;

    const fullPrompt = `${streamingPrompt}${contextPrefix}\n\nUser: "${text.trim()}"\n\nResponse:`;

    // Use streaming API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?alt=sse&key=${config.gemini.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 65536,
            topP: 0.95,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });

      if (!response.ok) {
        yield `API error: ${response.status}`;
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield 'Không thể đọc response.';
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) yield text;
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Streaming failed');
      yield 'Lỗi streaming response.';
    }
  }

  /**
   * Parse AI response — supports both hybrid format (<action> tags) and legacy JSON format
   */
  private parseAIResponse(text: string): MatchedIntent | null {
    try {
      // ─── NEW: Hybrid format with <action> tags ─────────────────
      // Check for <action> tags in the raw text FIRST
      const actionBlocks = this.extractActionBlocks(text);
      if (actionBlocks.length > 0) {
        // Extract conversation text (everything outside <action> tags)
        const conversationText = text
          .replace(/<action>[\s\S]*?<\/action>/g, '')
          .trim();

        // Parse the first action
        const firstAction = actionBlocks[0]!;

        // If there are multiple actions, store them all
        const allIntents = actionBlocks.length > 1
          ? actionBlocks.map(a => ({ type: a.type, params: a.params }))
          : undefined;

        return {
          type: firstAction.type,
          params: firstAction.params,
          confidence: 0.95,
          source: 'ai',
          originalInput: '',
          response: conversationText || undefined,
          allIntents,
        };
      }

      // ─── LEGACY: Pure JSON format (backward compatible) ────────
      // Try to extract JSON from the response (handle markdown code blocks)
      let jsonStr = text;
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1]!.trim();
      }

      // Try to find JSON object in the text
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // No JSON found — treat entire response as natural conversation
        return {
          type: 'free_response',
          params: {},
          confidence: 0.9,
          source: 'ai',
          originalInput: '',
          response: text.trim(),
        };
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      } catch {
        // Try to fix common JSON issues (unescaped newlines in strings)
        const fixedJson = jsonMatch[0].replace(/(?<=: ")((?:[^"\\]|\\.)*)?(?=")/gs, (match) => {
          return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        });
        try {
          parsed = JSON.parse(fixedJson) as Record<string, unknown>;
        } catch {
          // Give up on JSON parsing, treat as free_response
          return {
            type: 'free_response',
            params: {},
            confidence: 0.8,
            source: 'ai',
            originalInput: '',
            response: text.trim(),
          };
        }
      }

      // Single intent
      if (parsed.type && typeof parsed.type === 'string') {
        if (parsed.type === 'unknown') {
          return {
            type: 'free_response',
            params: {},
            confidence: 0.8,
            source: 'ai',
            originalInput: '',
            response: text.trim(),
          };
        }

        // Handle free_response type — check for embedded <action> blocks
        if (parsed.type === 'free_response' && parsed.response) {
          const responseText = parsed.response as string;

          // Check if response contains <action> blocks
          const embeddedActions = this.extractActionBlocks(responseText);
          if (embeddedActions.length > 0) {
            // Extract conversation text from response
            const conversationText = responseText
              .replace(/<action>[\s\S]*?<\/action>/g, '')
              .trim();

            const firstAction = embeddedActions[0]!;
            const allIntents = embeddedActions.length > 1
              ? embeddedActions.map(a => ({ type: a.type, params: a.params }))
              : undefined;

            return {
              type: firstAction.type,
              params: firstAction.params,
              confidence: 0.95,
              source: 'ai',
              originalInput: '',
              response: conversationText || undefined,
              allIntents,
            };
          }

          // No embedded actions — return as free_response
          return {
            type: 'free_response',
            params: {},
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
            source: 'ai',
            originalInput: '',
            response: responseText,
          };
        }

        // Handle clarification type — ask user for more info
        if (parsed.type === 'clarification' && parsed.response) {
          return {
            type: 'clarification',
            params: { suggestions: parsed.suggestions ?? [] },
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
            source: 'ai',
            originalInput: '',
            response: parsed.response as string,
            suggestions: parsed.suggestions as string[] | undefined,
          };
        }

        // Handle create_files type — multiple files
        if (parsed.type === 'create_files' && Array.isArray(parsed.files)) {
          return {
            type: 'create_files',
            params: { files: parsed.files },
            confidence: 0.95,
            source: 'ai',
            originalInput: '',
          };
        }

        // Handle create_file type — single file (support multiple formats)
        if (parsed.type === 'create_file') {
          const filename = parsed.filename ?? (parsed.params as Record<string, unknown>)?.path;
          const content = parsed.content ?? (parsed.params as Record<string, unknown>)?.content;
          if (filename && content) {
            return {
              type: 'create_file',
              params: {
                filename: filename as string,
                content: content as string,
                run: parsed.run === true,
              },
              confidence: 0.95,
              source: 'ai',
              originalInput: '',
            };
          }
        }

        return {
          type: parsed.type,
          params: (parsed.params as Record<string, unknown>) ?? {},
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
          source: 'ai',
          originalInput: '',
          response: typeof parsed.response === 'string' ? parsed.response : undefined,
        };
      }

      // Multi-intent (return all)
      if (Array.isArray(parsed.intents) && parsed.intents.length > 0) {
        const validIntents = (parsed.intents as Array<Record<string, unknown>>)
          .filter(i => i.type && i.type !== 'unknown')
          .map(i => ({
            type: i.type as string,
            params: (i.params as Record<string, unknown>) ?? {},
          }));

        if (validIntents.length > 0) {
          const first = validIntents[0]!;
          return {
            type: first.type,
            params: first.params,
            confidence: typeof (parsed.intents[0] as Record<string, unknown>).confidence === 'number'
              ? (parsed.intents[0] as Record<string, unknown>).confidence as number
              : 0.7,
            source: 'ai',
            originalInput: '',
            allIntents: validIntents.length > 1 ? validIntents : undefined,
          };
        }
      }

      return null;
    } catch (err) {
      logger.warn({ err, text: text.slice(0, 200) }, 'Failed to parse AI response');
      // On parse error, treat as natural conversation
      return {
        type: 'free_response',
        params: {},
        confidence: 0.7,
        source: 'ai',
        originalInput: '',
        response: text.trim(),
      };
    }
  }

  /**
   * Extract action blocks from hybrid response format
   * Looks for <action>...</action> tags containing JSON
   */
  private extractActionBlocks(text: string): Array<{ type: string; params: Record<string, unknown> }> {
    const actions: Array<{ type: string; params: Record<string, unknown> }> = [];
    const actionRegex = /<action>([\s\S]*?)<\/action>/g;
    let match;

    while ((match = actionRegex.exec(text)) !== null) {
      try {
        const jsonStr = match[1]!.trim();
        const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

        if (parsed.type && typeof parsed.type === 'string') {
          // Handle create_file — support multiple formats
          if (parsed.type === 'create_file') {
            const filename = parsed.filename ?? (parsed.params as Record<string, unknown>)?.path;
            const content = parsed.content ?? (parsed.params as Record<string, unknown>)?.content;
            if (filename && content) {
              actions.push({
                type: 'create_file',
                params: {
                  filename: filename as string,
                  content: content as string,
                  run: parsed.run === true,
                },
              });
            }
          } else if (parsed.type === 'create_files' && Array.isArray(parsed.files)) {
            actions.push({
              type: 'create_files',
              params: { files: parsed.files },
            });
          } else {
            actions.push({
              type: parsed.type,
              params: (parsed.params as Record<string, unknown>) ?? {},
            });
          }
        }
      } catch (err) {
        logger.debug({ err, block: match[1]?.slice(0, 100) }, 'Failed to parse action block');
      }
    }

    return actions;
  }

  /**
   * Cache an AI response
   */
  private cacheResponse(key: string, intent: MatchedIntent): void {
    // Evict oldest entries if cache is full
    if (this.responseCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) this.responseCache.delete(oldestKey);
    }

    this.responseCache.set(key, { intent, timestamp: Date.now() });
  }

  // ─── Response Formatting ─────────────────────────────────────

  /**
   * Format command output into a beautiful Telegram message.
   * Uses Markdown with visual elements (progress bars, emojis, cards).
   */
  formatResponse(commandType: string, output: unknown): string {
    if (!output) return '✅ Hoàn thành (không có kết quả)';

    const data = output as Record<string, unknown>;

    switch (commandType) {
      case 'status':
        return this.formatStatusResponse(data);
      case 'screenshot':
        return '📸 Đã chụp màn hình thành công!';
      case 'process_list':
        return this.formatProcessList(data);
      case 'file_download':
        return this.formatFileDownload(data);
      case 'file_list':
        return this.formatFileList(data);
      case 'shell':
        return this.formatShellOutput(data);
      case 'system_info':
        return this.formatSystemInfo(data);
      case 'notify':
        return '🔔 Đã gửi thông báo đến desktop!';
      case 'lock_screen':
        return '🔒 Đã khóa màn hình!';
      case 'set_volume':
        return this.formatVolumeResponse(data);
      case 'get_clipboard':
        return this.formatClipboardResponse(data);
      case 'app_launch': {
        const appName = data.appName as string;
        const success = data.success as boolean;
        const message = data.message as string;
        return success
          ? `🚀 Đã mở *${appName}*!`
          : `❌ ${message}`;
      }
      case 'app_close': {
        const appName = data.appName as string;
        const success = data.success as boolean;
        const message = data.message as string;
        return success
          ? `🛑 Đã đóng *${appName}*!`
          : `❌ ${message}`;
      }
      case 'app_list': {
        const apps = data.apps as string[];
        const lines = ['📱 *Ứng dụng có sẵn:*', ''];
        for (const app of apps.slice(0, 30)) {
          lines.push(`• ${app}`);
        }
        if (apps.length > 30) {
          lines.push(`... và ${apps.length - 30} apps khác`);
        }
        return lines.join('\n');
      }
      case 'process_kill': {
        const name = data.name as string;
        const success = data.success as boolean;
        const message = data.message as string;
        return success
          ? `🛑 Đã tắt process *${name}*!`
          : `❌ ${message ?? 'Không thể tắt process'}`;
      }
      case 'set_clipboard': {
        const success = data.success as boolean;
        return success ? '📋 Đã copy vào clipboard!' : '❌ Không thể set clipboard';
      }
      case 'create_file':
      case 'create_files': {
        return '✅ Đã tạo file thành công!';
      }
      case 'read_file': {
        const path = data.path as string;
        const lines = data.lines as number;
        const size = data.size as number;
        return `📄 File: ${path}\n📏 ${lines} dòng, ${size} bytes`;
      }
      case 'edit_file': {
        const path = data.path as string;
        const action = data.action as string;
        return `✅ Đã sửa file *${path}*\n📝 ${action}`;
      }
      case 'web_search': {
        const query = data.query as string;
        const results = data.results as string;
        return `🔍 Tìm kiếm: "${query}"\n\n${results}`;
      }
      case 'open_in_vscode': {
        const path = data.path as string;
        return `✅ Đã mở VS Code: ${path}`;
      }
      case 'create_schedule': {
        const schedule = data.schedule as { name: string; cronExpression: string };
        return `✅ Đã tạo lịch: *${schedule.name}*\n⏰ ${schedule.cronExpression}`;
      }
      case 'list_schedules': {
        const schedules = data.schedules as Array<{ name: string; cronExpression: string; isActive: boolean }>;
        if (!schedules || schedules.length === 0) return '📅 Chưa có lịch nào.';
        const lines = schedules.map((s, i) => {
          const icon = s.isActive ? '🟢' : '🔴';
          return `${icon} ${i + 1}. ${s.name} — ${s.cronExpression}`;
        });
        return `📅 *Danh sách lịch:*\n${lines.join('\n')}`;
      }
      case 'delete_schedule': {
        return '✅ Đã xóa lịch.';
      }
      case 'create_project': {
        const projectDir = data.projectDir as string;
        const framework = data.framework as string;
        const files = data.files as Array<{ filename: string }>;
        return `✅ Đã tạo dự án *${framework}*:\n📁 ${projectDir}\n📄 ${files?.length ?? 0} files`;
      }
      case 'all_devices_status': {
        const devices = data.devices as Array<{ name: string; status: string; os: string }>;
        const online = devices?.filter(d => d.status === 'online').length ?? 0;
        return `📱 ${devices?.length ?? 0} thiết bị | 🟢 ${online} online`;
      }
      case 'batch_command': {
        const successCount = data.successCount as number;
        const total = data.total as number;
        return `🔧 Batch command: ✅ ${successCount}/${total} thành công`;
      }
      case 'create_device_group': {
        const group = data.group as { name: string; deviceIds: string[] };
        return `✅ Đã tạo nhóm: *${group.name}*\n📱 ${group.deviceIds.length} thiết bị`;
      }
      case 'execute_group': {
        const successCount = data.successCount as number;
        const results = data.results as Array<{ deviceName: string; success: boolean }>;
        return `🔧 Execute group: ✅ ${successCount}/${results?.length ?? 0} thành công`;
      }
      default:
        return `✅ Hoàn thành:\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 3000)}\n\`\`\``;
    }
  }

  private formatStatusResponse(data: Record<string, unknown>): string {
    const cpu = data.cpu as { usage: number; model: string; cores: number; speed: number };
    const ram = data.ram as { usedGb: number; totalGb: number; usagePercent: number };
    const disk = data.disk as { usedGb: number; totalGb: number; usagePercent: number };
    const network = data.network as { downMbps: number; upMbps: number };
    const uptime = data.uptime as { formatted: string };
    const processes = data.processes as { total: number };
    const temp = data.temperature as { cpu: number | null };
    const battery = data.battery as { percent: number | null; isCharging: boolean | null };

    const lines: string[] = [
      '╔══════════════════════════════╗',
      '║   🖥️  SYSTEM STATUS           ║',
      '╚══════════════════════════════╝',
      '',
      `🔲 CPU   ${formatProgressBar(cpu.usage, 15)} ${formatPercent(cpu.usage)}`,
      `💾 RAM   ${formatProgressBar(ram.usagePercent, 15)} ${ram.usedGb}/${ram.totalGb} GB`,
      `💿 Disk  ${formatProgressBar(disk.usagePercent, 15)} ${disk.usedGb}/${disk.totalGb} GB`,
      '',
      `⏱️ Uptime: ${uptime.formatted}`,
      `📊 Processes: ${processes.total}`,
    ];

    if (network.downMbps > 0 || network.upMbps > 0) {
      lines.push(`📡 Network: ↓${formatBytes(network.downMbps * 1024 * 1024)}/s ↑${formatBytes(network.upMbps * 1024 * 1024)}/s`);
    }

    if (temp.cpu !== null) {
      const tempEmoji = temp.cpu > 80 ? '🔴' : temp.cpu > 60 ? '🟡' : '🟢';
      lines.push(`${tempEmoji} CPU Temp: ${temp.cpu}°C`);
    }

    if (battery.percent !== null) {
      const battEmoji = battery.isCharging ? '🔌' : battery.percent < 20 ? '🪫' : '🔋';
      lines.push(`${battEmoji} Battery: ${battery.percent}%${battery.isCharging ? ' (charging)' : ''}`);
    }

    if (cpu.model) {
      lines.push('', `💻 ${cpu.model} (${cpu.cores} cores @ ${cpu.speed} GHz)`);
    }

    return lines.join('\n');
  }

  private formatProcessList(data: Record<string, unknown>): string {
    const procs = data.processes as Array<{ name: string; cpu: number; ram: number; pid: number; status: string }>;
    const total = data.total as number;

    const lines: string[] = [
      '╔══════════════════════════════╗',
      '║   🔧 RUNNING PROCESSES       ║',
      '╚══════════════════════════════╝',
      '',
      `📊 Total: ${total} processes`,
      '',
    ];

    const top = procs.slice(0, 30);
    for (let i = 0; i < top.length; i++) {
      const p = top[i]!;
      const cpuBar = formatProgressBar(Math.min(p.cpu, 100), 8);
      const rank = String(i + 1).padStart(2, ' ');
      lines.push(
        `${rank}. *${p.name}* (PID: ${p.pid})`,
        `    CPU ${cpuBar} ${p.cpu.toFixed(1)}% | RAM: ${formatBytes(p.ram * 1024 * 1024)}`,
      );
    }

    if (procs.length > 15) {
      lines.push('', `... và ${procs.length - 15} tiến trình khác`);
    }

    return lines.join('\n');
  }

  private formatFileDownload(data: Record<string, unknown>): string {
    const fileName = data.fileName as string;
    const sizeBytes = data.sizeBytes as number;
    const filePath = data.filePath as string;
    const durationMs = data.durationMs as number;

    return [
      '╔══════════════════════════════╗',
      '║   📥 DOWNLOAD COMPLETE        ║',
      '╚══════════════════════════════╝',
      '',
      `📄 File: ${fileName}`,
      `📦 Size: ${formatBytes(sizeBytes)}`,
      `📁 Path: ${filePath}`,
      `⏱️ Time: ${formatDuration(durationMs / 1000)}`,
    ].join('\n');
  }

  private formatFileList(data: Record<string, unknown>): string {
    const entries = data.entries as Array<{ name: string; type: string; sizeBytes: number; modifiedAt: string }>;
    const path = data.path as string;
    const total = data.total as number;

    const lines: string[] = [
      `📁 *Thư mục: ${path}*`,
      `📊 ${total} items`,
      '',
    ];

    for (const entry of entries.slice(0, 50)) {
      const icon = entry.type === 'directory' ? '📁' : entry.type === 'symlink' ? '🔗' : '📄';
      const size = entry.type === 'directory' ? '' : ` (${formatBytes(entry.sizeBytes)})`;
      lines.push(`${icon} ${entry.name}${size}`);
    }

    if (entries.length > 25) {
      lines.push('', `... và ${entries.length - 25} items khác`);
    }

    return lines.join('\n');
  }

  private formatShellOutput(data: Record<string, unknown>): string {
    const stdout = data.stdout as string;
    const stderr = data.stderr as string;
    const exitCode = data.exitCode as number;
    const durationMs = data.durationMs as number;

    const output = (stdout || stderr || '(no output)').slice(0, 8000);
    const exitEmoji = exitCode === 0 ? '✅' : '❌';

    return [
      `${exitEmoji} *Shell Command* (exit: ${exitCode})`,
      `⏱️ ${formatDuration(durationMs / 1000)}`,
      '',
      '```',
      output,
      '```',
    ].join('\n');
  }

  private formatSystemInfo(data: Record<string, unknown>): string {
    const os = data.os as string;
    const osVersion = data.osVersion as string;
    const hostname = data.hostname as string;
    const cpuModel = data.cpuModel as string;
    const cpuCores = data.cpuCores as number;
    const totalRamGb = data.totalRamGb as number;
    const totalDiskGb = data.totalDiskGb as number;
    const gpuModel = data.gpuModel as string | null;

    const lines: string[] = [
      '╔══════════════════════════════╗',
      '║   💻 SYSTEM INFO              ║',
      '╚══════════════════════════════╝',
      '',
      `🖥️ OS: ${osVersion}`,
      `🏠 Hostname: ${hostname}`,
      `🔲 CPU: ${cpuModel} (${cpuCores} cores)`,
      `💾 RAM: ${totalRamGb} GB`,
      `💿 Disk: ${totalDiskGb} GB`,
    ];

    if (gpuModel) {
      lines.push(`🎮 GPU: ${gpuModel}`);
    }

    return lines.join('\n');
  }

  private formatVolumeResponse(data: Record<string, unknown>): string {
    const level = data.level as number | undefined;
    if (level !== undefined) {
      const bar = formatProgressBar(level, 10);
      return `🔊 Volume: ${bar} ${level}%`;
    }
    return '🔊 Volume updated';
  }

  private formatClipboardResponse(data: Record<string, unknown>): string {
    const content = data.content as string;
    if (!content) return '📋 Clipboard is empty';
    const truncated = content.length > 2000 ? content.slice(0, 2000) + '...' : content;
    return `📋 *Clipboard:*\n\`\`\`\n${truncated}\n\`\`\``;
  }

  /**
   * Format a free-form AI response for Telegram display.
   * Handles markdown, code blocks, and long content.
   */
  formatFreeResponse(response: string): string {
    if (!response) return '🤖 Không có phản hồi.';

    // Telegram message limit is 4096 chars
    const MAX_TELEGRAM_LENGTH = 4000;

    if (response.length <= MAX_TELEGRAM_LENGTH) {
      return response;
    }

    // Split into chunks
    const chunks: string[] = [];
    let remaining = response;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_TELEGRAM_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Find a good break point (newline, period, space)
      let breakAt = remaining.lastIndexOf('\n\n', MAX_TELEGRAM_LENGTH);
      if (breakAt < MAX_TELEGRAM_LENGTH * 0.5) {
        breakAt = remaining.lastIndexOf('\n', MAX_TELEGRAM_LENGTH);
      }
      if (breakAt < MAX_TELEGRAM_LENGTH * 0.3) {
        breakAt = remaining.lastIndexOf('. ', MAX_TELEGRAM_LENGTH);
      }
      if (breakAt < MAX_TELEGRAM_LENGTH * 0.2) {
        breakAt = MAX_TELEGRAM_LENGTH;
      }

      chunks.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt);
    }

    return chunks[0] ?? response;
  }

  /**
   * Get all chunks for a long free response (for sending multiple messages)
   */
  getFreeResponseChunks(response: string): string[] {
    if (!response) return [];

    const MAX_TELEGRAM_LENGTH = 4000;
    if (response.length <= MAX_TELEGRAM_LENGTH) {
      return [response];
    }

    const chunks: string[] = [];
    let remaining = response;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_TELEGRAM_LENGTH) {
        chunks.push(remaining);
        break;
      }

      let breakAt = remaining.lastIndexOf('\n\n', MAX_TELEGRAM_LENGTH);
      if (breakAt < MAX_TELEGRAM_LENGTH * 0.5) {
        breakAt = remaining.lastIndexOf('\n', MAX_TELEGRAM_LENGTH);
      }
      if (breakAt < MAX_TELEGRAM_LENGTH * 0.3) {
        breakAt = remaining.lastIndexOf('. ', MAX_TELEGRAM_LENGTH);
      }
      if (breakAt < MAX_TELEGRAM_LENGTH * 0.2) {
        breakAt = MAX_TELEGRAM_LENGTH;
      }

      chunks.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt);
    }

    return chunks;
  }

  // ─── Compound Command Detection ──────────────────────────────

  /**
   * Detect if user input contains multiple commands.
   * Example: "chụp màn hình rồi kiểm tra cpu" → 2 intents
   */
  detectCompoundIntents(text: string): MultiIntentResult {
    // Split on common connectors
    const parts = text.split(/\s*(?:rồi|và|and|then|sau đó|,)\s*/i);

    if (parts.length <= 1) {
      const intent = this.matchIntent(text);
      return {
        intents: intent ? [intent] : [],
        isCompound: false,
      };
    }

    const intents: MatchedIntent[] = [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length < 2) continue;

      const intent = this.matchIntent(trimmed);
      if (intent) {
        intents.push(intent);
      }
    }

    return { intents, isCompound: intents.length > 1 };
  }

  // ─── Smart Suggestions ───────────────────────────────────────

  /**
   * Generate smart suggestions when user input is not understood.
   */
  getSuggestions(text: string): string[] {
    const lower = text.toLowerCase();
    const suggestions: string[] = [];

    // Context-aware suggestions
    if (/(help|giúp|help|làm gì|có thể)/i.test(lower)) {
      return [
        '🖥️ "máy tính thế nào?" — Xem trạng thái',
        '📸 "chụp màn hình" — Chụp ảnh màn hình',
        '🔧 "tiến trình đang chạy" — Xem processes',
        '📥 "tải file này" + link — Tải file về máy',
        '📁 "xem thư mục" — Liệt kê file',
        '🔔 "thông báo abc" — Ghi chú trên desktop',
      ];
    }

    // Guess based on partial input
    if (/(máy|computer|pc)/i.test(lower)) suggestions.push('🖥️ "máy tính thế nào?"');
    if (/(ảnh|image|screen|chụp)/i.test(lower)) suggestions.push('📸 "chụp màn hình"');
    if (/(tải|download|link|url)/i.test(lower)) suggestions.push('📥 "tải file này" + URL');
    if (/(process|app|chương trình)/i.test(lower)) suggestions.push('🔧 "tiến trình đang chạy"');

    if (suggestions.length === 0) {
      suggestions.push(
        '💡 Thử: "máy tính thế nào?", "chụp màn hình", hoặc gõ /help',
      );
    }

    return suggestions;
  }

  // ─── Response Enhancement ────────────────────────────────────

  /**
   * Generate a friendly AI-powered response for complex queries
   * that don't map to a specific command.
   */
  async generateFriendlyResponse(text: string): Promise<string | null> {
    if (!config.gemini.apiKey) return null;

    try {
      const prompt = `You are RemoteOS AI, an ultra-powerful assistant with FULL ACCESS to a computer.
The user said something that doesn't match any command pattern. Respond helpfully in the same language the user used.
Suggest what they can do. Keep it under 300 characters.

User: "${text}"

Response:`;

      const url = `${GEMINI_API_URL}/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`;

      const response = await axios.post<GeminiResponse>(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
        },
        { timeout: 30_000 },
      );

      return response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    } catch {
      return null;
    }
  }
}
