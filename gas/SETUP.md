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

## Tab "Plan_Thang" và "Plan2026" — Kế hoạch kinh doanh (đổi lớn 2026-08-25)

Trước 2026-08-25, mỗi lần chỉ có 1 tháng "đang hoạt động" cho cả tab (dòng 0 giữ 1 ô tháng chung ở cột D). Từ 2026-08-25, mỗi dòng tự mang tháng riêng (giống cách `SOP_Plan` làm), nên nhiều tháng có thể tồn tại song song. Hai cột mới được thêm SAU cột `Note` (không đụng cột `Chênh` hiện có):

| Cột | Vị trí (1-indexed) | Tên | Ví dụ |
|---|---|---|---|
| O | 15 | Tháng | `T09-2026` |
| P | 16 | Trạng thái | `Chờ duyệt` / `Đã duyệt` |

Toàn bộ 14 cột cũ (A-N: Code, Search_code, Tên KH, Sale, Plan KPI, Plan_Update, Done, Chênh, Tuần 1-5, Note) giữ nguyên vị trí — `oemAppSubmitSalesPlan_` khi sửa 1 dòng đã có **cố tình không đụng cột G (Done) và H (Chênh)**: Done là số liệu thực tế được cập nhật ở nơi khác, còn Chênh là công thức sống trong Sheet — `getValues()` trả về GIÁ TRỊ đã tính của công thức đó, nên ghi lại y nguyên số này sẽ vô tình xoá công thức.

**64 dòng cũ (trước khi có cột Tháng)**: cột Tháng của chúng để trống — `oemAppLoadSalesPlans_`/`oemAppSubmitSalesPlan_`/`oemAppApproveSalesPlan_` đều tự hiểu các dòng trống này thuộc về tháng ghi trong ô tiêu đề cũ (dòng 1, cột D) + năm hiện tại (`oemAppPlanLegacyMonth_`), không cần tự điền lại tay. Đây là cầu nối 1 lần cho lô dữ liệu đã có sẵn, KHÔNG áp dụng cho dòng mới — mọi dòng ghi mới đều có Tháng tường minh.

Ghi (`oemAppSubmitSalesPlan_`, hàm `submitSalesPlan`): upsert theo cặp (Tháng, Search_code) — sửa dòng đã có hoặc thêm dòng mới cho khách chưa có kế hoạch tháng đó; sửa lại 1 dòng (kể cả dòng đã Đã duyệt) sẽ đưa Trạng thái về `Chờ duyệt` để chờ duyệt lại. Duyệt (`oemAppApproveSalesPlan_`, hàm `approveSalesPlan`): duyệt cả 1 tháng 1 lần (mọi dòng `Chờ duyệt` của tháng đó → `Đã duyệt`), giống cách `oemAppApproveSop_` duyệt cả kỳ.

**Tab "Plan2026"** (tạo tay, không theo gid) — lưới KPI theo năm, đọc bởi `oemAppLoadPlan2026_`, dùng để tự động điền "Plan KPI" khi Sale đề xuất kế hoạch tháng (không gõ tay): dòng 0-4 là các dòng tổng/subtotal, **dòng 6 (1-indexed) mới là dòng tiêu đề thật**: `Mã KH | Tên Khách hàng | PIC | Năm 2026 | Tháng 1 | ... | Tháng 12` (cột A-P, A=0-indexed 0). Khớp bằng "Mã KH" — đúng định dạng text-code (`TECOM`, `CTQTSONHA`...) dùng chung với `codeSearch`/`searchCode` ở mọi nơi khác trong app. Nếu tab này không tồn tại, `plan2026` trong `getBootstrap` trả về rỗng và Plan KPI hiển thị `0` (không lỗi).

## SOP: xem lại kế hoạch đã gửi + duyệt có thể sửa số/lọc theo Sale (2026-08-25)

- **`oemAppSubmitSopDraft_` đổi từ upsert-merge sang FULL REPLACE theo (Kỳ, Sale)** (2026-08-25, phiên riêng — xem ghi chú "full-replace" bên dưới): mỗi lần gửi, TOÀN BỘ payload trở thành đúng tập hợp dòng của Sale đó cho kỳ đó — SKU nào đang tồn tại trên Sheet mà KHÔNG có trong payload lần này sẽ bị **xoá hẳn** (`sheet.deleteRow`), không chỉ để nguyên/stale nữa. Dòng toàn số 0 ở cả 4 tháng bị loại khỏi payload trước khi ghi (không chiếm chỗ). Nếu kỳ đó ĐÃ được duyệt (`Đã duyệt`), hàm từ chối thẳng — Sale phải chờ kỳ tiếp theo, không thể âm thầm sửa/xoá 1 batch đã publish. Frontend (`SopPlanPanel.jsx`) vì vậy PHẢI gửi toàn bộ `draftMap` hiện có (không chỉ phần đang lọc hiển thị `filteredMaterials`) — nếu chỉ gửi phần đang lọc, các SKU bị bộ lọc ẩn đi sẽ bị hiểu nhầm là "Sale xoá" và mất thật. Có thêm nút "Tạo Mới Từ Đầu" (chỉ xoá state cục bộ, chưa đụng Sheet) và popup xác nhận trước khi Gửi Duyệt/Tạo mới.
- **`getMySopPlan`** (có thêm `price` mỗi dòng từ 2026-08-25) — trả về TOÀN BỘ dòng `SOP_Plan` của chính Sale đang đăng nhập (mọi kỳ, kèm Trạng thái/Ngày gửi/Ngày duyệt), hiển thị trong `SopMyPlanPanel.jsx` ngay trong tab "Xem SOP" (chỉ hiện với ai có quyền lập kế hoạch). Kỳ trùng với `anchor` hiện tại (kỳ đang mở) hiện y hệt kiểu bảng Chờ Duyệt của Admin: dòng Σ TỔNG DOANH THU DỰ KIẾN theo 4 tháng (SUMPRODUCT SL x Giá bán, cùng công thức với card "Doanh thu dự kiến" bên `SopApprovePanel.jsx` — không phải tổng số lượng thô), tick "Ẩn mã không có số lượng", số lượng sửa được ngay tại chỗ, và nút "Gửi duyệt lại" gọi thẳng `submitSopDraft` tại đây (2026-08-25: bỏ hẳn bước chuyển sang tab "Lập Kế Hoạch" để sửa) — theo semantics full-replace ở trên, chỉ gửi lại đúng các dòng đang hiện ở đây. Các kỳ cũ khác chỉ hiển thị lịch sử, không sửa/gửi lại được (submitSopDraft luôn nhắm vào kỳ `anchor` hiện tại, và bị chặn nếu kỳ đó đã duyệt).
- **`getSopPendingReview`** giờ trả thêm `detail` (mảng từng dòng Sale+SKU trước khi gộp) và `anchor` — `SopApprovePanel.jsx` dùng `detail` để cho Admin/Creator lọc xem tổng đóng góp của 1 Sale cụ thể (bảng phụ, chỉ để xem, không ảnh hưởng số liệu sẽ duyệt).
- **`approveSop`** nhận thêm tham số `overrideRows` (tuỳ chọn) — Admin/Creator có thể sửa trực tiếp số lượng trên bảng tổng hợp trước khi bấm Duyệt; số đã sửa mới là số được ghi vào tab "SOP", việc đánh dấu `Đã duyệt` cho các dòng `SOP_Plan` gốc thì KHÔNG đổi theo (vẫn theo đúng số Sale đã gửi thật). Chỉ được sửa số cho SKU đã có trong lô đang chờ duyệt — không thể thêm SKU mới qua đường này.
- **Lọc dòng toàn số 0**: `SopApprovePanel.jsx` có tick "Ẩn mã không có số lượng" (chỉ ẩn hiển thị, dòng ẩn vẫn được duyệt/xoá khỏi hàng chờ bình thường). Nhưng khi thực sự bấm Duyệt, `oemAppApproveSop_` **tự động bỏ qua** mọi SKU có số lượng = 0 ở cả 4 tháng (sau khi áp dụng overrideRows) khi ghi vào tab "SOP" — không xuất bản dòng toàn số 0, dù vẫn đánh dấu các dòng `SOP_Plan` liên quan là Đã duyệt để chúng thoát khỏi hàng chờ.
- **Bug đã gặp + đã sửa (2026-08-25)**: một Sale thấy mỗi mã SKU hiện lặp lại nhiều dòng giống nhau trong "Xem SOP" (tick "Ẩn mã không có số lượng" trông như không ăn — React dùng `key={r.sku}` nên nhiều dòng trùng khoá làm việc lọc/re-render sai), và Admin xem duyệt của 1 Sale ra doanh thu gấp 6-18 lần con số thật Sale tự thấy. Cùng 1 nguyên nhân gốc, tìm ra qua `sopDiag`: tab `SOP_Plan` có nhiều hơn 1 dòng vật lý cho cùng (Kỳ, Sale, SKU) dù tab này được thiết kế "1 dòng = 1 (Kỳ, Sale, SKU)" — cụ thể, cột A "Kỳ" bị Google Sheets tự diễn giải lại chuỗi `"2026-09"` thành một ô kiểu Date thật (thay vì text), khiến so khớp `String(anchor) === String(ô)` không bao giờ đúng nữa — mọi lần Sale gửi lại, code không tìm thấy dòng cũ nên cứ APPEND thêm ~450 dòng mới mỗi lần (1 Sale bị tới 7943 dòng thô cho 452 SKU thật — gần như vô hình với cả Admin lẫn "Xem SOP" hiện tại của chính Sale đó, vì không khớp `anchor`). Đã sửa 2 lớp: (1) `oemAppSopNormalizePeriod_` — mọi nơi ĐỌC cột Kỳ (kể cả khi nó là Date) đều quy về đúng chuỗi `yyyy-MM`; (2) `oemAppSubmitSopDraft_` giờ ép định dạng ô cột A về Text (`setNumberFormat('@')`) TRƯỚC khi ghi, để không bị Sheets diễn giải lại nữa. `oemAppLoadSopPlanRows_` cũng tự gộp về ĐÚNG 1 dòng mới nhất (rowIndex cao nhất) cho mỗi (Kỳ, Sale, SKU) sau khi đã chuẩn hoá Kỳ — áp dụng cho MỌI nơi đọc tab này (planning context, tổng hợp chờ duyệt, "Xem SOP"). Các dòng trùng/hỏng cũ vẫn còn nằm vật lý trong Sheet (vô hại, bị bỏ qua nhờ dedupe) — muốn dọn sạch (~9000+ dòng thừa hiện tại) thì cần xoá tay, chưa tự động.

## Tab "Debt" — Công nợ khách hàng (thêm 2026-08-25)

Tab tìm theo TÊN ("Debt", không theo gid). **Cấu trúc khác mọi tab khác trong app**: dòng 1 có 1 giá trị rác ở cột G (bỏ qua), dòng 2 trống, **dòng 3 mới là tiêu đề thật**, dữ liệu từ dòng 4:

| Cột | Vị trí (1-indexed) | Tên | Ghi chú |
|---|---|---|---|
| A | 1 | Mã KH | text-code, cùng quy ước `codeSearch` dùng chung toàn app |
| B | 2 | MÃ SỐ CŨ | mã số cũ; app chỉ GHI cột này cho khách hàng MỚI lúc import (từ file), không bao giờ đụng vào dòng đã tồn tại |
| C | 3 | Tên Khách hàng | |
| D | 4 | PIC | tên Sale, dùng để scope theo `oemAppMatchesSale_` giống mọi tab khác |
| E | 5 | Hạn mức | số, ghi được |
| F | 6 | Vượt hạn mức | **CÔNG THỨC** — 1 ô `=ARRAYFORMULA(G4:G-E4:E)` duy nhất ở F4, tràn xuống cả cột. App **KHÔNG BAO GIỜ** ghi vào cột này (kể cả ghi chuỗi rỗng) — ghi vào bất kỳ ô nào trong cột có thể phá công thức tràn cho toàn bộ phần còn lại. |
| G | 7 | Số dư công nợ | số, ghi được |

- **`getDebtView`** — đọc toàn bộ, scope theo Sale (PIC) giống `getBootstrap`; hiển thị ở `DebtViewPanel.jsx` (tab "Bảng Công Nợ").
- **`importDebtExcel`** (role admin/creator, giống tầng quyền duyệt Sop/SalesPlan) — nhận file Excel với Mã KH, Mã Số Cũ, Tên khách hàng, PIC, Hạn mức, Vượt hạn mức (chỉ để xem trước, không ghi), Số dư công nợ; upsert theo Mã KH (trim + uppercase) vào cột A/C/D/E/G — ghi theo khối cột 1 lần (không phải từng dòng) để nhanh với vài trăm dòng. Mã Số Cũ chỉ được điền cho khách hàng MỚI.
- **PIC lấy từ tab "Clients", KHÔNG tin thẳng cột PIC trong file** (2026-08-26, `oemAppDebtPicByCode_`) — cột "KINH DOANH QL" trong file báo cáo tuần là copy tay, có thể sai/cũ cho 1 khách cụ thể (vd dòng TECOM ghi PIC là "CT Tecom" — chính tên khách hàng — thay vì tên Sale thật). Với mỗi Mã KH đã có trong Clients, PIC ghi vào tab Debt luôn lấy theo `sale` của Clients (đè cả giá trị cũ đang có trong Debt lẫn giá trị trong file); chỉ dùng PIC trong file khi Mã KH đó KHÔNG có trong Clients (khách hoàn toàn mới). `DebtImportPanel.jsx` resolve PIC y hệt cách này ở bảng xem trước (cần prop `clients` truyền từ `App.jsx`), để không lệch với PIC thật sự được ghi.
- **`DebtImportPanel.jsx` đọc đúng file thật** (2026-08-26, sau khi import báo lỗi "không đọc được dòng nào"): file báo cáo tuần thật ("BÁO CÁO KẾ HOẠCH -THỰC THU CÔNG NỢ OEM...xlsx", tab "TỔNG HỢP") có 7 dòng tiêu đề/pivot (tổng theo Sale, tổng công ty, cột kế hoạch tuần) TRƯỚC dòng tiêu đề thật "Mã KH" — không phải bảng 5 cột đơn giản như thiết kế ban đầu. Parser giờ quét cột A tìm ô "Mã KH" (bất kể nằm dòng nào) rồi đọc theo VỊ TRÍ cột bên dưới, đúng layout tab "Debt" ở trên; ưu tiên đọc sheet tên "TỔNG HỢP" nếu có (file có tới 10 tab khác không phải dữ liệu); vẫn giữ cách đọc theo tên cột cũ làm phương án dự phòng cho file rút gọn.
- **Tab này CŨNG được ghi bởi skill `cong-no-oem` riêng** (dự án khác, đối chiếu Mã KH/Tên KH) — `importDebtExcel` là luồng ghi tự động THỨ 2 vào cùng tab, theo quyết định rõ ràng của người dùng (2026-08-25, đảo ngược quyết định "chỉ lưu tạm, chưa nối" trước đó) — cần cẩn trọng khi cả 2 luồng cùng chạy gần nhau.

## Bảng giá bán — đề xuất/duyệt giá lẻ+KM, chung hoặc theo khách (thêm 2026-08-26)

MVP: bước 1 (Sale đề xuất), 2 (Admin xem/sửa/duyệt), 4 (duyệt = áp dụng giá ngay + ghi Ngày hiệu lực). Bước 3 (đối chiếu giá thành/Margin, xuất Excel, tự tạo ticket Odoo qua API — có tiền lệ kỹ thuật ở skill `phe-duyet-bht`) để Phase 2, chưa làm.

**Tab "Products" — thêm 2 cột J/K, tái dùng lại G/H đã bỏ trống sẵn từ trước:**

| Cột | Vị trí | Tên | Trước đây | Từ 2026-08-26 |
|---|---|---|---|---|
| G | 7 | Duyệt giá | để trống, chưa ai đọc/ghi | "Đã áp dụng" — trạng thái áp dụng giá gần nhất, ghi bởi `oemAppApplyPriceListToProducts_` |
| H | 8 | Ngày duyệt | để trống, chưa ai đọc/ghi | Ngày hiệu lực của lần áp dụng gần nhất |
| J | 10 | Giá KM | đã có header sẵn trên Sheet, chưa có dữ liệu | Giá khuyến mãi hiện hành |
| K | 11 | SL KM | đã có header sẵn trên Sheet, chưa có dữ liệu | Ngưỡng số lượng để được giá KM |

Cột J/K hoá ra đã có header sẵn trên Sheet trước khi tính năng này được xây (kiểm tra qua 1 diag tạm `oemAppProductsDiag_`, đã xoá sau khi xác nhận) — chỉ là chưa có dữ liệu và chưa có code nào đọc/ghi. `oemAppLoadMaterialCatalog_`/`oemAppDeriveMaterials_` giờ đọc thêm `promoPrice`/`promoQty` từ đây, hiển thị ở bảng "Danh mục" trong `ProductManagement.jsx`.

**Tab "Gia_DeXuat" — PHẢI TẠO TAY trước khi dùng tính năng này** (tìm theo tên, không tự tạo). 1 dòng = 1 (đợt đề xuất, SKU). Cột (1-indexed):

| Cột | Tên | Ghi chú |
|---|---|---|
| A | Mã đợt | tự sinh dạng `yyyyMMdd-HHmmss-xxxx`, mỗi lần Sale gửi tạo đợt MỚI (không upsert vào đợt cũ) |
| B | Người đề xuất | Sale (saleId hoặc tên đăng nhập) |
| C | Mã KH | **BỎ TRỐNG = áp dụng chung** cho mọi khách hàng; điền = giá riêng CHỈ khách đó |
| D | Ngày đề xuất | |
| E | Mã SKU | |
| F | Tên SP | denormalize từ Products lúc gửi |
| G | Giá lẻ hiện tại | snapshot lúc gửi (từ Gia_KhachHang nếu có Mã KH + đã có giá riêng, ngược lại từ Products) |
| H | Giá KM hiện tại | snapshot, cùng logic |
| I | Giá lẻ ĐX | Sale nhập |
| J | Số lượng KM ĐX | Sale nhập, để trống/0 nếu SKU không có KM |
| K | Giá KM ĐX | Sale nhập, để trống/0 nếu SKU không có KM |
| L | % tăng/giảm | **CÔNG THỨC SỐNG**, vd `=IFERROR((I2-G2)/G2,0)` — kéo công thức xuống hết các dòng dự kiến sẽ dùng (vài nghìn dòng) vì app chỉ APPEND, không tự điền công thức cho dòng mới |
| M | Trạng thái | Chờ duyệt / Đã duyệt / Từ chối |
| N | Ngày hiệu lực | Admin điền lúc Duyệt |
| O | Người duyệt | |
| P | Ngày duyệt | |
| Q | Ghi chú | tuỳ chọn, dùng khi Từ chối |

App ghi thành 2 khối cột tách rời (A-K, rồi M-Q) — **không bao giờ đụng cột L** kể cả khi ghi cả dòng mới, để không xoá mất công thức (giống nguyên tắc đã áp dụng cho "Chênh" ở Plan_Thang và "Vượt hạn mức" ở Debt).

**Tab "Gia_KhachHang" — PHẢI TẠO TAY, chỉ cần nếu có đề xuất giá riêng theo khách** (không tự tạo; nếu chưa tồn tại, `oemAppLoadClientPricingMap_` trả về rỗng thay vì lỗi — tính năng "áp dụng chung" vẫn chạy bình thường không cần tab này). 1 dòng = 1 (Mã KH, Mã SKU), upsert khi duyệt đợt giá riêng. Cột (1-indexed): A Mã KH | B Mã SKU | C Giá lẻ | D Số lượng KM | E Giá KM | F Ngày hiệu lực | G Người duyệt | H Ngày duyệt.

**Luồng**: `submitPriceProposal` (role sale/admin/creator) → `getPendingPriceProposals` (role admin/creator, nhóm theo Mã đợt ở frontend) → `approvePriceBatch(token, batchId, effectiveDate, overrideRows)` ghi NGAY vào Products (đợt không Mã KH) hoặc Gia_KhachHang (đợt có Mã KH) rồi đánh dấu `Đã duyệt`, hoặc `rejectPriceBatch` đánh dấu `Từ chối`. Không có cơ chế hẹn giờ áp dụng — "Ngày hiệu lực" chỉ là nhãn ghi lại cho mục đích đối chiếu, giá đổi ngay lúc bấm Duyệt.

Đã bỏ nút "Đề Xuất Giá" cũ (theo từng khách, từng SKU riêng lẻ) trong `ProductManagement.jsx` — hoàn toàn không hoạt động từ trước (`handleSavePriceProposal` chỉ có `e.preventDefault()`), thay bằng 2 tab mới "Đề Xuất Giá"/"Chờ Duyệt" ở `ProductPricing.jsx` (wrapper mới bọc ngoài `ProductManagement.jsx`, cùng khuôn 3-nút-subview với `SopPlan.jsx`).

## Vai trò "account" (kế toán) (thêm 2026-08-26)

Vai trò mới, gán trong tab "Users" như mọi vai trò khác (không cần khai báo gì thêm — `oemAppLogin_` đọc thẳng chuỗi trong cột Role, không có allowlist). Chỉ thấy 3 menu: Sản phẩm & Bảng giá (chỉ tab "Danh Mục", không Đề Xuất/Chờ Duyệt/Tính Giá/Giá Vốn), Khách hàng OEM (xem, không thêm/sửa), Công nợ (xem + **được Nhập Excel** — role gate `oemAppRequireDebtImportRole_` giờ là `['admin','creator','account']`). Sidebar.jsx lọc menu theo `activeUser.role === 'account'` (`OEMAPP_ACCOUNT_MENU_IDS_`); `App.jsx` tự chuyển tab mặc định sang "products" lúc đăng nhập thay vì "ai-agent" (account không có trong menu đó, nhưng KeepAliveTab không tự chặn render nếu activeTab lỡ trỏ tới — chỉ là landing tab, không phải một lớp bảo mật thật).

## Giá vốn (Cost) — so sánh LNG khi duyệt giá + công cụ tính giá gợi ý (thêm 2026-08-26)

**Tab "Cost"** — người dùng tự tạo, 4 cột (1-indexed): A Mã (SKU, cùng định dạng số với "Mã LK" ở Products) | B Tên | C Giá ưu tiên (= giá vốn, **CHƯA VAT** — tên cột hơi lạ nhưng đúng là giá vốn theo mô tả người dùng) | D Tháng GV (dạng `"T07.2026"` — **dấu CHẤM**, khác quy ước `"T09-2026"` dùng ở SOP/SalesPlan; `oemAppCostParseMonth_` parse được cả 2 kiểu cho chắc). 1 SKU có thể có nhiều dòng (nhiều tháng, cập nhật định kỳ) — mọi nơi dùng giá vốn đều tự lấy dòng có Tháng GV **mới nhất của đúng SKU đó** (`oemAppLoadLatestCostBySku_`), không phải tháng mới nhất tồn tại trên toàn tab. SKU chưa từng có dòng nào → không có giá vốn, phải tự cảnh báo cho người dùng nhập tay, không suy đoán/mặc định 0.

VAT dùng 1 mức cố định 8% (`OEMAPP_COST_DEFAULT_VAT_`) cho mọi SKU — không đọc thuế suất riêng từng mã, giữ đơn giản.

- **Chỉ Creator được xem giá vốn thật và nhập Excel giá vốn** — khác với MỌI tính năng khác trong app (luôn gộp chung Admin+Creator 1 tầng quyền), đây là ngoại lệ có chủ đích theo đúng yêu cầu người dùng. `oemAppGetCostBySku_`/`oemAppRequireCostImportRole_` chặn cả Admin.
- **`importCostExcel(token, monthLabel, rows)`** — Creator chọn tháng áp dụng (input `type="month"`, đổi "2026-08" → "T08.2026") rồi tải file Excel kế toán gửi (cột Mã/Tên/Giá vốn, tên cột linh hoạt). Upsert theo (SKU, Tháng) — tải lại đúng tháng đó lần 2 sẽ ghi đè, không nhân đôi dòng (bài học từ SOP_Plan/Debt import trước đó trong app này).
- **`PriceApprovePanel.jsx`** — chỉ khi `activeUser.role === 'creator'` mới fetch `getCostBySku` và hiện thêm 2 cột "Giá vốn (VAT)"/"LNG %" (LNG = (Giá đề xuất − Giá vốn+VAT) / Giá đề xuất — cả 2 vế đều SAU VAT theo đúng yêu cầu "Cost + VAT để so với giá đề xuất sau VAT"). SKU chưa có giá vốn hiện "⚠️ Chưa có" thay vì %. Admin duyệt được giá bình thường nhưng KHÔNG thấy 2 cột này.
- **`calculateSuggestedPrice(token, sku, targetMarginPct)`** (Admin+Creator, `PriceCalculatorPanel.jsx`, tab "Tính Giá") — công cụ tính giá bán gợi ý theo % LNG mong muốn, dùng để Admin/Creator báo giá giúp Sale cho 1 mã đơn lẻ. **Không bao giờ trả về số giá vốn thật** — chỉ trả giá bán đề xuất đã tính sẵn, nên Admin dùng được công cụ mà không thấy giá vốn (chỉ Creator xem giá vốn thật qua đường `getCostBySku` ở trên).
