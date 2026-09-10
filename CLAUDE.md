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

**Mỗi con số một tab, do người dùng chốt 2026-09-08:**

| Con số | Nguồn |
|---|---|
| Doanh thu tháng trước | tab `Data` (SAP) |
| Doanh thu Done MTD | tab `Data` (SAP) |
| Plan update của sale | tab `Plan_Thang`, cột F |
| Mục tiêu Plan KPI | tab `Plan2026`, cột tháng hiện tại |
| Tổng công nợ | tab `Debt` |

Cột `Done` (G) và `Plan KPI` (E) của `Plan_Thang` **không** còn được đọc. `Done`
là ô điền tay, còn `Data` là bản đổ từ SAP — hai chỗ lệch nhau là chuyện thường.
`Plan KPI` cột E chỉ là bản chép của Plan2026 lúc sale lập kế hoạch, nên tháng
nào sale chưa lập dòng thì mục tiêu biến mất khỏi tổng.

`Plan2026` có **tên tab cứng**: sang 2027 nó không còn là kế hoạch năm hiện tại,
nên `oemAppPstatsCotPlan2026_()` trả `-1` và endpoint gắn cờ `kpiHetHan` để cổng
hiện "—" kèm cảnh báo thay vì số 0.

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

## Nhập ZSD450 từ trong app (tab Lịch sử doanh thu)

Nút **"Nhập ZSD450"** trong tab `transactions` làm đúng việc mà
`Scripts/up-dt-oem/push_to_sheet.py` làm ở dòng lệnh: đọc file Excel xuất từ
SAP, dựng mảng 65 ô mỗi dòng, ghi vào tab Data.

**Đường ghi vẫn chỉ có MỘT.** `oemAppImportRevenueExcel_` không tự ghi Sheet —
nó `UrlFetchApp` sang Web App `up-dt-oem`, nơi `replaceMonth_` đã chạy thật
nhiều tháng và biết những thứ không nhìn ra từ đây (7 cột công thức/điền tay,
dòng neo ARRAYFORMULA không được xoá, ghi theo từng khối cột). Viết lại logic
đó ở đây là tạo bản thứ hai của cùng một sự thật.

**Cần hai Script Property, thiếu là panel báo lỗi ngay khi bấm:**

```
UPDT_WEBAPP_URL = URL /exec của dự án up-dt-oem
UPDT_SECRET     = đúng chuỗi trong Script Property SECRET của dự án đó
```

Hai giá trị nằm sẵn ở `Scripts/up-dt-oem/config.json`. Chạy
`setup_kiemCauHinhNhapDoanhThu()` để kiểm — nó in CÓ/KHÔNG, **không in giá
trị**. Secret KHÔNG BAO GIỜ xuống client: kho này là **public**, mọi chuỗi
trong bundle đều đọc được trên GitHub.

**Bản đồ 65 cột có HAI BẢN** — `src/utils/zsd450.js` và `push_to_sheet.py`. SAP
đổi tên một cột mà chỉ sửa một bên thì bên kia im lặng gửi sai. `test/revenue-import.test.cjs`
đọc thẳng mã nguồn Python và so từng phần tử.

```bash
node test/revenue-import.test.cjs   # 45 test
```

Ba cái bẫy bộ test đang canh, đều là chuyện thật của dữ liệu ZSD450: dòng "nhãn
số cột" (1,2,3…) SAP chèn dưới tiêu đề phải lọc theo **kiểu Date** chứ không
theo rỗng — nên file **bắt buộc** đọc với `cellDates: true`; cột Thuế suất ra
dạng chữ `"08 %"` phải thành `0.08` nếu không cột DT thuần sau VAT ra `#VALUE!`
cả cột; và 7 cột công thức phải gửi `null` chứ không phải chuỗi rỗng — chuỗi
rỗng là GHI đè lên ARRAYFORMULA.

**File chứa nhiều hơn một tháng thì panel CHẶN.** `replaceMonth_` xoá đúng một
tháng rồi chèn tất cả dòng gửi lên, nên dòng của tháng còn lại sẽ nằm cạnh dòng
cũ của chính nó — nhân đôi. `push_to_sheet.py` không có chốt này (nó tin
`--month`); trong thực tế không gặp vì `export_zsd450.py` luôn xuất đúng một
tháng.

## Nhịp tim của việc tự động

`gas/NhipTim.gs` giống hệt **từng byte** với bản ở FC App, Export Ops Hub,
Karofi ID và `D:\Operation\Claude\Scripts\up-dt-oem`. `test/nhip-tim.test.js`
của Karofi ID so cả năm file.

Điểm dễ nhầm ở app này: **backend OEM App KHÔNG ghi nhịp nào cả, chỉ đọc.** Hai
việc `oem.doanh-thu` và `oem.cong-no` do dự án `Scripts/up-dt-oem` ghi — dự án
khác, gắn (container-bound) vào chính file Sheet OEM. Nhịp tim do **bên nhận**
ghi chứ không phải bên gửi, nên `push_to_sheet.py` và `push_debt_to_sheet.py`
không phải sửa gì, và thứ được ghi lại là dữ liệu ĐÃ vào Sheet chứ không phải
một script tự khai là đã chạy.

`oemAppBuildPortalStats_` trả `nhipTim` kèm số liệu (nằm trong khối cache 10
phút — chấp nhận được vì đây là phép đo tính bằng giờ).

## Liên quan tới app khác

`gas/KarofiToken.gs`, `gas/KarofiSession.gs`, `src/services/karofiSession.js` là
bản sao dùng chung với FC và Export. Danh sách app trong `CAC_APP_` (dùng cho
trình chuyển app) trùng với cổng VHKD và hai app kia — thêm app mới phải sửa cả
bốn chỗ.
