/** AI Order Agent -> SAP staging tab "Orders" (created by hand in the Sheet, found by name). */

// AI Order Agent "learning" loop: every order line saved to the Orders tab carries
// an "Update alias" value whenever Sale used a free-text term the matcher didn't
// already know for that SKU (see oemAppSaveOrder_). Reading it back here and handing
// it to the frontend as material.learnedAliases lets future free-text orders match
// correctly on the first try instead of repeating the same manual SKU correction.
function oemAppLoadOrderAliasHints_() {
  var map = {};
  var sheet;
  try {
    sheet = oemAppGetOrdersSheet_();
  } catch (e) {
    return map; // "Orders" tab not present yet — no hints, not fatal
  }
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var sku = String(rows[i][1] || '');
    var alias = String(rows[i][11] || '').trim();
    if (!sku || !alias) continue;
    if (!map[sku]) map[sku] = [];
    if (map[sku].indexOf(alias) === -1 && map[sku].length < 8) map[sku].push(alias);
  }
  return map;
}

// There is no dedicated product-catalogue tab in the ORIGINAL Sheet — "Materials"
// there is a month-by-SKU pivot, not a catalogue — so materials are still derived
// from transactions primarily. Alias/Nhóm SP/Giá bán đề xuất edits (added
// 2026-08-19, "Sửa" button for admin) now persist on a small sheet this app
// owns and auto-creates — see oemAppGetMaterialCatalogSheet_ — whose values
// override the transaction-derived alias/group per SKU, and which also seeds
// brand-new SKUs that have no transaction history yet (added via "Thêm Sản
// Phẩm Mới", previously local-only/lost-on-refresh).

// ---------- Orders (AI Order Agent → SAP staging tab) ----------
// "Orders" is a flat order-lines tab created directly in the Sheet by the user
// (not tracked here by gid, unlike the tabs above — its columns are: STT, Mã VT,
// Tên Vật Tư, Số Lượng, Đơn Giá, Thành Tiền, Mã tham chiếu SAP SO, Mã KH, Mã KH
// Chữ, Ngày tạo, PIC, Update alias).

function oemAppGetOrdersSheet_() {
  var sheet = SpreadsheetApp.openById(OEMAPP_SHEET_ID).getSheetByName('Orders');
  if (!sheet) throw new Error('Không tìm thấy tab "Orders" trên Google Sheet.');
  return sheet;
}


function oemAppSaveOrder_(token, order) {
  var user = oemAppRequireSession_(token);
  if (!order || !order.items || !order.items.length) {
    throw new Error('Đơn hàng trống, không có gì để lưu.');
  }
  var sheet = oemAppGetOrdersSheet_();
  var lastRow = sheet.getLastRow();
  var dataRowCount = Math.max(0, lastRow - 1); // row 1 = header
  var now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');

  var rows = order.items.map(function (item, idx) {
    return [
      dataRowCount + idx + 1,
      item.sku || '',
      item.name || '',
      item.qty || 0,
      item.price || 0,
      Math.round(item.total || 0),
      order.orderNo || '',
      order.client ? (order.client.code || '') : '',
      order.client ? (order.client.codeSearch || '') : '',
      now,
      user.name,
      item.matchedAlias || ''
    ];
  });

  sheet.getRange(lastRow + 1, 1, rows.length, 12).setValues(rows);
  return { ok: true, savedCount: rows.length };
}


function oemAppGetOrders_(token) {
  oemAppRequireSession_(token); // role-based filtering (Sale sees own PIC) stays client-side, same as bootstrap
  var sheet = oemAppGetOrdersSheet_();
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[1] && !r[2]) continue; // skip blank rows
    out.push({
      rowIndex: i + 1, // 1-based real sheet row — used by oemAppUpdateOrderLine_
      stt: r[0],
      sku: String(r[1] || ''),
      name: String(r[2] || ''),
      qty: oemAppParseNum_(r[3]),
      price: oemAppParseNum_(r[4]),
      total: oemAppParseNum_(r[5]),
      orderNo: String(r[6] || ''),
      clientCode: String(r[7] || ''),
      clientCodeSearch: String(r[8] || ''),
      createdAt: oemAppNormalizeDateStr_(r[9]) || String(r[9] || ''),
      pic: String(r[10] || ''),
      updateAlias: String(r[11] || '')
    });
  }
  return out;
}


function oemAppUpdateOrderLine_(token, rowIndex, updates) {
  oemAppRequireSession_(token);
  var sheet = oemAppGetOrdersSheet_();
  var idx = parseInt(rowIndex, 10);
  if (!idx || idx < 2) throw new Error('rowIndex không hợp lệ.');

  var existing = sheet.getRange(idx, 1, 1, 12).getValues()[0];
  var sku = updates.sku != null ? updates.sku : existing[1];
  var name = updates.name != null ? updates.name : existing[2];
  var qty = updates.qty != null ? updates.qty : existing[3];
  var price = updates.price != null ? updates.price : existing[4];
  var total = updates.total != null ? updates.total : (qty * price);

  sheet.getRange(idx, 2, 1, 5).setValues([[sku, name, qty, price, Math.round(total)]]);

  // Mã KH / Mã KH Chữ (columns 8-9) are optional — only touched when the caller
  // is correcting a wrongly-detected client on this line (see AI agent client match fix).
  if (updates.clientCode != null || updates.clientCodeSearch != null) {
    var clientCode = updates.clientCode != null ? updates.clientCode : existing[7];
    var clientCodeSearch = updates.clientCodeSearch != null ? updates.clientCodeSearch : existing[8];
    sheet.getRange(idx, 8, 1, 2).setValues([[clientCode, clientCodeSearch]]);
  }

  return { ok: true };
}

// Insert an accompanying/forgotten line next to an existing one (Sale reviewing a
// saved order realizes a "bộ sản phẩm" needs another SKU alongside it). The new row
// inherits Mã tham chiếu SAP SO / Mã KH / Mã KH Chữ from its neighbor so it stays
// grouped under the same order in the review UI; item fields start blank/zero and
// get filled in via the same inline-edit + updateOrderLine flow as any other row.

// Insert an accompanying/forgotten line next to an existing one (Sale reviewing a
// saved order realizes a "bộ sản phẩm" needs another SKU alongside it). The new row
// inherits Mã tham chiếu SAP SO / Mã KH / Mã KH Chữ from its neighbor so it stays
// grouped under the same order in the review UI; item fields start blank/zero and
// get filled in via the same inline-edit + updateOrderLine flow as any other row.
function oemAppInsertOrderLine_(token, refRowIndex, position, item) {
  var user = oemAppRequireSession_(token);
  var sheet = oemAppGetOrdersSheet_();
  var idx = parseInt(refRowIndex, 10);
  if (!idx || idx < 2) throw new Error('rowIndex không hợp lệ.');

  var refRow = sheet.getRange(idx, 1, 1, 12).getValues()[0];
  var insertAt = position === 'above' ? idx : idx + 1;
  sheet.insertRowBefore(insertAt);

  var now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');
  item = item || {};
  sheet.getRange(insertAt, 1, 1, 12).setValues([[
    '',
    item.sku || '',
    item.name || '',
    item.qty || 0,
    item.price || 0,
    Math.round((item.qty || 0) * (item.price || 0)),
    refRow[6] || '',
    refRow[7] || '',
    refRow[8] || '',
    now,
    user.name,
    ''
  ]]);
  return { ok: true, insertedRowIndex: insertAt };
}


function oemAppDeleteOrderLine_(token, rowIndex) {
  oemAppRequireSession_(token);
  var sheet = oemAppGetOrdersSheet_();
  var idx = parseInt(rowIndex, 10);
  if (!idx || idx < 2) throw new Error('rowIndex không hợp lệ.');
  sheet.deleteRow(idx);
  return { ok: true };
}

// Deletes every line of one order (all rows sharing the same Mã tham chiếu SAP SO) —
// for the trùng/nhầm-đơn case, admin/creator only (a single-line delete is already
// available to sale/admin via oemAppDeleteOrderLine_, this is the more destructive
// whole-order version). Rows are removed bottom-to-top so earlier row indices in the
// same pass stay valid as later rows are deleted.

// Deletes every line of one order (all rows sharing the same Mã tham chiếu SAP SO) —
// for the trùng/nhầm-đơn case, admin/creator only (a single-line delete is already
// available to sale/admin via oemAppDeleteOrderLine_, this is the more destructive
// whole-order version). Rows are removed bottom-to-top so earlier row indices in the
// same pass stay valid as later rows are deleted.
function oemAppDeleteOrder_(token, orderNo) {
  var user = oemAppRequireSession_(token);
  if (user.role !== 'admin' && user.role !== 'creator') {
    throw new Error('Chỉ Admin mới có quyền xóa cả đơn hàng.');
  }
  var sheet = oemAppGetOrdersSheet_();
  var rows = sheet.getDataRange().getValues();
  var rowsToDelete = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][6]) === String(orderNo)) rowsToDelete.push(i + 1);
  }
  if (!rowsToDelete.length) throw new Error('Không tìm thấy đơn hàng ' + orderNo + ' trong tab Orders.');
  rowsToDelete.sort(function (a, b) { return b - a; });
  rowsToDelete.forEach(function (r) { sheet.deleteRow(r); });
  return { ok: true, deletedCount: rowsToDelete.length };
}

// ---------- Writers ----------
// Both are plain appendRow — never overwrite/rewrite existing rows — to keep
// this safe against the live production data in this Sheet.
