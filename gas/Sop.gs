/** SOP (Sales & Operations Plan) — monthly per-SKU quantity forecast.
 *
 * Two-stage flow (added 2026-08-22): each Sale submits a draft (tab
 * "SOP_Plan", one row per Sale+SKU+period) for the next 4 months; Admin/
 * Creator reviews the combined total across every Sale for that period and
 * approves it in one action, which aggregates by SKU into tab "SOP" — the
 * read-facing forecast used for the revenue summary and the MRP/SAP export.
 *
 * Both tabs are created by hand in the Sheet, same precedent as "Orders"/
 * "Products" — found by name, not gid, never auto-created.
 */

// SOP_Plan columns (1-indexed): Ky, Sale, Ma SKU, SL T+1, SL T+2, SL T+3,
// SL T+4, Trang thai, Ngay gui, Nguoi duyet, Ngay duyet.
function oemAppGetSopPlanSheet_() {
  var sheet = oemAppSS_().getSheetByName('SOP_Plan');
  if (!sheet) throw new Error('Không tìm thấy tab "SOP_Plan" trên Google Sheet.');
  return sheet;
}

// SOP columns (1-indexed): Ma, Ten SP, Gia ban, SL T+1..T+4 (header text carries
// the real month label, eg "SL T09-2026" — written by oemAppApproveSop_).
function oemAppGetSopSheet_() {
  var sheet = oemAppSS_().getSheetByName('SOP');
  if (!sheet) throw new Error('Không tìm thấy tab "SOP" trên Google Sheet.');
  return sheet;
}

// ---------- Period (anchor month) helpers ----------
// A period is keyed by its first month, "yyyy-MM" (eg "2026-09"), covering
// that month plus the next 3. Kept as yyyy-MM internally (plain arithmetic,
// no leading-zero/string-sort traps); rendered as "T09-2026" — same style as
// the rest of the app (see src/utils/period.js) — for anything a human reads.

function oemAppSopFormatYM_(year, month) {
  return year + '-' + (month < 10 ? '0' + month : String(month));
}

function oemAppSopParseYM_(ym) {
  var parts = String(ym || '').split('-');
  return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) };
}

function oemAppSopAddMonths_(ym, delta) {
  var p = oemAppSopParseYM_(ym);
  var totalMonths = (p.year * 12 + (p.month - 1)) + delta;
  var year = Math.floor(totalMonths / 12);
  var month = (totalMonths % 12) + 1;
  return oemAppSopFormatYM_(year, month);
}

function oemAppSopLabel_(ym) {
  var p = oemAppSopParseYM_(ym);
  if (!p.year || !p.month) return String(ym || '');
  return 'T' + (p.month < 10 ? '0' + p.month : p.month) + '-' + p.year;
}

// The period a Sale opening the planning screen today should fill in: always
// the calendar month AFTER the current one. Computed here — not in the
// frontend — so a submission and its later approval can never disagree about
// which period "next month" meant, even if entry slips into early next month.
function oemAppSopCurrentAnchor_() {
  var now = new Date();
  var tz = 'GMT+7';
  var year = parseInt(Utilities.formatDate(now, tz, 'yyyy'), 10);
  var month = parseInt(Utilities.formatDate(now, tz, 'MM'), 10);
  return oemAppSopAddMonths_(oemAppSopFormatYM_(year, month), 1);
}

function oemAppSopPeriodMonths_(anchor) {
  return [anchor, oemAppSopAddMonths_(anchor, 1), oemAppSopAddMonths_(anchor, 2), oemAppSopAddMonths_(anchor, 3)];
}

// ---------- SOP_Plan (per-Sale draft/approved detail) ----------

function oemAppLoadSopPlanRows_() {
  var sheet = oemAppGetSopPlanSheet_();
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[2]) continue; // no SKU = blank row
    out.push({
      rowIndex: i + 1,
      period: String(r[0] || ''),
      sale: String(r[1] || ''),
      sku: String(r[2] || ''),
      sl: [oemAppParseNum_(r[3]), oemAppParseNum_(r[4]), oemAppParseNum_(r[5]), oemAppParseNum_(r[6])],
      status: String(r[7] || ''),
      submittedAt: r[8] || '',
      approvedBy: String(r[9] || ''),
      approvedAt: r[10] || ''
    });
  }
  return out;
}

// This Sale's identity for SOP_Plan attribution — a real Sale uses saleId
// (the same key oemAppMatchesSale_ uses everywhere else for revenue scoping);
// Admin/Creator have no saleId, so fall back to their login name rather than
// refusing to let them plan.
function oemAppSopSaleKey_(user) {
  return user.saleId || user.name;
}

// What a Sale sees before they start filling in the table: the period they're
// about to plan for (the frontend shows this in a "xác nhận kỳ" banner before
// unlocking the table), whatever they already typed and submitted this period
// but isn't approved yet (so reopening the screen doesn't lose it), last
// month's APPROVED qty per SKU (the ">0" default filter), and — since 3 of
// the 4 new months were already part of whatever this Sale last got
// approved — a carry-forward value per SKU for each of the 4 new months, so
// the table opens pre-filled for editing instead of blank (only a genuinely
// new month, normally T+4, has nothing to carry forward).
function oemAppGetSopPlanningContext_(token) {
  var user = oemAppRequireSession_(token);
  var saleKey = oemAppSopSaleKey_(user);
  var anchor = oemAppSopCurrentAnchor_();
  var priorMonth = oemAppSopAddMonths_(anchor, -1);
  var newMonths = oemAppSopPeriodMonths_(anchor);

  var allRows = oemAppLoadSopPlanRows_();
  var myDraft = [];

  // sku -> { monthKey: { value, rowIndex } }, built from EVERY approved row
  // this Sale has ever had, across every period — not just the immediately
  // preceding one — so a gap (a month nobody submitted a period for) still
  // carries forward from whichever approval last covered it. Keyed by
  // rowIndex (physical sheet position), NOT by parsing "Ngày duyệt" — that
  // column is text "dd/MM/yyyy HH:mm", which `new Date(...)` silently returns
  // NaN for in V8/Apps Script. Rows are only ever appended, never reordered,
  // so a later real-world approval always lands at a higher rowIndex.
  var approvedGrid = {};

  allRows.forEach(function (row) {
    if (row.sale !== saleKey) return;

    if (row.period === anchor && row.status !== 'Đã duyệt') {
      myDraft.push({ sku: row.sku, sl1: row.sl[0], sl2: row.sl[1], sl3: row.sl[2], sl4: row.sl[3] });
    }

    if (row.status === 'Đã duyệt') {
      var rowMonths = oemAppSopPeriodMonths_(row.period);
      if (!approvedGrid[row.sku]) approvedGrid[row.sku] = {};
      var grid = approvedGrid[row.sku];
      rowMonths.forEach(function (m, i) {
        if (!grid[m] || row.rowIndex > grid[m].rowIndex) {
          grid[m] = { value: row.sl[i], rowIndex: row.rowIndex };
        }
      });
    }
  });

  var priorApproved = {};
  var carryForward = {};
  Object.keys(approvedGrid).forEach(function (sku) {
    var grid = approvedGrid[sku];
    if (grid[priorMonth]) priorApproved[sku] = grid[priorMonth].value;
    carryForward[sku] = newMonths.map(function (m) { return grid[m] ? grid[m].value : 0; });
  });

  return {
    anchor: anchor,
    monthLabels: newMonths.map(oemAppSopLabel_),
    myDraft: myDraft,
    priorApprovedBySku: priorApproved,
    carryForwardBySku: carryForward
  };
}

// Bulk save — Sale fills in the whole filtered table and submits once. Each
// row upserts against THIS Sale's own rows for THIS period only (an approved
// row from a past period, or another Sale's row, is never touched here), so
// resubmitting before approval overwrites cleanly instead of duplicating.
function oemAppSubmitSopDraft_(token, anchor, rows) {
  var user = oemAppRequireSession_(token);
  if (!['sale', 'admin', 'creator'].includes(user.role)) {
    throw new Error('Không có quyền lập kế hoạch SOP.');
  }
  if (!anchor) throw new Error('Thiếu kỳ kế hoạch.');
  if (!rows || !rows.length) throw new Error('Không có dòng nào để lưu.');

  var saleKey = oemAppSopSaleKey_(user);
  var sheet = oemAppGetSopPlanSheet_();
  var existing = sheet.getDataRange().getValues();

  var rowIndexBySku = {};
  for (var i = 1; i < existing.length; i++) {
    var r = existing[i];
    if (String(r[0]) === String(anchor) && String(r[1]) === saleKey) {
      rowIndexBySku[String(r[2])] = i + 1;
    }
  }

  var now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');
  rows.forEach(function (item) {
    if (!item || !item.sku) return;
    var values = [
      anchor, saleKey, item.sku,
      item.sl1 || 0, item.sl2 || 0, item.sl3 || 0, item.sl4 || 0,
      'Chờ duyệt', now, '', ''
    ];
    var rowIndex = rowIndexBySku[item.sku];
    if (rowIndex) {
      sheet.getRange(rowIndex, 1, 1, 11).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
  });

  return { ok: true, savedCount: rows.length };
}

// ---------- Aggregation (shared by the pre-approval preview and the real approve) ----------

function oemAppAggregateSopPeriod_(anchor) {
  var catalog = oemAppLoadMaterialCatalog_().bySku;
  var rows = oemAppLoadSopPlanRows_().filter(function (r) {
    return r.period === anchor && r.status === 'Chờ duyệt';
  });

  var bySku = {};
  var order = [];
  rows.forEach(function (r) {
    if (!bySku[r.sku]) { bySku[r.sku] = { sl: [0, 0, 0, 0], sales: {} }; order.push(r.sku); }
    var acc = bySku[r.sku];
    for (var i = 0; i < 4; i++) acc.sl[i] += r.sl[i];
    var lineTotal = r.sl.reduce(function (a, b) { return a + b; }, 0);
    acc.sales[r.sale] = (acc.sales[r.sale] || 0) + lineTotal;
  });

  var months = oemAppSopPeriodMonths_(anchor);
  var result = order.map(function (sku) {
    var entry = catalog[sku] || {};
    return {
      sku: sku,
      name: entry.name || sku,
      price: entry.suggestedPrice || 0,
      sl: bySku[sku].sl,
      contributors: Object.keys(bySku[sku].sales)
    };
  });

  return { rows: result, monthLabels: months.map(oemAppSopLabel_), pendingCount: rows.length };
}

// Admin/Creator preview before committing — same numbers oemAppApproveSop_
// would write, without touching anything yet.
function oemAppGetSopPendingReview_(token, anchor) {
  var user = oemAppRequireSession_(token);
  if (!['admin', 'creator'].includes(user.role)) {
    throw new Error('Chỉ Admin mới xem được bảng tổng hợp chờ duyệt.');
  }
  return oemAppAggregateSopPeriod_(anchor || oemAppSopCurrentAnchor_());
}

// Approve the WHOLE batch for a period in one action (duyệt cả bảng đã cộng
// dồn nhiều Sale, không duyệt từng dòng riêng). Overwrites tab "SOP" wholesale
// with the aggregated result, then marks every contributing SOP_Plan row as
// Đã duyệt so it stops showing as pending and starts counting toward "SL đã
// duyệt tháng trước" for whoever plans the next period.
function oemAppApproveSop_(token, anchor) {
  var user = oemAppRequireSession_(token);
  if (!['admin', 'creator'].includes(user.role)) {
    throw new Error('Chỉ Admin mới có quyền duyệt kế hoạch SOP.');
  }
  anchor = anchor || oemAppSopCurrentAnchor_();
  var agg = oemAppAggregateSopPeriod_(anchor);
  if (!agg.rows.length) throw new Error('Không có kế hoạch nào đang chờ duyệt cho kỳ này.');

  var sopSheet = oemAppGetSopSheet_();
  var lastRow = sopSheet.getLastRow();
  if (lastRow > 1) sopSheet.getRange(2, 1, lastRow - 1, 7).clearContent();
  sopSheet.getRange(1, 1, 1, 7).setValues([[
    'Mã', 'Tên SP', 'Giá bán',
    'SL ' + agg.monthLabels[0], 'SL ' + agg.monthLabels[1], 'SL ' + agg.monthLabels[2], 'SL ' + agg.monthLabels[3]
  ]]);
  var body = agg.rows.map(function (r) {
    return [r.sku, r.name, r.price, r.sl[0], r.sl[1], r.sl[2], r.sl[3]];
  });
  if (body.length) sopSheet.getRange(2, 1, body.length, 7).setValues(body);

  var planSheet = oemAppGetSopPlanSheet_();
  var planRows = planSheet.getDataRange().getValues();
  var now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');
  for (var i = 1; i < planRows.length; i++) {
    if (String(planRows[i][0]) === String(anchor) && String(planRows[i][7]) === 'Chờ duyệt') {
      planSheet.getRange(i + 1, 8, 1, 3).setValues([['Đã duyệt', user.name, now]]);
    }
  }

  return { ok: true, skuCount: agg.rows.length, monthLabels: agg.monthLabels };
}

// ---------- SOP (read-facing forecast) ----------

function oemAppGetSopView_(token) {
  oemAppRequireSession_(token);
  var sheet = oemAppGetSopSheet_();
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 1) return { rows: [], monthLabels: [] };

  var header = rows[0];
  var monthLabels = [3, 4, 5, 6].map(function (c) {
    return String(header[c] || '').replace(/^SL\s*/, '');
  });

  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    out.push({
      sku: String(r[0]),
      name: String(r[1] || ''),
      price: oemAppParseNum_(r[2]),
      sl: [oemAppParseNum_(r[3]), oemAppParseNum_(r[4]), oemAppParseNum_(r[5]), oemAppParseNum_(r[6])]
    });
  }
  return { rows: out, monthLabels: monthLabels };
}

// ---------- Diagnostics (no session required — same tier as ping) ----------
// Structural-only (sheet found? which headers?) so it's safe to leave callable
// without a token; never returns plan/forecast quantities.
function oemAppSopDiag_() {
  var out = { anchor: oemAppSopCurrentAnchor_() };
  try {
    var planSheet = oemAppGetSopPlanSheet_();
    out.planFound = true;
    out.planHeaders = planSheet.getRange(1, 1, 1, 11).getValues()[0];
    // Data-shape summary only — distinct labels + counts, never quantities —
    // so seeded rows (period/sale spelling/status text) can be sanity-checked
    // without a login and without exposing any real numbers.
    var planRows = oemAppLoadSopPlanRows_();
    out.planRowCount = planRows.length;
    out.planDistinctPeriods = Array.from(new Set(planRows.map(function (r) { return r.period; }))).sort();
    out.planDistinctSales = Array.from(new Set(planRows.map(function (r) { return r.sale; }))).sort();
    out.planDistinctStatuses = Array.from(new Set(planRows.map(function (r) { return r.status; }))).sort();
  } catch (e) {
    out.planFound = false;
    out.planError = e.message;
  }
  try {
    var sopSheet = oemAppGetSopSheet_();
    out.sopFound = true;
    out.sopHeaders = sopSheet.getRange(1, 1, 1, Math.max(sopSheet.getLastColumn(), 7)).getValues()[0];
    out.sopRowCount = Math.max(0, sopSheet.getLastRow() - 1);
  } catch (e) {
    out.sopFound = false;
    out.sopError = e.message;
  }
  return out;
}
