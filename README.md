<div align="center">

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:0a0a0f,50:667eea,100:764ba2&height=220&section=header&text=RemoteOS&fontSize=80&fontColor=ffffff&animation=fadeIn&fontAlignY=35&desc=Your%20Computer%2C%20Anywhere.%20Just%20Talk%20to%20It.&descSize=18&descAlignY=55" />

<br>

<img src="https://img.shields.io/badge/⚡_RemoteOS-v5.0-blueviolet?style=for-the-badge&logo=terminal&logoColor=white" alt="RemoteOS">&nbsp;
<img src="https://img.shields.io/badge/🧠_AI-Powered-ff6b6b?style=for-the-badge&logo=google&logoColor=white" alt="AI Powered">&nbsp;
<img src="https://img.shields.io/badge/🖥️_Control-PC-4ecdc4?style=for-the-badge&logo=windows&logoColor=white" alt="PC Control">

<br>

<img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
<img src="https://img.shields.io/badge/Gemini_AI-36_Functions-4285F4?style=flat-square&logo=google&logoColor=white" alt="Gemini AI">
<img src="https://img.shields.io/badge/Tests-135_Passed-00d4aa?style=flat-square&logo=vitest&logoColor=white" alt="Tests">
<img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">

<br><br>

<p><b>🧠 36 AI Functions</b> · <b>🔄 5-Model Rotation</b> · <b>💾 Persistent Memory</b> · <b>🌐 Real-time Search</b> · <b>🔒 Sandboxed Execution</b></p>

<p><i>Not just a remote control. An autonomous AI agent that thinks, acts, and learns.</i></p>

</div>

---

## 🎯 What is RemoteOS?

RemoteOS is an **autonomous AI agent** that lives on your computer and executes any task you describe in natural language. It understands Vietnamese and English, remembers your conversation context, and takes real actions on your machine.

```
👤 "tạo file hello.py in Hello World và chạy nó"
🤖 ✅ File hello.py đã tạo thành công! Code chạy OK: Hello World

👤 "chạy nó"                          ← AI remembers "nó" = hello.py
🤖 ✅ Kết quả: Hello World

👤 "tìm thông tin về AI trends 2026"  ← Real-time web search
🤖 🔍 Google Search kết quả: [detailed analysis with sources]

👤 "tạo báo cáo doanh thu Word"      ← Generates 379-line Python script
🤖 ✅ Đã tạo Bao_Cao_Doanh_Thu.docx trên Desktop
```

---

## ✨ Core Capabilities

### 🤖 AI Engine
| Feature | Detail |
|---------|--------|
| **36 Gemini Functions** | File, code, system, web, git, database, weather, image, clipboard, todo, email, reminder, translate, calculate |
| **Multi-Model Rotation** | 5 Gemini models (2.5-flash, 3.5-flash, 3-flash, 3.1-flash-lite, 2.5-flash-lite) → 40 RPM combined |
| **Tool Result Feedback** | After executing a function, result is fed back to AI for next decision |
| **Google Search Grounding** | Real-time web search via Gemini grounding API |
| **Exponential Backoff** | Smart retry with 2^n + jitter backoff on rate limits |
| **Token Usage Tracking** | Per-user SQLite-backed usage stats with cost estimation |

### 🧠 Intelligence
| Feature | Detail |
|---------|--------|
| **Persistent Memory** | SQLite-backed conversation history (50 turns/user, survives restart) |
| **Pronoun Resolution** | "nó", "file đó", "vừa tạo", "kết quả" → auto-resolved from context |
| **15-Turn Context** | Last 15 conversation turns injected into AI prompt |
| **User Learning** | Tracks command frequency, preferred languages, skill level |
| **Emotion Detection** | 8 emotions (frustrated, excited, confused, etc.) → adapts response tone |
| **RAG System** | Knowledge base with document ingestion and keyword search |

### 🖥️ Computer Control
| Feature | Detail |
|---------|--------|
| **File Operations** | Create, read, edit, search, delete with path sanitization |
| **Code Execution** | 20+ languages (Python, JS, TS, Go, Rust, Java, C++, Ruby, PHP, etc.) |
| **Sandboxed Execution** | vm.runInNewContext for JS, subprocess isolation for others, 30s timeout |
| **System Monitoring** | CPU, RAM, disk, network, battery, temperature, processes |
| **Desktop Automation** | Click, type, key combos, drag, scroll via PowerShell/xdotool |
| **Browser Automation** | Puppeteer-based: navigate, click, type, extract data, screenshots |

### 🔒 Security
| Feature | Detail |
|---------|--------|
| **Command Injection Protection** | execFile with array args (no shell interpolation) |
| **Safe Math Evaluation** | vm.runInNewContext sandbox (no eval/new Function) |
| **SQL Injection Detection** | Refined patterns (only actual SQL injection, not normal text) |
| **Rate Limiting** | Per-user (30 RPM) + per-model rotation |
| **Audit Logging** | Full trail of all API calls |
| **AES-256 Encryption** | For API key storage |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interfaces                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Telegram │  │ Discord  │  │ Web Dash │  │   REST   │   │
│  │   Bot    │  │   Bot    │  │  board   │  │   API    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
└───────┼──────────────┼──────────────┼──────────────┼────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Fastify Server (Port 3000)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              AI Service Engine                        │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │ Gemini  │ │ OpenAI  │ │Anthropic│ │  Local  │   │   │
│  │  │3.5/2.5  │ │ GPT-4o  │ │ Claude  │ │ Ollama  │   │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │   │
│  │       └───────────┼───────────┼───────────┘         │   │
│  │                   ▼                                   │   │
│  │          Model Manager (5-model rotation)             │   │
│  │          Conversation Memory (SQLite)                 │   │
│  │          Tool Result Feedback Loop                    │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              13 Route Groups                          │   │
│  │  devices · commands · interpret · voice · analytics   │   │
│  │  schedules · multi-device · rag · plugins · workflows │   │
│  │  webhooks · user-settings · create-file               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │ Command Queue (SQLite)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Agent Daemon                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────┐     │
│  │ System  │ │  File   │ │ Desktop │ │   Browser    │     │
│  │ Monitor │ │ Manager │ │  Auto   │ │   Engine     │     │
│  └─────────┘ └─────────┘ └─────────┘ └──────────────┘     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────┐     │
│  │  Code   │ │ Screen  │ │  RAG    │ │   Plugin     │     │
│  │Executor │ │ Vision  │ │ System  │ │   System     │     │
│  └─────────┘ └─────────┘ └─────────┘ └──────────────┘     │
│  60+ command types · 25 modules · Cross-platform            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ ([download](https://nodejs.org))
- **pnpm** 9+ (`npm install -g pnpm`)
- **Python** 3.8+ ([download](https://python.org)) — for code execution
- **Gemini API key** ([get free](https://aistudio.google.com/apikey))

### Installation

```bash
# 1. Clone
git clone https://github.com/nphu211206/remoteos.git
cd remoteos

# 2. Install
pnpm install

# 3. Build
pnpm build

# 4. Configure
cp .env.example .env
# Edit .env → add your GEMINI_API_KEY

# 5. Start
pnpm dev
```

### Windows Quick Start
```cmd
start-all.bat
```

### Linux/Mac Quick Start
```bash
chmod +x start-remoteos.sh && ./start-remoteos.sh
```

---

## 💬 Usage Examples

### Simple Commands
```
👤 "máy tính thế nào?"
🤖 🔲 CPU ████░░░░ 23.4% | 💾 RAM ██████░░ 6.2/16 GB | 💿 Disk ████░░░░ 45.2%

👤 "chụp màn hình"
🤖 📸 [Screenshot image]

👤 "tắt tiếng máy tính"
🤖 🔇 Đã tắt tiếng

👤 "khóa màn hình"
🤖 🔒 Đã khóa màn hình
```

### Code Generation
```
👤 "tạo file hello.py in Hello World"
🤖 ✅ Đã tạo hello.py (58 dòng) — Code chạy thành công!

👤 "viết Express server với JWT auth"
🤖 ✅ Đã tạo server.ts (96 dòng) — TypeScript, JWT middleware, routes

👤 "tạo script phân tích dữ liệu pandas"
🤖 ✅ Đã tạo analyze.py (151 dòng) — CSV parsing, bar chart, report
```

### Research & Analysis
```
👤 "tìm thông tin về AI trends 2026"
🤖 🔍 [Google Search grounding results with sources]

👤 "thời tiết Hà Nội hôm nay"
🤖 🌤️ 24-31°C, nhiều mây, độ ẩm 75%

👤 "dịch Hello World sang tiếng Nhật"
🤖 🌐 こんにちは世界

👤 "tính 2^10 + sqrt(144)"
🤖 🔢 1136
```

### Complex Multi-Step
```
👤 "tạo báo cáo doanh thu Word với biểu đồ"
🤖 ✅ Đã tạo report_generator.py (379 dòng) → Bao_Cao_Doanh_Thu.docx

👤 "git status"
🤖 🔧 On branch main, 3 files changed

👤 "tạo REST API hoàn chỉnh với 8 files"
🤖 ✅ Đã tạo project với package.json, tsconfig, routes, models, middleware...
```

---

## 📁 Project Structure

```
remoteos/
├── packages/
│   ├── shared/          # Types, constants, validators, utilities (Zod)
│   ├── server/          # Fastify server + AI engine (50 source files)
│   ├── agent/           # Daemon on target machine (39 source files)
│   ├── bot/             # Telegram bot (grammY)
│   ├── discord-bot/     # Discord bot (discord.js)
│   └── web-dashboard/   # Next.js 14 dashboard
├── docs/                # Architecture docs, session logs
├── scripts/             # Helper scripts (Python, Bash)
├── .env.example         # Environment template
├── package.json         # Root workspace (pnpm + Turborepo)
├── turbo.json           # Task dependency graph
└── tsconfig.base.json   # Shared TypeScript config
```

---

## 🔧 Configuration

### Environment Variables

```env
# ─── Telegram Bot ───
TELEGRAM_BOT_TOKEN=your_bot_token_here

# ─── AI Engine ───
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite

# ─── Server ───
SERVER_HOST=0.0.0.0
SERVER_PORT=3000

# ─── Security ───
JWT_SECRET=your_secret_key_here
DEVICE_REGISTRATION_CODE=REMOTEOS2026

# ─── Agent ───
AGENT_POLL_INTERVAL_MS=2000
AGENT_HEARTBEAT_INTERVAL_MS=10000
AGENT_COMMAND_TIMEOUT_MS=30000
```

### AI Providers

| Provider | Models | Free Tier |
|----------|--------|-----------|
| **Gemini** | 3.5-flash, 2.5-flash, 3-flash, 3.1-flash-lite | ✅ 500 req/day |
| **OpenAI** | GPT-4o, GPT-4o-mini | ❌ Paid |
| **Anthropic** | Claude Sonnet, Haiku, Opus | ❌ Paid |
| **Local** | llama3, mistral, codellama (Ollama) | ✅ Free |

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| AI Functions | **36** |
| Model Rotation | **5 models, 40 RPM combined** |
| Context Memory | **15 turns, SQLite persistent** |
| Command Types | **60+** |
| Code Languages | **20+** |
| Test Coverage | **135 tests, 100% pass** |
| Packages | **6 (shared, server, agent, bot, discord, dashboard)** |

---

## 🧪 Testing

```bash
# All tests
pnpm test

# Specific package
pnpm test --filter @remoteos/server
pnpm test --filter @remoteos/shared

# Watch mode
pnpm test:watch

# Lint
pnpm lint

# Type check
pnpm typecheck
```

---

## 🤝 Contributing

1. Fork → `git checkout -b feature/amazing`
2. Code → `pnpm build && pnpm test`
3. Commit → `git commit -m 'feat: amazing feature'`
4. Push → `git push origin feature/amazing`
5. PR → Open Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE)

---

## 🙏 Built With

[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify&logoColor=white)](https://fastify.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Gemini](https://img.shields.io/badge/Gemini_AI-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev)
[![grammY](https://img.shields.io/badge/grammY-Telegram-0088cc?style=flat-square&logo=telegram&logoColor=white)](https://grammy.dev)
[![Drizzle](https://img.shields.io/badge/Drizzle_ORM-SQLite-C5F74F?style=flat-square&logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![Vitest](https://img.shields.io/badge/Vitest-6-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev)

---

<div align="center">

### ⭐ Star this repo if you find it useful!

[![Stars](https://img.shields.io/github/stars/nphu211206/remoteos?style=social)](https://github.com/nphu211206/remoteos/stargazers)
[![Forks](https://img.shields.io/github/forks/nphu211206/remoteos?style=social)](https://github.com/nphu211206/remoteos/network/members)
[![Issues](https://img.shields.io/github/issues/nphu211206/remoteos?style=social)](https://github.com/nphu211206/remoteos/issues)

**Made with ❤️ by [nphu211206](https://github.com/nphu211206)**

</div>
