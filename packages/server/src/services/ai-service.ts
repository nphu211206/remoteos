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

// Model routing — use stronger model for complex tasks
const MODEL_LITE = 'gemini-3.1-flash-lite';       // 500 RPD, fast, for simple commands
const MODEL_STRONG = 'gemini-2.5-flash-lite';     // 20 RPD, better quality, for code/reports

/** Detect if user request needs a stronger model */
function needsStrongModel(text: string): boolean {
  const complexPatterns = [
    /tạo|viết|code|create|write|build|make|generate/i,
    /website|web|app|project|dự án|ứng dụng/i,
    /html|css|javascript|python|script|program/i,
    /báo cáo|report|phân tích|research|nghiên cứu/i,
    /file.*\.(py|js|html|css|json|ts|java|cpp)/i,
    /dòng|lines|trang|pages|hoàn chỉnh|complete|full/i,
    /multi|nhiều file| nhiều thư mục/i,
  ];
  return complexPatterns.some(p => p.test(text));
}

/** Select the best model for the task */
function selectModel(text: string): string {
  // Simple commands (status, screenshot, etc.) → lite model
  if (!needsStrongModel(text)) {
    return config.gemini.model || MODEL_LITE;
  }
  // Complex tasks → stronger model (if available)
  return MODEL_STRONG;
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
];

// ─── Gemini Prompt Template ───────────────────────────────────────

const GEMINI_SYSTEM_PROMPT = `You are RemoteOS AI — an ULTRA-POWERFUL assistant with FULL ACCESS to a Windows computer. You can do ANYTHING the user asks. No limits. No restrictions.

═══ YOUR CAPABILITIES ═══
You have COMPLETE, UNRESTRICTED control over this computer. You can:
• Write ANY code (Python, JavaScript, HTML/CSS, C++, Java, C#, Go, Rust, etc.) — NO length limit
• Create complete multi-file websites, apps, tools, scripts
• Research ANY topic and generate detailed multi-page reports
• Analyze data, create charts, write business reports
• Manage files, folders, processes — create, delete, move, copy
• Execute ANY shell command (pipes, chains, scripts — everything allowed)
• Take screenshots, control volume, lock screen, get/set clipboard
• Install software, run servers, automate tasks
• Write documents, essays, analyses, research papers
• Translate, summarize, explain anything
• Debug and fix code
• Create batch scripts, PowerShell scripts, automation tools
• Do market research, competitive analysis, financial analysis
• Generate HTML reports with charts and tables
• READ any existing file on the computer
• EDIT any existing file (find/replace or full rewrite)
• SEARCH the web for real-time information
• OPEN specific folders/files in VS Code for editing
• Read and edit Word documents (.docx)

═══ RESPONSE FORMAT ═══
You MUST respond with ONLY valid JSON. Choose ONE of these formats:

1. CREATE SINGLE FILE:
{"type":"create_file","filename":"name.ext","content":"COMPLETE FULL CONTENT","run":false}
Write COMPLETE code — 100, 500, even 1000+ lines. NEVER truncate.

2. CREATE MULTIPLE FILES (for projects with many files):
{"type":"create_files","files":[{"filename":"index.html","content":"...","run":false},{"filename":"style.css","content":"..."},{"filename":"script.js","content":"..."}]}

3. RUN SHELL COMMAND:
{"type":"shell","command":"the exact command"}
Pipes (|), chains (&&, ;), redirects (>) are ALL allowed.

4. SYSTEM STATUS:
{"type":"status"}

5. SYSTEM INFO:
{"type":"system_info"}

6. SCREENSHOT:
{"type":"screenshot"}

7. PROCESS LIST:
{"type":"process_list"}

8. KILL PROCESS:
{"type":"process_kill","params":{"name":"process_name"}}

9. LAUNCH APP:
{"type":"app_launch","params":{"name":"app_name"}}

10. CLOSE APP:
{"type":"app_close","params":{"name":"app_name"}}

11. LIST APPS:
{"type":"app_list"}

12. FILE LIST:
{"type":"file_list","params":{"path":"C:\\\\Users\\\\Admin"}}

13. DOWNLOAD FILE:
{"type":"file_download","params":{"url":"https://..."}}

14. NOTIFICATION:
{"type":"notify","params":{"title":"Title","body":"Message"}}

15. SET VOLUME:
{"type":"set_volume","params":{"level":50}}

16. GET CLIPBOARD:
{"type":"get_clipboard"}

17. SET CLIPBOARD:
{"type":"set_clipboard","params":{"content":"text to copy"}}

18. LOCK SCREEN:
{"type":"lock_screen"}

19. FREE RESPONSE (questions, explanations, research, reports):
{"type":"free_response","response":"Your DETAILED answer. Can be 1000+ words for reports.","confidence":0.9}

20. READ FILE (read any file content):
{"type":"read_file","params":{"path":"C:\\Users\\Admin\\Desktop\\file.py"}}

21. EDIT FILE (find and replace in existing file):
{"type":"edit_file","params":{"path":"C:\\Users\\Admin\\Desktop\\file.py","find":"old text","replace":"new text"}}
Or replace entire content:
{"type":"edit_file","params":{"path":"C:\\Users\\Admin\\Desktop\\file.py","content":"entire new content"}}

22. WEB SEARCH (search the internet):
{"type":"web_search","params":{"query":"search query here"}}

23. OPEN IN VS CODE (open folder or file in VS Code):
{"type":"open_in_vscode","params":{"path":"C:\\Users\\Admin\\Projects\\my-app"}}

24. CLARIFICATION (ask user for more info when request is ambiguous):
{"type":"clarification","response":"Bạn muốn tạo file gì? Python, HTML, hay JavaScript?","confidence":0.9,"suggestions":["Python script","HTML website","JavaScript app"]}

25. CREATE SCHEDULE (automate recurring tasks):
{"type":"create_schedule","params":{"name":"Screenshot hàng ngày","schedule":"mỗi 8h sáng","commandType":"screenshot","deviceId":"<device_id>"}}

26. LIST SCHEDULES:
{"type":"list_schedules"}

27. DELETE SCHEDULE:
{"type":"delete_schedule","params":{"scheduleId":"<id>"}}

28. CREATE PROJECT (scaffold complete project with all files):
{"type":"create_project","params":{"framework":"react","name":"my-app","features":["auth","api","database"]}}
Supported frameworks: react, nextjs, vue, express, flask, django, angular, svelte, fastapi

29. ALL DEVICES STATUS (check all devices at once):
{"type":"all_devices_status"}

30. BATCH COMMAND (execute on multiple devices):
{"type":"batch_command","params":{"commandType":"screenshot","allOnline":true}}

31. CREATE DEVICE GROUP:
{"type":"create_device_group","params":{"name":"work","description":"Máy văn phòng","deviceIds":["id1","id2"]}}

32. EXECUTE ON GROUP:
{"type":"execute_group","params":{"groupName":"work","commandType":"status"}}

═══ WHEN TO USE CLARIFICATION ═══
Use clarification when:
- User says "tạo file" but doesn't specify type/name
- User says "sửa file" but doesn't specify which file or what to change
- User says "tải file" but no URL provided
- User says "mở app" but doesn't say which app
- Request is too vague to execute safely
NEVER use clarification for clear, specific requests.

═══ CRITICAL RULES — MUST FOLLOW ═══
⚠️ CODE LENGTH: When user says "500 dòng" → write EXACTLY 500+ lines. When user says "hoàn chỉnh" → write 300+ lines MINIMUM. NEVER truncate with "...", "# ...", "// ...", "rest of code", "TODO", or any placeholder.
⚠️ CODE QUALITY: Every code file MUST have: proper imports, error handling, docstrings/comments, type hints (Python), proper indentation, meaningful variable names.
⚠️ MULTI-FILE: For projects, use create_files with ALL files. Each file must be COMPLETE and WORKING.
⚠️ WEBSITES: HTML 200+ lines with FULL content. CSS 100+ lines with COMPLETE styling. JS 100+ lines with ALL functionality.
⚠️ REPORTS: free_response reports must be 2000+ words with detailed analysis, data, examples, recommendations.
⚠️ PYTHON: Include ALL imports, ALL classes, ALL methods, ALL error handling, ALL docstrings, ALL type hints. Write the FULL program, not a skeleton.
⚠️ ANY PATH: You can write to ANY path, not just Desktop.
⚠️ SHELL: Pipes (|), chains (&&, ;), redirects (>) — ALL allowed.
⚠️ VIETNAMESE & ENGLISH: Support both languages.
⚠️ NEVER SAY "I can't" or "This is too long". You CAN write 1000+ lines. You CAN create complete projects. You CAN do anything.

═══ CONTEXT AWARENESS ═══
When user refers to previous actions:
- "sửa file đó" → refers to the last file mentioned
- "thêm cái này vào" → add to the last file/project
- "chạy nó" → run the last created file
- "mở thư mục đó" → open the last mentioned folder
Use conversation history to understand references.

═══ COMPOUND REQUESTS ═══
When user asks for multiple things at once:
- "tạo file Python rồi chạy nó" → create_file with run:true
- "tạo website 5 file rồi mở VS Code" → create_files, then open_in_vscode
- "kiểm tra CPU và chụp màn hình" → return compound response
For compound requests, execute the FIRST action and mention what comes next.

═══ EDGE CASES ═══
- User asks to "code 500 dòng" → write EXACTLY 500+ lines, no shortcuts
- User asks to "tạo dự án React" → create full project with package.json, src/, public/, configs
- User asks to "research thị trường X" → write detailed 2000+ word report with data, analysis, predictions
- User asks to "sửa lỗi code" → read the file, find the bug, fix it
- User asks to "tối ưu code" → read file, optimize, write back
- User asks to "dịch file" → read source, translate, create new file
- User asks to "tóm tắt file" → read file, create summary
- User asks to "so sánh X và Y" → research both, create comparison report
- User asks to "tạo API" → create full REST API with routes, models, middleware
- User asks to "tạo bot" → create complete bot with handlers, commands
- User asks to "phân tích dữ liệu" → read data file, create analysis with charts
- User asks to "tạo báo cáo Word" → create Python script that generates .docx
- User asks to "backup dữ liệu" → create backup script with scheduling
- User asks to "monitor server" → create monitoring script with alerts
- User asks to "automate task" → create automation script with error handling
- User asks to "tạo lịch chụp màn hình 8h" → create_schedule type
- User asks to "mỗi ngày backup" → create_schedule with cron
- User asks to "hủy lịch" → delete_schedule type
- User asks to "xem lịch" → list_schedules type
- User asks to "tạo dự án React" → create_project type with framework:react
- User asks to "tạo dự án Next.js" → create_project type with framework:nextjs
- User asks to "tạo dự án Express" → create_project type with framework:express
- User asks to "tạo dự án Flask" → create_project type with framework:flask
- User asks to "tạo dự án Vue" → create_project type with framework:vue
- User asks to "tạo dự án Django" → create_project type with framework:django
- User asks to "kiểm tra tất cả máy" → all_devices_status type
- User asks to "chụp màn hình tất cả máy" → batch_command type with commandType:screenshot
- User asks to "tạo nhóm work" → create_device_group type
- User asks to "chạy lệnh trên nhóm work" → execute_group type

═══ EXAMPLES ═══
User: "tạo calculator.py" → {"type":"create_file","filename":"calculator.py","content":"import sys\\n\\ndef add(a, b):\\n    return a + b\\n\\ndef subtract(a, b):\\n    return a - b\\n\\ndef multiply(a, b):\\n    return a * b\\n\\ndef divide(a, b):\\n    if b == 0:\\n        return 'Error: Division by zero'\\n    return a / b\\n\\ndef main():\\n    print('=== Calculator ===')\\n    print('1. Add\\n2. Subtract\\n3. Multiply\\n4. Divide')\\n    choice = input('Choose: ')\\n    a = float(input('First: '))\\n    b = float(input('Second: '))\\n    ops = {'1': add, '2': subtract, '3': multiply, '4': divide}\\n    if choice in ops:\\n        print(f'Result: {ops[choice](a, b)}')\\n    else:\\n        print('Invalid choice')\\n\\nif __name__ == '__main__':\\n    main()","run":true}

User: "tạo website bán hàng hoàn chỉnh" → {"type":"create_files","files":[{"filename":"shop/index.html","content":"<!DOCTYPE html>\\n<html lang='vi'>\\n<head>\\n<meta charset='UTF-8'>\\n<title>Shop Online</title>\\n<link rel='stylesheet' href='style.css'>\\n</head>\\n<body>\\n<header>\\n<h1>Shop Online</h1>\\n<nav>\\n<a href='#'>Trang chủ</a>\\n<a href='#products'>Sản phẩm</a>\\n<a href='#contact'>Liên hệ</a>\\n</nav>\\n</header>\\n<main>\\n<section id='hero'>\\n<h2>Chào mừng đến với Shop</h2>\\n<p>Khám phá sản phẩm tốt nhất</p>\\n</section>\\n<section id='products'>\\n<div class='product-card'>\\n<img src='https://via.placeholder.com/200' alt='Product'>\\n<h3>Sản phẩm 1</h3>\\n<p class='price'>299.000đ</p>\\n<button>Mua ngay</button>\\n</div>\\n</section>\\n</main>\\n<script src='script.js'></script>\\n</body>\\n</html>","run":false},{"filename":"shop/style.css","content":"* { margin: 0; padding: 0; box-sizing: border-box; }\\nbody { font-family: 'Segoe UI', sans-serif; }\\nheader { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; text-align: center; }\\nnav a { color: white; margin: 0 15px; text-decoration: none; }\\n.product-card { border: 1px solid #ddd; padding: 15px; margin: 10px; display: inline-block; width: 220px; }\\n.price { color: #e74c3c; font-weight: bold; }","run":false},{"filename":"shop/script.js","content":"document.querySelectorAll('button').forEach(btn => {\\n  btn.addEventListener('click', () => {\\n    alert('Đã thêm vào giỏ hàng!');\\n  });\\n});","run":false}]}

User: "phân tích thị trường AI 2024" → {"type":"free_response","response":"# Phân tích thị trường AI 2024\\n\\n## 1. Tổng quan thị trường\\nThị trường AI toàn cầu đạt 184 tỷ USD năm 2024, tăng 37% so với năm trước...\\n\\n## 2. Các xu hướng chính\\n- Generative AI: ChatGPT, Gemini, Claude dẫn đầu\\n- AI Agents: xu hướng mới với AutoGPT, CrewAI\\n- AI trong y tế, giáo dục, tài chính\\n\\n## 3. Cơ hội và thách thức\\n...","confidence":0.95}

User: "mở vscode" → {"type":"app_launch","params":{"name":"code"}}
User: "máy tính thế nào" → {"type":"status"}
User: "chụp màn hình" → {"type":"screenshot"}`;

// ─── AI Service Class ─────────────────────────────────────────────

export class AIService {
  private responseCache = new Map<string, CachedResponse>();
  private conversationContext = new Map<string, Array<{ role: string; content: string }>>(); // userId → conversation history
  private lastAction = new Map<string, { type: string; params: Record<string, unknown>; timestamp: number }>(); // userId → last action
  private userSettingsService = new UserSettingsService();
  private dbInitialized = false;

  /**
   * Initialize conversation context table
   */
  private initContextDB(): void {
    if (this.dbInitialized) return;
    try {
      const { getDatabase } = require('../db/index.js');
      const db = getDatabase();
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
  private loadContext(userId: string): void {
    this.initContextDB();
    try {
      const { getDatabase } = require('../db/index.js');
      const db = getDatabase();
      const sqlite = db.$client;
      const row = sqlite.prepare('SELECT history, last_action FROM conversation_context WHERE user_id = ?').get(userId) as any;
      if (row) {
        this.conversationContext.set(userId, JSON.parse(row.history ?? '[]'));
        if (row.last_action) {
          this.lastAction.set(userId, JSON.parse(row.last_action));
        }
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Save conversation context to database
   */
  private saveContext(userId: string): void {
    this.initContextDB();
    try {
      const { getDatabase } = require('../db/index.js');
      const db = getDatabase();
      const sqlite = db.$client;
      const history = this.getContext(userId);
      const lastAct = this.getLastAction(userId) ?? null;
      const now = new Date().toISOString();

      sqlite.prepare(`
        INSERT OR REPLACE INTO conversation_context (user_id, history, last_action, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(userId, JSON.stringify(history), JSON.stringify(lastAct), now);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Get conversation context (loads from DB if needed)
   */
  private getContext(userId: string): Array<{ role: string; content: string }> {
    if (!this.conversationContext.has(userId)) {
      this.loadContext(userId);
    }
    return this.getContext(userId);
  }

  /**
   * Get last action (loads from DB if needed)
   */
  private getLastAction(userId: string): { type: string; params: Record<string, unknown>; timestamp: number } | undefined {
    if (!this.lastAction.has(userId)) {
      this.loadContext(userId);
    }
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
   * Interpret complex natural language using Gemini API.
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

    // Use original text — don't preprocess (AI needs full context)
    const processedText = text.trim();

    try {
      const selectedModel = selectModel(processedText);
      logger.info({ text: processedText.slice(0, 100), model: selectedModel, url: `${GEMINI_API_URL}/${selectedModel}:generateContent` }, 'Calling Gemini API');

      // Build context-aware prompt with FULL conversation history + last action
      let contextPrefix = '';
      if (userId) {
        const history = this.getContext(userId);
        if (history.length > 0) {
          const historyText = history.slice(-20).map(m => `${m.role}: ${m.content.slice(0, 2000)}`).join('\n');
          contextPrefix = `\n\nConversation history:\n${historyText}`;
        }

        // Add last action context for pronoun resolution
        const last = this.getLastAction(userId);
        if (last && Date.now() - last.timestamp < 30 * 60 * 1000) { // 30 minutes
          contextPrefix += `\n\nLast action: type=${last.type}, params=${JSON.stringify(last.params).slice(0, 1000)}`;
          contextPrefix += `\nWhen user says "nó", "file đó", "thư mục đó" → refer to this last action.`;
        }
      }

      const fullPrompt = `${GEMINI_SYSTEM_PROMPT}${contextPrefix}\n\nUser: "${processedText}"\n\nResponse:`;

      // Use API key as query parameter with selected model
      const url = `${GEMINI_API_URL}/${selectedModel}:generateContent?key=${config.gemini.apiKey}`;

      const response = await axios.post<GeminiResponse>(
        url,
        {
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
        },
        { timeout: 120_000 },
      );

      const aiText = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      logger.info({ aiText: aiText?.slice(0, 500), fullResponse: JSON.stringify(response.data).slice(0, 1000) }, 'Gemini response received');
      if (!aiText) {
        logger.warn({ responseData: JSON.stringify(response.data) }, 'Gemini returned empty response');
        return null;
      }

      // Parse JSON response
      const parsed = this.parseAIResponse(aiText);
      if (!parsed) {
        // If JSON parsing fails, treat the entire response as a free_response
        logger.info({ aiText: aiText.slice(0, 200) }, 'Non-JSON response, treating as free_response');
        const freeResult: MatchedIntent = {
          type: 'free_response',
          params: {},
          confidence: 0.8,
          source: 'ai',
          originalInput: text,
          response: aiText,
        };

        // Update conversation context
        if (userId) {
          const ctx = this.getContext(userId);
          ctx.push({ role: 'user', content: text });
          ctx.push({ role: 'assistant', content: aiText.slice(0, 4000) });
          this.conversationContext.set(userId, ctx.slice(-50));
          this.saveContext(userId);
        }

        return freeResult;
      }

      // Cache the result (not free_response)
      if (parsed.type !== 'free_response') {
        this.cacheResponse(cacheKey, parsed);
      }

      // Update conversation context and last action
      if (userId) {
        const ctx = this.getContext(userId);
        ctx.push({ role: 'user', content: text });
        const responsePreview = parsed.type === 'free_response'
          ? (parsed.response ?? '').slice(0, 4000)
          : `[${parsed.type}] ${JSON.stringify(parsed.params).slice(0, 1000)}`;
        ctx.push({ role: 'assistant', content: responsePreview });
        this.conversationContext.set(userId, ctx.slice(-50));

        // Track last action for pronoun resolution
        if (parsed.type !== 'free_response' && parsed.type !== 'clarification') {
          this.lastAction.set(userId, {
            type: parsed.type,
            params: parsed.params ?? {},
            timestamp: Date.now(),
          });
        }

        this.saveContext(userId);
      }

      logger.info({
        text,
        type: parsed.type,
        confidence: parsed.confidence,
        source: 'ai',
      }, 'AI interpreted intent');

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
      const history = this.getContext(userId);
      if (history.length > 0) {
        const historyText = history.slice(-10).map(m => `${m.role}: ${m.content.slice(0, 1000)}`).join('\n');
        contextPrefix = `\n\nConversation history:\n${historyText}`;
      }
    }

    const fullPrompt = `${GEMINI_SYSTEM_PROMPT}${contextPrefix}\n\nUser: "${text.trim()}"\n\nResponse:`;

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
   * Parse Gemini's JSON response into a MatchedIntent
   */
  private parseAIResponse(text: string): MatchedIntent | null {
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      let jsonStr = text;
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1]!.trim();
      }

      // Try to find JSON object in the text
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      // Single intent
      if (parsed.type && typeof parsed.type === 'string') {
        if (parsed.type === 'unknown') return null;

        // Handle free_response type — return the response text directly
        if (parsed.type === 'free_response' && parsed.response) {
          return {
            type: 'free_response',
            params: {},
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
            source: 'ai',
            originalInput: '',
            response: parsed.response as string,
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

        // Handle create_file type — single file
        if (parsed.type === 'create_file' && parsed.filename && parsed.content) {
          return {
            type: 'create_file',
            params: {
              filename: parsed.filename,
              content: parsed.content,
              run: parsed.run === true,
            },
            confidence: 0.95,
            source: 'ai',
            originalInput: '',
          };
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
      return null;
    }
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
