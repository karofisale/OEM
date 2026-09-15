/**
 * BOM.gs — chi tiết nguyên vật liệu của các MÃ MÁY, tab "BOM" (người dùng tự
 * tạo 15/09/2026, giống tiền lệ Orders/Products: tìm theo TÊN, KHÔNG tự tạo,
 * thiếu thì báo lỗi rõ chứ không lặng lẽ dựng một tab rỗng).
 *
 * Nguồn dữ liệu là T-code Z_BOM trong SAP (Material = mã máy, Plant = 0400).
 * Vào app theo hai đường, cả hai đổ về oemAppUpdateBom_:
 *   - nút "Cào từ SAP" (giao thức karofi-oem://bom?material=...)
 *   - dán bảng đã copy từ SAP vào app
 *
 * ĐỌC THEO TÊN TIÊU ĐỀ, không theo vị trí cột — ngoại lệ có chủ ý so với quy
 * ước "đọc theo chỉ số cột" của mọi tab khác trong app này. Lý do giống hệt
 * ngoại lệ đã có ở phần nhập giá vốn Excel: tab này do người dùng tự dựng tay
 * từ một bảng SAP, và bảng SAP có thể được kéo thả/thêm cột bất cứ lúc nào.
 * Bám theo vị trí thì một lần chèn cột là đọc sai toàn bộ, mà đọc sai BOM thì
 * không ai nhận ra — số nào cũng trông hợp lý.
 *
 * 5 cột bắt buộc, đúng tên SAP trả về:
 *   Material | Material Description | Component | Component Descript | Quantity
 * Cột thứ 6 "Ngày cập nhật" do CHÍNH APP sở hữu: không có thì tự thêm vào cuối
 * ở lần cập nhật đầu tiên. Ghi lên MỌI dòng của mã vừa cập nhật (không chỉ dòng
 * đầu) — đọc ra chỉ cần nhìn một dòng bất kỳ, và sắp xếp lại tab trên Sheet
 * cũng không làm mốc thời gian lạc mất khỏi các dòng của nó.
 */

var OEMAPP_BOM_SHEET_ = 'BOM';

function oemAppGetBomSheet_() {
  var sheet = oemAppSS_().getSheetByName(OEMAPP_BOM_SHEET_);
  if (!sheet) throw new Error('Không tìm thấy tab "BOM" trên Google Sheet.');
  return sheet;
}

/** Bỏ dấu + bỏ mọi ký tự không phải chữ/số, để so tiêu đề không phụ thuộc
 *  hoa thường, khoảng trắng thừa hay dấu tiếng Việt. */
function oemAppBomNormHeader_(s) {
  return String(s === null || s === undefined ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Vị trí (1-indexed) của từng cột theo tiêu đề dòng 1.
 *
 * `taoCotNgay` = true thì thiếu cột "Ngày cập nhật" sẽ TỰ THÊM vào cuối — chỉ
 * đường ghi mới truyền true. Đường đọc để nguyên tab của người dùng.
 */
function oemAppBomCols_(sheet, taoCotNgay) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  var cols = { material: 0, materialDesc: 0, component: 0, componentDesc: 0, quantity: 0, updatedAt: 0 };
  for (var i = 0; i < head.length; i++) {
    var k = oemAppBomNormHeader_(head[i]);
    var c = i + 1;
    // Thứ tự nhánh quan trọng: "materialdescription" KHÔNG bằng "material" nên
    // không cướp mất cột Material, và ngược lại.
    if (k === 'material') { if (!cols.material) cols.material = c; }
    else if (k.indexOf('materialdesc') === 0) { if (!cols.materialDesc) cols.materialDesc = c; }
    else if (k === 'component') { if (!cols.component) cols.component = c; }
    else if (k.indexOf('componentdesc') === 0) { if (!cols.componentDesc) cols.componentDesc = c; }
    else if (k === 'quantity' || k === 'qty') { if (!cols.quantity) cols.quantity = c; }
    else if (k === 'ngaycapnhat') { if (!cols.updatedAt) cols.updatedAt = c; }
  }

  var thieu = [];
  if (!cols.material) thieu.push('Material');
  if (!cols.materialDesc) thieu.push('Material Description');
  if (!cols.component) thieu.push('Component');
  if (!cols.componentDesc) thieu.push('Component Descript');
  if (!cols.quantity) thieu.push('Quantity');
  if (thieu.length) {
    throw new Error('Tab "BOM" thiếu cột tiêu đề: ' + thieu.join(', ') +
                    '. Dòng 1 phải là tiêu đề đúng tên SAP trả về.');
  }

  if (!cols.updatedAt && taoCotNgay) {
    cols.updatedAt = lastCol + 1;
    sheet.getRange(1, cols.updatedAt).setValue('Ngày cập nhật');
  }
  return cols;
}

/** So mã máy/mã linh kiện: SAP hay trả kèm khoảng trắng, và Sheet có thể lưu
 *  mã toàn số thành number. Ép về chuỗi đã trim trước khi so. */
function oemAppBomKey_(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

function oemAppBomNgayISO_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  return String(v);
}

/**
 * Xem BOM của một mã máy — MỌI vai đều gọi được, chỉ cần phiên hợp lệ.
 *
 * KHÔNG lọc theo Sale: BOM là định mức kỹ thuật của sản phẩm, không gắn với
 * khách hàng hay doanh số của ai. Cùng lý lẽ với danh mục sản phẩm.
 */
function oemAppGetBom_(token, sku) {
  oemAppRequireSession_(token);
  var key = oemAppBomKey_(sku);
  if (!key) throw new Error('Thiếu mã sản phẩm.');

  var sheet = oemAppGetBomSheet_();
  var cols = oemAppBomCols_(sheet, false);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sku: key, rows: [], updatedAt: '', materialName: '' };

  var vals = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var out = [];
  var updatedAt = '';
  var materialName = '';
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (oemAppBomKey_(r[cols.material - 1]) !== key) continue;
    if (!materialName) materialName = String(r[cols.materialDesc - 1] || '');
    if (cols.updatedAt && !updatedAt) updatedAt = oemAppBomNgayISO_(r[cols.updatedAt - 1]);
    out.push({
      component: oemAppBomKey_(r[cols.component - 1]),
      componentDesc: String(r[cols.componentDesc - 1] || ''),
      quantity: oemAppParseNum_(r[cols.quantity - 1])
    });
  }
  return { sku: key, materialName: materialName, updatedAt: updatedAt, rows: out };
}

/**
 * Thay TOÀN BỘ BOM của một mã máy bằng lô dòng vừa lấy từ SAP.
 *
 * Thay chứ không gộp: BOM là ảnh chụp định mức tại một thời điểm: linh kiện bị
 * bỏ khỏi máy phải BIẾN MẤT khỏi bảng, không được nằm lại thành dòng mồ côi.
 * Mã chưa có dòng nào thì đây là lần thêm mới.
 *
 * Ghi theo kiểu đọc-cả-khối / sửa-trong-bộ-nhớ / ghi-cả-khối (khuôn đã dùng ở
 * oemAppImportDebtExcel_, oemAppSubmitSalesPlan_): giữ nguyên MỌI cột khác của
 * những dòng không thuộc mã này, kể cả cột người dùng tự thêm sau — vì dòng cũ
 * được mang nguyên mảng gốc sang khối mới, không dựng lại từ 5 trường.
 */
function oemAppUpdateBom_(token, sku, rows) {
  var user = oemAppRequireSession_(token);
  if (!['admin', 'creator'].includes(user.role)) {
    throw new Error('Chỉ Admin/Creator mới cập nhật được BOM.');
  }
  return oemAppGhiBom_(sku, rows);
}


/**
 * Đường vào cho TIẾN TRÌNH TRÊN MÁY — script cào Z_BOM chạy sau khi người dùng
 * bấm nút "Cào từ SAP", xác thực bằng SECRET dùng chung chứ không phải phiên
 * đăng nhập.
 *
 * VÌ SAO KHÔNG DÙNG TOKEN PHIÊN: script chạy trong một tiến trình Windows do
 * giao thức karofi-oem:// khởi động, không có trình duyệt, không có phiên. Đây
 * đúng khuôn `push_to_sheet.py` -> web app up-dt-oem đã dùng ổn định từ lâu.
 *
 * ĐÂY LÀ HÀM CÔNG KHAI THEO NGHĨA MẠNG — backend deploy "Anyone", nên bất kỳ ai
 * biết secret đều ghi được. Vì vậy:
 *   - Secret nằm ở Script Property BOM_PUSH_SECRET, KHÔNG có mặc định. Chưa đặt
 *     thì hàm từ chối mọi lượt gọi, không phải "cho qua vì chưa cấu hình".
 *   - So sánh độ dài trước rồi mới so nội dung, và chỉ trả một câu lỗi duy nhất
 *     cho mọi kiểu sai — không nói cho người gọi biết họ sai ở đâu.
 *   - Quyền hạn hẹp nhất có thể: chỉ ghi được tab BOM của đúng một mã mỗi lượt.
 *     Thiệt hại tối đa nếu secret lọt là BOM bị ghi sai, và BOM luôn cào lại
 *     được từ SAP. Nếu sau này đường này được nới ra tab khác thì phép tính đổi
 *     hẳn và phải chuyển sang xác thực thật.
 */
function oemAppPushBom_(secret, sku, rows) {
  var mong = PropertiesService.getScriptProperties().getProperty('BOM_PUSH_SECRET');
  var nhan = String(secret === null || secret === undefined ? '' : secret);
  if (!mong || nhan.length !== String(mong).length || nhan !== String(mong)) {
    throw new Error('Không có quyền ghi BOM từ máy trạm.');
  }
  return oemAppGhiBom_(sku, rows);
}


/** Thân chung của hai đường ghi ở trên. Tách ra để luật ghi BOM chỉ tồn tại
 *  MỘT bản — đường dán và đường cào phải cư xử giống hệt nhau, nếu không thì
 *  cùng một tab có hai hành vi tuỳ theo ai ghi. */
function oemAppGhiBom_(sku, rows) {
  var key = oemAppBomKey_(sku);
  if (!key) throw new Error('Thiếu mã sản phẩm.');

  var sach = (rows || []).filter(function (r) {
    return r && oemAppBomKey_(r.component);
  });
  // Đúng câu người dùng yêu cầu. Ném lỗi chứ KHÔNG ghi một BOM rỗng: ghi rỗng
  // sẽ xoá sạch BOM đang có chỉ vì một lượt cào hỏng.
  if (!sach.length) throw new Error('Không tìm thấy BOM cho mã ' + key + '.');

  var sheet = oemAppGetBomSheet_();
  var cols = oemAppBomCols_(sheet, true);
  var width = Math.max(sheet.getLastColumn(), cols.updatedAt || 0);
  var lastRow = sheet.getLastRow();
  var cu = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];

  var giu = [];
  var soDongCu = 0;
  cu.forEach(function (r) {
    if (oemAppBomKey_(r[cols.material - 1]) === key) { soDongCu++; return; }
    // Dòng trắng hoàn toàn thì bỏ luôn, không mang sang khối mới.
    var coGiTri = r.some(function (c) { return c !== '' && c !== null; });
    if (coGiTri) giu.push(r);
  });

  var now = new Date();
  var moi = sach.map(function (r) {
    var row = [];
    for (var i = 0; i < width; i++) row.push('');
    row[cols.material - 1] = key;
    row[cols.materialDesc - 1] = String(r.materialDesc || '');
    row[cols.component - 1] = oemAppBomKey_(r.component);
    row[cols.componentDesc - 1] = String(r.componentDesc || '');
    row[cols.quantity - 1] = oemAppParseNum_(r.quantity);
    if (cols.updatedAt) row[cols.updatedAt - 1] = now;
    return row;
  });

  var khoi = giu.concat(moi);
  if (khoi.length) sheet.getRange(2, 1, khoi.length, width).setValues(khoi);
  // Khối mới ngắn hơn khối cũ (mã này bớt linh kiện) thì phần đuôi thừa phải
  // được dọn, nếu không những dòng cũ nằm lại và bị đọc như BOM thật.
  if (cu.length > khoi.length) {
    sheet.getRange(2 + khoi.length, 1, cu.length - khoi.length, width).clearContent();
  }

  return {
    ok: true,
    sku: key,
    soDongMoi: moi.length,
    soDongCu: soDongCu,
    laThemMoi: soDongCu === 0,
    updatedAt: now.toISOString()
  };
}
