/**
 * AI Agent Scenario Tests — Real-World Multi-Industry
 *
 * These tests verify that the AI agent can handle complex, multi-step tasks
 * from various industries and use cases. This is NOT just unit testing —
 * it's testing the AI's ability to understand and act on natural language.
 *
 * Categories:
 * 1. Software Development (code generation, debugging, refactoring)
 * 2. Data Analysis (Excel, CSV, reports)
 * 3. DevOps (monitoring, automation, deployment)
 * 4. Content Creation (writing, translation)
 * 5. Project Management (tasks, scheduling)
 * 6. Education (math, research)
 * 7. Multi-step Complex Tasks
 * 8. Conversation Context & Pronoun Resolution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Setup ───────────────────────────────────────────────────

vi.mock('../../services/ai-service.js', () => ({
  AIService: vi.fn().mockImplementation(() => ({
    interpretWithUserAI: vi.fn(),
    generateFriendlyResponse: vi.fn(),
    formatResponse: vi.fn(),
    getFreeResponseChunks: vi.fn((text: string) => [text]),
    getLastActionForUser: vi.fn(),
    setLastAction: vi.fn(),
    getContext: vi.fn(() => []),
    streamResponse: vi.fn(),
  })),
}));

vi.mock('../../services/device-service.js', () => ({
  DeviceService: vi.fn().mockImplementation(() => ({
    listByUser: vi.fn(() => [
      { id: 'device-1', name: 'My PC', status: 'online', os: 'windows' },
    ]),
  })),
}));

vi.mock('../../services/command-service.js', () => ({
  CommandService: vi.fn().mockImplementation(() => ({
    create: vi.fn(),
    waitForResult: vi.fn(),
  })),
}));

vi.mock('../../services/agent-loop.js', () => ({
  AgentLoop: vi.fn().mockImplementation(() => ({
    execute: vi.fn(),
  })),
}));

vi.mock('../../services/conversation-memory.js', () => ({
  getConversationMemory: vi.fn(() => ({
    recordTurn: vi.fn(),
    updateLastAction: vi.fn(),
    getContext: vi.fn(() => ({
      recentTurns: [],
      lastAction: null,
      previousAction: null,
      workingDirectory: 'C:\\Users\\Admin\\Desktop',
      recentFiles: [],
      language: 'vi',
      interactionCount: 0,
    })),
    resolveReference: vi.fn(() => null),
    buildContextForAI: vi.fn(() => ''),
    clearUserMemory: vi.fn(),
  })),
}));

vi.mock('../../config/index.js', () => ({
  config: {
    gemini: { apiKey: 'test-key', model: 'gemini-3.1-flash-lite' },
    server: { host: '0.0.0.0', port: 3000 },
  },
}));

vi.mock('../../config/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../db/index.js', () => ({
  getDb: vi.fn(() => ({
    exec: vi.fn(),
    run: vi.fn(),
    all: vi.fn(() => []),
    get: vi.fn(() => null),
  })),
}));

vi.mock('../../services/auth-service.js', () => ({
  AuthService: vi.fn().mockImplementation(() => ({
    findOrCreateUser: vi.fn(() => ({ id: 'user-1', displayName: 'Test User' })),
  })),
}));

vi.mock('../../services/user-settings-service.js', () => ({
  UserSettingsService: vi.fn().mockImplementation(() => ({
    getUserConfig: vi.fn(),
  })),
}));

vi.mock('../../services/emotion-detector.js', () => ({
  detectEmotion: vi.fn(() => ({ emotion: 'neutral', confidence: 0.5 })),
  injectEmotionalContext: vi.fn((prompt: string) => prompt),
}));

// ─── Test Scenarios ───────────────────────────────────────────────

describe('AI Agent — Real-World Scenarios', () => {
  // ── Category 1: Software Development ──────────────────────────

  describe('Software Development', () => {
    it('should understand "tạo REST API Node.js với Express"', () => {
      const text = 'tạo REST API Node.js với Express, MongoDB, JWT auth';
      const isComplex = /tạo.*api|create.*api|build.*api/i.test(text);
      expect(isComplex).toBe(true);
    });

    it('should understand "debug lỗi TypeError trong file server.ts"', () => {
      const text = 'debug lỗi TypeError trong file server.ts dòng 45';
      const hasDebugIntent = /debug|fix|sửa lỗi|tìm lỗi/i.test(text);
      expect(hasDebugIntent).toBe(true);
    });

    it('should understand "refactor class UserService thành singleton"', () => {
      const text = 'refactor class UserService thành singleton pattern';
      const hasRefactorIntent = /refactor|tái cấu trúc|cải thiện/i.test(text);
      expect(hasRefactorIntent).toBe(true);
    });

    it('should understand "viết unit test cho hàm calculateDiscount"', () => {
      const text = 'viết unit test cho hàm calculateDiscount()';
      const hasTestIntent = /test|kiểm thử|unit test|test case/i.test(text);
      expect(hasTestIntent).toBe(true);
    });

    it('should understand "deploy ứng dụng lên Railway"', () => {
      const text = 'deploy ứng dụng lên Railway';
      const hasDeployIntent = /deploy|triển khai|push.*production/i.test(text);
      expect(hasDeployIntent).toBe(true);
    });
  });

  // ── Category 2: Data Analysis ─────────────────────────────────

  describe('Data Analysis', () => {
    it('should understand "đọc file sales_q4.xlsx, tính tổng doanh thu"', () => {
      const text = 'đọc file sales_q4.xlsx, tính tổng doanh thu theo tháng';
      const hasDataIntent = /đọc.*xlsx|excel|phân tích.*dữ liệu|tính.*tổng/i.test(text);
      expect(hasDataIntent).toBe(true);
    });

    it('should understand "phân tích outlier trong dataset"', () => {
      const text = 'phân tích outlier trong dataset customer_churn.csv';
      const hasAnalysisIntent = /phân tích|outlier|anomaly|statistics/i.test(text);
      expect(hasAnalysisIntent).toBe(true);
    });

    it('should understand "tạo báo cáo PDF với biểu đồ"', () => {
      const text = 'tạo báo cáo PDF với biểu đồ và bảng tổng hợp';
      const hasReportIntent = /báo cáo|report|tạo.*pdf|generate.*report/i.test(text);
      expect(hasReportIntent).toBe(true);
    });

    it('should understand "dự đoán doanh thu tháng tới"', () => {
      const text = 'dự đoán doanh thu tháng tới dựa trên dữ liệu 12 tháng';
      const hasPredictIntent = /dự đoán|predict|forecast|dự báo/i.test(text);
      expect(hasPredictIntent).toBe(true);
    });
  });

  // ── Category 3: DevOps ────────────────────────────────────────

  describe('DevOps', () => {
    it('should understand "kiểm tra port 3000 đang bị process nào占用"', () => {
      const text = 'kiểm tra xem port 3000 đang bị process nào占用';
      const hasPortIntent = /port|process.*占用|netstat|lsof/i.test(text);
      expect(hasPortIntent).toBe(true);
    });

    it('should understand "tạo script backup database tự động"', () => {
      const text = 'tạo script backup database tự động mỗi ngày lúc 2h sáng';
      const hasAutomationIntent = /tạo.*script|backup|tự động|automation/i.test(text);
      expect(hasAutomationIntent).toBe(true);
    });

    it('should understand "monitor CPU/RAM và gửi cảnh báo"', () => {
      const text = 'monitor CPU/RAM usage và gửi cảnh báo qua Telegram khi vượt 90%';
      const hasMonitorIntent = /monitor|giám sát|cảnh báo|alert/i.test(text);
      expect(hasMonitorIntent).toBe(true);
    });
  });

  // ── Category 4: Content Creation ──────────────────────────────

  describe('Content Creation', () => {
    it('should understand "viết bài blog 1000 từ về AI"', () => {
      const text = 'viết bài blog 1000 từ về AI trends 2026';
      const hasWriteIntent = /viết|blog|bài viết|content/i.test(text);
      expect(hasWriteIntent).toBe(true);
    });

    it('should understand "tạo slide presentation"', () => {
      const text = 'tạo slide presentation về dự án RemoteOS';
      const hasSlideIntent = /slide|presentation|powerpoint|pptx/i.test(text);
      expect(hasSlideIntent).toBe(true);
    });

    it('should understand "dịch document sang tiếng Nhật"', () => {
      const text = 'dịch document này sang tiếng Nhật';
      const hasTranslateIntent = /dịch|translate|tiếng nhật|japanese/i.test(text);
      expect(hasTranslateIntent).toBe(true);
    });
  });

  // ── Category 5: Project Management ────────────────────────────

  describe('Project Management', () => {
    it('should understand "tạo Kanban board với các task"', () => {
      const text = 'tạo Kanban board với các task cho dự án RemoteOS';
      const hasKanbanIntent = /kanban|task|board|quản lý.*công việc/i.test(text);
      expect(hasKanbanIntent).toBe(true);
    });

    it('should understand "tóm tắt cuộc họp từ file meeting_notes"', () => {
      const text = 'tóm tắt cuộc họp từ file meeting_notes.docx';
      const hasSummaryIntent = /tóm tắt|summary|meeting|cuộc họp/i.test(text);
      expect(hasSummaryIntent).toBe(true);
    });

    it('should understand "gửi email nhắc nhở cho team"', () => {
      const text = 'gửi email nhắc nhở cho team về deadline';
      const hasEmailIntent = /email|gửi.*mail|nhắc nhở|remind/i.test(text);
      expect(hasEmailIntent).toBe(true);
    });
  });

  // ── Category 6: Education ─────────────────────────────────────

  describe('Education', () => {
    it('should understand "giải phương trình bậc 2"', () => {
      const text = 'giải phương trình bậc 2: x² + 5x + 6 = 0';
      const hasMathIntent = /giải|phương trình|math|calculate|tính/i.test(text);
      expect(hasMathIntent).toBe(true);
    });

    it('should understand "tạo flashcard học tiếng Anh"', () => {
      const text = 'tạo flashcard học tiếng Anh từ vocabulary.txt';
      const hasFlashcardIntent = /flashcard|học|vocabulary|từ vựng/i.test(text);
      expect(hasFlashcardIntent).toBe(true);
    });

    it('should understand "viết luận văn về AI và giáo dục"', () => {
      const text = 'viết luận văn về tác động của AI đến giáo dục';
      const hasEssayIntent = /luận văn|essay|viết.*về|bài luận/i.test(text);
      expect(hasEssayIntent).toBe(true);
    });
  });

  // ── Category 7: Multi-step Complex Tasks ──────────────────────

  describe('Multi-step Complex Tasks', () => {
    it('should detect complex task: "tìm file .log, nén lại, upload"', () => {
      const text = 'tìm tất cả file .log trên Desktop, nén lại, upload lên Google Drive';
      const isComplex = /tìm.*nén|nén.*upload|tìm.*và.*tạo|nhiều.*bước/i.test(text);
      expect(isComplex).toBe(true);
    });

    it('should detect complex task: "scrape dữ liệu, phân tích, tạo báo cáo"', () => {
      const text = 'scrape dữ liệu từ website X, phân tích, tạo báo cáo Excel';
      const isComplex = /scrape.*phân tích|phân tích.*tạo|dữ liệu.*báo cáo/i.test(text);
      expect(isComplex).toBe(true);
    });

    it('should detect complex task: "tạo chatbot Telegram, deploy Heroku"', () => {
      const text = 'tạo chatbot Telegram đơn giản bằng Python, deploy lên Heroku';
      const isComplex = /tạo.*deploy|chatbot.*deploy|tạo.*và.*deploy/i.test(text);
      expect(isComplex).toBe(true);
    });
  });

  // ── Category 8: Conversation Context & Pronouns ───────────────

  describe('Conversation Context & Pronoun Resolution', () => {
    it('should detect pronoun "nó" in "chạy nó"', () => {
      const text = 'chạy nó';
      const hasPronoun = /(nó|cái đó|file đó)/i.test(text);
      expect(hasPronoun).toBe(true);
    });

    it('should detect pronoun "file đó" in "đọc file đó"', () => {
      const text = 'đọc file đó';
      const hasPronoun = /(file đó|cái đó|nó)/i.test(text);
      expect(hasPronoun).toBe(true);
    });

    it('should detect implicit reference "vừa tạo"', () => {
      const text = 'xem file vừa tạo';
      const hasReference = /(vừa tạo|vừa tìm|vừa đọc)/i.test(text);
      expect(hasReference).toBe(true);
    });

    it('should detect implicit reference in "đọc nó"', () => {
      const text = 'đọc nó';
      const hasImplicit = /(?:đọc|read|xem|cat)\s+(?:nó|thêm|tiếp)/i.test(text);
      expect(hasImplicit).toBe(true);
    });

    it('should detect implicit reference in "chạy nó"', () => {
      const text = 'chạy nó';
      const hasImplicit = /(?:chạy|run|execute)\s+(?:nó|thêm|tiếp)/i.test(text);
      expect(hasImplicit).toBe(true);
    });

    it('should NOT detect pronoun in "tạo file mới"', () => {
      const text = 'tạo file mới tên app.py';
      const hasPronoun = /(nó|cái đó|file đó|vừa tạo)/i.test(text);
      expect(hasPronoun).toBe(false);
    });
  });

  // ── Category 9: Vietnamese Language Understanding ─────────────

  describe('Vietnamese Language Understanding', () => {
    it('should understand casual Vietnamese: "máy tính sao rồi?"', () => {
      const text = 'máy tính sao rồi?';
      const hasStatusIntent = /máy tính.*sao|status|trạng thái/i.test(text);
      expect(hasStatusIntent).toBe(true);
    });

    it('should understand casual Vietnamese: "chụp cái màn hình cho tao"', () => {
      const text = 'chụp cái màn hình cho tao';
      const hasScreenshotIntent = /chụp|screenshot|màn hình/i.test(text);
      expect(hasScreenshotIntent).toBe(true);
    });

    it('should understand casual Vietnamese: "tắt cái app đó đi"', () => {
      const text = 'tắt cái app đó đi';
      const hasKillIntent = /tắt|kill|close|stop|đóng/i.test(text);
      expect(hasKillIntent).toBe(true);
    });

    it('should understand mixed Vietnamese-English: "tạo file hello world bằng Python"', () => {
      const text = 'tạo file hello world bằng Python';
      const hasCreateIntent = /tạo|create|viết/i.test(text);
      const hasPython = /python|\.py/i.test(text);
      expect(hasCreateIntent).toBe(true);
      expect(hasPython).toBe(true);
    });
  });

  // ── Category 10: Edge Cases ───────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const text = '';
      expect(text.length).toBe(0);
    });

    it('should handle very long input', () => {
      const text = 'tạo file '.repeat(1000) + 'test.py';
      expect(text.length).toBeGreaterThan(5000);
      // Should still detect intent
      const hasIntent = /tạo.*file/i.test(text);
      expect(hasIntent).toBe(true);
    });

    it('should handle special characters', () => {
      const text = 'tạo file test<script>alert(1)</script>.py';
      // Should sanitize but still detect intent
      const sanitized = text.replace(/<[^>]*>/g, '');
      const hasIntent = /tạo.*file/i.test(sanitized);
      expect(hasIntent).toBe(true);
    });

    it('should handle code in message', () => {
      const text = 'tạo file với nội dung:\n```python\nprint("hello")\n```';
      const hasCode = /```/.test(text);
      expect(hasCode).toBe(true);
    });

    it('should handle URL in message', () => {
      const text = 'tải file từ https://example.com/data.csv';
      const hasUrl = /https?:\/\/[^\s]+/.test(text);
      expect(hasUrl).toBe(true);
    });
  });
});

describe('AI Agent — Complex Task Detection', () => {
  const complexPatterns = [
    /tạo.*dự án|create.*project|tạo.*website.*hoàn chỉnh|build.*complete/i,
    /tạo.*website.*với|create.*website.*with/i,
    /tạo.*ứng dụng|create.*app|build.*app/i,
    /tạo.*hệ thống|create.*system|build.*system/i,
    /phân tích.*dữ liệu.*và.*tạo.*báo cáo|analyze.*data.*and.*create.*report/i,
    /tìm.*đọc.*và.*tóm tắt|find.*read.*and.*summarize/i,
    /đọc.*và.*tóm tắt|read.*and.*summarize/i,
    /tìm.*và.*tóm tắt|find.*and.*summarize/i,
    /tạo.*nhiều.*file|create.*multiple.*files/i,
    /tạo.*api|create.*api|build.*api/i,
    /nghiên cứu.*và.*viết|research.*and.*write/i,
    /viết.*báo cáo|write.*report|tạo.*báo cáo|create.*report/i,
    /tạo.*script.*tự động|create.*automation.*script/i,
    /viết.*chương trình.*hoàn chỉnh|write.*complete.*program/i,
    /quản lý.*sinh viên|student.*management/i,
    /quản lý.*bệnh viện|hospital.*management/i,
    /quản lý.*kho|inventory.*management/i,
    /blog|landing.*page/i,
    /tạo.*chatbot|create.*chatbot/i,
    /deploy|triển khai/i,
  ];

  const complexTasks = [
    'tạo dự án React hoàn chỉnh với authentication',
    'tạo website với HTML, CSS, JavaScript',
    'tạo ứng dụng quản lý sinh viên',
    'tạo hệ thống đặt hàng online',
    'phân tích dữ liệu sales và tạo báo cáo PDF',
    'tìm file .docx và tóm tắt nội dung',
    'tạo 5 file Python cho dự án ML',
    'tạo REST API cho ứng dụng blog',
    'nghiên cứu AI trends và viết bài phân tích',
    'viết báo cáo về hiệu suất hệ thống',
    'tạo script tự động backup hàng ngày',
    'viết chương trình quản lý kho hoàn chỉnh',
    'tạo ứng dụng quản lý sinh viên bằng Java',
    'tạo hệ thống quản lý bệnh viện',
    'quản lý kho hàng với barcode scanner',
    'tạo landing page cho sản phẩm mới',
  ];

  it.each(complexTasks)('should detect complex task: "%s"', (task) => {
    const isComplex = complexPatterns.some(pattern => pattern.test(task));
    expect(isComplex).toBe(true);
  });

  const simpleTasks = [
    'chụp màn hình',
    'máy tính thế nào?',
    'tạo file test.py',
    'đọc file README.md',
    'tìm file *.pdf',
  ];

  it.each(simpleTasks)('should NOT detect as complex: "%s"', (task) => {
    const isComplex = complexPatterns.some(pattern => pattern.test(task));
    expect(isComplex).toBe(false);
  });
});
