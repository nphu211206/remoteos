/**
 * Interpret Route — AI-powered Natural Language Understanding
 *
 * POST /api/v1/interpret
 * POST /api/v1/interpret-and-execute
 *
 * Core principle: Users say ANYTHING → AI understands → Computer executes.
 * No rigid pattern matching for natural language.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AIService } from '../services/ai-service.js';
import { DeviceService } from '../services/device-service.js';
import { CommandService } from '../services/command-service.js';
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

      if (aiIntent && aiIntent.confidence >= 0.5) {
        logger.info({ type: aiIntent.type, source: 'ai', confidence: aiIntent.confidence }, 'AI match');

        // Handle free_response type
        if (aiIntent.type === 'free_response') {
          return reply.send({
            success: true,
            intent: { type: 'free_response', params: {}, confidence: aiIntent.confidence, source: 'ai' },
            response: aiIntent.response,
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
    const body = req.body as { text?: string; deviceId?: string };
    const text = body.text?.trim();
    const deviceId = body.deviceId;

    if (!text) {
      return reply.status(400).send({ success: false, error: 'Missing text field' });
    }

    // Get default dev user
    const { AuthService } = await import('../services/auth-service.js');
    const authService = new AuthService();
    const defaultUser = await authService.findOrCreateUser(0, { firstName: 'Dev User', language: 'vi' });
    const userId = defaultUser.id;

    // Find device
    let targetDeviceId = deviceId;
    if (!targetDeviceId) {
      const devices = await deviceService.listByUser(userId);
      const onlineDevice = devices.find((d) => d.status === 'online');
      if (!onlineDevice) {
        return reply.send({ success: false, error: 'Không có thiết bị nào đang online.' });
      }
      targetDeviceId = onlineDevice.id;
    }

    // Always try AI first
    let intent: { type: string; params?: Record<string, unknown>; confidence: number; source: string; response?: string; suggestions?: string[] } | null = null;

    try {
      logger.info({ text, userId }, 'Calling AI service');
      const aiIntent = await aiService.interpretWithUserAI(text, userId);
      logger.info({ aiIntent: aiIntent ? { type: aiIntent.type, confidence: aiIntent.confidence } : null }, 'AI result');
      if (aiIntent && aiIntent.confidence >= 0.5) {
        intent = aiIntent;
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown error';
      logger.error({ err: msg, stack: err?.stack }, 'AI service failed');

      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        return reply.send({
          success: false,
          error: 'Gemini API đã hết quota miễn phí. Vui lòng đợi hoặc nâng cấp API key.',
        });
      }

      return reply.send({ success: false, error: `AI service error: ${msg}` });
    }

    if (!intent) {
      return reply.send({ success: false, error: 'AI không hiểu yêu cầu. Vui lòng diễn đạt lại.' });
    }

    // Handle free_response type — return AI's natural language response directly
    if (intent.type === 'free_response') {
      const responseText = intent.response ?? 'Không có phản hồi.';
      const chunks = aiService.getFreeResponseChunks(responseText);
      return reply.send({
        success: true,
        intent: { type: 'free_response', params: {}, confidence: intent.confidence, source: 'ai' },
        result: { response: responseText },
        formattedResponse: chunks[0] ?? responseText,
        allChunks: chunks.length > 1 ? chunks : undefined,
      });
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
        const cronExpression = parseScheduleText(scheduleText);
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

        // Optionally run the file
        let runResult = null;
        if (run) {
          const ext = filename.split('.').pop()?.toLowerCase();
          let cmd = '';
          if (ext === 'py') cmd = `python "${filepath}"`;
          else if (ext === 'js') cmd = `node "${filepath}"`;
          else if (ext === 'html') cmd = `start "" "${filepath}"`;
          else if (ext === 'bat' || ext === 'cmd') cmd = `"${filepath}"`;
          else if (ext === 'ps1') cmd = `powershell -ExecutionPolicy Bypass -File "${filepath}"`;

          if (cmd) {
            try {
              const { execSync } = await import('node:child_process');
              const output = execSync(cmd, { timeout: 60000, encoding: 'utf-8' });
              runResult = { success: true, output };
            } catch (err: any) {
              runResult = { success: false, error: err.message };
            }
          }
        }

        return reply.send({
          success: true,
          intent: { type: 'create_file', params: intent.params, confidence: 0.95, source: 'ai' },
          result: { filepath, size: content.length, run: runResult },
          formattedResponse: `✅ File *${filename}* đã tạo thành công! (${content.length} bytes)`,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to create file');
        return reply.send({ success: false, error: 'Không thể tạo file.' });
      }
    }

    // Execute the command
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
          compilerOptions: { target: 'ES2020', useDefineForClassFields: true, lib: ['ES2020', 'DOM', 'DOM.Iterable'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: 'react-jsx', strict: true, noUnusedLocals: true, noUnusedParameters: true, noFallthroughCasesInSwitch: true },
          include: ['src'],
        }, null, 2);
        files['src/main.tsx'] = `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n)`;
        files['src/App.tsx'] = `import { useState } from 'react'\n\nfunction App() {\n  const [count, setCount] = useState(0)\n\n  return (\n    <div className="app">\n      <h1>${name}</h1>\n      <p>Count: {count}</p>\n      <button onClick={() => setCount(count + 1)}>Increment</button>\n    </div>\n  )\n}\n\nexport default App`;
        files['src/index.css'] = `* {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: 'Segoe UI', sans-serif;\n  background: #f5f5f5;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  min-height: 100vh;\n}\n\n.app {\n  text-align: center;\n  background: white;\n  padding: 2rem;\n  border-radius: 12px;\n  box-shadow: 0 4px 6px rgba(0,0,0,0.1);\n}\n\nbutton {\n  margin-top: 1rem;\n  padding: 0.5rem 1.5rem;\n  background: #667eea;\n  color: white;\n  border: none;\n  border-radius: 6px;\n  cursor: pointer;\n  font-size: 1rem;\n}\n\nbutton:hover {\n  background: #5a6fd6;\n}`;
        files['.gitignore'] = `node_modules\ndist\n.env`;
        files['README.md'] = `# ${name}\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nOpen http://localhost:3000`;
        break;

      case 'nextjs':
        files['package.json'] = JSON.stringify({
          name, version: '1.0.0', private: true,
          scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
          dependencies: { next: '^14.0.0', react: '^18.2.0', 'react-dom': '^18.2.0' },
          devDependencies: { typescript: '^5.0.0', '@types/react': '^18.0.0', '@types/node': '^20.0.0' },
        }, null, 2);
        files['next.config.js'] = `/** @type {import('next').NextConfig} */\nconst nextConfig = {}\n\nmodule.exports = nextConfig`;
        files['tsconfig.json'] = JSON.stringify({
          compilerOptions: { target: 'es5', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'preserve', incremental: true, plugins: [{ name: 'next' }], paths: { '@/*': ['./src/*'] } },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        }, null, 2);
        files['src/app/layout.tsx'] = `export const metadata = { title: '${name}', description: 'Built with Next.js' }\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="vi">\n      <body>{children}</body>\n    </html>\n  )\n}`;
        files['src/app/page.tsx'] = `export default function Home() {\n  return (\n    <main>\n      <h1>${name}</h1>\n      <p>Welcome to your Next.js app!</p>\n    </main>\n  )\n}`;
        files['src/app/globals.css'] = `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: 'Segoe UI', sans-serif; }`;
        files['.gitignore'] = `node_modules\n.next\n.env`;
        files['README.md'] = `# ${name}\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nOpen http://localhost:3000`;
        break;

      case 'express':
        files['package.json'] = JSON.stringify({
          name, version: '1.0.0', private: true,
          scripts: { dev: 'tsx watch src/index.ts', build: 'tsc', start: 'node dist/index.js' },
          dependencies: { express: '^4.18.0', cors: '^2.8.5', helmet: '^7.0.0' },
          devDependencies: { typescript: '^5.0.0', '@types/express': '^4.17.0', '@types/cors': '^2.8.0', tsx: '^4.0.0' },
        }, null, 2);
        files['tsconfig.json'] = JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs', lib: ['ES2020'], outDir: './dist', rootDir: './src', strict: true, esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true, resolveJsonModule: true },
          include: ['src/**/*'],
          exclude: ['node_modules', 'dist'],
        }, null, 2);
        files['src/index.ts'] = `import express from 'express'\nimport cors from 'cors'\nimport helmet from 'helmet'\n\nconst app = express()\nconst PORT = process.env.PORT || 3000\n\napp.use(helmet())\napp.use(cors())\napp.use(express.json())\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Welcome to ${name} API' })\n})\n\napp.get('/health', (req, res) => {\n  res.json({ status: 'ok', uptime: process.uptime() })\n})\n\napp.listen(PORT, () => {\n  console.log(\`Server running on port \${PORT}\`)\n})`;
        files['.gitignore'] = `node_modules\ndist\n.env`;
        files['README.md'] = `# ${name}\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nAPI: http://localhost:3000`;
        break;

      case 'flask':
      case 'fastapi':
        files['requirements.txt'] = framework === 'flask' ? 'flask==3.0.0\nflask-cors==4.0.0' : 'fastapi==0.104.0\nuvicorn==0.24.0\npydantic==2.5.0';
        files['app.py'] = framework === 'flask'
          ? `from flask import Flask, jsonify\nfrom flask_cors import CORS\n\napp = Flask(__name__)\nCORS(app)\n\n@app.route('/')\ndef home():\n    return jsonify({'message': 'Welcome to ${name} API'})\n\n@app.route('/health')\ndef health():\n    return jsonify({'status': 'ok'})\n\nif __name__ == '__main__':\n    app.run(debug=True, port=5000)`
          : `from fastapi import FastAPI\nfrom fastapi.middleware.cors import CORSMiddleware\n\napp = FastAPI(title="${name}")\napp.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])\n\n@app.get("/")\ndef home():\n    return {"message": "Welcome to ${name} API"}\n\n@app.get("/health")\ndef health():\n    return {"status": "ok"}`;
        files['.gitignore'] = `__pycache__\n*.pyc\n.env\nvenv/`;
        files['README.md'] = `# ${name}\n\n## Getting Started\n\n\`\`\`bash\npip install -r requirements.txt\npython app.py\n\`\`\`\n\nAPI: http://localhost:5000`;
        break;

      default:
        files['README.md'] = `# ${name}\n\nProject created with RemoteOS`;
        break;
    }

    return files;
  };
}
