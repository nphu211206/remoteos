/**
 * Interpret Route — AI-powered Natural Language Understanding
 *
 * POST /api/v1/interpret
 * POST /api/v1/interpret-and-execute
 *
 * Core principle: Users say ANYTHING → AI understands → Computer executes.
 * No rigid pattern matching for natural language.
 *
 * Supports hybrid response format:
 * - Natural conversation text (displayed to user)
 * - Action blocks (executed on device)
 * - Multi-step execution via Agent Loop
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AIService } from '../services/ai-service.js';
import { DeviceService } from '../services/device-service.js';
import { CommandService } from '../services/command-service.js';
import { AgentLoop } from '../services/agent-loop.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Select the best model for recovery tasks */
function selectRecoveryModel(): string {
  return 'gemini-3.1-flash-lite'; // Use fast model for recovery
}

const aiService = new AIService();
const deviceService = new DeviceService();
const commandService = new CommandService();
const agentLoop = new AgentLoop();

/**
 * Get the user's Desktop path (cross-platform)
 */
function getDesktopPath(): string {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return home ? `${home}${process.platform === 'win32' ? '\\' : '/'}Desktop` : '';
}

// Helper: Generate project files based on framework
function generateProjectFiles(framework: string, name: string, features: string[]): Record<string, string> {
  const files: Record<string, string> = {};

  switch (framework) {
    case 'react':
      files['package.json'] = JSON.stringify({
        name, version: '1.0.0', private: true,
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
        devDependencies: { '@vitejs/plugin-react': '^4.0.0', vite: '^5.0.0', typescript: '^5.0.0' },
      }, null, 2);
      files['index.html'] = `<!DOCTYPE html>\n<html lang="vi">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${name}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>`;
      files['vite.config.ts'] = `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { port: 3000, open: true }\n})`;
      files['tsconfig.json'] = JSON.stringify({
        compilerOptions: { target: 'ES2020', useDefineForClassFields: true, lib: ['ES2020', 'DOM', 'DOM.Iterable'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: 'react-jsx', strict: true },
        include: ['src'],
      }, null, 2);
      files['src/main.tsx'] = `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n)`;
      files['src/App.tsx'] = `import { useState } from 'react'\n\nfunction App() {\n  const [count, setCount] = useState(0)\n\n  return (\n    <div className="app">\n      <h1>${name}</h1>\n      <p>Count: {count}</p>\n      <button onClick={() => setCount(count + 1)}>Increment</button>\n    </div>\n  )\n}\n\nexport default App`;
      files['src/index.css'] = `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: 'Segoe UI', sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }\n.app { text-align: center; background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }\nbutton { margin-top: 1rem; padding: 0.5rem 1.5rem; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; }`;
      files['.gitignore'] = `node_modules\ndist\n.env`;
      files['README.md'] = `# ${name}\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\``;
      break;

    case 'nextjs':
      files['package.json'] = JSON.stringify({
        name, version: '1.0.0', private: true,
        scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        dependencies: { next: '^14.0.0', react: '^18.2.0', 'react-dom': '^18.2.0' },
        devDependencies: { typescript: '^5.0.0', '@types/react': '^18.0.0' },
      }, null, 2);
      files['next.config.js'] = `module.exports = {}`;
      files['src/app/layout.tsx'] = `export const metadata = { title: '${name}' }\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="vi"><body>{children}</body></html>\n}`;
      files['src/app/page.tsx'] = `export default function Home() {\n  return <main><h1>${name}</h1><p>Welcome!</p></main>\n}`;
      files['.gitignore'] = `node_modules\n.next\n.env`;
      files['README.md'] = `# ${name}\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\``;
      break;

    case 'express':
      files['package.json'] = JSON.stringify({
        name, version: '1.0.0',
        scripts: { dev: 'tsx watch src/index.ts', build: 'tsc', start: 'node dist/index.js' },
        dependencies: { express: '^4.18.0', cors: '^2.8.5' },
        devDependencies: { typescript: '^5.0.0', '@types/express': '^4.17.0', tsx: '^4.0.0' },
      }, null, 2);
      files['src/index.ts'] = `import express from 'express'\nimport cors from 'cors'\n\nconst app = express()\napp.use(cors())\napp.use(express.json())\n\napp.get('/', (req, res) => res.json({ message: 'Welcome to ${name} API' }))\napp.get('/health', (req, res) => res.json({ status: 'ok' }))\n\napp.listen(3000, () => console.log('Server on port 3000'))`;
      files['.gitignore'] = `node_modules\ndist\n.env`;
      files['README.md'] = `# ${name}\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\``;
      break;

    case 'flask':
      files['requirements.txt'] = 'flask==3.0.0\nflask-cors==4.0.0';
      files['app.py'] = `from flask import Flask, jsonify\nfrom flask_cors import CORS\n\napp = Flask(__name__)\nCORS(app)\n\n@app.route('/')\ndef home():\n    return jsonify({'message': 'Welcome to ${name} API'})\n\n@app.route('/health')\ndef health():\n    return jsonify({'status': 'ok'})\n\nif __name__ == '__main__':\n    app.run(debug=True, port=5000)`;
      files['.gitignore'] = `__pycache__\n*.pyc\n.env`;
      files['README.md'] = `# ${name}\n\n\`\`\`bash\npip install -r requirements.txt\npython app.py\n\`\`\``;
      break;

    case 'fastapi':
      files['requirements.txt'] = 'fastapi==0.104.0\nuvicorn==0.24.0';
      files['app.py'] = `from fastapi import FastAPI\n\napp = FastAPI(title="${name}")\n\n@app.get("/")\ndef home():\n    return {"message": "Welcome to ${name} API"}\n\n@app.get("/health")\ndef health():\n    return {"status": "ok"}`;
      files['.gitignore'] = `__pycache__\n*.pyc\n.env`;
      files['README.md'] = `# ${name}\n\n\`\`\`bash\npip install -r requirements.txt\nuvicorn app:app --reload\n\`\`\``;
      break;

    default:
      files['README.md'] = `# ${name}\n\nProject created with RemoteOS`;
      break;
  }

  return files;
}

/**
 * Detect if a task is complex enough to warrant the Agent Loop
 * Complex tasks are multi-step operations that benefit from autonomous execution
 */
function isComplexTask(text: string): boolean {
  const complexPatterns = [
    // Multi-file project creation
    /tạo.*dự án|create.*project|tạo.*website.*hoàn chỉnh|build.*complete/i,
    /tạo.*website.*với|create.*website.*with|tạo.*trang.*web.*với/i,
    /tạo.*ứng dụng|create.*app|build.*app|make.*app/i,
    /tạo.*hệ thống|create.*system|build.*system/i,
    // Data analysis pipelines
    /phân tích.*dữ liệu.*và.*tạo.*báo cáo|analyze.*data.*and.*create.*report/i,
    /phân tích.*và.*tạo|analyze.*and.*create/i,
    // Multi-step file operations
    /tìm.*đọc.*và.*tóm tắt|find.*read.*and.*summarize/i,
    /đọc.*và.*tóm tắt|read.*and.*summarize/i,
    // Code generation with multiple files
    /tạo.*nhiều.*file|create.*multiple.*files|tạo.*api.*hoàn chỉnh|create.*complete.*api/i,
    /tạo.*api|create.*api|build.*api|make.*api/i,
    /tạo.*rest.*api|create.*rest.*api/i,
    // Research and report generation
    /nghiên cứu.*và.*viết|research.*and.*write|phân tích.*thị trường.*và.*tạo/i,
    /viết.*báo cáo|write.*report|tạo.*báo cáo|create.*report/i,
    // Automation workflows
    /tạo.*script.*tự động|create.*automation.*script|backup.*và.*upload/i,
    /tạo.*script|create.*script|write.*script/i,
    // Complex coding tasks
    /viết.*chương trình.*hoàn chỉnh|write.*complete.*program|code.*500.*dòng/i,
    /viết.*chương trình|write.*program|tạo.*chương trình|create.*program/i,
    /viết.*hàm|write.*function|tạo.*hàm|create.*function/i,
    /viết.*code|write.*code|tạo.*code|create.*code/i,
    // Industry-specific
    /quản lý.*sinh viên|student.*management/i,
    /quản lý.*bệnh viện|hospital.*management/i,
    /quản lý.*kho|inventory.*management/i,
    /quản lý.*công việc|task.*management/i,
    /bán hàng|e-commerce|ecommerce|shopping/i,
    /blog|landing.*page/i,
    // Multi-step with "và" (and)
    /tạo.*và.*tạo|create.*and.*create/i,
    /viết.*và.*tạo|write.*and.*create/i,
  ];

  return complexPatterns.some(pattern => pattern.test(text));
}

export function registerInterpretRoutes(server: FastifyInstance): void {

  // ─── POST /interpret ──────────────────────────────────────────

  // ─── POST /stream — Streaming AI Response ─────────────────────

  server.post('/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { text?: string };
    const text = body.text?.trim();

    if (!text) {
      return reply.status(400).send({ error: 'Missing text field' });
    }

    // Set headers for streaming
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    try {
      const { AuthService } = await import('../services/auth-service.js');
      const authService = new AuthService();
      const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

      for await (const chunk of aiService.streamResponse(text, defaultUser.id)) {
        reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    } catch (err) {
      logger.error({ err }, 'Streaming failed');
      reply.raw.write(`data: ${JSON.stringify({ error: 'Streaming failed' })}\n\n`);
      reply.raw.end();
    }
  });

  server.post('/interpret', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { text?: string };
    const text = body.text?.trim();

    if (!text) {
      return reply.status(400).send({ success: false, error: 'Missing text field' });
    }

    // Get default dev user
    const { AuthService } = await import('../services/auth-service.js');
    const authService = new AuthService();
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });
    const userId = defaultUser.id;

    logger.info({ text }, 'Interpret request');

    // Always try AI — this is the core of RemoteOS
    // Uses user's AI provider if configured, falls back to global Gemini
    try {
      const aiIntent = await aiService.interpretWithUserAI(text, userId);

      if (aiIntent) {
        logger.info({ type: aiIntent.type, source: 'ai', confidence: aiIntent.confidence }, 'AI match');

        // Handle free_response type — check for embedded <action> blocks
        if (aiIntent.type === 'free_response') {
          const responseText = aiIntent.response ?? '';

          // Check if response contains <action> blocks
          const actionMatch = responseText.match(/<action>([\s\S]*?)<\/action>/);
          if (actionMatch) {
            // Has embedded action — return as action type
            try {
              const actionJson = JSON.parse(actionMatch[1]!.trim());
              return reply.send({
                success: true,
                intent: {
                  type: actionJson.type,
                  params: actionJson.params ?? {},
                  confidence: 0.95,
                  source: 'ai',
                },
                response: responseText.replace(/<action>[\s\S]*?<\/action>/g, '').trim(),
              });
            } catch {
              // Parse error — return as free_response
            }
          }

          return reply.send({
            success: true,
            intent: { type: 'free_response', params: {}, confidence: aiIntent.confidence, source: 'ai' },
            response: responseText,
          });
        }

        return reply.send({
          success: true,
          intent: { type: aiIntent.type, params: aiIntent.params, confidence: aiIntent.confidence, source: 'ai' },
        });
      }

      // AI couldn't understand
      return reply.send({ success: false, error: 'AI không hiểu yêu cầu. Vui lòng diễn đạt lại.' });
    } catch (err: any) {
      // AI service failed (quota, network, etc.)
      const msg = err?.message ?? 'Unknown error';
      logger.error({ err: msg }, 'AI service failed');

      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        return reply.send({
          success: false,
          error: 'Gemini API đã hết quota miễn phí (20 requests/ngày). Vui lòng đợi hoặc nâng cấp API key.',
        });
      }

      return reply.send({ success: false, error: 'AI service tạm thời không khả dụng. Thử lại sau.' });
    }
  });

  // ─── POST /interpret-and-execute ──────────────────────────────

  server.post('/interpret-and-execute', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { text?: string; deviceId?: string; context?: string; image?: string };
    const text = body.text?.trim();
    const deviceId = body.deviceId;
    const context = body.context?.trim();
    const imageBase64 = body.image;

    if (!text && !imageBase64) {
      return reply.status(400).send({ success: false, error: 'Missing text or image field' });
    }

    // If image is provided, use Vision API
    if (imageBase64) {
      try {
        const visionUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.gemini.apiKey}`;
        const prompt = text ?? 'Mô tả chi tiết những gì bạn thấy trong ảnh chụp màn hình này. Nếu có code, đọc code. Nếu có UI, mô tả UI. Nếu có lỗi, giải thích lỗi.';

        const visionBody = {
          contents: [{
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
                },
              },
            ],
          }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        };

        const axios = (await import('axios')).default;
        const response = await axios.post(visionUrl, visionBody, { timeout: 30000 });
        const aiText = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (aiText) {
          return reply.send({
            success: true,
            intent: { type: 'vision_analysis', params: {}, confidence: 0.95, source: 'ai' },
            result: { description: aiText },
            formattedResponse: aiText,
          });
        }
      } catch (err) {
        logger.error({ err }, 'Vision analysis failed');
      }
    }

    // Get default dev user
    const { AuthService } = await import('../services/auth-service.js');
    const authService = new AuthService();
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });
    const userId = defaultUser.id;

    // Find device (optional - if no device, use AI to generate response)
    let targetDeviceId = deviceId;
    if (!targetDeviceId) {
      const devices = await deviceService.listByUser(userId);
      const onlineDevice = devices.find((d) => d.status === 'online');
      if (onlineDevice) {
        targetDeviceId = onlineDevice.id;
      }
      // If no device, continue without device (AI will generate response)
    }

    // Detect complex multi-step tasks and use Agent Loop
    const isComplex = text ? isComplexTask(text) : false;
    if (isComplex && targetDeviceId && text) {
      logger.info({ text: text.slice(0, 100) }, 'Complex task detected, using Agent Loop');
      try {
        const loopResult = await agentLoop.execute(userId, text, targetDeviceId, {
          maxSteps: 20,
          stepTimeoutMs: 60_000,
        });

        return reply.send({
          success: loopResult.success,
          intent: { type: 'agent_loop', params: {}, confidence: 0.95, source: 'ai' },
          result: { actions: loopResult.actions, steps: loopResult.totalSteps },
          formattedResponse: loopResult.response,
          allChunks: loopResult.response.length > 4000
            ? aiService.getFreeResponseChunks(loopResult.response)
            : undefined,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, 'Agent Loop failed, falling back to single-step');
        // Fall through to single-step execution
      }
    }

    // No server-side pre-processing — let AI handle everything
    // The AI prompt has been updated to be autonomous and never ask questions
    let intent: { type: string; params?: Record<string, unknown>; confidence: number; source: string; response?: string; suggestions?: string[]; allIntents?: Array<{ type: string; params?: Record<string, unknown> }> } | null = null;

    // Always use AI for interpretation
    if (!intent) {
      // Prepend context if provided
      let textWithContext = text ?? '';
      if (context && text) {
        textWithContext = `[Context: ${context}]\n\nUser request: ${text}`;
        logger.info({ context: context.slice(0, 200) }, 'Including context in AI request');
      }

      try {
        logger.info({ text: textWithContext.slice(0, 200), userId }, 'Calling AI service');
        const aiIntent = await aiService.interpretWithUserAI(textWithContext, userId);
        logger.info({ aiIntent: aiIntent ? { type: aiIntent.type, confidence: aiIntent.confidence, hasResponse: !!aiIntent.response } : null }, 'AI result');
        if (aiIntent) {
          intent = aiIntent;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, 'AI service failed');

        if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
          return reply.send({
            success: false,
            error: 'Gemini API đã hết quota miễn phí. Vui lòng đợi hoặc nâng cấp API key.',
          });
        }

        return reply.send({ success: false, error: `AI service error: ${msg}` });
      }
    }

    if (!intent) {
      return reply.send({ success: false, error: 'AI không hiểu yêu cầu. Vui lòng diễn đạt lại.' });
    }

    // Post-processing: If AI returned shell type without command, generate one
    if (intent.type === 'shell' && !intent.params?.command && text) {
      // Pattern: find and read docx file
      if (/t[ìi]m.*file.*docx|truy.*cập.*docx|file.*word|\.docx/i.test(text)) {
        intent.type = 'process_file';
        intent.params = { path: getDesktopPath() };
      }
      // Pattern: find any file
      else if (/t[ìi]m.*file|truy.*cập.*file|list.*file|file.*b[ấa]t.*k[ìi]/i.test(text)) {
        intent.params = { command: `powershell -NoProfile -Command "Get-ChildItem ${getDesktopPath()} | Select-Object Name, Length | Format-Table -AutoSize"` };
      }
      // Pattern: open notepad/editor
      else if (/mở.*notepad|mở.*editor/i.test(text)) {
        intent.params = { command: 'notepad' };
      }
      // Default: list desktop files
      else {
        intent.params = { command: `powershell -NoProfile -Command "Get-ChildItem ${getDesktopPath()} | Select-Object Name, Length | Format-Table -AutoSize"` };
      }
      logger.info({ command: intent.params.command }, 'Generated shell command for AI');
    }

    // Post-processing: If AI returned file_read without path, try to extract from text or context
    if (intent.type === 'file_read' && !intent.params?.path) {
      // Try to get last file from context
      const lastAction = await aiService.getLastActionForUser(userId);
      if (lastAction?.params?.path) {
        intent.params = { path: lastAction.params.path as string };
      } else if (lastAction?.params?.filename) {
        const desktop = getDesktopPath();
        intent.params = { path: `${desktop}\\${lastAction.params.filename}` };
      } else {
        // Find most recently created .py file on Desktop
        try {
          const { readdirSync, statSync } = await import('node:fs');
          const desktop = getDesktopPath();
          const files = readdirSync(desktop)
            .filter(f => f.endsWith('.py') || f.endsWith('.js') || f.endsWith('.html'))
            .map(f => ({ name: f, time: statSync(`${desktop}\\${f}`).mtimeMs }))
            .sort((a, b) => b.time - a.time);
          if (files.length > 0) {
            intent.params = { path: `${desktop}\\${files[0].name}` };
          }
        } catch {}
      }
    }

    // Post-processing: If user asks to read Word/PDF but AI returned file_search, find the file first
    if (intent.type === 'file_search' && text && /đọc|read|xem|tóm tắt|summarize/i.test(text) && /\.(docx|doc|pdf|xlsx)|word|pdf|excel/i.test(text)) {
      // Find the first Word/PDF file on Desktop (prefer .docx over .doc)
      const { readdirSync } = await import('node:fs');
      const desktopPath = getDesktopPath();
      try {
        const files = readdirSync(desktopPath);
        // Prefer .docx files, then .pdf, then .xlsx
        const docxFile = files.find(f => /\.docx$/i.test(f) && !f.startsWith('~$'));
        const pdfFile = files.find(f => /\.pdf$/i.test(f) && !f.startsWith('~$'));
        const xlsxFile = files.find(f => /\.xlsx$/i.test(f) && !f.startsWith('~$'));
        const docFile = docxFile || pdfFile || xlsxFile;

        if (docFile) {
          intent.type = 'process_file';
          intent.params = { path: `${desktopPath}\\${docFile}` };
        }
      } catch (err) {
        logger.debug({ err }, 'Failed to read Desktop directory');
      }
    }

    // Handle free_response type — check for embedded <action> blocks
    if (intent.type === 'free_response') {
      const responseText = intent.response ?? 'Không có phản hồi.';

      // Check if response contains <action> blocks (support multiple)
      // Also handle INCOMPLETE action blocks (truncated by token limit)
      const actionRegex = /<action>([\s\S]*?)(?:<\/action>|$)/g;
      const actionMatches = [...responseText.matchAll(actionRegex)];

      if (actionMatches.length > 0) {
        // Has embedded actions — try to extract and execute
        for (const actionMatch of actionMatches) {
          try {
            let jsonStr = actionMatch[1]!.trim();

            // First try: parse as-is
            try {
              const actionJson = JSON.parse(jsonStr);
              if (actionJson.type === 'create_file' && (actionJson.filename || actionJson.params?.path) && (actionJson.content || actionJson.params?.content)) {
                const filename = actionJson.filename ?? actionJson.params?.path;
                const content = actionJson.content ?? actionJson.params?.content;
                intent = {
                  type: 'create_file',
                  params: { filename, content, run: actionJson.run ?? false },
                  confidence: 0.95,
                  source: 'ai',
                  response: responseText.replace(/<action>[\s\S]*?<\/action>/g, '').replace(/<action>[\s\S]*$/, '').trim(),
                };
                // Store last action for context memory
                const desktop = getDesktopPath();
                const path = filename?.startsWith?.('C:') ? filename : `${desktop}\\${filename}`;
                aiService.setLastAction(userId, { type: 'create_file', params: { filename, path, content: content?.slice?.(0, 1000) } });
                break;
              }
            } catch {}

            // Second try: extract filename and content with regex (handles truncated JSON)
            const filenameMatch = jsonStr.match(/"(?:filename|path)"\s*:\s*"([^"]+)"/);
            const contentMatch = jsonStr.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/s);

            if (filenameMatch && contentMatch) {
              const filename = filenameMatch[1];
              let content = contentMatch[1];
              // Unescape JSON string
              content = content.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

              intent = {
                type: 'create_file',
                params: { filename, content, run: false },
                confidence: 0.95,
                source: 'ai',
                response: responseText.replace(/<action>[\s\S]*?<\/action>/g, '').replace(/<action>[\s\S]*$/, '').trim(),
              };
              break;
            }

            // Third try: extract just filename for create_file type
            if (jsonStr.includes('"type":"create_file"') || jsonStr.includes('"type": "create_file"')) {
              const fnMatch = jsonStr.match(/"(?:filename|path)"\s*:\s*"([^"]+)"/);
              if (fnMatch) {
                // Extract content from the raw response after the action block
                const afterAction = responseText.slice(responseText.indexOf('</action>') + 9 || responseText.length);
                if (afterAction.length > 10) {
                  intent = {
                    type: 'create_file',
                    params: { filename: fnMatch[1], content: afterAction.trim(), run: false },
                    confidence: 0.9,
                    source: 'ai',
                    response: responseText.replace(/<action>[\s\S]*?<\/action>/g, '').replace(/<action>[\s\S]*$/, '').trim(),
                  };
                  break;
                }
              }
            }
          } catch (err) {
            logger.debug({ err, block: actionMatch[1]?.slice(0, 100) }, 'Failed to parse embedded action block');
          }
        }
      }

      // If still free_response after parsing, return it
      if (intent && intent.type === 'free_response') {
        const chunks = aiService.getFreeResponseChunks(responseText);
        return reply.send({
          success: true,
          intent: { type: 'free_response', params: {}, confidence: intent.confidence, source: 'ai' },
          result: { response: responseText },
          formattedResponse: chunks[0] ?? responseText,
          allChunks: chunks.length > 1 ? chunks : undefined,
        });
      }
    }

    // Guard clause — if intent is null after free_response parsing
    if (!intent) {
      return reply.send({ success: false, error: 'AI không hiểu yêu cầu.' });
    }

    // Handle clarification type — ask user for more info with suggestions
    if (intent.type === 'clarification') {
      const responseText = intent.response ?? 'Bạn có thể nói rõ hơn không?';
      const suggestions = intent.suggestions ?? [];
      return reply.send({
        success: true,
        intent: { type: 'clarification', params: { suggestions }, confidence: intent.confidence, source: 'ai' },
        result: { response: text, clarification: responseText, suggestions },
        formattedResponse: responseText,
        needsClarification: true,
        suggestions,
      });
    }

    // Handle read_file type — read any file content
    if (intent.type === 'read_file' && intent.params) {
      const { path: filePath } = intent.params as { path: string };
      try {
        const { readFileSync, existsSync } = await import('node:fs');
        const { resolve, isAbsolute, join } = await import('node:path');

        const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
        const fullPath = isAbsolute(filePath) ? resolve(filePath) : join(desktop, filePath);

        if (!existsSync(fullPath)) {
          return reply.send({ success: false, error: `File không tồn tại: ${fullPath}` });
        }

        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n').length;

        return reply.send({
          success: true,
          intent: { type: 'read_file', params: { path: fullPath }, confidence: 0.95, source: 'ai' },
          result: { path: fullPath, content, size: content.length, lines },
          formattedResponse: `📄 File: ${fullPath}\n📏 ${lines} dòng, ${content.length} bytes\n\n\`\`\`\n${content.slice(0, 3000)}${content.length > 3000 ? '\n...(còn tiếp)' : ''}\n\`\`\``,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to read file');
        return reply.send({ success: false, error: 'Không thể đọc file.' });
      }
    }

    // Handle process_file type — read Word/PDF/Excel files with proper parsing
    if (intent.type === 'process_file' && intent.params) {
      const { path: filePath } = intent.params as { path: string };
      try {
        const { existsSync } = await import('node:fs');
        const { resolve, isAbsolute, join } = await import('node:path');
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
        const fullPath = isAbsolute(filePath) ? resolve(filePath) : join(desktop, filePath);

        if (!existsSync(fullPath)) {
          return reply.send({ success: false, error: `File không tồn tại: ${fullPath}` });
        }

        const ext = fullPath.toLowerCase().split('.').pop();
        let content = '';

        if (ext === 'docx' || ext === 'doc') {
          // Use python-docx to read Word files
          const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
          const { writeFile: writeFileAsync, unlink } = await import('node:fs/promises');
          const { tmpdir } = await import('node:os');
          const tempScript = join(tmpdir(), `read_docx_${Date.now()}.py`);

          // Convert backslashes to forward slashes for Python compatibility
          const pythonPath = fullPath.replace(/\\/g, '/');

          // Use Array.join to avoid template literal escaping issues
          const scriptLines = [
            'import sys',
            'import io',
            'sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")',
            'try:',
            '    from docx import Document',
            `    doc = Document(r"${pythonPath}")`,
            '    text = ""',
            '    for para in doc.paragraphs:',
            '        text += para.text + chr(10)',
            '    for table in doc.tables:',
            '        text += chr(10) + "--- TABLE ---" + chr(10)',
            '        for row in table.rows:',
            '            text += chr(9).join(cell.text for cell in row.cells) + chr(10)',
            '    print(text)',
            'except ImportError:',
            '    print("ERROR: python-docx not installed. Run: pip install python-docx")',
            'except Exception as e:',
            '    print(f"ERROR: {e}")',
          ];
          const script = scriptLines.join('\n');

          await writeFileAsync(tempScript, script, 'utf-8');

          try {
            const { stdout } = await execAsync(`${pythonCmd} "${tempScript}"`, {
              timeout: 30000,
              env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });
            content = stdout;

            // Check if Python reported an error
            if (content.startsWith('ERROR:')) {
              return reply.send({ success: false, error: content });
            }
          } catch (execErr) {
            logger.error({ err: execErr }, 'Python script execution failed');
            return reply.send({ success: false, error: 'Không thể đọc file Word. File có thể bị hỏng hoặc không phải định dạng Word.' });
          } finally {
            // Clean up temp file
            await unlink(tempScript).catch(() => {});
          }
        } else if (ext === 'pdf') {
          // Use pdftotext to read PDF files
          const { stdout } = await execAsync(`pdftotext "${fullPath}" -`, { timeout: 30000 });
          content = stdout;
        } else {
          // For other files, read as text
          const { readFileSync } = await import('node:fs');
          content = readFileSync(fullPath, 'utf-8');
        }

        // Clean up content
        content = content.trim();
        if (content.startsWith('ERROR:')) {
          return reply.send({ success: false, error: content });
        }

        const lines = content.split('\n').length;

        return reply.send({
          success: true,
          intent: { type: 'process_file', params: { path: fullPath }, confidence: 0.95, source: 'ai' },
          result: { path: fullPath, content, size: content.length, lines, format: ext },
          formattedResponse: `📄 File: ${fullPath}\n📏 ${lines} dòng, ${content.length} bytes\n\n${content.slice(0, 4000)}${content.length > 4000 ? '\n\n...(còn tiếp)' : ''}`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to process file');
        return reply.send({ success: false, error: 'Không thể đọc file. Đảm bảo đã cài python-docx: pip install python-docx' });
      }
    }

    // Handle edit_file type — find and replace in existing file
    if (intent.type === 'edit_file' && intent.params) {
      const { path: filePath, find, replace, content: newContent } = intent.params as {
        path: string; find?: string; replace?: string; content?: string;
      };
      try {
        const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
        const { resolve, isAbsolute, join } = await import('node:path');

        const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
        const fullPath = isAbsolute(filePath) ? resolve(filePath) : join(desktop, filePath);

        if (!existsSync(fullPath)) {
          return reply.send({ success: false, error: `File không tồn tại: ${fullPath}` });
        }

        let resultContent: string;
        let action: string;

        if (newContent !== undefined) {
          // Replace entire file content
          resultContent = newContent;
          action = 'replaced entire file';
        } else if (find && replace !== undefined) {
          // Find and replace
          const original = readFileSync(fullPath, 'utf-8');
          resultContent = original.split(find).join(replace);
          action = `replaced "${find.slice(0, 50)}" with "${replace.slice(0, 50)}"`;
        } else {
          return reply.send({ success: false, error: 'Cần cung cấp content hoặc find+replace.' });
        }

        writeFileSync(fullPath, resultContent, 'utf-8');

        return reply.send({
          success: true,
          intent: { type: 'edit_file', params: intent.params, confidence: 0.95, source: 'ai' },
          result: { path: fullPath, action, newSize: resultContent.length },
          formattedResponse: `✅ Đã sửa file *${fullPath}*\n📝 ${action}\n📏 ${resultContent.length} bytes`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to edit file');
        return reply.send({ success: false, error: 'Không thể sửa file.' });
      }
    }

    // Handle web_search type — search the web
    if (intent.type === 'web_search' && intent.params) {
      const { query } = intent.params as { query: string };
      try {
        const axios = (await import('axios')).default;
        let results = '';
        let source = 'AI Knowledge';

        // Try DuckDuckGo first
        try {
          const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
          const searchResponse = await axios.get(searchUrl, { timeout: 10000 });
          const data = searchResponse.data as Record<string, unknown>;

          if (data.Abstract) {
            results += `📖 ${data.Abstract}\n\n`;
            source = 'DuckDuckGo';
          }

          const topics = data.RelatedTopics as Array<{ Text?: string; FirstURL?: string }> | undefined;
          if (topics && topics.length > 0) {
            results += '🔗 Kết quả liên quan:\n';
            for (const topic of topics.slice(0, 10)) {
              if (topic.Text) {
                results += `• ${topic.Text.slice(0, 300)}\n`;
                if (topic.FirstURL) results += `  ${topic.FirstURL}\n`;
              }
            }
          }
        } catch {
          // DuckDuckGo failed, try alternative
        }

        // If no results from DuckDuckGo, use AI to generate a comprehensive answer
        if (!results || results.length < 100) {
          const aiAnswer = await aiService.generateFriendlyResponse(
            `Trả lời chi tiết và đầy đủ về: "${query}". Cung cấp thông tin cụ thể, số liệu, dữ liệu. Trả lời bằng tiếng Việt.`
          );
          if (aiAnswer) {
            results = aiAnswer;
            source = 'AI Knowledge';
          }
        }

        return reply.send({
          success: true,
          intent: { type: 'web_search', params: { query }, confidence: 0.9, source: 'ai' },
          result: { query, results, source },
          formattedResponse: `🔍 Tìm kiếm: "${query}"\n\n${results}`,
        });
      } catch (err) {
        logger.error({ err }, 'Web search failed');
        // Fallback: use AI to answer the question
        const aiAnswer = await aiService.generateFriendlyResponse(`Trả lời câu hỏi: ${query}`);
        return reply.send({
          success: true,
          intent: { type: 'web_search', params: { query }, confidence: 0.7, source: 'ai' },
          result: { query, results: aiAnswer ?? 'Không thể tìm kiếm.', source: 'AI Knowledge' },
          formattedResponse: `🔍 Tìm kiếm: "${query}"\n\n${aiAnswer ?? 'Không thể tìm kiếm.'}`,
        });
      }
    }

    // Handle open_in_vscode type — open folder/file in VS Code
    if (intent.type === 'open_in_vscode' && intent.params) {
      const { path: targetPath } = intent.params as { path: string };
      try {
        const { existsSync } = await import('node:fs');
        const { resolve, isAbsolute, join } = await import('node:path');
        const { execSync } = await import('node:child_process');

        const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
        const fullPath = isAbsolute(targetPath) ? resolve(targetPath) : join(desktop, targetPath);

        // Open in VS Code (works even if path doesn't exist - VS Code will create it)
        execSync(`code "${fullPath}"`, { timeout: 10000, encoding: 'utf-8' });

        const pathType = existsSync(fullPath) ? (fullPath.includes('.') ? 'file' : 'folder') : 'new';

        return reply.send({
          success: true,
          intent: { type: 'open_in_vscode', params: { path: fullPath }, confidence: 0.95, source: 'ai' },
          result: { path: fullPath, type: pathType },
          formattedResponse: `✅ Đã mở VS Code: ${fullPath}`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to open VS Code');
        return reply.send({ success: false, error: 'Không thể mở VS Code.' });
      }
    }

    // Handle create_schedule type — automate recurring tasks
    if (intent.type === 'create_schedule' && intent.params) {
      const { SchedulerService } = await import('../services/scheduler-service.js');
      const schedulerService = new SchedulerService();
      const { name, schedule: scheduleText, commandType, deviceId: schedDeviceId } = intent.params as {
        name: string; schedule: string; commandType: string; deviceId?: string;
      };

      try {
        const { parseScheduleText } = await import('../services/scheduler-service.js');

        // Check if scheduleText is already a valid cron expression (5 fields)
        const cronRegex = /^(\S+\s+){4}\S+$/;
        let cronExpression: string | null = null;

        if (cronRegex.test(scheduleText)) {
          // Already a cron expression
          cronExpression = scheduleText;
          logger.info({ cronExpression }, 'Using cron expression directly from AI');
        } else {
          // Parse natural language
          cronExpression = parseScheduleText(scheduleText);
        }

        if (!cronExpression) {
          return reply.send({ success: false, error: 'Không hiểu lịch trình. Thử: "mỗi 8h sáng", "mỗi 5 phút", "mỗi ngày".' });
        }

        const targetDevice = schedDeviceId ?? targetDeviceId;
        if (!targetDevice) {
          return reply.send({ success: false, error: 'Không có thiết bị nào online.' });
        }

        const { AuthService } = await import('../services/auth-service.js');
        const authService = new AuthService();
        const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

        const schedule = await schedulerService.create(defaultUser.id, {
          name: name ?? `Lịch ${commandType}`,
          cronExpression,
          commandType,
          commandParams: intent.params,
          deviceId: targetDevice,
        });

        return reply.send({
          success: true,
          intent: { type: 'create_schedule', params: intent.params, confidence: 0.95, source: 'ai' },
          result: { schedule },
          formattedResponse: `✅ Đã tạo lịch: *${schedule.name}*\n⏰ ${scheduleText}\n🔧 ${commandType}`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to create schedule');
        return reply.send({ success: false, error: 'Không thể tạo lịch.' });
      }
    }

    // Handle list_schedules type
    if (intent.type === 'list_schedules') {
      const { SchedulerService } = await import('../services/scheduler-service.js');
      const schedulerService = new SchedulerService();

      try {
        const { AuthService } = await import('../services/auth-service.js');
        const authService = new AuthService();
        const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

        const schedules = await schedulerService.listByUser(defaultUser.id);

        if (schedules.length === 0) {
          return reply.send({
            success: true,
            intent: { type: 'list_schedules', params: {}, confidence: 0.95, source: 'ai' },
            result: { schedules: [] },
            formattedResponse: '📅 Chưa có lịch nào. Dùng "tạo lịch" để bắt đầu.',
          });
        }

        const lines = schedules.map((s, i) => {
          const status = s.isActive ? '🟢' : '🔴';
          return `${status} ${i + 1}. *${s.name}*\n   ⏰ ${s.cronExpression} | 🔧 ${s.commandType}\n   📊 Đã chạy: ${s.runCount} lần`;
        });

        return reply.send({
          success: true,
          intent: { type: 'list_schedules', params: {}, confidence: 0.95, source: 'ai' },
          result: { schedules },
          formattedResponse: `📅 *Danh sách lịch (${schedules.length}):*\n\n${lines.join('\n\n')}`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to list schedules');
        return reply.send({ success: false, error: 'Không thể lấy danh sách lịch.' });
      }
    }

    // Handle delete_schedule type
    if (intent.type === 'delete_schedule' && intent.params) {
      const { SchedulerService } = await import('../services/scheduler-service.js');
      const schedulerService = new SchedulerService();
      const { scheduleId } = intent.params as { scheduleId: string };

      try {
        const { AuthService } = await import('../services/auth-service.js');
        const authService = new AuthService();
        const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

        const deleted = await schedulerService.delete(scheduleId, defaultUser.id);
        return reply.send({
          success: deleted,
          intent: { type: 'delete_schedule', params: intent.params, confidence: 0.95, source: 'ai' },
          formattedResponse: deleted ? '✅ Đã xóa lịch.' : '❌ Không tìm thấy lịch.',
        });
      } catch (err) {
        logger.error({ err }, 'Failed to delete schedule');
        return reply.send({ success: false, error: 'Không thể xóa lịch.' });
      }
    }

    // Handle all_devices_status type
    if (intent.type === 'all_devices_status') {
      const { MultiDeviceService } = await import('../services/multi-device-service.js');
      const multiDeviceService = new MultiDeviceService();

      try {
        const { AuthService } = await import('../services/auth-service.js');
        const authService = new AuthService();
        const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

        const statuses = await multiDeviceService.getAllDeviceStatus(defaultUser.id);
        const online = statuses.filter(d => d.status === 'online').length;

        const lines = statuses.map(d => {
          const icon = d.status === 'online' ? '🟢' : '🔴';
          return `${icon} ${d.name} (${d.os})`;
        });

        return reply.send({
          success: true,
          intent: { type: 'all_devices_status', params: {}, confidence: 0.95, source: 'ai' },
          result: { devices: statuses, online, total: statuses.length },
          formattedResponse: `📱 *Tất cả thiết bị (${statuses.length}):*\n\n${lines.join('\n')}\n\n🟢 Online: ${online} | 🔴 Offline: ${statuses.length - online}`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to get all device status');
        return reply.send({ success: false, error: 'Không thể lấy trạng thái thiết bị.' });
      }
    }

    // Handle batch_command type
    if (intent.type === 'batch_command' && intent.params) {
      const { MultiDeviceService } = await import('../services/multi-device-service.js');
      const multiDeviceService = new MultiDeviceService();
      const { commandType, allOnline: batchAllOnline } = intent.params as { commandType: string; allOnline?: boolean };

      try {
        const { AuthService } = await import('../services/auth-service.js');
        const authService = new AuthService();
        const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

        let results;
        if (batchAllOnline) {
          results = await multiDeviceService.executeOnAll(defaultUser.id, commandType);
        } else {
          const devices = await deviceService.listByUser(defaultUser.id);
          const onlineIds = devices.filter(d => d.status === 'online').map(d => d.id);
          results = await multiDeviceService.executeBatch(defaultUser.id, onlineIds, commandType);
        }

        const successCount = results.filter(r => r.success).length;
        const lines = results.map(r => {
          const icon = r.success ? '✅' : '❌';
          return `${icon} ${r.deviceName}`;
        });

        return reply.send({
          success: true,
          intent: { type: 'batch_command', params: intent.params, confidence: 0.95, source: 'ai' },
          result: { results, successCount, total: results.length },
          formattedResponse: `🔧 *Batch: ${commandType}*\n\n${lines.join('\n')}\n\n✅ ${successCount}/${results.length} thành công`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to execute batch command');
        return reply.send({ success: false, error: 'Không thể thực thi batch command.' });
      }
    }

    // Handle create_device_group type
    if (intent.type === 'create_device_group' && intent.params) {
      const { MultiDeviceService } = await import('../services/multi-device-service.js');
      const multiDeviceService = new MultiDeviceService();
      const { name: groupName, description, deviceIds } = intent.params as { name: string; description?: string; deviceIds?: string[] };

      try {
        const { AuthService } = await import('../services/auth-service.js');
        const authService = new AuthService();
        const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

        // If no deviceIds provided, use all online devices
        let targetDeviceIds = deviceIds;
        if (!targetDeviceIds || targetDeviceIds.length === 0) {
          const devices = await deviceService.listByUser(defaultUser.id);
          targetDeviceIds = devices.filter(d => d.status === 'online').map(d => d.id);
        }

        const group = await multiDeviceService.createGroup(defaultUser.id, groupName, description ?? '', targetDeviceIds);

        return reply.send({
          success: true,
          intent: { type: 'create_device_group', params: intent.params, confidence: 0.95, source: 'ai' },
          result: { group },
          formattedResponse: `✅ Đã tạo nhóm: *${groupName}*\n📱 ${targetDeviceIds.length} thiết bị`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to create device group');
        return reply.send({ success: false, error: 'Không thể tạo nhóm.' });
      }
    }

    // Handle execute_group type
    if (intent.type === 'execute_group' && intent.params) {
      const { MultiDeviceService } = await import('../services/multi-device-service.js');
      const multiDeviceService = new MultiDeviceService();
      const { groupName, commandType } = intent.params as { groupName: string; commandType: string };

      try {
        const { AuthService } = await import('../services/auth-service.js');
        const authService = new AuthService();
        const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });

        const results = await multiDeviceService.executeOnGroup(defaultUser.id, groupName, commandType);

        if (results.length === 0) {
          return reply.send({ success: false, error: `Không tìm thấy nhóm "${groupName}" hoặc không có thiết bị online.` });
        }

        const successCount = results.filter(r => r.success).length;
        const lines = results.map(r => {
          const icon = r.success ? '✅' : '❌';
          return `${icon} ${r.deviceName}`;
        });

        return reply.send({
          success: true,
          intent: { type: 'execute_group', params: intent.params, confidence: 0.95, source: 'ai' },
          result: { results, successCount },
          formattedResponse: `🔧 *Execute on "${groupName}":*\n\n${lines.join('\n')}\n\n✅ ${successCount}/${results.length} thành công`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to execute on group');
        return reply.send({ success: false, error: 'Không thể thực thi trên nhóm.' });
      }
    }

    // Handle create_project type — scaffold complete project
    if (intent.type === 'create_project' && intent.params) {
      const { framework, name, features } = intent.params as {
        framework: string; name: string; features?: string[];
      };

      try {
        const { writeFileSync, existsSync, mkdirSync } = await import('node:fs');
        const { join, resolve } = await import('node:path');

        const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
        const projectDir = join(desktop, name ?? `${framework}-project`);

        if (!existsSync(projectDir)) {
          mkdirSync(projectDir, { recursive: true });
        }

        // Generate project files based on framework
        const files = generateProjectFiles(framework, name ?? 'my-app', features ?? []);

        const results: Array<{ filename: string; filepath: string; size: number }> = [];
        for (const [filename, content] of Object.entries(files)) {
          const filepath = join(projectDir, filename);
          const dir = filepath.substring(0, filepath.lastIndexOf('\\'));
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(filepath, content, 'utf-8');
          results.push({ filename, filepath, size: content.length });
        }

        const totalSize = results.reduce((sum, r) => sum + r.size, 0);
        const fileList = results.map(r => `📄 ${r.filename} (${r.size} bytes)`).join('\n');

        return reply.send({
          success: true,
          intent: { type: 'create_project', params: intent.params, confidence: 0.95, source: 'ai' },
          result: { projectDir, files: results, totalSize, framework },
          formattedResponse: `✅ Đã tạo dự án *${name}* (${framework}):\n📁 ${projectDir}\n\n${fileList}\n\n📦 Tổng: ${totalSize} bytes\n\n💡 Chạy: \`cd ${name} && npm install && npm run dev\``,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to create project');
        return reply.send({ success: false, error: 'Không thể tạo dự án.' });
      }
    }

    // Handle create_files type — multiple files in one request
    if (intent.type === 'create_files' && intent.params) {
      const { files } = intent.params as { files: Array<{ filename: string; content: string; run?: boolean }> };
      try {
        const { writeFileSync, existsSync, mkdirSync } = await import('node:fs');
        const { join, dirname, resolve, isAbsolute } = await import('node:path');

        const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
        const results: Array<{ filename: string; filepath: string; size: number }> = [];

        for (const file of files) {
          // Handle both absolute paths and relative filenames
          let filepath: string;
          if (isAbsolute(file.filename)) {
            filepath = resolve(file.filename);
          } else {
            filepath = join(desktop, file.filename);
          }
          const dir = dirname(filepath);

          // Create subdirectory if needed
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          writeFileSync(filepath, file.content, 'utf-8');
          results.push({ filename: file.filename, filepath, size: file.content.length });
          logger.info({ filepath, size: file.content.length }, 'File created by AI');
        }

        const totalSize = results.reduce((sum, r) => sum + r.size, 0);
        const fileList = results.map(r => `📄 ${r.filename} (${r.size} bytes)`).join('\n');

        return reply.send({
          success: true,
          intent: { type: 'create_files', params: intent.params, confidence: 0.95, source: 'ai' },
          result: { files: results, totalSize },
          formattedResponse: `✅ Đã tạo ${results.length} files trên Desktop:\n${fileList}\n\n📦 Tổng: ${totalSize} bytes`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to create files');
        return reply.send({ success: false, error: 'Không thể tạo files.' });
      }
    }

    // Handle create_file type — single file, supports subdirectories
    if (intent.type === 'create_file' && intent.params) {
      const { filename, content, run } = intent.params as { filename: string; content: string; run: boolean };
      try {
        const { writeFileSync, existsSync, mkdirSync } = await import('node:fs');
        const { join, dirname, resolve, isAbsolute } = await import('node:path');

        const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');

        // Handle both absolute paths and relative filenames
        let filepath: string;
        if (isAbsolute(filename)) {
          filepath = resolve(filename);
        } else {
          filepath = join(desktop, filename);
        }
        const dir = dirname(filepath);

        // Create subdirectory if needed
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        // Write file with UTF-8 encoding
        writeFileSync(filepath, content, 'utf-8');
        logger.info({ filepath, size: content.length }, 'File created by AI');

        // Auto-verify: run code files after creation to ensure they work
        let runResult = null;
        const ext = filename.split('.').pop()?.toLowerCase();
        const verifiableExts = ['py', 'js', 'ts', 'go', 'rs', 'java', 'cpp', 'c', 'rb', 'php', 'sh', 'ps1'];
        const shouldVerify = run || verifiableExts.includes(ext ?? '');

        if (shouldVerify) {
          let cmd = '';
          if (ext === 'py') cmd = `python "${filepath}"`;
          else if (ext === 'js') cmd = `node "${filepath}"`;
          else if (ext === 'ts') cmd = `npx tsx "${filepath}"`;
          else if (ext === 'go') cmd = `go run "${filepath}"`;
          else if (ext === 'html') cmd = `start "" "${filepath}"`;
          else if (ext === 'bat' || ext === 'cmd') cmd = `"${filepath}"`;
          else if (ext === 'ps1') cmd = `powershell -ExecutionPolicy Bypass -File "${filepath}"`;
          else if (ext === 'rb') cmd = `ruby "${filepath}"`;
          else if (ext === 'php') cmd = `php "${filepath}"`;
          else if (ext === 'sh') cmd = `bash "${filepath}"`;

          if (cmd) {
            try {
              const { execSync } = await import('node:child_process');
              const output = execSync(cmd, { timeout: 60000, encoding: 'utf-8' });
              runResult = { success: true, output: output.slice(0, 5000) };
              logger.info({ filepath, output: output.slice(0, 200) }, 'Code verification passed');
            } catch (err: any) {
              runResult = { success: false, error: err.message?.slice(0, 2000) };
              logger.warn({ filepath, error: err.message?.slice(0, 200) }, 'Code verification failed');
            }
          }
        }

        // Update last action with full path for context memory
        aiService.setLastAction(userId, {
          type: 'create_file',
          params: { filename, path: filepath, content: content.slice(0, 1000) },
        });

        // Build response message
        let responseMsg = `✅ File *${filename}* đã tạo thành công! (${content.length} bytes)`;
        if (runResult) {
          if (runResult.success) {
            responseMsg += `\n\n✅ Code chạy thành công!`;
            if (runResult.output) {
              responseMsg += `\n\`\`\`\n${runResult.output.slice(0, 2000)}\n\`\`\``;
            }
          } else {
            responseMsg += `\n\n⚠️ Code có lỗi:\n\`\`\`\n${runResult.error?.slice(0, 1000)}\n\`\`\``;
          }
        }

        return reply.send({
          success: true,
          intent: { type: 'create_file', params: { ...intent.params, path: filepath }, confidence: 0.95, source: 'ai' },
          result: { filepath, size: content.length, verified: !!runResult, verification: runResult },
          formattedResponse: responseMsg,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to create file');
        return reply.send({ success: false, error: 'Không thể tạo file.' });
      }
    }

    // Handle verify_code type — verify code by running it
    if (intent.type === 'verify_code' && intent.params) {
      const { path: filePath } = intent.params as { path: string };
      try {
        const { existsSync } = await import('node:fs');
        const { resolve, isAbsolute, join } = await import('node:path');

        const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
        const fullPath = isAbsolute(filePath) ? resolve(filePath) : join(desktop, filePath);

        if (!existsSync(fullPath)) {
          return reply.send({ success: false, error: `File không tồn tại: ${fullPath}` });
        }

        const ext = fullPath.split('.').pop()?.toLowerCase();
        const cmds: Record<string, string> = {
          py: `python "${fullPath}"`,
          js: `node "${fullPath}"`,
          ts: `npx tsx "${fullPath}"`,
          go: `go run "${fullPath}"`,
          rb: `ruby "${fullPath}"`,
          php: `php "${fullPath}"`,
          sh: `bash "${fullPath}"`,
          ps1: `powershell -ExecutionPolicy Bypass -File "${fullPath}"`,
        };

        const cmd = cmds[ext ?? ''];
        if (!cmd) {
          return reply.send({ success: false, error: `Không thể verify file .${ext}` });
        }

        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        try {
          const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 });
          return reply.send({
            success: true,
            intent: { type: 'verify_code', params: { path: fullPath }, confidence: 0.95, source: 'ai' },
            result: { success: true, output: stdout?.slice(0, 5000), stderr: stderr?.slice(0, 2000) },
            formattedResponse: `✅ Code chạy thành công!\n\`\`\`\n${(stdout || '').slice(0, 3000)}\n\`\`\``,
          });
        } catch (execErr: any) {
          return reply.send({
            success: true,
            intent: { type: 'verify_code', params: { path: fullPath }, confidence: 0.95, source: 'ai' },
            result: { success: false, error: execErr.message?.slice(0, 2000), stderr: execErr.stderr?.slice(0, 2000) },
            formattedResponse: `⚠️ Code có lỗi:\n\`\`\`\n${(execErr.stderr || execErr.message || '').slice(0, 3000)}\n\`\`\``,
          });
        }
      } catch (err) {
        logger.error({ err }, 'Failed to verify code');
        return reply.send({ success: false, error: 'Không thể verify code.' });
      }
    }

    // Handle execute_code type — run arbitrary code
    if (intent.type === 'execute_code' && intent.params) {
      const { language, code, filename } = intent.params as { language: string; code: string; filename?: string };
      try {
        const { writeFile, unlink, mkdir } = await import('node:fs/promises');
        const { existsSync } = await import('node:fs');
        const { join } = await import('node:path');
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        const exts: Record<string, string> = {
          python: 'py', javascript: 'js', typescript: 'ts', go: 'go',
          rust: 'rs', java: 'java', cpp: 'cpp', c: 'c', ruby: 'rb',
          php: 'php', shell: 'sh', powershell: 'ps1', sql: 'sql',
        };

        const ext = exts[language.toLowerCase()] ?? language;
        const tmpDir = join(process.env.USERPROFILE || process.env.HOME || '', '.remoteos', 'tmp');
        if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });

        const tmpFile = join(tmpDir, filename ?? `code_${Date.now()}.${ext}`);
        await writeFile(tmpFile, code, 'utf-8');

        const runCmds: Record<string, string> = {
          py: `python "${tmpFile}"`,
          js: `node "${tmpFile}"`,
          ts: `npx tsx "${tmpFile}"`,
          go: `go run "${tmpFile}"`,
          rb: `ruby "${tmpFile}"`,
          php: `php "${tmpFile}"`,
          sh: `bash "${tmpFile}"`,
          ps1: `powershell -ExecutionPolicy Bypass -File "${tmpFile}"`,
        };

        const cmd = runCmds[ext];
        if (!cmd) {
          await unlink(tmpFile).catch(() => {});
          return reply.send({ success: false, error: `Không thể chạy ngôn ngữ: ${language}` });
        }

        try {
          const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 });
          await unlink(tmpFile).catch(() => {});
          return reply.send({
            success: true,
            intent: { type: 'execute_code', params: { language }, confidence: 0.95, source: 'ai' },
            result: { success: true, output: stdout?.slice(0, 10000), stderr: stderr?.slice(0, 2000), language },
            formattedResponse: `✅ Code ${language} chạy thành công!\n\`\`\`\n${(stdout || '').slice(0, 5000)}\n\`\`\``,
          });
        } catch (execErr: any) {
          await unlink(tmpFile).catch(() => {});
          return reply.send({
            success: true,
            intent: { type: 'execute_code', params: { language }, confidence: 0.95, source: 'ai' },
            result: { success: false, error: execErr.message?.slice(0, 2000), stderr: execErr.stderr?.slice(0, 2000) },
            formattedResponse: `⚠️ Code ${language} có lỗi:\n\`\`\`\n${(execErr.stderr || execErr.message || '').slice(0, 3000)}\n\`\`\``,
          });
        }
      } catch (err) {
        logger.error({ err }, 'Failed to execute code');
        return reply.send({ success: false, error: 'Không thể chạy code.' });
      }
    }

    // Execute the command (only if we have a device)
    if (!targetDeviceId) {
      // No device available - return AI-generated response
      const aiResponse = await aiService.generateFriendlyResponse(text ?? 'Xin chào');
      return reply.send({
        success: true,
        intent: { type: 'free_response', params: {}, confidence: 0.9, source: 'ai' },
        result: { response: aiResponse ?? 'Không có thiết bị nào online. Vui lòng khởi động RemoteOS Agent trên máy tính.' },
        formattedResponse: aiResponse ?? 'Không có thiết bị nào online. Vui lòng khởi động RemoteOS Agent trên máy tính.',
      });
    }

    try {
      const result = await commandService.create(userId, {
        deviceId: targetDeviceId,
        type: intent.type,
        params: intent.params,
      });

      if (!result.success) {
        return reply.send({ success: false, error: result.error });
      }

      const cmdResult = await commandService.waitForResult(result.command!.id, 120_000);

      if (!cmdResult) {
        return reply.send({ success: false, error: 'Lệnh hết thời gian chờ.' });
      }

      if (cmdResult.status === 'failed') {
        // Smart Error Recovery — ask AI to analyze and fix
        const errorMsg = cmdResult.error?.message ?? 'Unknown error';
        logger.info({ errorMsg, originalType: intent.type }, 'Command failed, attempting AI error recovery');

        try {
          const recoveryPrompt = `The command failed with error: "${errorMsg}". Original command type: ${intent.type}, params: ${JSON.stringify(intent.params)}. Suggest a fix. Respond with JSON: {"type":"<command_type>","params":{...},"confidence":0.8}`;
          const recoveryUrl = `${GEMINI_API_URL}/${selectRecoveryModel()}:generateContent?key=${config.gemini.apiKey}`;
          const axios = (await import('axios')).default;
          const recoveryResponse = await axios.post(recoveryUrl, {
            contents: [{ parts: [{ text: recoveryPrompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
          }, { timeout: 15000 });

          const recoveryText = recoveryResponse.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (recoveryText) {
            const jsonMatch = recoveryText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const recoveryIntent = JSON.parse(jsonMatch[0]);
              if (recoveryIntent.type && recoveryIntent.type !== 'unknown') {
                logger.info({ recoveryType: recoveryIntent.type }, 'AI suggested recovery');
                // Try the recovery command
                const recoveryResult = await commandService.create(userId, {
                  deviceId: targetDeviceId,
                  type: recoveryIntent.type,
                  params: recoveryIntent.params,
                });

                if (recoveryResult.success) {
                  const recoveryCmdResult = await commandService.waitForResult(recoveryResult.command!.id, 120_000);
                  if (recoveryCmdResult?.status === 'completed') {
                    const response = aiService.formatResponse(recoveryIntent.type, recoveryCmdResult.output);
                    return reply.send({
                      success: true,
                      intent: { type: recoveryIntent.type, params: recoveryIntent.params, confidence: 0.8, source: 'ai' },
                      result: recoveryCmdResult.output,
                      formattedResponse: `🔄 Đã tự động sửa lỗi và thử lại:\n${response}`,
                      recoveredFrom: intent.type,
                    });
                  }
                }
              }
            }
          }
        } catch (recoveryErr) {
          logger.warn({ recoveryErr }, 'Error recovery failed');
        }

        // Recovery failed — return original error
        return reply.send({
          success: false,
          error: errorMsg,
          formattedResponse: `❌ Lệnh thất bại: ${errorMsg}\n\n💡 Thử diễn đạt lại hoặc dùng lệnh cụ thể hơn.`,
        });
      }

      const response = aiService.formatResponse(intent.type, cmdResult.output);

      return reply.send({
        success: true,
        intent: { type: intent.type, params: intent.params, confidence: intent.confidence, source: intent.source },
        result: cmdResult.output,
        formattedResponse: response,
      });
    } catch (err) {
      logger.error({ err, type: intent.type }, 'Execution failed');
      return reply.send({ success: false, error: 'Thực thi lệnh thất bại.' });
    }
  });

  // ─── POST /vision — Analyze Screenshot with Gemini Vision ─────

  server.post('/vision', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { image?: string; prompt?: string; deviceId?: string };
    const imageBase64 = body.image;
    const prompt = body.prompt ?? 'Mô tả chi tiết những gì bạn thấy trong ảnh chụp màn hình này. Nếu có code, đọc code. Nếu có UI, mô tả UI. Nếu có lỗi, giải thích lỗi.';

    if (!imageBase64) {
      return reply.status(400).send({ success: false, error: 'Missing image field (base64)' });
    }

    if (!config.gemini.apiKey) {
      return reply.send({ success: false, error: 'Gemini API key not configured' });
    }

    try {
      const visionUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.gemini.apiKey}`;

      const requestBody = {
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      };

      const axios = (await import('axios')).default;
      const response = await axios.post(visionUrl, requestBody, { timeout: 30000 });
      const aiText = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!aiText) {
        return reply.send({ success: false, error: 'AI không thể phân tích ảnh.' });
      }

      return reply.send({
        success: true,
        result: { description: aiText },
        formattedResponse: aiText,
      });
    } catch (err) {
      logger.error({ err }, 'Vision analysis failed');
      return reply.send({ success: false, error: 'Phân tích ảnh thất bại.' });
    }
  });

  // ─── POST /execute — Multi-turn Function Calling Loop ────────

  server.post('/execute', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { text?: string; deviceId?: string; maxTurns?: number };
    const text = body.text?.trim();
    const maxTurns = body.maxTurns ?? 5;

    if (!text) {
      return reply.status(400).send({ success: false, error: 'Missing text field' });
    }

    const { AuthService } = await import('../services/auth-service.js');
    const authService = new AuthService();
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });
    const userId = defaultUser.id;

    let targetDeviceId = body.deviceId;
    if (!targetDeviceId) {
      const devices = await deviceService.listByUser(userId);
      const onlineDevice = devices.find((d) => d.status === 'online');
      if (!onlineDevice) {
        return reply.send({ success: false, error: 'Không có thiết bị nào đang online.' });
      }
      targetDeviceId = onlineDevice.id;
    }

    const results: Array<{ turn: number; action: string; success: boolean; output: unknown }> = [];
    let currentText = text;
    let turn = 0;

    while (turn < maxTurns) {
      turn++;
      logger.info({ turn, text: currentText.slice(0, 100) }, 'Multi-turn execution');

      const intent = await aiService.interpretWithUserAI(currentText, userId);
      if (!intent || intent.type === 'free_response') {
        // AI wants to respond conversationally — stop the loop
        break;
      }

      // Execute the action
      try {
        const result = await commandService.create(userId, {
          deviceId: targetDeviceId,
          type: intent.type,
          params: intent.params,
        });

        if (!result.success) {
          results.push({ turn, action: intent.type, success: false, output: result.error });
          break;
        }

        const cmdResult = await commandService.waitForResult(result.command!.id, 120_000);
        const success = cmdResult?.status === 'completed';

        results.push({
          turn,
          action: intent.type,
          success,
          output: cmdResult?.output ?? cmdResult?.error?.message,
        });

        if (!success) break;

        // Feed result back to AI for next turn
        currentText = `Kết quả bước ${turn} (${intent.type}): ${JSON.stringify(cmdResult?.output).slice(0, 2000)}. Tiếp tục với bước tiếp theo hoặc trả lời user.`;
      } catch (err) {
        results.push({ turn, action: intent.type, success: false, output: String(err) });
        break;
      }
    }

    // Generate final response
    const allSuccess = results.every(r => r.success);
    const summary = results.map(r => `${r.turn}. ${r.action}: ${r.success ? '✅' : '❌'}`).join('\n');

    return reply.send({
      success: allSuccess,
      result: { turns: results.length, results },
      formattedResponse: allSuccess
        ? `✅ Hoàn thành ${results.length} bước:\n${summary}`
        : `⚠️ Hoàn thành ${results.filter(r => r.success).length}/${results.length} bước:\n${summary}`,
    });
  });
}
