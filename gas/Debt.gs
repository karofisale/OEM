/** Customer debt (công nợ) — tab "Debt".
 *
 * Layout confirmed via oemAppDebtDiag_ on 2026-08-25 (NOT the same layout as
 * every other tab in this app, which all start their header at row 1):
 *   Row 1: a stray leftover value in column G, ignored.
 *   Row 2: blank spacer.
 *   Row 3: real header — Mã KH | MÃ SỐ CŨ | Tên Khách hàng | PIC | Hạn mức |
 *          Vượt hạn mức | Số dư công nợ.
 *   Row 4+: data.
 *
 * Column F "Vượt hạn mức" is a SINGLE open-ended =ARRAYFORMULA(G4:G-E4:E)
 * living in cell F4 — it is NOT a per-row formula, it spills its result down
 * the whole column from a single anchor cell. Writing ANYTHING into column F
 * on ANY row (even '' from an appendRow call) can break the spill for the
 * entire column below it — this app NEVER writes it, on any row. Column B
 * "MÃ SỐ CŨ" (legacy numeric code) is only ever written for a brand-new
 * customer row (the real import file does carry it, see DebtImportPanel.jsx)
 * — an EXISTING row's legacy code is left exactly as-is, never overwritten,
 * so a manual correction there can't be clobbered by a later import. Same
 * precaution as Plan_Thang's "Chênh" column (see SalesData.gs / SETUP.md).
 *
 * This tab is ALSO written by the separate `cong-no-oem` skill/project (see
 * SETUP.md) — this app's import is a second, independent write path onto the
 * same tab, by explicit user decision (2026-08-25). Restricted to
 * admin/creator, same tier as approving a SOP/sales plan batch.
 */

var OEMAPP_DEBT_HEADER_ROW_ = 3;
var OEMAPP_DEBT_DATA_START_ROW_ = 4;

function oemAppGetDebtSheet_() {
  var sheet = oemAppSS_().getSheetByName('Debt');
  if (!sheet) throw new Error('Không tìm thấy tab "Debt" trên Google Sheet.');
  return sheet;
}

function oemAppRequireDebtImportRole_(user) {
  if (!['admin', 'creator'].includes(user.role)) {
    throw new Error('Chỉ Admin/Creator mới có quyền nhập công nợ.');
  }
}

// rowIndex kept (1-indexed, physical sheet row) so the importer can target
// narrow updates precisely without re-scanning the sheet per item.
function oemAppLoadDebtRows_() {
  var sheet = oemAppGetDebtSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < OEMAPP_DEBT_DATA_START_ROW_) return [];

  var count = lastRow - OEMAPP_DEBT_DATA_START_ROW_ + 1;
  var values = sheet.getRange(OEMAPP_DEBT_DATA_START_ROW_, 1, count, 7).getValues();

  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue; // no Mã KH = blank row
    out.push({
      rowIndex: OEMAPP_DEBT_DATA_START_ROW_ + i,
      code: String(r[0] || ''),
      oldCode: String(r[1] || ''),
      name: String(r[2] || ''),
      pic: String(r[3] || ''),
      creditLimit: oemAppParseNum_(r[4]),
      overLimit: oemAppParseNum_(r[5]),
      balance: oemAppParseNum_(r[6])
    });
  }
  return out;
}

function oemAppGetDebtView_(token) {
  var user = oemAppRequireSession_(token);
  var scope = oemAppScopeOf_(user);
  var rows = oemAppLoadDebtRows_().filter(function (r) {
    return scope.all || oemAppMatchesSale_(r.pic, scope);
  });
  return { rows: rows };
}

// Mã KH -> Sale, straight from tab "Clients" (the authoritative source of
// PIC assignment for the whole app — see oemAppScopeOf_/oemAppMatchesSale_).
// The weekly debt report's own "KINH DOANH QL" column is copy-pasted by hand
// and can carry stale/wrong labels for a specific customer (eg. one row
// showing "CT Tecom" — the customer's own name — instead of an actual Sale);
// Clients is trusted over whatever the uploaded file says whenever the code
// is known there, so a one-off bad label in the file can't silently
// reassign a customer's PIC in tab "Debt".
function oemAppDebtPicByCode_() {
  var map = {};
  oemAppLoadClients_().forEach(function (c) {
    var key = String(c.codeSearch || '').trim().toUpperCase();
    if (key && c.sale) map[key] = c.sale;
  });
  return map;
}

// Bulk upsert by Mã KH (trimmed, case-insensitive match — the codeSearch text
// code convention shared with Clients/Plan2026/Plan_Thang everywhere else in
// this app). Touches columns A (Mã KH), C (Tên KH), D (PIC), E (Hạn mức), G
// (Số dư công nợ) for every row, plus B (Mã Số Cũ) for brand-new rows only —
// see file header comment for why B is append-only and F is never written.
// Column-batched (a handful of setValues calls total, never one per row) so
// a few hundred rows imports in one round trip instead of hundreds.
//
// PIC comes from Clients when the code is known there (oemAppDebtPicByCode_);
// otherwise falls back to whatever the file itself says (may be blank on a
// simplified upload with no PIC column). An existing row's PIC is left
// untouched only when NEITHER source has an answer; a brand-new customer
// with no answer from either gets a blank PIC (assigned to a Sale by hand
// later), never a false attribution.
function oemAppImportDebtExcel_(token, rows) {
  var user = oemAppRequireSession_(token);
  oemAppRequireDebtImportRole_(user);
  if (!rows || !rows.length) throw new Error('Không có dòng nào để nhập.');

  var picByCode = oemAppDebtPicByCode_();

  // Dedup by Mã KH — last occurrence in the uploaded file wins — so a repeated
  // code can't collide between the "update existing" and "append new" arrays.
  var byCode = {};
  var order = [];
  rows.forEach(function (item) {
    if (!item || !item.code) return;
    var key = String(item.code).trim().toUpperCase();
    if (!byCode[key]) order.push(key);
    byCode[key] = item;
  });

  var sheet = oemAppGetDebtSheet_();
  var existing = oemAppLoadDebtRows_();
  var indexByCode = {};
  existing.forEach(function (r, i) { indexByCode[r.code.trim().toUpperCase()] = i; });

  var colA = existing.map(function (r) { return r.code; });
  var colC = existing.map(function (r) { return r.name; });
  var colD = existing.map(function (r) { return r.pic; });
  var colE = existing.map(function (r) { return r.creditLimit; });
  var colG = existing.map(function (r) { return r.balance; });

  var newColA = [], newColB = [], newColC = [], newColD = [], newColE = [], newColG = [];
  var updatedCount = 0, addedCount = 0;

  order.forEach(function (key) {
    var item = byCode[key];
    var name = item.name || '';
    var pic = picByCode[key] || item.pic || '';
    var creditLimit = Number(item.creditLimit) || 0;
    var balance = Number(item.balance) || 0;
    var i = indexByCode[key];

    if (i !== undefined) {
      colA[i] = item.code;
      colC[i] = name;
      if (pic) colD[i] = pic;
      colE[i] = creditLimit;
      colG[i] = balance;
      updatedCount++;
    } else {
      newColA.push(item.code);
      // "Mã Số Cũ" only makes sense to fill in for a customer that doesn't
      // exist yet — an existing row's legacy code is never touched above, so
      // this can't silently overwrite a manually-corrected one.
      newColB.push(item.oldCode || '');
      newColC.push(name);
      newColD.push(pic);
      newColE.push(creditLimit);
      newColG.push(balance);
      addedCount++;
    }
  });

  var toColumn = function (arr) { return arr.map(function (v) { return [v]; }); };

  if (colA.length) {
    sheet.getRange(OEMAPP_DEBT_DATA_START_ROW_, 1, colA.length, 1).setValues(toColumn(colA));
    sheet.getRange(OEMAPP_DEBT_DATA_START_ROW_, 3, colC.length, 1).setValues(toColumn(colC));
    sheet.getRange(OEMAPP_DEBT_DATA_START_ROW_, 4, colD.length, 1).setValues(toColumn(colD));
    sheet.getRange(OEMAPP_DEBT_DATA_START_ROW_, 5, colE.length, 1).setValues(toColumn(colE));
    sheet.getRange(OEMAPP_DEBT_DATA_START_ROW_, 7, colG.length, 1).setValues(toColumn(colG));
  }

  if (newColA.length) {
    var appendAt = OEMAPP_DEBT_DATA_START_ROW_ + colA.length;
    sheet.getRange(appendAt, 1, newColA.length, 1).setValues(toColumn(newColA));
    sheet.getRange(appendAt, 2, newColB.length, 1).setValues(toColumn(newColB));
    sheet.getRange(appendAt, 3, newColC.length, 1).setValues(toColumn(newColC));
    sheet.getRange(appendAt, 4, newColD.length, 1).setValues(toColumn(newColD));
    sheet.getRange(appendAt, 5, newColE.length, 1).setValues(toColumn(newColE));
    sheet.getRange(appendAt, 7, newColG.length, 1).setValues(toColumn(newColG));
  }

  return { ok: true, updatedCount: updatedCount, addedCount: addedCount };
}

// ---------- Diagnostics (no session required — same tier as oemAppSopDiag_) ----------
// Structural-only (headers, row/col count) — never returns real debt figures.
function oemAppDebtDiag_() {
  var out = {};
  try {
    var sheet = oemAppGetDebtSheet_();
    out.found = true;
    out.lastRow = sheet.getLastRow();
    out.lastCol = sheet.getLastColumn();
    out.headers = sheet.getRange(OEMAPP_DEBT_HEADER_ROW_, 1, 1, out.lastCol).getValues()[0];
    out.dataRowCount = Math.max(0, out.lastRow - OEMAPP_DEBT_DATA_START_ROW_ + 1);
  } catch (e) {
    out.found = false;
    out.error = e.message;
  }
  return out;
}
