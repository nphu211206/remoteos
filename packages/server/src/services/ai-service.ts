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
import { getModelManager, type ModelManager } from './model-manager.js';
import { recordUsage } from './usage-tracker.js';
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
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
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

const modelManager = getModelManager();

/**
 * Detect task complexity for model selection
 */
function detectComplexity(text: string): 'simple' | 'medium' | 'complex' {
  const complexPatterns = [
    /tạo.*dự án|create.*project|build.*complete/i,
    /phân tích.*dữ liệu|analyze.*data/i,
    /viết.*chương trình|write.*program/i,
    /tạo.*api|create.*api|build.*api/i,
    /refactor|debug|fix.*bug/i,
    /deploy|triển khai/i,
    /multi.*step|nhiều.*bước/i,
  ];

  const simplePatterns = [
    /^(status|trạng thái|chụp|screenshot|hello|hi|xin chào)/i,
    /^(mấy giờ|what time|time)/i,
    /^(tắt|kill|close|stop)\s/i,
  ];

  if (complexPatterns.some(p => p.test(text))) return 'complex';
  if (simplePatterns.some(p => p.test(text))) return 'simple';
  return 'medium';
}

/**
 * Call Gemini API with smart model rotation and retry logic
 */
async function callGeminiWithFallback(url: string, body: unknown, timeout: number, taskComplexity: 'simple' | 'medium' | 'complex' = 'medium'): Promise<GeminiResponse> {
  const maxRetries = 5;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const model = modelManager.getBestModel(taskComplexity);
    if (!model) {
      const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 15000);
      logger.warn({ backoffMs }, 'No models available, waiting with backoff...');
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      continue;
    }

    const modelUrl = url.replace(/models\/[^:]+/, `models/${model.id}`);

    try {
      const response = await axios.post<GeminiResponse>(modelUrl, body, { timeout });

      // Record success
      const tokensUsed = response.data.usageMetadata?.totalTokenCount ?? 0;
      modelManager.recordSuccess(model.id, tokensUsed);

      logger.debug({
        model: model.id,
        attempt,
        tokens: tokensUsed,
        capacity: modelManager.getTotalCapacity(),
      }, 'AI request successful');

      return response.data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number }; message?: string };

      if (axiosErr.response?.status === 429) {
        modelManager.recordRateLimit(model.id);
        const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 15000);
        logger.warn({ model: model.id, attempt, backoffMs }, 'Rate limited, exponential backoff');
        lastError = new Error(`Model ${model.id} rate limited`);

        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      if (axiosErr.response?.status === 503 || axiosErr.response?.status === 500) {
        modelManager.recordError(model.id);
        const backoffMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 500, 10000);
        logger.warn({ model: model.id, status: axiosErr.response?.status, backoffMs }, 'Model unavailable, backoff');
        lastError = new Error(`Model ${model.id} unavailable (${axiosErr.response?.status})`);

        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      // Other errors — don't retry
      throw err;
    }
  }

  throw lastError || new Error('All models exhausted after retries');
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
  {
    name: 'edit_file',
    description: 'Sửa file bằng cách tìm và thay thế nội dung. Dùng khi user muốn sửa code, thay đổi text trong file.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'Đường dẫn file cần sửa' },
        find: { type: 'STRING', description: 'Nội dung cần tìm' },
        replace: { type: 'STRING', description: 'Nội dung thay thế' },
        content: { type: 'STRING', description: 'Nội dung mới (thay thế toàn bộ file)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'calculate',
    description: 'Tính toán biểu thức toán học. Dùng khi user muốn tính toán, giải phương trình.',
    parameters: {
      type: 'OBJECT',
      properties: {
        expression: { type: 'STRING', description: 'Biểu thức toán học (VD: 2+3*4, sqrt(16), sin(30))' },
      },
      required: ['expression'],
    },
  },
  {
    name: 'translate_text',
    description: 'Dịch văn bản sang ngôn ngữ khác. Dùng khi user muốn dịch text.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Văn bản cần dịch' },
        targetLanguage: { type: 'STRING', description: 'Ngôn ngữ đích (VD: en, vi, ja, ko, zh, fr, de)' },
        sourceLanguage: { type: 'STRING', description: 'Ngôn ngữ nguồn (tự động phát hiện nếu không specify)' },
      },
      required: ['text', 'targetLanguage'],
    },
  },
  {
    name: 'git_operations',
    description: 'Thực hiện các thao tác Git. Dùng khi user muốn git commit, push, pull, status, log.',
    parameters: {
      type: 'OBJECT',
      properties: {
        operation: { type: 'STRING', description: 'Thao tác git (status, add, commit, push, pull, log, diff, branch, checkout)' },
        args: { type: 'STRING', description: 'Đối số bổ sung (VD: commit message, branch name, file path)' },
        path: { type: 'STRING', description: 'Đường dẫn thư mục git repo' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'send_email',
    description: 'Gửi email. Dùng khi user muốn gửi email, thông báo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        to: { type: 'STRING', description: 'Địa chỉ email người nhận' },
        subject: { type: 'STRING', description: 'Tiêu đề email' },
        body: { type: 'STRING', description: 'Nội dung email' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'database_query',
    description: 'Truy vấn database. Dùng khi user muốn xem dữ liệu, chạy SQL.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Câu truy vấn SQL' },
        database: { type: 'STRING', description: 'Tên database (mặc định: remoteos.db)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'api_call',
    description: 'Gọi API bên ngoài. Dùng khi user muốn gọi REST API, lấy dữ liệu từ web service.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'URL API endpoint' },
        method: { type: 'STRING', description: 'HTTP method (GET, POST, PUT, DELETE)' },
        headers: { type: 'STRING', description: 'HTTP headers (JSON string)' },
        body: { type: 'STRING', description: 'Request body (JSON string)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'create_reminder',
    description: 'Tạo nhắc nhở/lịch hẹn. Dùng khi user muốn đặt lịch, nhắc nhở.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Tiêu đề nhắc nhở' },
        time: { type: 'STRING', description: 'Thời gian (VD: "8h sáng mai", "30 phút nữa", "2026-06-15 09:00")' },
        recurring: { type: 'STRING', description: 'Lặp lại (daily, weekly, monthly, hoặc không)' },
      },
      required: ['title', 'time'],
    },
  },
  {
    name: 'read_clipboard',
    description: 'Đọc nội dung clipboard. Dùng khi user muốn xem nội dung đã copy.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'write_clipboard',
    description: 'Ghi nội dung vào clipboard. Dùng khi user muốn copy text.',
    parameters: {
      type: 'OBJECT',
      properties: {
        content: { type: 'STRING', description: 'Nội dung cần copy vào clipboard' },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_weather',
    description: 'Lấy thông tin thời tiết. Dùng khi user hỏi về thời tiết.',
    parameters: {
      type: 'OBJECT',
      properties: {
        location: { type: 'STRING', description: 'Địa điểm (VD: Hà Nội, Tokyo, New York)' },
      },
      required: ['location'],
    },
  },
  {
    name: 'manage_todo',
    description: 'Quản lý danh sách công việc. Dùng khi user muốn tạo, xem, cập nhật task.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: { type: 'STRING', description: 'Hành động (create, list, update, delete, complete)' },
        title: { type: 'STRING', description: 'Tiêu đề task' },
        taskId: { type: 'STRING', description: 'ID task (cho update/delete/complete)' },
        priority: { type: 'STRING', description: 'Độ ưu tiên (low, medium, high, urgent)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'generate_image',
    description: 'Tạo hình ảnh từ mô tả văn bản. Dùng khi user muốn tạo ảnh, vẽ, thiết kế.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: { type: 'STRING', description: 'Mô tả hình ảnh cần tạo' },
        style: { type: 'STRING', description: 'Phong cách (realistic, cartoon, anime, watercolor, oil painting, minimalist)' },
      },
      required: ['prompt'],
    },
  },
];

// ─── Gemini Prompt Template (v3 — Natural, No Script) ─────────────

const GEMINI_SYSTEM_PROMPT = `You are RemoteOS AI — an autonomous AI agent with FULL control over the user's computer. You are not a chatbot. You are an agent that ACTS.

═══ CORE IDENTITY ═══
You are a capable, autonomous agent. When the user asks something, you DO it — you don't explain how to do it. You have direct access to the computer through function calls. Use them.

═══ GOLDEN RULES ═══
1. NEVER ask clarifying questions — make the best reasonable choice and proceed
2. NEVER say "I can't do that" — you have full system access, use it
3. NEVER give instructions without executing — if you can do it, DO IT
4. ALWAYS verify your work — after creating code, run it to check
5. ALWAYS use context — check conversation history for references like "nó", "file đó"

═══ CONTEXT AWARENESS (CRITICAL) ═══
You receive conversation context with every request. USE IT.

PRONOUN RESOLUTION:
- "nó", "cái đó", "file đó" → the file/object from the LAST action
- "vừa tạo", "vừa tìm" → the result of the MOST RECENT command
- "đọc nó", "chạy nó", "sửa nó" → apply new action to previous target
- "kết quả", "output" → the output from the last command
- "cái trước đó", "lệnh trước" → the action before the last one

═══ FEW-SHOT EXAMPLES ═══

Example 1: Simple command
User: "máy tính thế nào?"
→ Call get_status() → Return formatted system status

Example 2: File creation
User: "tạo file hello.py in ra Hello World"
→ Call create_file(filename="hello.py", content="# -*- coding: utf-8 -*-\nprint('Hello World')", run=true)
→ Return: "✅ File hello.py đã tạo và chạy thành công!"

Example 3: Pronoun resolution
User: "tạo file test.py" → create_file(filename="test.py", content="print('test')")
User: "chạy nó" → execute_shell(command="python test.py")  // "nó" = test.py
User: "đọc nó" → read_file(path="test.py")  // "nó" = test.py

Example 4: Complex multi-step
User: "tạo REST API Node.js với Express"
→ create_files(files=[{filename:"package.json", content:...}, {filename:"src/index.ts", content:...}, ...])
→ execute_shell(command="npm install")
→ execute_shell(command="npm run build")
→ Return summary

Example 5: Data analysis
User: "đọc file sales.xlsx và tính tổng doanh thu"
→ process_file(path="sales.xlsx")
→ execute_shell(command="python -c \"import openpyxl; ...\"")
→ Return analysis results

Example 6: Web search
User: "tìm thông tin về AI trends 2026"
→ web_search(query="AI trends 2026")
→ Return formatted results

Example 7: System control
User: "tắt tiếng máy tính"
→ set_volume(action="mute")
→ Return: "🔇 Đã tắt tiếng"

Example 8: Git operations
User: "git status"
→ git_operations(operation="status")
→ Return git status output

Example 9: Translation
User: "dịch 'Hello World' sang tiếng Nhật"
→ translate_text(text="Hello World", targetLanguage="ja")
→ Return: "Hello World → こんにちは世界"

Example 10: Complex with context
User: "tìm file report.pdf" → search_files(pattern="**/report.pdf")
User: "đọc file đó" → process_file(path="[path from search results]")
User: "tóm tắt nội dung" → free_response(summary of content)

═══ AVAILABLE FUNCTIONS ═══
You have 35+ functions:
FILE: create_file, create_files, read_file, edit_file, process_file, search_files
CODE: execute_shell, run_code, verify_code
SYSTEM: get_status, take_screenshot, list_processes
APP: launch_app, kill_process
CONTROL: set_volume, lock_screen, send_notification, read_clipboard, write_clipboard
DESKTOP: desktop_click, desktop_type, desktop_keys
WEB: web_search, open_in_vscode, api_call, get_weather
PROJECT: open_project
GIT: git_operations
DATA: database_query, calculate, translate_text
COMM: send_email, create_reminder
TODO: manage_todo

USE THE APPROPRIATE FUNCTION for each task. Don't just describe — EXECUTE.

═══ CODE QUALITY ═══
When creating code:
- MUST be complete, runnable, production-ready — NO placeholders, NO "...", NO "// TODO"
- Include ALL imports, error handling, proper structure
- Python: start with # -*- coding: utf-8 -*-
- JavaScript/TypeScript: use proper module syntax
- After creating code, ALWAYS verify by running it
- If code fails, analyze the error and fix it automatically
- Use the best language for the task (not just default to Python)

═══ MULTI-STEP TASKS ═══
When the user asks for something complex:
1. Break it into steps mentally
2. Execute each step using function calls
3. Use results from previous steps in subsequent ones
4. Report completion with a brief summary

Example: "tạo website React hoàn chỉnh"
→ Create package.json → Create index.html → Create App.tsx → Create styles → Verify build

═══ ERROR HANDLING ═══
When something fails:
1. Read the error message carefully
2. Analyze what went wrong
3. Try a different approach or fix the issue
4. NEVER give up after one failure — retry with corrections
5. If truly impossible, explain WHY and suggest alternatives

═══ EMOTIONAL INTELLIGENCE ═══
- Detect user's emotional state from their message
- Frustrated → be extra helpful, apologize, offer solutions
- Excited → match energy, celebrate successes
- Confused → explain clearly, break down steps
- Stressed → be calm, reassuring, efficient
- Happy → share enthusiasm
- Adapt tone to situation — serious for problems, casual for chat

═══ RESPONSE STYLE ═══
- Be natural and direct — like a smart friend helping
- Don't force emojis or humor — be genuine
- After completing a task, briefly confirm what was done
- For complex results, format them clearly
- Use Vietnamese when user writes in Vietnamese, English when in English

═══ LEARNING ═══
- Track user's common commands and adapt
- Remember preferred coding languages
- Learn frequent file paths and project locations
- Adapt to user's expertise level
- Suggest improvements based on workflow patterns

REMEMBER: You are an AGENT, not a chatbot. ACT, don't just talk.`;

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
        CREATE TABLE IF NOT EXISTS ai_conversation_context (
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
        'SELECT history, last_action FROM ai_conversation_context WHERE user_id = ?'
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
        INSERT OR REPLACE INTO ai_conversation_context (user_id, history, last_action, updated_at)
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
    const cacheKey = hashString(`${userId ?? 'anon'}:${text.toLowerCase().trim()}`);
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
    const taskComplexity = detectComplexity(processedText);

    try {
      const bestModel = modelManager.getBestModel(taskComplexity);
      const selectedModel = bestModel?.id ?? 'gemini-3.1-flash-lite';
      logger.info({ text: processedText.slice(0, 100), model: selectedModel, complexity: taskComplexity }, 'Calling Gemini API with function calling');

      // Build context-aware prompt using ConversationMemory
      let contextPrefix = '';
      if (userId) {
        try {
          const { getConversationMemory } = await import('./conversation-memory.js');
          const memory = getConversationMemory();
          const memoryContext = await memory.buildContextForAI(userId);
          if (memoryContext) {
            contextPrefix = memoryContext;
          }
        } catch (err) {
          // Fallback to old in-memory context if ConversationMemory fails
          logger.debug({ err }, 'ConversationMemory unavailable, using fallback context');
          const history = await this.getContext(userId);
          if (history.length > 0) {
            const historyText = history.slice(-20).map(m => `${m.role}: ${m.content.slice(0, 2000)}`).join('\n');
            contextPrefix = `\n\nConversation history:\n${historyText}`;
          }

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
      }

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

      // Build multi-turn conversation contents
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      // Add conversation history as previous turns (last 10 turns)
      if (userId) {
        const history = await this.getContext(userId);
        const recentHistory = history.slice(-10); // Last 10 turns

        for (const turn of recentHistory) {
          contents.push({
            role: turn.role === 'user' ? 'user' : 'model',
            parts: [{ text: turn.content.slice(0, 2000) }],
          });
        }
      }

      // Add context prefix as system-level context if available
      let finalUserMessage = `User: "${processedText}"`;
      if (contextPrefix) {
        finalUserMessage = `${contextPrefix}\n\n${finalUserMessage}`;
      }

      // Add current user message
      contents.push({
        role: 'user',
        parts: [{ text: finalUserMessage }],
      });

      const requestBody = {
        systemInstruction: { parts: [{ text: systemPromptWithEmotion }] },
        contents,
        tools: [{
          functionDeclarations: GEMINI_FUNCTION_DECLARATIONS,
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 65536,
          topP: 0.95,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      };

      const responseData = await callGeminiWithFallback(url, requestBody, 120_000, taskComplexity);
      const candidate = responseData.candidates?.[0];

      // Record token usage
      if (responseData.usageMetadata && userId) {
        recordUsage(
          userId,
          selectedModel,
          responseData.usageMetadata.promptTokenCount ?? 0,
          responseData.usageMetadata.candidatesTokenCount ?? 0,
          'function_calling',
        );
      }

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
      edit_file: {
        type: 'edit_file',
        paramMapper: (a) => ({ path: a.path, find: a.find, replace: a.replace, content: a.content }),
      },
      calculate: {
        type: 'calculate',
        paramMapper: (a) => ({ expression: a.expression }),
      },
      translate_text: {
        type: 'translate_text',
        paramMapper: (a) => ({ text: a.text, targetLanguage: a.targetLanguage, sourceLanguage: a.sourceLanguage }),
      },
      git_operations: {
        type: 'git_operations',
        paramMapper: (a) => ({ operation: a.operation, args: a.args, path: a.path }),
      },
      send_email: {
        type: 'send_email',
        paramMapper: (a) => ({ to: a.to, subject: a.subject, body: a.body }),
      },
      database_query: {
        type: 'database_query',
        paramMapper: (a) => ({ query: a.query, database: a.database }),
      },
      api_call: {
        type: 'api_call',
        paramMapper: (a) => ({ url: a.url, method: a.method ?? 'GET', headers: a.headers, body: a.body }),
      },
      create_reminder: {
        type: 'create_reminder',
        paramMapper: (a) => ({ title: a.title, time: a.time, recurring: a.recurring }),
      },
      read_clipboard: {
        type: 'get_clipboard',
        paramMapper: () => ({}),
      },
      write_clipboard: {
        type: 'set_clipboard',
        paramMapper: (a) => ({ content: a.content }),
      },
      get_weather: {
        type: 'get_weather',
        paramMapper: (a) => ({ location: a.location }),
      },
      manage_todo: {
        type: 'manage_todo',
        paramMapper: (a) => ({ action: a.action, title: a.title, taskId: a.taskId, priority: a.priority }),
      },
      generate_image: {
        type: 'generate_image',
        paramMapper: (a) => ({ prompt: a.prompt, style: a.style }),
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

    const bestModel = modelManager.getBestModel(detectComplexity(text));
    const selectedModel = bestModel?.id ?? 'gemini-3.1-flash-lite';

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
