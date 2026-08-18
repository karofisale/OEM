# Deploy OEM App Backend (Google Apps Script)

**Cập nhật 2026-08-18**: backend của app này giờ **dùng chung** Apps Script project đã có sẵn với 2 skill `up-dt-oem` và `cong-no-oem` (không tạo project mới) — chỉ 1 tài khoản Google cần quyền Editor trên Sheet `OEM`. Code nguồn thật (đã gộp) nằm ở:

```
D:\Operation\Claude\Scripts\up-dt-oem\Code.gs
```

File `gas/Code.gs` trong repo này **chỉ còn là bản tham khảo lịch sử**, không dùng để deploy nữa.

## 1. Dán code mới & deploy "New version" (không tạo deployment mới)

1. Mở Apps Script project đang chạy Web App của `up-dt-oem`/`cong-no-oem` (từ Google Sheet `OEM` → Extensions → Apps Script).
2. Xoá hết nội dung `Code.gs` cũ, dán toàn bộ nội dung file `D:\Operation\Claude\Scripts\up-dt-oem\Code.gs` (đã gộp sẵn phần OEM App vào cuối file, đánh dấu `===== OEM APP BACKEND =====`).
3. Lưu (Ctrl+S).
4. **Deploy → Manage deployments** → bấm bút chì (Edit) trên deployment Web App đang dùng → **Version: New version** → Deploy.
   - **KHÔNG** tạo "New deployment" — làm vậy sẽ ra URL mới, phá vỡ `up-dt-oem/config.json` và `cong-no-oem` đang trỏ URL cũ.
5. URL không đổi — đã điền sẵn trong `src/services/api.js` (`API_URL`), lấy từ `D:\Operation\Claude\Scripts\up-dt-oem\config.json`.

## 2. Build + test trước khi push

```bash
npm run build
```

Mở app, thử đăng nhập (PIN đúng ở tab Users của Sheet) — nếu vẫn báo lỗi "Unknown function: login" nghĩa là bước 4 ở trên chưa deploy đúng deployment/version.

## 3. Chỉ sau khi đã xác nhận app chạy tốt — khoá Sheet public

Đây là bước **thực sự** chặn rò rỉ dữ liệu qua URL public:

1. Mở Google Sheet `OEM` (1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk) → **Share**.
2. Đổi "Anyone with the link" → **Restricted** (chỉ những người/nhóm cụ thể).
3. Đảm bảo tài khoản Google chạy Apps Script này ("Execute as: Me" lúc deploy) vẫn còn quyền Editor trên Sheet — nếu không, cả OEM App lẫn `up-dt-oem`/`cong-no-oem` sẽ lỗi theo (giờ dùng chung 1 project nên chỉ cần kiểm tra đúng 1 tài khoản).

## Khi sửa lại Code.gs sau này

Luôn sửa trực tiếp `D:\Operation\Claude\Scripts\up-dt-oem\Code.gs` (không sửa `gas/Code.gs` trong repo React — file đó chỉ để tham khảo). Sau khi sửa: dán vào Apps Script editor, Save, rồi **Deploy → Manage deployments → Edit → New version → Deploy** (như bước 1.4 ở trên).

## Những gì backend này CHƯA làm (có chủ đích)

- **Thêm sản phẩm mới** (`ProductManagement.jsx`) vẫn chỉ lưu tạm trên trình duyệt — Sheet không có tab danh mục sản phẩm riêng (tab `Materials` hiện tại là pivot số lượng bán theo tháng, không phải danh mục).
- **Đồng bộ Công Nợ Excel** (`DebtImporter.jsx`) vẫn chỉ lưu tạm — tab `Debt_Tracking`/`Debt` đã có quy trình cập nhật riêng qua skill `cong-no-oem` (đối chiếu Mã KH/Tên KH); một luồng ghi tự động thứ 2 từ app này rủi ro làm hai luồng đá nhau.
