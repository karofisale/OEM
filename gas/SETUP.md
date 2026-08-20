# Deploy OEM App Backend (Google Apps Script)

**Cập nhật 2026-08-19**: backend của app này giờ là **project Apps Script ĐỘC LẬP**, tách khỏi project dùng chung với 2 skill `up-dt-oem`/`cong-no-oem` (gộp chung hôm 2026-08-18, tách lại hôm nay). Lý do tách: đo thử cho thấy project dùng chung (gắn trực tiếp vào Sheet "OEM" khổng lồ làm container) chậm hơn 5-10 lần so với 1 project độc lập cho cùng 1 lệnh gọi đơn giản, ngay cả khi không bị lỗi mạng — xem ghi chú trong file `Code.gs`. File `gas/Code.gs` trong repo này **giờ LÀ bản deploy thật**, không còn là bản tham khảo lịch sử nữa.

## 1. Tạo project Apps Script mới (chỉ 1 lần)

1. Mở Google Sheet `OEM` (1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk) → **Extensions → Apps Script**.
   - Tạo project MỚI (không phải project đang dùng chung với up-dt-oem/cong-no-oem) — dùng đúng tài khoản Google đang có quyền Editor trên Sheet này.
2. Xoá nội dung mặc định của `Code.gs`, dán toàn bộ nội dung file `gas/Code.gs` trong repo này.
3. Lưu (Ctrl+S).
4. **Deploy → New deployment** → chọn loại **Web app** → Execute as: **Me** → Who has access: **Anyone** → Deploy.
   - Lần đầu deploy sẽ có màn hình xin cấp quyền (Authorize) — chọn đúng tài khoản, bấm "Advanced" → "Go to (tên project) (unsafe)" nếu Google cảnh báo app chưa xác minh (bình thường với Apps Script tự viết).
5. Copy **Web app URL** ra — báo cho Claude để cập nhật `API_URL` trong `src/services/api.js`, build lại và push.

## 2. Build + test trước khi push

```bash
npm run build
```

Mở app, thử đăng nhập (PIN đúng ở tab Users của Sheet) — nếu báo lỗi khác "Unknown function" thì có thể do URL chưa đúng hoặc chưa Authorize đủ quyền (Sheets/Drive) cho project mới.

## 3. Dọn project cũ — ĐÃ LÀM (2026-08-20)

Phần OEM App đã được gỡ khỏi project dùng chung với up-dt-oem/cong-no-oem
(`D:\Operation\Claude\Scripts\up-dt-oem\`): file `OemAppBackend.gs` đã xoá, nhánh route `if (body.fn)` trong
`doPost` đã gỡ. Project đó giờ chỉ còn `Code.gs`, `UpDtOem.gs`, `CongNoOem.gs`
và chỉ phục vụ 2 skill.

**Việc còn phải làm bằng tay**: dán lại `Code.gs` đã sửa vào editor của project CŨ
rồi Deploy → New version. Nếu không, project cũ vẫn chạy bản có nhánh route trỏ tới
`oemAppDoPost_` — hàm nay đã bị xoá, nên request nào kèm `body.fn` sẽ lỗi.

## 4. Chỉ sau khi mọi thứ đã ổn định — khoá Sheet public

Đây là bước **thực sự** chặn rò rỉ dữ liệu qua URL public:

1. Mở Google Sheet `OEM` → **Share**.
2. Đổi "Anyone with the link" → **Restricted** (chỉ những người/nhóm cụ thể).
3. Đảm bảo tài khoản Google chạy project OEM App MỚI (Execute as: Me) vẫn còn quyền Editor trên Sheet.

## Khi sửa lại Code.gs sau này

Sửa trực tiếp `D:\Antigravity\OEM App\gas\Code.gs` (giờ LÀ bản deploy thật) — dán vào Apps Script editor của project ĐỘC LẬP mới (không phải project up-dt-oem/cong-no-oem nữa), Save, rồi **Deploy → Manage deployments → Edit → New version → Deploy**.

## Những gì backend này CHƯA làm (có chủ đích)

- **Đồng bộ Công Nợ Excel** (`DebtImporter.jsx`) vẫn chỉ lưu tạm — tab `Debt_Tracking`/`Debt` đã có quy trình cập nhật riêng qua skill `cong-no-oem` (đối chiếu Mã KH/Tên KH); một luồng ghi tự động thứ 2 từ app này rủi ro làm hai luồng đá nhau.
