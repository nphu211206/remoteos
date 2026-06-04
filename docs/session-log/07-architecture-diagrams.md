# Phần 7: Architecture Diagrams — Bản Master (18 Diagrams)

---

## Tin nhắn của bạn:

như này đã đủ và đúng chưa tôi thấy nó chưa đủ tốt chưa đủ hoàn hảo chưa đủ sáng tạo chưa đủ độc đáo bùng nổ và mới lạ,chưa đủ chi tiết chưa đủ hoàn hảo chưa đủ tốt làm phải cực kì hoàn hảo và hoàn thiện

---

## MỤC LỤC (18 Diagrams)

### PART A — CORE ARCHITECTURE
- 2.1. System Architecture Diagram
- 2.2. Sequence Diagram: Command Execution
- 2.3. Sequence Diagram: Device Registration
- 2.4. Component Diagram
- 2.5. Data Flow Diagram
- 2.6. Deployment Diagram
- 2.7. Security Architecture Diagram

### PART B — ADVANCED ARCHITECTURE
- 2.8. State Machine Diagram (Device + Command)
- 2.9. Error Handling Flow (4 error types)
- 2.10. AI Integration Architecture (Hybrid Engine)
- 2.11. Caching Strategy (4-layer cache)
- 2.12. Real-time Communication (WebSocket + Polling)
- 2.13. File Transfer Architecture (Upload + Download)
- 2.14. Monitoring & Alerting (6 alert rules)
- 2.15. Scaling Architecture (4 phases)

### PART C — DEVOPS & QUALITY
- 2.16. CI/CD Pipeline (8 stages)
- 2.17. Testing Strategy (Test Pyramid)
- 2.18. Plugin Architecture (Plugin System)

---

## 2.1. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         REMOTEOS — SYSTEM ARCHITECTURE               │
│                                                                      │
│  USER LAYER                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   📱 Phone   │  │   💻 Laptop  │  │   🖥️ Desktop │             │
│  │   Telegram   │  │   Telegram   │  │   Telegram   │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                 │                 │                       │
│         ▼                 ▼                 ▼                       │
│  TELEGRAM BOT API (Cloud)                                           │
│         │                                                           │
│         ▼                                                           │
│  RELAY SERVER (Node.js)                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │  Webhook    │ │   Auth      │ │   Command   │ │   Response  │  │
│  │  Handler    │ │   Service   │ │   Queue     │ │   Handler   │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│  │  Rule-based │ │   AI        │ │   Device    │                  │
│  │  Engine     │ │   Service   │ │   Manager   │                  │
│  └─────────────┘ └─────────────┘ └─────────────┘                  │
│         │                                                           │
│    ┌────┴────┐                                                      │
│    ▼         ▼                                                      │
│  GEMINI    AGENT — PC/LAPTOP                                       │
│  API       ┌──────────────────┐                                    │
│            │  System Monitor  │                                    │
│            │  File Manager    │                                    │
│            │  Screen Capture  │                                    │
│            │  Process Manager │                                    │
│            │  Shell Executor  │                                    │
│            └──────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2.2. Sequence Diagram: Command Execution

```
User → Telegram API → Server → Agent → Gemini API

1. User: "máy tính thế nào?"
2. Telegram → Server (webhook)
3. Server: Auth check
4. Server: Rule-based matching ("máy tính" + "thế nào" = status)
5. Server: Create command {type: "status"}
6. Server: Add to queue
7. Agent: Poll → nhận lệnh
8. Agent: Execute getSystemStatus()
9. Agent: Return result {cpu: 23, ram: 51}
10. Server: Format response
11. Server → Telegram: Send message
12. Telegram → User: Display

TỔNG THỜI GIAN: ~2-5 giây
```

---

## 2.8. State Machine: Device Lifecycle

```
UNREGISTERED → PENDING → REGISTERED → ONLINE
                                        │
                    ┌───────────┬────────┼───────────┐
                    ▼           ▼        ▼           ▼
                OFFLINE      LOCKED   CRASHED      BUSY
                    │           │        │           │
                    └───────────┴────────┴───────────┘
                                        │
                                    ONLINE (again)

TIMEOUTS:
- PENDING → EXPIRED: 5 phút
- ONLINE → OFFLINE: 30 giây (không nhận heartbeat)
```

---

## 2.8. State Machine: Command Lifecycle

```
CREATED → QUEUED → DELIVERED → EXECUTING → COMPLETED → DELIVERED_RESULT
                │          │         │
                ▼          ▼         ▼
            TIMED_OUT  CANCELLED  EXEC_TIMEOUT/EXEC_FAILED

TIMEOUTS:
- QUEUED → TIMED_OUT: 10 phút
- DELIVERED → TIMED_OUT: 30 giây
- EXECUTING → EXEC_TIMEOUT: 30 giây
```

---

## 2.9. Error Handling Flow

### 4 Error Levels:
1. **CRITICAL** — Server crash, DB down → Alert ngay, auto-restart
2. **HIGH** — Agent offline, command failed → Retry, fallback, notify
3. **MEDIUM** — File download failed → Notify user, suggest alternative
4. **LOW** — Log write failed → Log only

### Flow 1: Agent Offline
- Agent không gửi heartbeat trong 30 giây
- Server đánh dấu OFFLINE
- Lưu command vào queue (chờ agent online lại)
- Gửi user: "⚠️ Máy tính đang offline"
- Nếu offline > 5 phút: Alert user

### Flow 2: Command Failed
- Agent gửi error về server
- Server phân loại lỗi
- Gửi user: "❌ [Lỗi cụ thể]. Bạn muốn thử lại không?"

### Flow 3: Gemini API Failed
- Fallback sang Rule-based Engine
- Nếu no match: Gửi user danh sách lệnh có sẵn

### Flow 4: Security Violation
- Server từ chối thực thi
- Log vào audit_log
- Nếu injection attempt: Tăng failure count, tạm khóa

---

## 2.10. AI Integration Architecture

### Hybrid AI Engine:
```
User Input → Pre-Processor → Rule-based Engine (80%)
                                │
                        ┌───────┴───────┐
                        ▼               ▼
                    MATCHED          NO MATCH
                    (80%)            (20%)
                        │               │
                        │               ▼
                        │         Gemini API Engine
                        │               │
                        │         ┌──────┴──────┐
                        │         ▼             ▼
                        │      VALID         INVALID
                        │         │             │
                        ▼         ▼             ▼
                    Command Builder → Execute
```

### AI Cost Optimization:
1. **Response Caching** — Cache AI responses, TTL 1 giờ, tiết kiệm ~30%
2. **Smart Routing** — 80% rule-based, 20% AI
3. **Prompt Optimization** — Prompt ngắn gọn, max 500 tokens
4. **Batch Processing** — Gom nhiều câu hỏi → 1 API call

---

## 2.11. Caching Strategy

### 4-Layer Cache:
1. **L1: In-Memory** — TTL 30 giây, 1000 entries, hit rate ~40%
2. **L2: Redis** — TTL 5 phút, hit rate ~30%
3. **L3: Database** — Optimized queries, hit rate ~20%
4. **L4: Agent** — Source of truth, response time 1-3 giây

### Cache Invalidation Rules:
1. **Time-based (TTL)** — System status: 30s, Process list: 10s
2. **Event-based** — Command executed → Invalidate status cache
3. **Manual** — User request "refresh" → Clear all cache

---

## 2.12. Real-time Communication

### WebSocket Architecture:
```
Agent ←═══════→ Server ←═══════→ Telegram
         WSS              Webhook
```

### Message Types:
- Agent → Server: heartbeat, command_result, event, error
- Server → Agent: command, cancel, config, ping

### Reconnection Strategy:
- Exponential Backoff: 1s → 2s → 4s → 8s → 16s → 30s (max)
- Nếu fail 10 lần → Alert user
- Heartbeat: Mỗi 10 giây, timeout 30 giây

### Polling Fallback:
- Nếu WebSocket không khả dụng
- Agent poll mỗi 2 giây
- Delay 0-2 giây

---

## 2.13. File Transfer Architecture

### Download Flow (User → PC):
1. Validate URL (format, protocol, blacklist)
2. Create download task (status: pending)
3. Agent download với progress tracking
4. Gửi progress về server mỗi 1 giây
5. Server forward progress cho user
6. Hoàn thành: "✅ Đã tải xong!"

### Upload Flow (PC → User):
1. Agent tìm file theo tên
2. Nếu < 50MB: Upload trực tiếp qua Bot API
3. Nếu > 50MB: Nén trước khi upload
4. Nếu > 2GB: Chia thành nhiều parts

### Progress Display:
```
📥 Đang tải movie.mkv (2.3 GB)
████████████░░░░░░░░ 58% | 1.3 GB/2.3 GB | 12.5 MB/s
⏱️ ETA: 1 phút 20 giây
[⏸️ Tạm dừng] [❌ Hủy] [📋 Chi tiết]
```

---

## 2.14. Monitoring & Alerting

### System Monitoring (mỗi 10 giây):
- CPU: Usage%, Cores, Speed
- RAM: Used, Free, Total
- Disk: Used, Free, Total
- Network: Upload, Download, Latency
- Temp: CPU, GPU
- Processes: Count, Top 10
- Uptime, Battery

### 6 Alert Rules:
1. **CPU High** — CPU > 90% for 5 phút, cooldown 15 phút
2. **RAM High** — RAM > 90%, cooldown 15 phút
3. **Disk Low** — Disk free < 10%, cooldown 1 giờ
4. **Temperature High** — CPU temp > 85°C, cooldown 5 phút
5. **App Crash** — Monitored app exits unexpectedly, cooldown 5 phút
6. **Network Down** — No internet for 1 phút, cooldown 5 phút

### Alert Message Format:
```
⚠️ CPU ALERT
Máy tính: DESKTOP-ABC
CPU đang ở 95% (ngưỡng: 90%)
Top processes: chrome.exe (45%), vscode.exe (12%)
💡 Đề xuất: Đóng tab Chrome không cần thiết
[🔧 Xem processes] [🔇 Tắt alert 1h]
```

---

## 2.15. Scaling Architecture

### Phase 1: MVP (0-100 users)
- Single Server + SQLite + In-mem Queue
- Chi phí: $0-5/tháng
- Capacity: ~100 users

### Phase 2: Growth (100-1000 users)
- Split Services: Server + PostgreSQL + Redis
- Chi phí: ~$20-50/tháng
- Capacity: ~1000 users

### Phase 3: Scale (1000-10000 users)
- Horizontal Scaling: Load Balancer + Multiple Servers
- Chi phí: ~$100-200/tháng
- Capacity: ~10000 users

### Phase 4: Enterprise (10000+ users)
- Microservices + Kubernetes
- Chi phí: ~$500+/tháng
- Capacity: Unlimited

---

## 2.16. CI/CD Pipeline

### CI Pipeline (GitHub Actions):
1. **Stage 1:** Lint & Type Check (ESLint, TypeScript, Prettier)
2. **Stage 2:** Unit Tests (coverage >80%)
3. **Stage 3:** Integration Tests
4. **Stage 4:** Security Scan (npm audit, Snyk)
5. **Stage 5:** Build (server, agent binaries)

### CD Pipeline (on main branch):
6. **Stage 6:** Deploy Staging + Smoke tests
7. **Stage 7:** Deploy Production + Health checks
8. **Stage 8:** Release Agent (GitHub Release + binaries)

---

## 2.17. Testing Strategy

### Test Pyramid:
- **Unit Tests (75%)** — Fast, cheap
- **Integration Tests (20%)** — Medium speed
- **E2E Tests (5%)** — Slow, expensive

### Unit Tests:
- Shared: Type validation, constants, utils
- Server: Auth, command parser, AI service, queue, response formatter
- Agent: System monitor, file manager, process manager, heartbeat

### Integration Tests:
- API endpoints
- Database CRUD
- Queue flow

### E2E Tests:
- Device registration flow
- Command execution flow
- Error handling flow
- Security flow

---

## 2.18. Plugin Architecture

### Plugin Lifecycle:
1. Discover → 2. Load → 3. Validate → 4. Initialize → 5. Register → 6. Ready → 7. Shutdown

### Plugin Manifest:
```json
{
  "name": "spotify-control",
  "version": "1.0.0",
  "permissions": ["process.read", "process.execute"],
  "commands": [
    { "name": "play", "description": "Play music" },
    { "name": "pause", "description": "Pause music" }
  ]
}
```

### Example Plugins:
- Spotify Control: /play, /pause, /next
- Weather Report: /weather, /forecast
- Smart Home: /lights, /thermostat, /lock
- Git Helper: /git-status, /git-push, /git-log
- Docker Manager: /docker-ps, /docker-logs, /docker-stop

---

*Last updated: 2026-05-30*
