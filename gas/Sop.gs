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
 *
 * Submit is FULL REPLACE, not append/upsert-only (2026-08-25): a Sale can
 * only "Sửa" (resubmit with changes) or "Tạo mới từ đầu" (frontend clears its
 * draft, resubmits fresh) for a period — never end up with two overlapping
 * versions. Any of that Sale's existing rows for the period whose SKU isn't
 * in the new payload gets deleted; rows with 0 in every month are dropped
 * from the payload before writing (nothing to forecast). Resubmitting a
 * period that's already "Đã duyệt" is rejected outright — see
 * oemAppSubmitSopDraft_.
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

// Column A "Kỳ" is meant to always hold the plain string "yyyy-MM", but
// Google Sheets can silently reinterpret a value that LOOKS date-like (eg.
// "2026-09") as an actual Date cell — found in production 2026-08-25: one
// Sale's current-period rows all had column A read back as a real Date
// object instead of the string, so `String(anchor) === String(cell)` never
// matched, and every resubmit appended a fresh ~450-row batch instead of
// overwriting (7943 raw rows for 452 real SKUs, i.e. that Sale's whole
// period was invisible to Admin's approve screen and to their own "Xem SOP"
// current-period section — silently orphaned, not merely duplicated).
// Every read AND every write-side match of column A goes through this so a
// Date-coerced cell is transparently treated the same as the string it was
// supposed to be.
function oemAppSopNormalizePeriod_(raw) {
  if (raw instanceof Date) return Utilities.formatDate(raw, 'GMT+7', 'yyyy-MM');
  return String(raw || '');
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
      period: oemAppSopNormalizePeriod_(r[0]),
      sale: String(r[1] || ''),
      sku: String(r[2] || ''),
      sl: [oemAppParseNum_(r[3]), oemAppParseNum_(r[4]), oemAppParseNum_(r[5]), oemAppParseNum_(r[6])],
      status: String(r[7] || ''),
      submittedAt: r[8] || '',
      approvedBy: String(r[9] || ''),
      approvedAt: r[10] || ''
    });
  }

  // SOP_Plan is documented as "1 dòng = 1 (Kỳ, Sale, SKU)", but every write
  // path only matches an existing row by (period, sale, sku) before deciding
  // update-vs-append — a race between two overlapping submits (eg. two tabs,
  // or a retried request) can still leave more than one physical row for the
  // same triple. Found in production 2026-08-25 (a Sale saw each SKU tripled
  // in "Xem SOP", and the "Ẩn mã không có số lượng" filter looked broken
  // because of it — duplicate React keys on 3 near-identical rows confuse
  // list reconciliation). Defensively collapse to the LATEST row (highest
  // rowIndex — rows are append-only, never reordered) per (period, sale,
  // sku), so every reader (this function's callers: planning context,
  // aggregation/approve, "Xem SOP") sees exactly one row per triple
  // regardless of stray duplicates left sitting in the sheet.
  var latestByKey = {};
  var order = [];
  out.forEach(function (r) {
    var key = r.period + '|' + r.sale + '|' + r.sku;
    if (!latestByKey[key]) order.push(key);
    latestByKey[key] = r; // later in append order = higher rowIndex = wins
  });
  return order.map(function (key) { return latestByKey[key]; });
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

// Bulk save — Sale fills in the whole table and submits once. FULL REPLACE
// semantics (added 2026-08-25, per user requirement): whatever this call
// receives becomes the ENTIRE set of this Sale's rows for this period — any
// of their existing rows for this (period, sale) whose SKU is NOT in the new
// payload gets deleted, not just left stale. This is what makes "Sửa" (edit a
// few cells and resubmit) and "Tạo mới từ đầu" (frontend clears its local
// draft, then submits only the freshly-typed rows) behave identically here:
// either way, the sheet ends up holding exactly this payload, never a mix of
// two submissions ("2 phiên bản"). The frontend is responsible for sending
// its COMPLETE current draft (not just whatever a filter currently shows) —
// see SopPlanPanel.jsx's use of the full draftMap, not filteredMaterials —
// otherwise a narrowed filter at submit time would look identical to "the
// Sale deleted those rows" and wipe them for real.
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

  var existingRowIndexBySku = {};
  var hasApproved = false;
  for (var i = 1; i < existing.length; i++) {
    var r = existing[i];
    if (oemAppSopNormalizePeriod_(r[0]) === String(anchor) && String(r[1]) === saleKey) {
      existingRowIndexBySku[String(r[2])] = i + 1;
      if (String(r[7]) === 'Đã duyệt') hasApproved = true;
    }
  }
  // Kỳ này của chính Sale đó đã được Admin duyệt (đã cộng vào tab "SOP") —
  // không cho gửi/ghi đè lại nữa, để tránh "2 phiên bản" theo kiểu tệ nhất:
  // âm thầm làm mất dấu 1 batch đã duyệt. Sale phải chờ kỳ kế hoạch tiếp theo.
  // Checked BEFORE the zero-quantity filter below so this specific reason
  // always wins over the generic "không có dòng hợp lệ" error.
  if (hasApproved) {
    throw new Error('Kỳ kế hoạch này đã được duyệt — không thể gửi hoặc sửa lại. Vui lòng chờ kỳ kế hoạch tiếp theo.');
  }

  // Chỉ giữ dòng có số lượng > 0 ở ít nhất 1 trong 4 tháng — một dòng toàn 0
  // (SKU chưa từng nhập, hoặc vừa bị xoá hết số lượng) không có gì để lập kế
  // hoạch, không nên chiếm 1 dòng trên SOP_Plan.
  var validRows = rows.filter(function (item) {
    if (!item || !item.sku) return false;
    var sl = [item.sl1, item.sl2, item.sl3, item.sl4];
    return sl.some(function (v) { return (Number(v) || 0) > 0; });
  });
  if (!validRows.length) {
    throw new Error('Không có mã SKU nào có số lượng > 0 ở ít nhất 1 tháng để lưu.');
  }

  var keepSkus = {};
  validRows.forEach(function (item) { keepSkus[item.sku] = true; });
  var removedSkus = Object.keys(existingRowIndexBySku).filter(function (sku) { return !keepSkus[sku]; });

  // Perf (2026-08-26): xoá dòng CŨ không còn trong lần gửi này bằng cách LÀM
  // TRỐNG cột SKU (cột C) của đúng dòng đó, KHÔNG dùng sheet.deleteRow — deleteRow
  // là thao tác cấu trúc (dồn lại toàn bộ chỉ số dòng phía dưới), với batch
  // ~450 SKU từng phải xoá từng dòng MỘT rồi đọc lại cả Sheet (nguy cơ chạm
  // timeout 6 phút của Apps Script). Dòng trống cột C bị mọi hàm đọc khác coi
  // là dòng rỗng và bỏ qua (`if (!r[2]) continue`) — coi như đã xoá dù vẫn còn
  // nằm vật lý, cùng kiểu đánh đổi đã chấp nhận cho các dòng trùng/hỏng cũ
  // (xem SETUP.md) — không cần đọc lại Sheet, không lệch chỉ số dòng nào.
  removedSkus.forEach(function (sku) {
    sheet.getRange(existingRowIndexBySku[sku], 3, 1, 1).setValue('');
  });

  var now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');

  // Ghi đè TẠI CHỖ các dòng đã có sẵn — không setNumberFormat lại (ô này đã
  // được định dạng Text đúng từ lần tạo dòng đầu tiên), chỉ 1 lệnh/dòng thay
  // vì 2. Dòng THẬT SỰ MỚI gom lại ghi 1 LẦN DUY NHẤT thành 1 khối liền bên
  // dưới — chỉ khối này mới cần setNumberFormat vì là ô chưa từng được ghi.
  var newRows = [];
  validRows.forEach(function (item) {
    var values = [
      anchor, saleKey, item.sku,
      item.sl1 || 0, item.sl2 || 0, item.sl3 || 0, item.sl4 || 0,
      'Chờ duyệt', now, '', ''
    ];
    var rowIndex = existingRowIndexBySku[item.sku];
    if (rowIndex) {
      sheet.getRange(rowIndex, 1, 1, 11).setValues([values]);
    } else {
      newRows.push(values);
    }
  });

  if (newRows.length) {
    // Force column A to plain text BEFORE writing — otherwise Sheets can
    // silently reinterpret a "yyyy-MM" string as a real Date cell (see
    // oemAppSopNormalizePeriod_), which then breaks this exact match on the
    // next submit and piles up duplicate rows instead of overwriting.
    var startRow = existing.length + 1;
    sheet.getRange(startRow, 1, newRows.length, 1).setNumberFormat('@');
    sheet.getRange(startRow, 1, newRows.length, 11).setValues(newRows);
  }

  return {
    ok: true,
    savedCount: validRows.length,
    skippedZeroCount: rows.length - validRows.length,
    removedCount: removedSkus.length
  };
}

// What THIS Sale has ever submitted, across every period — status included —
// so "Xem SOP" can show it back to them (period, SKU, status, ngày gửi/duyệt)
// instead of only the read-facing aggregate tab. `anchor` tells the frontend
// which period group is still editable via "Lập Kế Hoạch" (only the current
// one — the planning screen itself has no way to target an older period).
function oemAppGetMySopPlan_(token) {
  var user = oemAppRequireSession_(token);
  var saleKey = oemAppSopSaleKey_(user);
  var catalog = oemAppLoadMaterialCatalog_().bySku;
  var anchor = oemAppSopCurrentAnchor_();

  var rows = oemAppLoadSopPlanRows_()
    .filter(function (r) { return r.sale === saleKey; })
    .map(function (r) {
      var entry = catalog[r.sku] || {};
      return {
        period: r.period,
        monthLabels: oemAppSopPeriodMonths_(r.period).map(oemAppSopLabel_),
        sku: r.sku,
        name: entry.name || r.sku,
        price: entry.suggestedPrice || 0,
        sl: r.sl,
        status: r.status,
        submittedAt: r.submittedAt,
        approvedAt: r.approvedAt
      };
    })
    .sort(function (a, b) {
      if (a.period !== b.period) return a.period < b.period ? 1 : -1; // newest period first
      return a.sku < b.sku ? -1 : (a.sku > b.sku ? 1 : 0);
    });

  return { anchor: anchor, rows: rows };
}

// ---------- Aggregation (shared by the pre-approval preview and the real approve) ----------

function oemAppAggregateSopPeriod_(anchor) {
  var catalog = oemAppLoadMaterialCatalog_().bySku;
  var pendingRows = oemAppLoadSopPlanRows_().filter(function (r) {
    return r.period === anchor && r.status === 'Chờ duyệt';
  });

  var bySku = {};
  var order = [];
  pendingRows.forEach(function (r) {
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

  // Per-line detail (one entry per Sale+SKU, pre-aggregation) — lets the
  // approve screen filter "tổng đóng góp của mỗi sale" without a second read.
  var detail = pendingRows.map(function (r) {
    var entry = catalog[r.sku] || {};
    return { sale: r.sale, sku: r.sku, name: entry.name || r.sku, price: entry.suggestedPrice || 0, sl: r.sl };
  });

  return {
    rows: result,
    detail: detail,
    monthLabels: months.map(oemAppSopLabel_),
    pendingCount: pendingRows.length,
    // Perf (2026-08-26): oemAppApproveSop_ dùng lại danh sách rowIndex này để
    // đánh dấu Đã duyệt, khỏi phải đọc lại toàn bộ SOP_Plan (~9.000 dòng) lần
    // thứ 2 trong cùng 1 lượt Duyệt (đã đọc 1 lần ở oemAppLoadSopPlanRows_
    // bên trên rồi).
    pendingRowIndexes: pendingRows.map(function (r) { return r.rowIndex; })
  };
}

// Admin/Creator preview before committing — same numbers oemAppApproveSop_
// would write, without touching anything yet.
function oemAppGetSopPendingReview_(token, anchor) {
  var user = oemAppRequireSession_(token);
  if (!['admin', 'creator'].includes(user.role)) {
    throw new Error('Chỉ Admin mới xem được bảng tổng hợp chờ duyệt.');
  }
  anchor = anchor || oemAppSopCurrentAnchor_();
  var agg = oemAppAggregateSopPeriod_(anchor);
  agg.anchor = anchor;
  return agg;
}

// Approve the WHOLE batch for a period in one action (duyệt cả bảng đã cộng
// dồn nhiều Sale, không duyệt từng dòng riêng). Overwrites tab "SOP" wholesale
// with the aggregated result, then marks every contributing SOP_Plan row as
// Đã duyệt so it stops showing as pending and starts counting toward "SL đã
// duyệt tháng trước" for whoever plans the next period.
// overrideRows (optional): [{ sku, sl1, sl2, sl3, sl4 }, ...] — Admin/Creator
// may adjust quantities on the approve screen before committing. Only SKUs
// already part of this batch (agg.rows) can be overridden — this replaces
// what gets PUBLISHED to tab "SOP", it never changes who gets credited or
// which underlying SOP_Plan rows are marked Đã duyệt (that still follows the
// real submitted data, below).
function oemAppApproveSop_(token, anchor, overrideRows) {
  var user = oemAppRequireSession_(token);
  if (!['admin', 'creator'].includes(user.role)) {
    throw new Error('Chỉ Admin mới có quyền duyệt kế hoạch SOP.');
  }
  anchor = anchor || oemAppSopCurrentAnchor_();
  var agg = oemAppAggregateSopPeriod_(anchor);
  if (!agg.rows.length) throw new Error('Không có kế hoạch nào đang chờ duyệt cho kỳ này.');

  var slBySku = {};
  agg.rows.forEach(function (r) { slBySku[r.sku] = r.sl; });
  (overrideRows || []).forEach(function (o) {
    if (!o || !o.sku || !slBySku[o.sku]) return;
    slBySku[o.sku] = [Number(o.sl1) || 0, Number(o.sl2) || 0, Number(o.sl3) || 0, Number(o.sl4) || 0];
  });

  var sopSheet = oemAppGetSopSheet_();
  var lastRow = sopSheet.getLastRow();
  if (lastRow > 1) sopSheet.getRange(2, 1, lastRow - 1, 7).clearContent();
  sopSheet.getRange(1, 1, 1, 7).setValues([[
    'Mã', 'Tên SP', 'Giá bán',
    'SL ' + agg.monthLabels[0], 'SL ' + agg.monthLabels[1], 'SL ' + agg.monthLabels[2], 'SL ' + agg.monthLabels[3]
  ]]);
  // Only publish SKUs with quantity > 0 in at least one of the 4 months — an
  // all-zero row (a Sale's "no longer planning this SKU" line, or one edited
  // down to zero above) has nothing to forecast, so it's dropped from tab
  // "SOP" rather than published as a row of zeroes.
  var publishSkus = agg.rows.filter(function (r) { return slBySku[r.sku].some(function (v) { return v > 0; }); });

  var body = publishSkus.map(function (r) {
    var sl = slBySku[r.sku];
    return [r.sku, r.name, r.price, sl[0], sl[1], sl[2], sl[3]];
  });
  if (body.length) sopSheet.getRange(2, 1, body.length, 7).setValues(body);

  // Perf (2026-08-26): dùng lại agg.pendingRowIndexes (đã có từ lần đọc
  // SOP_Plan bên trong oemAppAggregateSopPeriod_ ở trên) thay vì đọc lại
  // getDataRange() lần 2 rồi quét từng dòng — SOP_Plan có thể lên tới hàng
  // nghìn dòng. Các dòng cần đánh dấu Đã duyệt nằm rải rác (nhiều Sale/nhiều
  // đợt gửi khác nhau qua thời gian), không liền nhau, nên đọc nguyên khối
  // cột Trạng thái (H) và Người duyệt/Ngày duyệt (J-K) 1 LẦN, sửa đúng những
  // dòng cần đổi trong bộ nhớ, rồi ghi lại nguyên khối — CỐ ĐỊNH 2 lệnh ghi dù
  // đợt duyệt có bao nhiêu dòng, thay vì 2 lệnh × N dòng.
  var planSheet = oemAppGetSopPlanSheet_();
  var planLastRow = planSheet.getLastRow();
  if (planLastRow > 1) {
    var planDataRowCount = planLastRow - 1; // dữ liệu từ dòng 2
    var now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');
    var colH = planSheet.getRange(2, 8, planDataRowCount, 1).getValues();
    var colJK = planSheet.getRange(2, 10, planDataRowCount, 2).getValues();
    agg.pendingRowIndexes.forEach(function (rowIndex) {
      var idx = rowIndex - 2;
      if (idx < 0 || idx >= planDataRowCount) return;
      colH[idx][0] = 'Đã duyệt';
      colJK[idx][0] = user.name;
      colJK[idx][1] = now;
    });
    planSheet.getRange(2, 8, planDataRowCount, 1).setValues(colH);
    planSheet.getRange(2, 10, planDataRowCount, 2).setValues(colJK);
  }

  return { ok: true, skuCount: publishSkus.length, monthLabels: agg.monthLabels };
}

// ---------- SOP (read-facing forecast) ----------

// No session check here — split out so oemAppAiChat_'s sku_info tool (called
// after the ONE session check already done at the top of that request) can
// read the current SOP without a second, redundant auth check.
function oemAppReadSopView_() {
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

function oemAppGetSopView_(token) {
  oemAppRequireSession_(token);
  return oemAppReadSopView_();
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
    var planRows = oemAppLoadSopPlanRows_(); // already deduped (latest per period+sale+sku)
    out.planRowCount = planRows.length;
    out.planDistinctPeriods = Array.from(new Set(planRows.map(function (r) { return r.period; }))).sort();
    out.planDistinctSales = Array.from(new Set(planRows.map(function (r) { return r.sale; }))).sort();
    out.planDistinctStatuses = Array.from(new Set(planRows.map(function (r) { return r.status; }))).sort();

    // Raw (pre-dedup) vs deduped counts per (period, sale) — quantifies
    // exactly how many duplicate physical rows still sit in the sheet for
    // each period+sale, without ever reading a quantity column.
    var rawValues = planSheet.getDataRange().getValues();
    var rawCountByKey = {};
    for (var i = 1; i < rawValues.length; i++) {
      var rr = rawValues[i];
      if (!rr[2]) continue;
      var k = oemAppSopNormalizePeriod_(rr[0]) + ' | ' + String(rr[1] || '');
      rawCountByKey[k] = (rawCountByKey[k] || 0) + 1;
    }
    var dedupedCountByKey = {};
    planRows.forEach(function (r) {
      var k = r.period + ' | ' + r.sale;
      dedupedCountByKey[k] = (dedupedCountByKey[k] || 0) + 1;
    });
    out.rowCountByPeriodSale = Object.keys(rawCountByKey).sort().map(function (k) {
      return { key: k, rawRowCount: rawCountByKey[k], dedupedSkuCount: dedupedCountByKey[k] || 0 };
    });
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
  try {
    // oemAppLoadMaterialCatalog_ reads the Products sheet live (no cache), so
    // this checks the real column value directly — separate from whatever the
    // (cached, up to 10 min stale) getBootstrap payload is currently serving.
    var bySku = oemAppLoadMaterialCatalog_().bySku;
    var skus = Object.keys(bySku);
    out.productCount = skus.length;
    out.productExclusiveNonEmptyCount = skus.filter(function (s) { return bySku[s].exclusiveTo; }).length;
    out.productExclusiveDistinctValues = Array.from(new Set(skus.map(function (s) { return bySku[s].exclusiveTo; }).filter(Boolean))).sort();
    // Sample of aliases that actually contain a comma (the multi-name-in-one-
    // cell pattern findMatchingMaterial's splitMultiValue_ now handles) — capped
    // at 10 so this stays a quick sanity check, not a full alias dump.
    out.productAliasWithCommaSample = skus
      .filter(function (s) { return String(bySku[s].alias || '').indexOf(',') !== -1; })
      .slice(0, 10)
      .map(function (s) { return { sku: s, alias: bySku[s].alias }; });
  } catch (e) {
    out.productError = e.message;
  }
  return out;
}


// Forces getBootstrap's next call (any user) to recompute instead of serving
// the up-to-10-min-old cached payload — same bump oemAppInvalidateBootstrap_
// already does after every write, just reachable without a login for
// troubleshooting (it only invalidates a cache key, never touches real data).
function oemAppForceRefreshBootstrap_() {
  oemAppInvalidateBootstrap_();
  oemAppInvalidateCatalog_();
  return { ok: true };
}
