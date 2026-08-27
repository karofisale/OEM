/** Giá vốn (cost, chưa VAT) theo tháng — tab "Cost", tạo tay, Creator cập
 * nhật định kỳ (mỗi tháng thêm 1 lô dòng mới cho các SKU có phát sinh doanh
 * thu tháng đó). Dùng để: Creator so sánh LNG (lợi nhuận gộp) khi duyệt bảng
 * giá đề xuất, và công cụ tính giá bán gợi ý theo % LNG mong muốn cho
 * Admin/Creator dùng giúp Sale.
 *
 * Cột (1-indexed): A Mã (SKU, cùng định dạng số với "Mã LK" ở Products) |
 * B Tên | C Giá ưu tiên (= giá vốn, CHƯA VAT) | D Tháng GV (dạng "T07.2026",
 * dấu CHẤM chứ không phải gạch ngang như các tab khác trong app — không tự
 * ý đổi định dạng, parse đúng cả 2 kiểu cho chắc).
 *
 * 1 SKU có thể có NHIỀU dòng (nhiều tháng) — giá vốn dùng để so sánh/tính
 * toán luôn lấy dòng có Tháng GV MỚI NHẤT của đúng SKU đó, không phải tháng
 * mới nhất tồn tại trên toàn tab. SKU chưa từng có dòng nào -> không có giá
 * vốn, phía dùng dữ liệu này phải tự cảnh báo "chưa có giá vốn", không suy
 * đoán hay mặc định 0.
 *
 * Cố định 1 mức thuế VAT chung (không đọc theo từng SKU) — giữ đơn giản,
 * khớp mức mặc định 8% đã dùng ở nơi khác trong app (oemAppDeriveMaterials_).
 */

var OEMAPP_COST_DEFAULT_VAT_ = 0.08;

function oemAppGetCostSheet_() {
  var sheet = oemAppSS_().getSheetByName('Cost');
  if (!sheet) throw new Error('Không tìm thấy tab "Cost" trên Google Sheet.');
  return sheet;
}

// Chỉ Creator — theo đúng yêu cầu, KHÁC với mọi nơi khác trong app luôn gộp
// chung Admin+Creator cùng 1 tầng quyền.
function oemAppRequireCostImportRole_(user) {
  if (user.role !== 'creator') {
    throw new Error('Chỉ Creator mới có quyền nhập giá vốn.');
  }
}

function oemAppRequireCostViewRole_(user) {
  if (user.role !== 'creator') {
    throw new Error('Chỉ Creator mới xem được giá vốn.');
  }
}

function oemAppRequireCostCalcRole_(user) {
  if (!['creator', 'admin'].includes(user.role)) {
    throw new Error('Chỉ Admin/Creator mới dùng được công cụ tính giá.');
  }
}

// "T07.2026" hoặc "T07-2026" -> { year, month, sortValue }. sortValue =
// year*12+month, dùng để so sánh THỜI GIAN đúng — so bằng chuỗi sẽ sai ở
// ranh giới năm (vd "T01.2027" < "T12.2026" theo chuỗi nhưng là tháng SAU).
function oemAppCostParseMonth_(label) {
  var m = /^T\s*(\d{1,2})[.\-](\d{4})$/.exec(String(label || '').trim());
  if (!m) return null;
  var month = parseInt(m[1], 10);
  var year = parseInt(m[2], 10);
  return { year: year, month: month, sortValue: year * 12 + month };
}

function oemAppLoadCostRows_() {
  var sheet = oemAppGetCostSheet_();
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    var parsed = oemAppCostParseMonth_(r[3]);
    out.push({
      rowIndex: i + 1,
      sku: String(r[0]),
      name: String(r[1] || ''),
      cost: oemAppParseNum_(r[2]),
      monthLabel: String(r[3] || ''),
      monthSort: parsed ? parsed.sortValue : -1
    });
  }
  return out;
}

// { sku: { cost, name, monthLabel, monthSort } } — chỉ giữ dòng MỚI NHẤT
// (theo monthSort) cho mỗi SKU.
function oemAppLoadLatestCostBySku_() {
  var bySku = {};
  oemAppLoadCostRows_().forEach(function (r) {
    var existing = bySku[r.sku];
    if (!existing || r.monthSort > existing.monthSort) bySku[r.sku] = r;
  });
  return bySku;
}

// Creator-only — giá vốn (+VAT) mới nhất cho mọi SKU đang có trong tab Cost,
// dùng để PriceApprovePanel hiện cột "Giá vốn (VAT)"/"LNG %". Số giá vốn thật
// không lộ ra role nào khác qua đường này.
function oemAppGetCostBySku_(token) {
  var user = oemAppRequireSession_(token);
  oemAppRequireCostViewRole_(user);
  var latest = oemAppLoadLatestCostBySku_();
  var out = {};
  Object.keys(latest).forEach(function (sku) {
    var c = latest[sku];
    out[sku] = {
      cost: c.cost,
      costWithVat: Math.round(c.cost * (1 + OEMAPP_COST_DEFAULT_VAT_)),
      monthLabel: c.monthLabel
    };
  });
  return { bySku: out, vatRate: OEMAPP_COST_DEFAULT_VAT_ };
}

// Admin/Creator — công cụ tính giá bán gợi ý theo % LNG mong muốn, KHÔNG bao
// giờ trả về số giá vốn thật (chỉ Creator mới xem giá vốn thật, qua
// oemAppGetCostBySku_) — Admin dùng được công cụ này mà không thấy giá vốn.
// margin = (price - costWithVat) / price  =>  price = costWithVat / (1 - margin)
function oemAppCalculateSuggestedPrice_(token, sku, targetMarginPct) {
  var user = oemAppRequireSession_(token);
  oemAppRequireCostCalcRole_(user);
  if (!sku) throw new Error('Thiếu mã SKU.');

  var entry = oemAppLoadLatestCostBySku_()[String(sku)];
  if (!entry) return { hasCost: false };

  var margin = Number(targetMarginPct) / 100;
  if (!(margin < 1)) throw new Error('% LNG mong muốn phải nhỏ hơn 100%.');

  var costWithVat = entry.cost * (1 + OEMAPP_COST_DEFAULT_VAT_);
  var suggestedPrice = Math.round(costWithVat / (1 - margin));
  return { hasCost: true, suggestedPriceWithVat: suggestedPrice, monthLabel: entry.monthLabel };
}

// Creator-only — nhập 1 lô giá vốn cho 1 tháng cụ thể (Creator tự chọn
// tháng khi upload, KHÔNG suy ra từ ngày hệ thống — file kế toán gửi
// thường là chốt của tháng trước). Upsert theo (SKU, Tháng) — tránh nhân đôi
// dòng nếu lỡ tải lại đúng tháng đó lần 2 (bài học từ SOP_Plan/Debt trước đó
// trong app này: mọi import lặp lại phải upsert, không được chỉ biết append).
function oemAppImportCostExcel_(token, monthLabel, rows) {
  var user = oemAppRequireSession_(token);
  oemAppRequireCostImportRole_(user);
  if (!monthLabel) throw new Error('Thiếu tháng giá vốn.');
  if (!rows || !rows.length) throw new Error('Không có dòng nào để nhập.');

  var sheet = oemAppGetCostSheet_();
  var lastRow = sheet.getLastRow();
  var dataRowCount = lastRow > 1 ? lastRow - 1 : 0;
  var block = dataRowCount ? sheet.getRange(2, 1, dataRowCount, 4).getValues() : [];

  var indexByKey = {};
  block.forEach(function (r, idx) { indexByKey[r[0] + '|' + r[3]] = idx; });

  var updatedCount = 0, addedCount = 0;

  rows.forEach(function (item) {
    if (!item || !item.sku) return;
    var key = String(item.sku) + '|' + monthLabel;
    var values = [item.sku, item.name || '', item.cost || 0, monthLabel];
    var idx = indexByKey[key];
    if (idx !== undefined) {
      block[idx] = values;
      updatedCount++;
    } else {
      indexByKey[key] = block.length;
      block.push(values);
      addedCount++;
    }
  });

  if (block.length) {
    sheet.getRange(2, 1, block.length, 4).setValues(block);
  }

  return { ok: true, monthLabel: monthLabel, updatedCount: updatedCount, addedCount: addedCount };
}
