# Phần 5: Giải thích AI vs Agent — Quan trọng nhất

---

## Tin nhắn của bạn:

ô nếu theo cái rule base free bạn nói thì cái agent trả lời vẫn là gemini mà,,bên cạnh đó để làm việc trên máy tính nữa mà nhỉ

---

## Bạn đang hiểu nhầm 2 khái niệm:

### "AI Agent" (như bạn đang nghĩ)
- Chatbot thông minh
- Hiểu ngôn ngữ tự nhiên
- Trả lời câu hỏi
- Ví dụ: ChatGPT, Gemini, Claude

### "Software Agent" (của RemoteOS)
- Chương trình chạy ngầm trên máy tính
- Nhận lệnh từ server
- Thực thi lệnh trên máy tính
- Trả kết quả về server
- Ví dụ: Như một "người làm thuê" trên máy tính

**Agent của RemoteOS = PHẦN MỀM chạy trên máy tính**
**KHÔNG PHẢI = AI**

---

## Ví dụ cụ thể: "CHỤP MÀN HÌNH"

```
1. User gửi: "chụp màn hình"
2. Server match keyword: "chụp" + "màn hình"
3. Server gọi function: takeScreenshot()
4. Agent dùng Node.js API để chụp màn hình
5. Agent gửi ảnh về server
6. Server gửi ảnh cho user

KHÔNG CẦN AI Ở ĐÂY!
```

---

## Vậy Gemini dùng cho lúc nào?

### KHÔNG CẦN (Rule-based — 80%):
- "/status" → getSystemStatus()
- "/screenshot" → takeScreenshot()
- "chụp màn hình" → takeScreenshot()
- "máy tính thế nào?" → getSystemStatus()
- "tải file này" + [link] → downloadFile(url)

### CẦN GEMINI (20% câu phức tạp):
- "mấy giờ rồi, máy tính có ổn không?" → 2 intent
- "tải cái này về rồi mở nó lên cho tôi" → multi-step
- "máy tính có gì bất thường không?" → check nhiều thứ
- "bắt nhạc chill đi" → mở Spotify với playlist

---

## Agent cụ thể làm gì trên máy tính?

### Giám sát hệ thống:
- CPU usage (dùng os.cpus())
- RAM usage (dùng os.freemem(), os.totalmem())
- Disk usage (dùng child_process: df/Get-PSDrive)
- Network speed (dùng netstat)
- Running processes (dùng tasklist/ps)

### Chụp ảnh:
- Screenshot toàn màn hình (dùng screenshot-desktop)

### Quản lý file:
- Tìm file (dùng glob)
- Đọc file info (dùng fs.stat)
- Tải file từ URL (dùng got/axios)
- Gửi file qua Telegram (dùng Bot API)

### Thông báo:
- Hiển thị desktop notification (dùng node-notifier)

### Quản lý tiến trình:
- Liệt kê tiến trình (dùng tasklist/ps)
- Kill tiến trình (dùng taskkill/kill)

### Điều khiển:
- Âm lượng (dùng loudness)
- Lock screen

**TẤT CẢ đều dùng Node.js libraries — KHÔNG CẦN AI**

---

## TÓM TẮT:

```
Agent = "người làm thuê" trên máy tính
Server = "người quản lý" nhận lệnh từ user
Gemini = "thông dịch viên" (chỉ khi cần)

KHÔNG CẦN AI ĐỂ CHẠY CƠ BẢN!
```

---

## Về Gemini API Key:

Bạn có Gemini Pro API key (qua Google One). Free tier:
- 15 requests per minute
- 1 million tokens per day
- 1500 requests per day
- Đủ cho development + testing + 10-50 users ban đầu

### Chi phí AI thực tế:
```
1 lệnh AI tốn bao nhiêu?
Input:  ~100 tokens
Output: ~200 tokens
Tổng:   ~300 tokens

GPT-4o-mini giá: $0.15/1M input, $0.60/1M output
300 tokens ≈ $0.0001 (0.01 cent)

50 lệnh/ngày × 30 ngày = 1,500 lệnh/tháng
1,500 × $0.0001 = $0.15/tháng

→ RẺ HƠN CẢ LY CAFE
```

---

## Cách làm local không mất phí:

### Hybrid Approach (KHUYÊN DÙNG):
- 80% câu hỏi → Rule-based ($0, nhanh)
- 20% câu phức tạp → Gemini API ($0 free tier)

### KHÔNG CẦN cho giai đoạn local:
- ❌ Domain
- ❌ VPS
- ❌ Thẻ tín dụng
- ❌ Deploy
- ❌ Public IP

### CHỈ CẦN:
- ✅ Máy tính của bạn
- ✅ Node.js (miễn phí)
- ✅ Telegram Bot Token (miễn phí)
- ✅ Gemini API Key (bạn đã có)
- ✅ Internet

---

*Last updated: 2026-05-30*
