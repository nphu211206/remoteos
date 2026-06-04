# Phần 3: Mô hình Phí, Chi phí & Quy trình Build

---

## Tin nhắn của bạn:

nhưng mà nói chung là kiểu người dùng vẫn p trả tiền cho máy tính nhỉ kiểu mình là trung gian giữa máy tính và điện thoại nếu người dùng không phải dân tech và họ sử dụng mình thì đầu tiên là họ phải trả phí cho mình à? đúng không nhỉ tôi cũng chưa nghĩ đến cái này kiểu các ứng dụng khác open claw các thứ có cần trả để giao tiếp với máy tính qua điện thoại không,tệp người dùng này có thể là game,văn phòng ,.. còn tùy từng người có thể kết nối đến agent trong máy và chúng ta sẽ phải thiết lập.Còn với nhóm người thứ 2 thì họ là dân dev hoặc dân cntt thường họ sẽ cần mình giúp họ khi họ ra ngoài đi bất cứ đâu cũng có thể giao việc cho máy tính qua điện thoại và tôi nghĩ hầu như những người này sẽ dùng chúng ta để kết nối đến AI Agent ấy nhỉ
bạn hãy làm rõ mấy cái vấn đề trên và mở rộng ra cho tôi ,à và chúng ta làm cái này có cần mất khoản phí gì không và chúng ta nên build kiểu gì build chạy local trước để test và trình bày trước sau đó mới deploy nhỉ,à và giờ đầu tiên chúng ta cần làm gì hay viết gì cho đúng quy trình và tốt nhất

---

## OpenClaw và các sản phẩm tương có mất phí không?

| Sản phẩm | Phí sử dụng | Phí ẩn |
|----------|------------|--------|
| **OpenClaw** | Miễn phí (open source) | Tự trả VPS ~$5/tháng, API key |
| **TeamViewer** | ~$25/tháng (cá nhân) | Không |
| **AnyDesk** | ~$10/tháng | Không |
| **Chrome Remote Desktop** | Miễn phí | Không (Google bao) |
| **Telegram SSH Bot** | Miễn phí (tự host) | Tự trả VPS |

**Kết luận**: Hầu hết sản phẩm cùng loại đều miễn phí hoặc open source. Người dùng chủ yếu trả tiền cho infrastructure (VPS, cloud), không phải trả cho phần mềm.

---

## Mô hình đề xuất:

### Tier 1: FREE (Open Source)
- Tự host trên VPS riêng
- Unlimited commands
- Community support
- Target: Dev/IT (tự cài được)

### Tier 2: MANAGED ($5/tháng)
- Không cần tự host
- 1 device, unlimited commands
- Email support
- Target: Power users

### Tier 3: PRO ($15/tháng)
- 5 devices
- AI-powered natural language
- Custom commands
- Priority support
- Target: Professionals, small teams

### Tier 4: TEAM ($50/tháng)
- Unlimited devices
- Shared access
- Audit logs
- SSO
- Target: Teams, companies

---

## 2 Nhóm người dùng:

### Nhóm 1: Non-tech (Sinh viên, nhân viên văn phòng, game thủ)
- Không cần hiểu VPS, server, API
- Chỉ cần cài app → quét QR → dùng
- Sẵn sàng trả: $0-5/tháng
- **Revenue chính đến từ nhóm này**

### Nhóm 2: Dev/IT
- Terminal access qua chat
- Script execution, File transfer
- Sẵn sàng trả: $0 (tự host)
- **Nhưng họ là người MARKETING miễn phí**

### Chiến lược:
- Dev/IT trước (free, open source, lấy traction)
- Non-tech sau (hosted service, lấy revenue)

---

## Chi phí build dự án:

| Hạng mục | Chi phí |
|----------|---------|
| Domain | ~$12/năm |
| VPS cho relay server | $5-10/tháng |
| Telegram Bot | $0 |
| LLM API (Gemini) | ~$5-20/tháng |
| SSL Certificate | $0 |
| GitHub | $0 |
| Monitoring | $0 |
| **Tổng cộng** | **~$7-15/tháng** |

---

## Quy trình build:

### Phase 0: Planning (Tuần 1)
- Viết PRD
- Vẽ architecture diagram
- Setup project structure
- Tạo GitHub repo

### Phase 1: Local Development (Tuần 2-5)
- Code agent chạy trên máy tính (local test)
- Code Telegram bot (local test với polling)
- Code relay server (local test)
- Test toàn bộ flow trên máy local
- Demo recording (video)

### Phase 2: Staging (Tuần 6-7)
- Deploy relay server lên Railway
- Deploy agent dưới dạng binary
- Test với real users
- Fix bugs, improve UX

### Phase 3: Production (Tuần 8-10)
- Deploy production
- Viết documentation
- Tạo landing page
- Launch trên Product Hunt, Reddit, HN

### Phase 4: Iterate (Tuần 11+)
- Thêm tính năng mới
- Mở rộng platforms
- Tối ưu performance
- Scale infrastructure

---

*Last updated: 2026-05-30*
