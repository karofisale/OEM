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

`Sop.gs` tìm 2 tab theo TÊN (như "Orders"/"Products" — không tự tạo, báo lỗi nếu thiếu, và đọc/ghi theo VỊ TRÍ cột chứ không theo tên tiêu đề — dòng 1 chỉ để người đọc, code không parse chữ trong đó trừ tab SOP như ghi chú bên dưới).

**⚠️ Kiểm tra lại (2026-08-22)**: `sopDiag` (gọi không cần đăng nhập) đọc được dòng tiêu đề THỰC TẾ của 2 tab hiện có không khớp bảng dưới đây — có nhãn "Tổng DT:" và các số thập phân trông giống dữ liệu doanh thu từ một tab khác, nghi là bị copy sót nội dung cũ. **Chưa ai chạy thử tính năng thật với dữ liệu này** — cần dọn lại 2 tab đúng cấu trúc dưới đây trước khi dùng, để tránh nút "Duyệt" (xoá + ghi đè tab SOP) đụng vào dữ liệu không liên quan.

### Tab "SOP_Plan" — 11 cột, đọc/ghi bởi `oemAppLoadSopPlanRows_` / `oemAppSubmitSopDraft_` / `oemAppApproveSop_`

| Cột | Vị trí (1-indexed) | Tên gợi ý | Kiểu dữ liệu | Ví dụ |
|---|---|---|---|---|
| A | 1 | Kỳ | text, "yyyy-MM" | `2026-09` |
| B | 2 | Sale | text (saleId hoặc tên đăng nhập) | `KH Đình Hoan` |
| C | 3 | Mã SKU | text | `SKU001` |
| D | 4 | SL T+1 | số | `50` |
| E | 5 | SL T+2 | số | `60` |
| F | 6 | SL T+3 | số | `70` |
| G | 7 | SL T+4 | số | `80` |
| H | 8 | Trạng thái | text: `Chờ duyệt` hoặc `Đã duyệt` | `Chờ duyệt` |
| I | 9 | Ngày gửi | text "dd/MM/yyyy HH:mm" | `21/08/2026 09:00` |
| J | 10 | Người duyệt | text (tên admin, để trống tới khi duyệt) | `` |
| K | 11 | Ngày duyệt | text "dd/MM/yyyy HH:mm" (để trống tới khi duyệt) | `` |

Dòng 1 = tiêu đề (bỏ qua khi đọc). Từ dòng 2 trở đi là dữ liệu — 1 dòng = 1 (Kỳ, Sale, SKU). Tab này **giữ lịch sử, không bao giờ bị code xoá** — chỉ ghi đè đúng dòng khi Sale gửi lại trước khi duyệt, hoặc chỉ đổi cột H/J/K khi duyệt.

### Tab "SOP" — 7 cột, bị `oemAppApproveSop_` **ghi đè toàn bộ** mỗi lần duyệt (chỉ phản ánh kỳ mới nhất)

| Cột | Vị trí (1-indexed) | Tên | Ví dụ |
|---|---|---|---|
| A | 1 | Mã | `SKU001` |
| B | 2 | Tên SP | `Vật tư 001` |
| C | 3 | Giá bán | `15000` |
| D | 4 | SL <tháng 1> | `55` |
| E | 5 | SL <tháng 2> | `66` |
| F | 6 | SL <tháng 3> | `77` |
| G | 7 | SL <tháng 4> | `88` |

Dòng 1 do code tự ghi (`Mã`, `Tên SP`, `Giá bán`, và 4 tiêu đề dạng `SL T09-2026`...) — `oemAppGetSopView_` đọc lại đúng 4 tiêu đề này ở cột D-G để hiển thị nhãn tháng, nên **không tự đổi tay dòng 1**. Nếu tab đang có thêm cột phía sau cột G (như dữ liệu lạ phát hiện ở trên), code không đọc tới nhưng nên xoá cho sạch, tránh gây nhầm khi mở Sheet trực tiếp.

Cột "Độc quyền" trên tab **Products** (cột thứ 9, do người dùng tự thêm) là **text tự do** (vd tên khách/hãng giữ độc quyền SKU đó), không phải cột đúng/sai — dùng để lọc bảng lập kế hoạch qua dropdown chọn đúng 1 giá trị, giống cách lọc "Nhóm SP", không phải ô tick.

## Tab tuỳ chọn "Kits" — công thức "Bộ sản phẩm" cho AI Agent (thêm 2026-08-24)

**Cập nhật 2026-08-25**: AI Agent đặt hàng đã rollback về xử lý cục bộ (không gọi API ngoài — xem `src/services/aiAgent.js`), sau khi gặp lỗi hạn mức/xác thực API liên tục. Tab "Kits" vẫn hoạt động y hệt: đọc qua `oemAppLoadKits_` (Ai.gs), đưa vào `getBootstrap` (trường `kits`), và việc TÁCH "Bộ" thành các SKU thành phần giờ chạy ở frontend (`expandKit_` trong `aiAgent.js`) thay vì trong prompt Gemini — không cần đổi gì trên Sheet. Đường Gemini (`gas/Ai.gs`'s `oemAppAiParseOrder_`, route `aiParseOrder`) vẫn còn nguyên, chỉ tạm không có nơi nào gọi tới — dễ bật lại nếu muốn.

Không bắt buộc — nếu tab "Kits" không tồn tại, `oemAppLoadKits_` trả về mảng rỗng và AI Agent xử lý "bộ"/"combo" như 1 sản phẩm đơn lẻ như trước (không tách dòng). Tạo tab này khi muốn dạy cho AI Agent biết một "Bộ <tên>" cụ thể gồm những SKU nào, mỗi SKU bao nhiêu cái.

5 cột: `Tên gọi Bộ | Mã SKU thành phần | Vai trò | SL trong 1 Bộ | Ghi chú`. Mỗi dòng = 1 thành phần của 1 Bộ. Ví dụ "Bộ cốc" gồm cốc trong, cốc màu (2 lựa chọn theo màu — cùng "Vai trò" nhưng khác SKU, AI Agent sẽ tự chọn đúng SKU theo màu được nhắc trong đơn), và nắp cốc:

| Tên gọi Bộ | Mã SKU thành phần | Vai trò | SL trong 1 Bộ | Ghi chú |
|---|---|---|---|---|
| Bộ cốc | SKU-COC-TRONG | Cốc trong | 1 | |
| Bộ cốc | SKU-COC-XANH | Cốc màu | 2 | Biến thể xanh |
| Bộ cốc | SKU-COC-DO | Cốc màu | 2 | Biến thể đỏ |
| Bộ cốc | SKU-NAP-COC | Nắp cốc | 3 | |

Với dữ liệu trên, lệnh "2 bộ cốc màu xanh" sẽ tách thành 3 dòng: 2x Cốc trong, 4x Cốc màu xanh (đúng SKU biến thể xanh, bỏ qua dòng SKU-COC-DO), 6x Nắp cốc. Nếu lệnh không nói rõ biến thể nào (chỉ ghi "bộ cốc" trống không), AI Agent bỏ qua thành phần "Cốc màu" và ghi cảnh báo thay vì đoán đại 1 màu.

Thêm "Bộ" mới bằng cách thêm dòng mới cùng `Tên gọi Bộ` — không cần sửa code, đây là dữ liệu, không phải cấu hình.

**Nhiều tên gọi cho cùng 1 Bộ**: gõ nhiều cách gọi cách nhau bằng dấu phẩy trong CÙNG 1 ô `Tên gọi Bộ`, vd `Bộ cốc ĐL, Bộ cốc Đài Loan` — khớp được với BẤT KỲ cách gọi nào trong đó, không cần lệnh gõ đúng y nguyên cả cụm. (2026-08-25: đây từng là lỗi — code cũ so khớp cả cụm có dấu phẩy như 1 chuỗi duy nhất nên gần như không bao giờ khớp; đã sửa để tách theo dấu phẩy trước khi so khớp — áp dụng luôn cho cột Alias trên tab Products và Clients.)

## Những gì backend này CHƯA làm (có chủ đích)

- **Đồng bộ Công Nợ Excel** (`DebtImporter.jsx`) vẫn chỉ lưu tạm — tab `Debt_Tracking`/`Debt` đã có quy trình cập nhật riêng qua skill `cong-no-oem` (đối chiếu Mã KH/Tên KH); một luồng ghi tự động thứ 2 từ app này rủi ro làm hai luồng đá nhau.
