# OEM App — OEM Portal

Kho `karofisale/OEM`. Chạy tại `https://karofisale.github.io/OEM/`.

`src/` (React 18 + Vite) và `gas/` (backend Apps Script). **Hai nửa deploy bằng
hai đường khác nhau.**

## Deploy

**Client** — push lên `main`, GitHub Actions tự build và đẩy `dist`. Không build
tay, không commit `dist` (đã gitignore).

> **`npm run deploy` trong `package.json` là script CŨ, đừng chạy.** Nó gọi
> `gh-pages -d dist`, tức đẩy lên nhánh `gh-pages` — trong khi Actions deploy từ
> `main`. Chạy nó là tạo ra hai nguồn tranh nhau phục vụ cùng một trang.

**Backend** — `clasp push` CHƯA ĐỦ, phải redeploy đúng deployment thật:

```bash
cd "D:/Antigravity/OEM App/gas" && clasp push -f && clasp redeploy AKfycbwKe1b7gUOnp9gPF_q6jlzTFIrD3DOtkFM8oMQf41D1iXGrEwmYElWZeupCNG-Szy7DfQ -d "mô tả"
```

Dự án có nhiều deployment; id ở trên là **bản thật** mà `src/services/api.js`
đang gọi. `clasp list-deployments` để đối chiếu, và số `@n` tăng là bằng chứng
đã tới người dùng.

## Chạy tay: chỉ mở Run.gs

**Mọi thao tác chạy tay nằm ở `gas/Run.gs`, tất cả đều KHÔNG THAM SỐ.** Mở file
đó, chọn tên hàm trong danh sách trên thanh công cụ, bấm Run. Không phải đi tìm
hàm ở file nào, không phải gõ tham số.

Lý do: nút Run của Apps Script **không truyền được tham số**. Hàm cần tham số
thì bấm Run là báo lỗi — và mỗi lần dùng lại phải tra xem gõ gì vào đâu.

Hai khuôn, dùng đúng một cách:

- **Việc có ghi dữ liệu** -> hai hàm riêng `run_<việc>_xemTruoc()` và
  `run_<việc>_ghiThat()`, **không phải một cờ `true`/`false`**. Tách đôi vì một
  cờ để quên ở trạng thái bật là ghi đè dữ liệu ngoài ý muốn.
- **Việc cần giá trị** -> hằng số VIẾT HOA ngay dòng đầu thân hàm.

**Thêm việc mới:** viết hàm nghiệp vụ ở file của nó như bình thường, rồi thêm
một vỏ bọc `run_*` không tham số vào `Run.gs`. Đừng bắt người dùng gõ tham số.

## Backend này là dự án ĐỘC LẬP

Tách khỏi dự án `up-dt-oem` dùng chung từ 2026-08-19, sau khi đo được nó chậm
hơn 5–10 lần vì bị gắn (container-bound) vào file Sheet lớn đầy công thức. Dùng
`SpreadsheetApp.openById()` chứ **không** dùng `getActiveSpreadsheet()`. Đừng
gộp lại.

## Quy ước không được phá

- **Mọi hàm trong `oemAppApiMap_` phải tự gọi `oemAppRequireSession_`.** Router
  không kiểm hộ. Chỉ 3 endpoint được phép mở: `ping`, `login` (có
  `LoginThrottle`), `getUserList` (**chỉ trả về tên** — bỏ role và saleId là cố
  ý, để không công bố ai là admin ra internet).
- Hàm ghi phải có tên trong `OEMAPP_WRITE_FNS_` (`Code.gs`) để chạy trong
  `oemAppRunExclusive_`. Đọc dữ liệu phải nằm **bên trong** khoá.
- Hàm ghi không lặp lại được phải có tên trong `NON_IDEMPOTENT_FNS`
  (`src/services/api.js`). Client thử lại tới 4 lượt khi lỗi mạng, mà đường mạng
  ở đây hay nuốt phản hồi — thử lại một lệnh ghi đã chạy xong là sinh dữ liệu
  trùng. `deleteOrderLine` xoá theo chỉ số dòng nên còn xoá nhầm.
- `PinHash.gs` và `LoginThrottle.gs` **giống hệt từng byte** với bản `.js` bên
  Export. Sửa một bên phải chép sang bên kia — bộ test của Karofi ID có mục so
  hai file và sẽ đỏ nếu chúng trôi lệch.

## Hiệu năng — hai thứ đang giữ nhịp

`KeepAliveTab` mount lười rồi giữ tab sống (không unmount khi chuyển tab), và
`App.jsx` tải các tab bằng `React.lazy`. Ranh giới `Suspense` nằm **trong**
`KeepAliveTab`, không bọc chung cả vùng nội dung — bọc chung thì tải chunk sẽ
làm nháy tab đang xem. Gói đầu tiên ~200 KB; thêm import tĩnh một màn nặng vào
`App.jsx` là kéo nó phình lại.

`getBootstrap` không còn chứa `plan2026` và `baselines2025` — hai khối đó sang
`getReportContext`, nạp khi mở màn cần. Endpoint mới **phải giữ nguyên việc ép
phạm vi theo sale**; bỏ sót là mở rộng quyền đọc cho mọi người.

`SCHEMA_VERSION` trong `services/dataCache.js`: tăng khi payload **thêm** hoặc
**đổi nghĩa** một khoá, không cần tăng khi chỉ **bỏ** một khoá.

## Cổng VHKD gọi vào đây

`getPortalStats` (`gas/PortalStats.gs`) là số liệu mà **cổng VHKD** hiện trong
khối "Số liệu tổng quan". Đừng đổi tên hay bỏ mà không sửa `index.html` của kho
`Karofi-VHKD` — cổng gọi thẳng `/exec` của dự án này.

Nó dùng đúng `oemAppScopeOf_` + `oemAppMatchesSale_` như getBootstrap, và cache
kết quả 10 phút **theo từng scope** (khoá cache có `scope.key` trong tên) vì nó
đọc trọn tab Data. Dùng chung một khoá là trả bản chụp của admin cho sale mở
trang sau đó.

```bash
node test/portalstats.test.cjs   # 27 test — .cjs vì package.json là "type":"module"
```

**`t.month` không còn mặc định `'T08-2026'`** (`SalesData.gs`, sửa 2026-09).
Giá trị mặc định đó dồn mọi dòng thiếu tháng vào một tháng thật và làm phồng
doanh thu tháng đó. Dòng thiếu tháng giờ có `month = ''` và không vào tháng
nào; `getPortalStats` báo ra số lượng để cổng nói được là đang thiếu bao nhiêu.

Còn một cái bẫy cùng loại **chưa sửa** ở ngay dưới đó: `t.sale` mặc định
`'KH Đình Hoan'` và `t.group` mặc định `'Linh kiện OEM'`. Với `sale` thì đó là
chuyện phân quyền — mọi dòng thiếu cột sale bị gán cho một người thật, và
người đó thấy chúng như đơn của mình. Sửa được nhưng phải rà cả đường
getBootstrap.

## Liên quan tới app khác

`gas/KarofiToken.gs`, `gas/KarofiSession.gs`, `src/services/karofiSession.js` là
bản sao dùng chung với FC và Export. Danh sách app trong `CAC_APP_` (dùng cho
trình chuyển app) trùng với cổng VHKD và hai app kia — thêm app mới phải sửa cả
bốn chỗ.
