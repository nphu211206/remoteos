# Phần 4: 4 Câu hỏi Lựa chọn

---

## Tin nhắn của bạn:

này nhưng mà tôi không có thẻ tín dụng để add hay như nào đâu,tôi thấy người ta sài vercel khá nhiều sao ta không sài,nó tốn phí à,à mà thôi đó là phần deploy sau này tập trung vào local đã
à và cái AI bạn bảo là chúng ta cũng phải đăng ký 1 AI agent để hoạt động trung gian giữa máy tính và điện thoại người dùng à (ừ cũng đúng vì chỉ có những người dev mới có AI agent nhỉ ,ơ thế nếu mấy người bên cntt họ có AI của riêng họ thì chúng ta nên làm thế nào ,đối với người thường thì ra sao bạn giải thích đoạn này đi tôi chưa hiểu

---

## CÂU 1: Nên hỗ trợ Messenger không?

| Tiêu chí | Telegram | Messenger |
|----------|----------|----------|
| **Bot API** | Cực mạnh, hỗ trợ đầy đủ | Hạn chế, nhiều giới hạn |
| **File upload** | Hỗ trợ file đến 2GB | Giới hạn 25MB |
| **Inline keyboard** | Có | Có nhưng hạn chế |
| **Webhook** | Ổn định, dễ setup | Hay thay đổi API |
| **Review process** | Không cần | Phải nộp xét duyệt |
| **Bảo mật** | E2E encryption option | Facebook thu thập dữ liệu |
| **Bị ban** | Rất hiếm | Rất dễ bị ban |

### Lựa chọn: **CHỈ TELEGRAM**
- Telegram API mạnh hơn Messenger ở MỌI khía cạnh
- Không cần review process — deploy ngay
- File limit 2GB vs 25MB
- Chi phí: $0

---

## CÂU 2: Nên dùng Claude API hay OpenAI API?

| Tiêu chí | Claude API | OpenAI API | Gemini API |
|----------|-----------|------------|------------|
| **Function Calling** | Tốt | Tốt hơn | Tốt |
| **Giá** | $3/1M input | $0.5/1M input | Free tier |
| **Free tier** | $5 credit | $5 credit | 15 RPM, 1M tokens/ngày |
| **Tài liệu** | Khá tốt | Rất tốt | Khá tốt |
| **Tiếng Việt** | Tốt | Tốt hơn | Rất tốt |

### Lựa chọn: **GEMINI API** (bạn đã có key)
- Free tier đủ cho development và testing
- Tiếng Việt rất tốt
- Function Calling support
- Chi phí: $0 (free tier)

---

## CÂU 3: Nên deploy server ở đâu?

| Tiêu chí | Railway | Fly.io | VPS (DO) | Vercel |
|----------|---------|--------|----------|--------|
| **Free tier** | $5 credit/tháng | 3 shared VMs | Không | 100GB bandwidth |
| **Dễ deploy** | Rất dễ | Trung bình | Khó | Rất dễ |
| **Persistent process** | Có | Có | Có | Không (serverless) |
| **WebSocket** | Có | Có | Có | Có (limited) |

### Lựa chọn: **RAILWAY**
- Free tier $5/tháng
- Deploy chỉ cần git push
- Hỗ trợ PostgreSQL và Redis built-in
- Persistent process — phù hợp cho relay server

### Về Vercel:
- Vercel free tier KHÔNG phù hợp cho relay server
- Vercel là SERVERLESS — code không chạy liên tục 24/7
- Timeout: 10 giây (free tier)
- Không phù hợp cho persistent connections

---

## CÂU 4: Nên có mobile app native hay chỉ web app?

| Tiêu chí | Mobile App Native | Web App | Chỉ Telegram |
|----------|------------------|---------|--------------|
| **Thời gian phát triển** | 3-6 tháng | 1-2 tháng | 0 tháng |
| **Chi phí phát triển** | Cao | Trung bình | $0 |
| **User friction** | Phải cài app | Phải bookmark | Không (đã có Telegram) |

### Lựa chọn: **CHỈ TELEGRAM (MVP) + WEB DASHBOARD (Phase 2)**
- Telegram ĐÃ là mobile app
- Không cần App Store review
- User friction = 0
- Chi phí: $0

---

## TÓM TẮT LỰA CHỌN CUỐI CÙNG:

```
Chat Platform:    Telegram only
AI Engine:        Gemini API (free tier — bạn đã có key)
Deploy:           Railway (free tier → paid khi scale)
Mobile:           Telegram app (không cần app riêng)

TỔNG CHI PHÍ MVP: $0-12/năm
TỔNG CHI PHÍ PRODUCTION (1000 users): ~$20-40/tháng
```

---

*Last updated: 2026-05-30*
