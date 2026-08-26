/** Bảng giá bán — đề xuất giá lẻ/KM hàng loạt cho nhiều SKU, áp dụng CHUNG
 * (tab "Products") hoặc RIÊNG cho 1 khách hàng cụ thể (tab "Gia_KhachHang"),
 * Admin/Creator duyệt trước khi giá mới có hiệu lực.
 *
 * Tab "Gia_DeXuat" — tạo tay, tìm theo TÊN (như "Orders"/"SOP_Plan"), không
 * tự tạo, báo lỗi nếu thiếu. 1 dòng = 1 (Đợt đề xuất, SKU). Cột (1-indexed):
 *   A Mã đợt | B Người đề xuất | C Mã KH (BỎ TRỐNG = áp dụng chung cho mọi
 *   khách hàng; điền = giá riêng CHỈ cho khách đó) | D Ngày đề xuất |
 *   E Mã SKU | F Tên SP | G Giá lẻ hiện tại | H Giá KM hiện tại |
 *   I Giá lẻ ĐX | J Số lượng KM ĐX | K Giá KM ĐX | L % tăng/giảm |
 *   M Trạng thái | N Ngày hiệu lực | O Người duyệt | P Ngày duyệt | Q Ghi chú
 *
 * Cột L "% tăng/giảm" là CÔNG THỨC SỐNG trên Sheet (vd
 * =IFERROR((I4-G4)/G4,0)) — giống "Chênh" ở Plan_Thang — app KHÔNG BAO GIỜ
 * ghi vào cột này, kể cả khi ghi cả dòng (luôn ghi 2 khối cột tách rời,
 * A-K rồi M-Q, bỏ qua L).
 *
 * Không có khái niệm "kỳ" như SOP — mỗi lần Sale bấm Gửi Duyệt tạo 1 đợt mới
 * (Mã đợt mới), độc lập với các đợt trước — không upsert/merge vào đợt cũ.
 * Muốn sửa thì gửi đợt mới, Admin tự chọn duyệt đợt đúng hoặc từ chối đợt sai.
 *
 * Tab "Gia_KhachHang" (tạo tay, giá riêng theo khách — chỉ có nếu khách đó
 * từng được đề xuất giá riêng) — 1 dòng = 1 (Mã KH, Mã SKU). Cột (1-indexed):
 *   A Mã KH | B Mã SKU | C Giá lẻ | D Số lượng KM | E Giá KM |
 *   F Ngày hiệu lực | G Người duyệt | H Ngày duyệt
 */

// ---------- Tab "Gia_DeXuat" ----------

function oemAppGetPriceProposalSheet_() {
  var sheet = oemAppSS_().getSheetByName('Gia_DeXuat');
  if (!sheet) throw new Error('Không tìm thấy tab "Gia_DeXuat" trên Google Sheet.');
  return sheet;
}

function oemAppRequirePriceProposeRole_(user) {
  if (!['sale', 'admin', 'creator'].includes(user.role)) {
    throw new Error('Không có quyền đề xuất giá bán.');
  }
}

function oemAppRequirePriceApproveRole_(user) {
  if (!['admin', 'creator'].includes(user.role)) {
    throw new Error('Chỉ Admin/Creator mới có quyền duyệt bảng giá.');
  }
}

function oemAppPriceProposalSaleKey_(user) {
  return user.saleId || user.name;
}

function oemAppLoadPriceProposalRows_() {
  var sheet = oemAppGetPriceProposalSheet_();
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[4]) continue; // no SKU (col E) = blank row
    out.push({
      rowIndex: i + 1,
      batchId: String(r[0] || ''),
      sale: String(r[1] || ''),
      clientCode: String(r[2] || ''), // blank = áp dụng chung
      submittedAt: r[3] || '',
      sku: String(r[4] || ''),
      name: String(r[5] || ''),
      currentRetail: oemAppParseNum_(r[6]),
      currentPromo: oemAppParseNum_(r[7]),
      retailPropose: oemAppParseNum_(r[8]),
      promoQtyPropose: oemAppParseNum_(r[9]),
      promoPricePropose: oemAppParseNum_(r[10]),
      pctChange: r[11], // live Sheet formula — passed through read-only, never written back
      status: String(r[12] || ''),
      effectiveDate: r[13] || '',
      approvedBy: String(r[14] || ''),
      approvedAt: r[15] || '',
      note: String(r[16] || '')
    });
  }
  return out;
}

// ---------- Tab "Gia_KhachHang" (giá riêng theo khách) ----------

function oemAppGetClientPricingSheet_() {
  var sheet = oemAppSS_().getSheetByName('Gia_KhachHang');
  if (!sheet) throw new Error('Không tìm thấy tab "Gia_KhachHang" trên Google Sheet.');
  return sheet;
}

// { "MAKH|SKU": {rowIndex, clientCode, sku, retail, promoQty, promoPrice, effectiveDate} }
function oemAppLoadClientPricingMap_() {
  var sheet;
  try {
    sheet = oemAppGetClientPricingSheet_();
  } catch (e) {
    return {}; // Chưa ai đề xuất giá riêng cho khách nào — tab chưa tồn tại cũng không sao
  }
  var rows = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0] || !r[1]) continue;
    var key = String(r[0]).trim().toUpperCase() + '|' + String(r[1]).trim().toUpperCase();
    map[key] = {
      rowIndex: i + 1,
      clientCode: String(r[0]),
      sku: String(r[1]),
      retail: oemAppParseNum_(r[2]),
      promoQty: oemAppParseNum_(r[3]),
      promoPrice: oemAppParseNum_(r[4]),
      effectiveDate: r[5] || ''
    };
  }
  return map;
}

// Upsert theo (Mã KH, Mã SKU) — batched giống oemAppImportDebtExcel_, không
// phải ghi từng dòng. Tab phải được tạo tay từ trước (không tự tạo) vì đây
// là lần ghi ĐẦU TIÊN của app vào tab này — an toàn hơn để lỗi rõ ràng "chưa
// có tab" thay vì tự ý tạo 1 tab công nợ/giá mới mà người dùng chưa chuẩn bị.
function oemAppApplyClientPriceList_(clientCode, items, effectiveDate, approverName, approvedAtStr) {
  var sheet = oemAppGetClientPricingSheet_(); // throws rõ ràng nếu chưa tạo tab
  var existingMap = oemAppLoadClientPricingMap_();

  var lastRow = sheet.getLastRow();
  var existingCount = Math.max(0, lastRow - 1);
  var nextAppendRow = lastRow + 1;
  var appliedCount = 0;

  items.forEach(function (item) {
    var key = String(clientCode).trim().toUpperCase() + '|' + String(item.sku).trim().toUpperCase();
    var existing = existingMap[key];
    var values = [[clientCode, item.sku, item.retail || 0, item.promoQty || 0, item.promoPrice || 0, effectiveDate || '', approverName, approvedAtStr]];
    if (existing) {
      sheet.getRange(existing.rowIndex, 1, 1, 8).setValues(values);
    } else {
      sheet.getRange(nextAppendRow, 1, 1, 8).setValues(values);
      nextAppendRow++;
    }
    appliedCount++;
  });

  return appliedCount;
}

// Cho màn Đề Xuất: khi Sale chọn 1 khách hàng cụ thể, hiện đúng giá riêng
// (nếu đã có) của khách đó cho từng SKU thay vì giá chung — trước khi họ
// nhập số đề xuất, không phải chỉ biết sau khi Gửi.
function oemAppGetClientPriceOverrides_(token, clientCode) {
  oemAppRequireSession_(token);
  if (!clientCode) return { overrides: {} };
  var map = oemAppLoadClientPricingMap_();
  var prefix = String(clientCode).trim().toUpperCase() + '|';
  var out = {};
  Object.keys(map).forEach(function (key) {
    if (key.indexOf(prefix) !== 0) return;
    var v = map[key];
    out[v.sku] = { retail: v.retail, promoQty: v.promoQty, promoPrice: v.promoPrice };
  });
  return { overrides: out };
}

// ---------- Đề xuất / duyệt ----------

// Sale gửi 1 đợt đề xuất mới — mỗi lần gọi luôn APPEND, không upsert vào đợt
// cũ (xem ghi chú đầu file). Giá hiện tại được snapshot NGAY LÚC GỬI (từ
// Gia_KhachHang nếu item.clientCode có + đã có giá riêng, ngược lại từ
// Products), không phải lúc Sale mở màn hình — tránh lệch nếu giá gốc đổi
// giữa chừng trước khi Sale bấm Gửi.
//
// Ghi thành 2 khối cột LIỀN NHAU (A-K, rồi M-Q) thay vì appendRow từng dòng —
// appendRow sẽ ghi cả cột L ("% tăng/giảm", công thức sống trên Sheet) bằng
// chuỗi rỗng và xoá mất công thức của chính dòng mới đó, giống lỗi đã gặp với
// "Chênh" ở Plan_Thang và "Vượt hạn mức" ở tab Debt.
function oemAppSubmitPriceProposal_(token, rows) {
  var user = oemAppRequireSession_(token);
  oemAppRequirePriceProposeRole_(user);
  if (!rows || !rows.length) throw new Error('Không có dòng nào để gửi.');

  var catalog = oemAppLoadMaterialCatalog_().bySku;
  var clientPricing = oemAppLoadClientPricingMap_();
  var sheet = oemAppGetPriceProposalSheet_();
  var saleKey = oemAppPriceProposalSaleKey_(user);
  var batchId = Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 4);
  var now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');

  var blockAK = [];
  var blockMQ = [];
  rows.forEach(function (item) {
    if (!item || !item.sku) return;
    var entry = catalog[String(item.sku)];
    if (!entry) return; // SKU không có trong Products — bỏ qua, không tự tạo mới ở đây

    var clientCode = item.clientCode ? String(item.clientCode).trim() : '';
    var currentRetail = entry.suggestedPrice || 0;
    var currentPromo = entry.promoPrice || 0;
    if (clientCode) {
      var key = clientCode.toUpperCase() + '|' + String(item.sku).trim().toUpperCase();
      var override = clientPricing[key];
      // Chưa có giá riêng cho khách này thì lấy giá chung làm mốc so sánh —
      // không có nghĩa là khách đang trả đúng giá chung, chỉ là baseline hiển thị.
      if (override) { currentRetail = override.retail; currentPromo = override.promoPrice; }
    }

    blockAK.push([
      batchId, saleKey, clientCode, now, item.sku, entry.name || '',
      currentRetail, currentPromo,
      item.retail || 0, item.promoQty || 0, item.promoPrice || 0
    ]);
    blockMQ.push(['Chờ duyệt', '', '', '', '']);
  });

  if (!blockAK.length) throw new Error('Không có mã SKU hợp lệ nào trong danh mục Products để lưu.');

  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, blockAK.length, 11).setValues(blockAK);
  sheet.getRange(startRow, 13, blockMQ.length, 5).setValues(blockMQ);

  return { ok: true, batchId: batchId, savedCount: blockAK.length };
}

// Admin/Creator xem toàn bộ các dòng đang "Chờ duyệt" (mọi đợt, mọi Sale,
// cả giá chung lẫn giá riêng theo khách) — frontend tự nhóm theo Mã đợt.
function oemAppGetPendingPriceProposals_(token) {
  var user = oemAppRequireSession_(token);
  oemAppRequirePriceApproveRole_(user);
  var rows = oemAppLoadPriceProposalRows_().filter(function (r) { return r.status === 'Chờ duyệt'; });
  return { rows: rows };
}

// Duyệt 1 đợt — ghi giá mới NGAY (không có cơ chế hẹn giờ áp dụng sau),
// "Ngày hiệu lực" chỉ là nhãn ghi lại mốc giá này có hiệu lực từ khi nào cho
// mục đích đối chiếu/báo cáo. Dòng có Mã KH -> ghi vào Gia_KhachHang (giá
// riêng); dòng không có Mã KH -> ghi vào Products (giá chung). Một đợt có
// thể trộn cả 2 loại nếu Sale gửi chung 1 lần (hiếm, nhưng xử lý đúng thay vì
// giả định 1 đợt chỉ có 1 loại). overrideRows (tuỳ chọn): Admin sửa số trước
// khi duyệt, giống cơ chế đã dùng ở duyệt SOP.
function oemAppApprovePriceBatch_(token, batchId, effectiveDate, overrideRows) {
  var user = oemAppRequireSession_(token);
  oemAppRequirePriceApproveRole_(user);
  if (!batchId) throw new Error('Thiếu mã đợt.');

  var sheet = oemAppGetPriceProposalSheet_();
  var allRows = oemAppLoadPriceProposalRows_();
  var batchRows = allRows.filter(function (r) { return r.batchId === batchId && r.status === 'Chờ duyệt'; });
  if (!batchRows.length) throw new Error('Không tìm thấy đợt đang chờ duyệt với mã này.');

  var overrideBySku = {};
  (overrideRows || []).forEach(function (o) {
    if (o && o.sku) overrideBySku[o.sku] = o;
  });

  var now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');
  var resolved = batchRows.map(function (r) {
    var o = overrideBySku[r.sku];
    return {
      sku: r.sku,
      clientCode: r.clientCode,
      retail: o ? Number(o.retail) || 0 : r.retailPropose,
      promoPrice: o ? Number(o.promoPrice) || 0 : r.promoPricePropose,
      promoQty: o ? Number(o.promoQty) || 0 : r.promoQtyPropose
    };
  });

  var generalItems = resolved.filter(function (r) { return !r.clientCode; });
  var byClient = {};
  resolved.forEach(function (r) {
    if (!r.clientCode) return;
    if (!byClient[r.clientCode]) byClient[r.clientCode] = [];
    byClient[r.clientCode].push(r);
  });

  var appliedCount = 0;
  if (generalItems.length) {
    generalItems.forEach(function (item) { item.effectiveDate = effectiveDate || ''; });
    appliedCount += oemAppApplyPriceListToProducts_(generalItems);
  }
  Object.keys(byClient).forEach(function (code) {
    appliedCount += oemAppApplyClientPriceList_(code, byClient[code], effectiveDate, user.name, now);
  });

  batchRows.forEach(function (r) {
    // Cột L (% tăng/giảm) bị bỏ qua có chủ đích — xem ghi chú đầu file.
    sheet.getRange(r.rowIndex, 13, 1, 1).setValue('Đã duyệt');
    sheet.getRange(r.rowIndex, 14, 1, 3).setValues([[effectiveDate || '', user.name, now]]);
  });

  return { ok: true, appliedCount: appliedCount, effectiveDate: effectiveDate || '' };
}

function oemAppRejectPriceBatch_(token, batchId, note) {
  var user = oemAppRequireSession_(token);
  oemAppRequirePriceApproveRole_(user);
  if (!batchId) throw new Error('Thiếu mã đợt.');

  var sheet = oemAppGetPriceProposalSheet_();
  var allRows = oemAppLoadPriceProposalRows_();
  var batchRows = allRows.filter(function (r) { return r.batchId === batchId && r.status === 'Chờ duyệt'; });
  if (!batchRows.length) throw new Error('Không tìm thấy đợt đang chờ duyệt với mã này.');

  var now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');
  batchRows.forEach(function (r) {
    sheet.getRange(r.rowIndex, 13, 1, 1).setValue('Từ chối');
    sheet.getRange(r.rowIndex, 15, 1, 2).setValues([[user.name, now]]);
    if (note) sheet.getRange(r.rowIndex, 17, 1, 1).setValue(note);
  });

  return { ok: true, rejectedCount: batchRows.length };
}
