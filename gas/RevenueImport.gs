/**
 * RevenueImport.gs — nhận doanh thu ZSD450 do trình duyệt đọc từ file Excel,
 * chuyển tiếp sang Web App `up-dt-oem` để ghi vào tab Data.
 *
 * VÌ SAO CHUYỂN TIẾP CHỨ KHÔNG TỰ GHI. Việc ghi tab Data đã có một bản cài đặt
 * chạy thật nhiều tháng: `replaceMonth_` trong dự án
 * `D:\Operation\Claude\Scripts\up-dt-oem` (Apps Script gắn vào chính file Sheet
 * OEM). Nó biết những thứ không nhìn ra được từ đây:
 *
 *   - 6 cột là CÔNG THỨC MẢNG (Tuần, DT thuần sau VAT, Mã KH chữ, Sale, Nhóm
 *     hàng hoá, Quý) và 1 cột điền tay (PK) — ghi đè lên là giết công thức.
 *   - Dòng nào đang NEO công thức mảng thì không được xoá, dù nó thuộc tháng
 *     đang thay.
 *   - Ghi theo từng KHỐI CỘT liên tục, chừa đúng các cột trên.
 *
 * Viết lại logic đó ở đây là tạo bản thứ hai của cùng một sự thật, và hai bản
 * sẽ trôi lệch — kho này đã bị đúng loại lỗi ấy nhiều lần. Nên đường ghi giữ
 * nguyên MỘT cửa, và file này chỉ làm ba việc: kiểm quyền, kiểm dữ liệu, và
 * mang gói dữ liệu sang đó.
 *
 * VÌ SAO KHÔNG ĐỂ TRÌNH DUYỆT GỌI THẲNG `up-dt-oem`. Lượt gọi đó cần
 * `secret`, mà kho `karofisale/OEM` là **public** — mọi chuỗi nằm trong bundle
 * client đều đọc được bằng cách mở tệp .js trên GitHub. Secret ở đây nằm trong
 * Script Properties của dự án này và không bao giờ rời máy chủ.
 *
 * CẤU HÌNH MỘT LẦN (Apps Script → ⚙ Project Settings → Script properties):
 *   UPDT_WEBAPP_URL = URL /exec của dự án up-dt-oem
 *   UPDT_SECRET     = đúng chuỗi trong Script Property SECRET của dự án đó
 * Hai giá trị này nằm sẵn ở `Scripts/up-dt-oem/config.json` trên máy.
 * Chạy `setup_kiemCauHinhNhapDoanhThu()` để kiểm mà không lộ giá trị ra log.
 *
 * NHỊP TIM: không ghi ở đây. `replaceMonth_` bên kia đã ghi `oem.doanh-thu`
 * ngay sau khi dữ liệu vào Sheet thật — ghi thêm một lần ở đây là ghi lại một
 * việc mình chỉ nghe kể, và nếu lượt chuyển tiếp hỏng giữa chừng thì nhịp sẽ
 * nói dối. Xem NhipTim.gs.
 */

var RI_URL_PROP_ = 'UPDT_WEBAPP_URL';
var RI_SECRET_PROP_ = 'UPDT_SECRET';

/** Đủ dài cho một tháng dữ liệu; Python đang dùng 180 giây cho cùng việc này. */
var RI_TIMEOUT_MS_ = 180 * 1000;

/**
 * Chỉ admin/creator. KHÔNG mở cho `account` như bên công nợ: đây là bảng doanh
 * thu gốc mà mọi báo cáo, mọi màn hình và số tổng quan trên cổng đều đứng lên,
 * và một lượt nhập sai tháng là xoá sạch tháng đó của cả phòng.
 */
function oemAppRequireRevenueImportRole_(user) {
  if (['admin', 'creator'].indexOf(user.role) < 0) {
    throw new Error('Chỉ Admin/Creator mới có quyền nhập doanh thu từ file ZSD450.');
  }
}

function riProp_(key, tenNguoiDoc) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v || !String(v).trim()) {
    throw new Error(
      'Chưa cấu hình Script Property "' + key + '" (' + tenNguoiDoc + '). ' +
      'Vào Apps Script → Project Settings → Script properties để thêm. ' +
      'Giá trị lấy ở Scripts/up-dt-oem/config.json trên máy.'
    );
  }
  return String(v).trim();
}

/**
 * Chạy tay để kiểm cấu hình. In ra CÓ / KHÔNG, tuyệt đối không in giá trị —
 * Nhật ký thực thi không tự xoá và ai vào được dự án đều đọc được.
 */
function setup_kiemCauHinhNhapDoanhThu() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty(RI_URL_PROP_);
  var secret = props.getProperty(RI_SECRET_PROP_);
  var out = [
    '=== CẤU HÌNH NHẬP DOANH THU TỪ FILE ZSD450 ===',
    RI_URL_PROP_ + ': ' + (url ? 'có (' + String(url).slice(0, 46) + '…)' : 'CHƯA CÓ'),
    RI_SECRET_PROP_ + ': ' + (secret ? 'có (' + String(secret).length + ' ký tự)' : 'CHƯA CÓ'),
    '',
    (url && secret)
      ? 'Đủ điều kiện. Panel "Nhập ZSD450" trong tab Lịch sử doanh thu dùng được.'
      : 'Thiếu cấu hình — panel sẽ báo lỗi ngay khi bấm. Xem đầu file RevenueImport.gs.'
  ];
  Logger.log(out.join('\n'));
  return out.join('\n');
}

/**
 * @param {string} token   phiên đăng nhập
 * @param {string} month   'yyyy-MM' — THÁNG SẼ BỊ THAY TOÀN BỘ
 * @param {Array<Array>} rows  mỗi dòng đúng 65 ô theo thứ tự cột tab Data,
 *     ô công thức/điền tay để null. Trình duyệt dựng (xem RevenueImportPanel.jsx).
 */
function oemAppImportRevenueExcel_(token, month, rows) {
  var user = oemAppRequireSession_(token);
  oemAppRequireRevenueImportRole_(user);

  month = String(month === null || month === undefined ? '' : month).trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Tháng không hợp lệ ("' + month + '") — cần dạng yyyy-MM.');
  }

  // KHÔNG có dòng nào thì DỪNG, không gọi sang. `replaceMonth_` xoá sạch tháng
  // trước rồi mới chèn, nên gọi với mảng rỗng là xoá trắng tháng đó mà không có
  // gì thay thế. `push_to_sheet.py` cũng chặn đúng ở đây, cùng một lý do.
  if (!rows || !rows.length) {
    throw new Error('Không có dòng dữ liệu nào — CHƯA gửi gì đi. ' +
      'File ZSD450 rỗng thì tháng này vẫn giữ nguyên số cũ trên Sheet.');
  }

  var res;
  try {
    res = UrlFetchApp.fetch(riProp_(RI_URL_PROP_, 'URL /exec của up-dt-oem'), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        secret: riProp_(RI_SECRET_PROP_, 'secret của up-dt-oem'),
        month: month,
        rows: rows
      }),
      muteHttpExceptions: true,
      followRedirects: true,
      timeout: RI_TIMEOUT_MS_
    });
  } catch (e) {
    throw new Error('Không gọi được dịch vụ ghi tab Data: ' + e.message);
  }

  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code >= 300) {
    throw new Error('Dịch vụ ghi tab Data trả lỗi HTTP ' + code + ': ' + body.slice(0, 200));
  }

  var out;
  try {
    out = JSON.parse(body);
  } catch (e) {
    // Đường mạng ở đây thỉnh thoảng trả trang HTML thay vì JSON — nói rõ thay
    // vì để một lỗi parse khó hiểu nổi lên tận màn hình người dùng.
    throw new Error('Dịch vụ ghi tab Data trả về dữ liệu không phải JSON ' +
      '(có thể URL sai hoặc bị chặn bởi trang đăng nhập Google).');
  }
  if (!out || out.ok !== true) {
    throw new Error('Ghi tab Data thất bại: ' + ((out && out.error) || 'không rõ lý do'));
  }

  // Cache bootstrap của app này KHÔNG tự dọn được: dữ liệu vừa do một dự án
  // KHÁC ghi, nên không có đường nào báo cho nó biết. Không dọn thì người vừa
  // bấm nhập vẫn thấy số cũ tới 10 phút và tưởng việc nhập hỏng.
  oemAppInvalidateBootstrap_();

  return {
    month: month,
    rowsSent: rows.length,
    rowsAdded: out.rows_added || 0,
    rowsRemoved: out.rows_removed || 0,
    warnings: out.warnings || []
  };
}
