# Deploy OEM App Backend (Google Apps Script)

**Cập nhật 2026-08-19**: backend của app này giờ là **project Apps Script ĐỘC LẬP**, tách khỏi project dùng chung với 2 skill `up-dt-oem`/`cong-no-oem` (gộp chung hôm 2026-08-18, tách lại hôm nay). Lý do tách: đo thử cho thấy project dùng chung (gắn trực tiếp vào Sheet "OEM" khổng lồ làm container) chậm hơn 5-10 lần so với 1 project độc lập cho cùng 1 lệnh gọi đơn giản, ngay cả khi không bị lỗi mạng — xem ghi chú trong file `Code.gs`.

**Cập nhật 2026-08-20**: thư mục `gas/` giờ nối trực tiếp với project Apps Script qua [clasp](https://github.com/google/clasp) (`gas/.clasp.json` — `scriptId` trỏ đúng project, không chứa bí mật gì nên an toàn để commit). Từ giờ **sửa code local rồi push bằng clasp**, không cần copy-paste tay vào trình soạn thảo trên web nữa. Mục 1 dưới đây (dán tay) chỉ còn cần khi tạo project MỚI từ đầu hoặc máy chưa có clasp/chưa đăng nhập.

## 0. Deploy bằng clasp (cách dùng hằng ngày)

Yêu cầu một lần: `npx clasp login` bằng tài khoản Google có quyền Editor trên project (không cần cài global, `npx` tự tải).

```bash
cd gas
npx clasp push                              # đẩy code local lên bản nháp @HEAD của Apps Script
npx clasp create-version "mô tả ngắn gọn"   # đóng băng bản nháp thành 1 version có số, bất biến
npx clasp update-deployment <deploymentId> -V <versionNumber>   # trỏ deployment ĐANG CHẠY sang version đó
```

**Lưu ý bắt buộc**: LUÔN dùng `update-deployment` (không phải `create-deployment`/`clasp deploy`) — lệnh này cập nhật đúng deployment ID hiện có, giữ nguyên Web app URL. Tạo deployment mới sẽ sinh URL khác, phá `API_URL` trong `src/services/api.js`.

Deployment ID đang chạy (khớp `API_URL` hiện tại): `AKfycbwKe1b7gUOnp9gPF_q6jlzTFIrD3DOtkFM8oMQf41D1iXGrEwmYElWZeupCNG-Szy7DfQ`. Xem lại/đối chiếu bất cứ lúc nào bằng `npx clasp list-deployments`.

**Cập nhật 2026-08-21**: deployment ID ở trên đã đổi (khác với bản 2026-08-20) — ai đó đã tạo **New deployment** thủ công trên trình soạn thảo web (mô tả "OEM Hub") thay vì `update-deployment`, nên sinh ra ID mới thay vì cập nhật ID cũ. Đã xác minh sống (`ping`/`getUserList`/`getBootstrap`) deployment mới này hoạt động bình thường và trả đúng dữ liệu thật. Đã đối chiếu qua `npx clasp list-deployments` (sau khi đăng nhập lại) — deployment mới nằm **đúng cùng project Apps Script** mà `scriptId` trong `gas/.clasp.json` đang trỏ tới, chỉ là 1 trong 3 deployment của project này (`AKfycbywqs2...@HEAD`, `AKfycbyUJ...@5` cũ nay đã bỏ, `AKfycbwK...@6` đang chạy). Không cần sửa `scriptId`. Từ lần deploy tiếp theo dùng đúng ID mới này với `update-deployment`.

`npx clasp status` cho biết file nào sẽ được đẩy lên (chỉ 7 file `.gs` + `appsscript.json` — `SETUP.md` và các file `.md` khác tự động bị bỏ qua, không cần `.claspignore` riêng).

Xác nhận thật (2026-08-20): đã chạy trọn vòng push → create-version → update-deployment với nội dung không đổi để kiểm chứng đường ống — deployment ID giữ nguyên, `ping`/`getUserList`/`getBootstrap` đều phản hồi bình thường sau khi đổi.

## 1. Tạo project Apps Script mới (chỉ 1 lần, khi KHÔNG dùng clasp hoặc tạo project từ đầu)

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

## Tab bắt buộc cho tính năng SOP (thêm 2026-08-22)

`Sop.gs` tìm 2 tab theo TÊN (như "Orders"/"Products" — không tự tạo, báo lỗi nếu thiếu):

- **SOP_Plan**: `Kỳ | Sale | Mã SKU | SL T+1 | SL T+2 | SL T+3 | SL T+4 | Trạng thái | Ngày gửi | Người duyệt | Ngày duyệt` — chi tiết từng Sale, giữ lịch sử, không bao giờ bị ghi đè.
- **SOP**: `Mã | Tên SP | Giá bán | SL <tháng> | SL <tháng> | SL <tháng> | SL <tháng>` — bị **ghi đè toàn bộ** mỗi khi Admin/Creator duyệt 1 kỳ, chỉ phản ánh kỳ mới nhất.

Cột "Độc quyền" trên tab **Products** (cột thứ 9, do người dùng tự thêm) dùng để lọc bảng lập kế hoạch — đọc bằng `oemAppParseBool_` (TRUE/"x"/text khác rỗng = có).

## Những gì backend này CHƯA làm (có chủ đích)

- **Đồng bộ Công Nợ Excel** (`DebtImporter.jsx`) vẫn chỉ lưu tạm — tab `Debt_Tracking`/`Debt` đã có quy trình cập nhật riêng qua skill `cong-no-oem` (đối chiếu Mã KH/Tên KH); một luồng ghi tự động thứ 2 từ app này rủi ro làm hai luồng đá nhau.
