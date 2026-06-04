<![CDATA[<div align="center">

# 🖥️ RemoteOS

### *Your computer, anywhere. Just talk to it.*

<br/>

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify&logoColor=white)](https://fastify.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?style=flat-square&logo=telegram&logoColor=white)](https://t.me)

<br/>

**RemoteOS** is an AI-powered remote computer control system.
Control your PC from anywhere through natural language conversation.

No terminal. No remote desktop. Just talk.

<br/>

```
You: "máy tính thế nào?"
Bot: 🖥️ CPU 45% | RAM 8.2/16 GB | Disk 234/500 GB

You: "tạo file Python quản lý sinh viên 500 dòng"
Bot: ✅ Đã tạo student_manager.py (584 dòng, 22KB)

You: "phân tích thị trường AI 2025"
Bot: 📖 Báo cáo chi tiết: 2000+ từ, 5 sections...

You: "tạo dự án React tên my-app"
Bot: ✅ Đã tạo 9 files — npm install && npm run dev
```

<br/>

[Features](#-features) •
[Quick Start](#-quick-start) •
[Architecture](#-architecture) •
[API](#-api) •
[Tech Stack](#-tech-stack)

</div>

---

## 🎯 What is RemoteOS?

RemoteOS lets you control your computer from anywhere using natural language. It's not remote desktop. It's not terminal. It's a new paradigm — **talk to your computer like talking to a genius assistant**.

> *"The first product that allows natural language computer control via chat."*

### Why RemoteOS?

| Problem | Existing Solutions | RemoteOS |
|---------|-------------------|----------|
| Need to access files remotely | Google Drive (must upload first) | Just ask: "gửi file báo cáo" |
| Need to control PC remotely | TeamViewer (heavy, need screen) | Just talk: "mở VS Code" |
| Need to run commands remotely | SSH (must know commands) | Just say: "restart Docker" |
| Need to monitor PC remotely | No good solution | Just ask: "máy tính thế nào?" |

---

## ✨ Features

### 🧠 AI Intelligence

- **Natural Language** — Vietnamese & English, understands context
- **Multi-Turn Conversation** — AI asks clarifying questions
- **Error Recovery** — Auto-analyzes and retries failed commands
- **Context Memory** — Remembers 50 messages, pronoun resolution
- **Compound Requests** — "tạo file rồi mở VS Code"
- **Smart Model Routing** — Auto-selects best AI model per task

### 💻 39 Computer Control Capabilities

| Category | Commands |
|----------|----------|
| **System** | Status, Screenshot, Processes, System Info |
| **Files** | Create, Read, Edit, List, Download, Multi-file |
| **Apps** | Launch, Close, List (60+ apps) |
| **Shell** | Any command — pipes, chains, redirects |
| **Control** | Volume, Clipboard, Lock Screen, Notifications |
| **AI** | Code Generation, Research Reports, Web Search |
| **Projects** | React, Next.js, Express, Flask, FastAPI scaffolding |
| **Automation** | Cron Scheduler, Batch Commands, Device Groups |

### 🌐 Multi-Platform

| Platform | Status |
|----------|--------|
| **Telegram Bot** | ✅ Full feature set |
| **Discord Bot** | ✅ Slash commands |
| **Web Dashboard** | ✅ Next.js dark theme |
| **REST API** | ✅ Full API |
| **Streaming (SSE)** | ✅ Real-time responses |

### 🔌 Multi-Provider AI

| Provider | Models |
|----------|--------|
| **Google Gemini** | 2.5 Flash, 3.1 Flash Lite, Pro |
| **OpenAI** | GPT-4o, GPT-4o Mini |
| **Anthropic** | Claude Sonnet, Haiku, Opus |
| **Local LLM** | Ollama (Llama3, Mistral) |

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+
- [Telegram Bot Token](https://t.me/BotFather)
- [Gemini API Key](https://aistudio.google.com/apikey)

### Installation

```bash
# Clone
git clone https://github.com/nphu211206/remoteos.git
cd remoteos

# Install
pnpm install

# Configure
cp .env.example .env
# Edit .env with your tokens

# Build
pnpm build

# Run
pnpm dev
```

### Environment Variables

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# AI
GEMINI_API_KEY=your_api_key
GEMINI_MODEL=gemini-3.1-flash-lite

# Server
SERVER_HOST=0.0.0.0
SERVER_PORT=3000

# Security
JWT_SECRET=your-secret
DEVICE_REGISTRATION_CODE=your-code
```

### Start Services

```bash
# Terminal 1: Server
pnpm dev:server

# Terminal 2: Agent (on your PC)
pnpm dev:agent

# Terminal 3: Telegram Bot
pnpm dev:bot

# Terminal 4: Web Dashboard (optional)
pnpm dev:dashboard
```

Then open Telegram, find your bot, and send `/start`!

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Telegram │  │ Discord  │  │ Web UI   │  │ REST API │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       └──────────────┼──────────────┼──────────────┘            │
│                      ▼                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              RELAY SERVER (Fastify + SQLite)              │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │   │
│  │  │REST API│ │AI Engine│ │Scheduler│ │Stream  │ │Auth JWT│ │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │   │
│  └───────────────────────┬──────────────────────────────────┘   │
│                          │ HTTP Polling                         │
│  ┌───────────────────────▼──────────────────────────────────┐   │
│  │                  AGENT (PC Daemon)                        │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │   │
│  │  │System  │ │File    │ │Shell   │ │App     │ │Screen  │ │   │
│  │  │Monitor │ │Manager │ │Executor│ │Launcher│ │Capture │ │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
remoteos/
├── packages/
│   ├── shared/              # Types, constants, validators
│   ├── server/              # Relay server (Fastify)
│   ├── agent/               # PC daemon
│   ├── bot/                 # Telegram bot
│   ├── web-dashboard/       # Next.js web UI
│   └── discord-bot/         # Discord bot
├── docs/                    # Documentation
├── scripts/                 # Utility scripts
├── turbo.json               # Turborepo config
├── pnpm-workspace.yaml      # pnpm workspace
└── package.json             # Root package
```

---

## 🔌 API Reference

### Core

```bash
# AI interpretation + execution
POST /api/v1/interpret-and-execute
Body: { "text": "tạo file calculator.py" }

# Streaming response (SSE)
POST /api/v1/stream
Body: { "text": "viết báo cáo về AI" }

# Health check
GET /health
```

### Devices

```bash
# List devices
GET /api/v1/devices

# All device status
GET /api/v1/devices/all/status

# Batch command
POST /api/v1/devices/batch
Body: { "commandType": "screenshot", "allOnline": true }
```

### Automation

```bash
# Create schedule
POST /api/v1/schedules
Body: { "name": "Daily screenshot", "schedule": "mỗi 8h sáng", "commandType": "screenshot", "deviceId": "..." }

# List schedules
GET /api/v1/schedules
```

---

## 🛠️ Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| **Runtime** | Node.js 18+ | Cross-platform, fast |
| **Language** | TypeScript 5.7 | Type safety |
| **Server** | Fastify 5 | 2x faster than Express |
| **Database** | SQLite + Drizzle | Zero config, portable |
| **Telegram** | grammY | Best TS bot framework |
| **Discord** | discord.js | Official library |
| **Web** | Next.js 14 | React + SSR |
| **AI** | Gemini API | Free tier, powerful |
| **Build** | Turborepo | Fast monorepo builds |
| **Package** | pnpm 9 | Efficient disk usage |

---

## 📊 Example Commands

### System
```
"máy tính thế nào?"          → CPU, RAM, Disk, Uptime
"chụp màn hình"              → Screenshot
"xem tiến trình"             → Process list
"kiểm tra CPU"               → CPU details
```

### Files
```
"tạo file calculator.py"     → Create Python file
"đọc file index.html"        → Read file content
"sửa title trong file X"     → Edit file
"xem thư mục Desktop"        → List files
```

### Code Generation
```
"tạo website bán hàng 5 file"       → Multi-file project
"viết Python 500 dòng quản lý SV"   → Long code
"tạo dự án React"                    → React scaffolding
"tạo dự án Express API"              → Express scaffolding
```

### Research
```
"phân tích thị trường AI 2025"       → Detailed report
"tìm kiếm giá Bitcoin"              → Web search
"viết báo cáo về crypto"            → Research report
```

### Automation
```
"tạo lịch chụp màn hình 8h sáng"   → Schedule task
"mỗi ngày backup dữ liệu"          → Daily backup
"xem lịch"                          → List schedules
```

### Multi-Device
```
"kiểm tra tất cả máy"              → All device status
"chụp màn hình tất cả máy"        → Batch screenshot
"tạo nhóm work"                    → Device group
```

---

## 🔒 Security

- **JWT Authentication** — Secure API access
- **Device Registration** — Token-based pairing
- **Rate Limiting** — 300 requests/minute
- **Input Validation** — Zod schemas
- **AES-256 Encryption** — API keys at rest
- **Full Access Mode** — User-controlled

---

## 🧪 Testing

```bash
pnpm test              # All tests
pnpm typecheck         # Type checking
pnpm lint              # Linting
pnpm format            # Formatting
```

---

## 📈 Roadmap

- [x] Phase 0: MVP (Agent, Server, Bot)
- [x] Phase 1: AI Engine, Advanced Commands
- [x] Phase 2: Multi-Turn, Error Recovery, Streaming
- [x] Phase 3: Scheduler, File Transfer, Project Scaffolding
- [x] Phase 4: Web Dashboard, Voice Input, Image Understanding
- [x] Phase 5: Multi-Device, Collaboration, Discord Bot
- [ ] Phase 6: WebSocket Real-Time, Mobile App
- [ ] Phase 7: Plugin System, Marketplace

---

## 🤝 Contributing

```bash
# Fork & clone
git checkout -b feature/my-feature
git commit -m "Add my feature"
git push origin feature/my-feature
# Open Pull Request
```

---

## 📄 License

MIT © [nphu211206](https://github.com/nphu211206)

---

<div align="center">

**Made with ❤️ by [nphu211206](https://github.com/nphu211206)**

*Your computer, anywhere. Just talk to it.*

[⬆ Back to top](#-remoteos)

</div>]]>