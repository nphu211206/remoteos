# REMOTEOS — Project Context

**Ngày tạo:** 2026-05-30
**Tác giả:** nphu211206
**GitHub:** https://github.com/nphu211206/remoteos

---

## TÓM TẮT DỰ ÁN

**RemoteOS** — *"Your computer, anywhere. Just talk to it."*

Cho phép kiểm soát máy tính từ xa qua Telegram, sử dụng AI để hiểu ngôn ngữ tự nhiên.

---

## TECH STACK

| Thành phần | Công nghệ |
|------------|-----------|
| Agent | Node.js (TypeScript) |
| Server | Node.js + Fastify |
| Bot | grammY (Telegram) |
| AI | Gemini API (free tier) |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Queue | BullMQ |
| Deploy | Railway (free tier) |

---

## CHI PHÍ: $0 (local development)

---

## TÀI LIỆU

Xem chi tiết trong thư mục `docs/session-log/`:
- [00-index.md](session-log/00-index.md) — Mục lục cuộc trò chuyện
- [01-phan-tich-y-tuong-ban-dau.md](session-log/01-phan-tich-y-tuong-ban-dau.md)
- [02-phan-tich-toan-dien-master.md](session-log/02-phan-tich-toan-dien-master.md)
- [03-mo-hinh-phi-va-chi-phi.md](session-log/03-mo-hinh-phi-va-chi-phi.md)
- [04-cau-hoi-lua-chon.md](session-log/04-cau-hoi-lua-chon.md)
- [05-giai-thich-ai-vs-agent.md](session-log/05-giai-thich-ai-vs-agent.md)
- [06-prd-full.md](session-log/06-prd-full.md)
- [07-architecture-diagrams.md](session-log/07-architecture-diagrams.md)

---

## BƯỚC TIẾP THEO

**Bước 3: Bắt đầu code**
1. Setup project structure
2. Code shared types
3. Code server
4. Code agent
5. Code bot
6. Integration test

---

*Last updated: 2026-05-30*
