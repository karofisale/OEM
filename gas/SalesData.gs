/** Transactions (tab "Data"), sales plans, 2025 baselines, combined getBootstrap payload. */

// Perf (2026-08-26): reading + mapping tab "Data" is the single most expensive
// read in this backend, and oemAppAiChat_'s tools (oemAppAiToolClientRevenue_,
// oemAppAiToolSkuInfo_) can each call this independently within ONE doPost —
// Gemini function-calling may invoke both in a single chat turn. Memoized per
// SCRIPT EXECUTION only (a plain top-level var, reset fresh on every new
// Apps Script invocation — never shared across requests, no staleness risk).
var OEMAPP_TRANSACTIONS_MEMO_ = null;

function oemAppLoadTransactions_() {
  if (OEMAPP_TRANSACTIONS_MEMO_) return OEMAPP_TRANSACTIONS_MEMO_;
  OEMAPP_TRANSACTIONS_MEMO_ = oemAppLoadTransactionsUncached_();
  return OEMAPP_TRANSACTIONS_MEMO_;
}

function oemAppLoadTransactionsUncached_() {
  var rows = oemAppGetRows_(OEMAPP_GIDS.TRANSACTIONS);
  return rows.slice(1).map(function (row) {
    var dateStr = oemAppNormalizeDateStr_(row[0]) || oemAppNormalizeDateStr_(row[1]);
    var clientName = row[6] || '';
    var rawCode = row[60] || row[5] || '';
    var codeSearch = oemAppGetClientTextCode_(clientName, rawCode, row[60]);
    var month = row[40] || 'T08-2026';
    var week = oemAppComputeWeekFromDate_(dateStr, row[42]);

    return {
      date: dateStr,
      billingNo: String(row[2] || ''),
      docType: String(row[4] || ''),
      clientCode: codeSearch,
      clientName: String(clientName),
      sku: String(row[8] || ''),
      skuName: String(row[9] || ''),
      qty: oemAppParseNum_(row[11] || row[10]),
      unit: String(row[12] || 'PC'),
      price: oemAppParseNum_(row[14]),
      revenue: oemAppParseNum_(row[17]),
      netRevenue: oemAppParseNum_(row[22]),
      orderNo: String(row[24] || row[2] || 'SO-10002'),
      month: month,
      week: week,
      sale: String(row[61] || row[36] || 'KH Đình Hoan'),
      group: String(row[62] || row[27] || 'Linh kiện OEM'),
      netVat: oemAppParseNum_(row[59]),
      taxRate: oemAppParseTaxRate_(row[58])
    };
  }).filter(function (t) { return t.clientName && t.skuName; });
}

// AI Order Agent "learning" loop: every order line saved to the Orders tab carries
// an "Update alias" value whenever Sale used a free-text term the matcher didn't
// already know for that SKU (see oemAppSaveOrder_). Reading it back here and handing
// it to the frontend as material.learnedAliases lets future free-text orders match
// correctly on the first try instead of repeating the same manual SKU correction.

// ---------- Plan_Thang month helpers ("T09-2026", same format as src/utils/period.js) ----------
// 2026-08-25: columns O (Tháng) and P (Trạng thái) were added after Note so
// several months can coexist as separate rows (like SOP_Plan), instead of the
// old single-global-month title row. The 64 pre-existing rows were never
// migrated to have an explicit Tháng, so they're read back as whatever month
// row0's title cell (col D) held — this is a one-time bridge for that already-
// existing batch, not something new rows should ever rely on.
function oemAppPlanFormatMonth_(year, month) {
  return 'T' + (month < 10 ? '0' + month : month) + '-' + year;
}

function oemAppPlanLegacyMonth_(rows) {
  var monthNum = oemAppParseNum_(rows[0] && rows[0][3]);
  if (!monthNum) return '';
  var year = parseInt(Utilities.formatDate(new Date(), 'GMT+7', 'yyyy'), 10);
  return oemAppPlanFormatMonth_(year, monthNum);
}

// Default month a Sale proposing/editing today should land on: the current
// month while it's still early/mid-month (ngày 1-24), the next month once
// it's late (ngày 25-31) — so a plan typed in the last week of the month
// defaults to the month it's actually meant for. Just a UI default (the
// frontend still shows a picker), so unlike SOP's anchor this doesn't need to
// be the single source of truth server-side — kept here anyway so the
// approve/pending-review math and the frontend's default never disagree.
function oemAppPlanDefaultMonth_() {
  var now = new Date();
  var tz = 'GMT+7';
  var year = parseInt(Utilities.formatDate(now, tz, 'yyyy'), 10);
  var month = parseInt(Utilities.formatDate(now, tz, 'MM'), 10);
  var day = parseInt(Utilities.formatDate(now, tz, 'dd'), 10);
  if (day >= 25) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return oemAppPlanFormatMonth_(year, month);
}

function oemAppLoadSalesPlans_() {
  var rows = oemAppGetRows_(OEMAPP_GIDS.PLAN_THANG);
  var legacyMonth = oemAppPlanLegacyMonth_(rows);
  var dataRows = rows.slice(2); // row0 = title/totals, row1 = column labels
  return dataRows.map(function (r, idx) {
    var clientName = String(r[2] || 'Khách hàng OEM');
    var searchCode = r[1] ? String(r[1]).trim() : oemAppGetClientTextCode_(clientName, r[0], r[1]);
    return {
      rowIndex: idx + 3, // physical 1-indexed sheet row (data starts at row 3)
      searchCode: searchCode,
      clientName: clientName,
      sale: String(r[3] || 'KH Đình Hoan'),
      planKpi: oemAppParseNum_(r[4]),
      planUpdate: oemAppParseNum_(r[5]),
      done: oemAppParseNum_(r[6]),
      w1: oemAppParseNum_(r[8]),
      w2: oemAppParseNum_(r[9]),
      w3: oemAppParseNum_(r[10]),
      w4: oemAppParseNum_(r[11]),
      w5: oemAppParseNum_(r[12]),
      note: String(r[13] || ''),
      month: String(r[14] || '').trim() || legacyMonth,
      status: String(r[15] || '')
    };
  }).filter(function (p) { return p.searchCode && p.searchCode !== 'Search_code'; });
}

// ---------- Plan2026 (per-client annual KPI grid, tab created by hand) ----------
// Rows 0-4: aggregate/subtotal rows (Tổng DT 2025, per-Sale subtotals, etc).
// Row 5 (0-indexed): real header — Mã KH, Tên Khách hàng, PIC, Năm 2026,
// Tháng 1..Tháng 12 (columns 4-15). Data starts row 6. Keyed by "Mã KH", which
// is the same text-code format as codeSearch/searchCode elsewhere in this app.
function oemAppLoadPlan2026_() {
  var sheet;
  try {
    sheet = oemAppSS_().getSheetByName('Plan2026');
  } catch (e) {
    return {};
  }
  if (!sheet) return {};
  var rows = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 6; i < rows.length; i++) {
    var code = String(rows[i][0] || '').trim();
    if (!code) continue;
    var months = [];
    for (var m = 0; m < 12; m++) months.push(oemAppParseNum_(rows[i][4 + m]));
    map[code] = { pic: String(rows[i][2] || ''), months: months };
  }
  return map;
}


function oemAppLoad2025Baselines_() {
  var rows = oemAppGetRows_(OEMAPP_GIDS.SALES_REVENUE);
  var map = {
    TECOM: 30323700000,
    CTMAXIMVN: 23500000000,
    CTQTSONHA: 9546500000,
    CTVIETTOANCAU: 8598500000,
    CHTUANDP: 7546800000,
    CHABACHN: 4000000000
  };
  if (rows.length > 5) {
    rows.slice(5).forEach(function (row) {
      var code = row[0] || oemAppGetClientTextCode_(row[1], '', row[0]);
      var rev2025 = oemAppParseNum_(row[3]);
      if (code && rev2025 > 0) map[code] = rev2025;
    });
  }
  return map;
}


// Bootstrap cache, keyed per permission scope (see oemAppScopeOf_) so a Sale can
// never be handed another Sale's payload out of the shared script cache.
// Admin/Leader share one 'all' entry; each Sale gets their own.
//
// TTL is safe at 10 minutes: tab "Data" is written by the separate up-dt-oem
// import skill on a daily/weekly cadence, not continuously. The tabs this app
// writes itself (Clients, Plan_Thang, Products) drop the cache on write, so a
// user never sees their own edit missing.
var OEMAPP_BOOTSTRAP_CACHE_KEY_ = 'oemapp_bootstrap_v2';
var OEMAPP_BOOTSTRAP_TTL_ = 600; // 10 minutes
var OEMAPP_BOOTSTRAP_VER_KEY_ = 'oemapp_bootstrap_ver';
var OEMAPP_CATALOG_CACHE_KEY_ = 'oemapp_catalog_v1';
var OEMAPP_CATALOG_TTL_ = 600; // 10 minutes
var OEMAPP_CATALOG_VER_KEY_ = 'oemapp_catalog_ver';


// Which slice of the data this user is allowed to see. A Sale only ever gets
// their own rows; Creator/Admin/Leader get everything.
//
// This is a real permission boundary now, not a display filter. Until 2026-08-20
// the backend returned every transaction to everyone and the frontend hid the
// other Sales' rows — except the "Lịch sử doanh thu" tab, which never filtered at
// all, so one Sale could simply read another's revenue there. Even where the UI
// did hide it, the data still sat in the browser.
function oemAppScopeOf_(user) {
  var role = String(user.role || '').toLowerCase();
  if (role !== 'sale') return { all: true, key: 'all' };

  // Fail CLOSED. An empty saleId used to make the frontend's
  // `includes('')` test true for every row, i.e. a Sale with no saleId saw
  // everything. If the Users tab is missing a saleId we return nothing rather
  // than everything — visible immediately, instead of silently over-sharing.
  var saleId = String(user.saleId || '').trim();
  return { all: false, saleId: saleId.toLowerCase(), key: 'sale:' + saleId.toLowerCase() };
}


function oemAppMatchesSale_(rowSale, scope) {
  if (scope.all) return true;
  if (!scope.saleId) return false; // fail closed, see oemAppScopeOf_
  return String(rowSale || '').toLowerCase().indexOf(scope.saleId) !== -1;
}


// Cache entries are per-scope, so a Sale can never be served another Sale's
// payload out of the shared script cache.
function oemAppBootstrapVersion_() {
  var cache = CacheService.getScriptCache();
  var v = cache.get(OEMAPP_BOOTSTRAP_VER_KEY_);
  if (!v) {
    v = Utilities.getUuid().slice(0, 8);
    cache.put(OEMAPP_BOOTSTRAP_VER_KEY_, v, 21600);
  }
  return v;
}


// Perf (2026-08-26): allTransactions + materials (via oemAppLoadCatalogBlock_,
// below) are the single most expensive part of getBootstrap — reading the
// whole transactions history and deriving every material from it — but they
// don't change when someone edits a client or a sales plan. Splitting this
// into its OWN version key (bumped only by oemAppInvalidateCatalog_, called
// from Products/price-apply writers) means a client/plan edit still busts the
// outer per-scope cache (via oemAppBootstrapVersion_ below) but the rebuild
// that follows reuses this still-fresh catalog block instead of re-scanning
// every transaction again.
function oemAppCatalogVersion_() {
  var cache = CacheService.getScriptCache();
  var v = cache.get(OEMAPP_CATALOG_VER_KEY_);
  if (!v) {
    v = Utilities.getUuid().slice(0, 8);
    cache.put(OEMAPP_CATALOG_VER_KEY_, v, 21600);
  }
  return v;
}


function oemAppInvalidateCatalog_() {
  try {
    CacheService.getScriptCache().put(OEMAPP_CATALOG_VER_KEY_, Utilities.getUuid().slice(0, 8), 21600);
  } catch (err) {}
}


// { allTransactions, materials } — same for every user regardless of scope
// (both are computed from the FULL transaction history), so this is cached
// without a scope suffix, unlike the outer bootstrap payload.
function oemAppLoadCatalogBlock_() {
  var cacheKey = OEMAPP_CATALOG_CACHE_KEY_ + '_' + oemAppCatalogVersion_();
  var cached = oemAppCacheGetBig_(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {
      // Corrupt/truncated cache entry — fall through and rebuild from the Sheet.
    }
  }

  var allTransactions = oemAppLoadTransactions_();
  var aliasHints = oemAppLoadOrderAliasHints_();
  var catalog = oemAppLoadMaterialCatalog_();
  var materials = oemAppDeriveMaterials_(allTransactions, aliasHints, catalog.bySku);
  var block = { allTransactions: allTransactions, materials: materials };

  try {
    oemAppCachePutBig_(cacheKey, JSON.stringify(block), OEMAPP_CATALOG_TTL_);
  } catch (err) {}

  return block;
}


function oemAppGetBootstrap_(token) {
  var user = oemAppRequireSession_(token);
  var scope = oemAppScopeOf_(user);
  var cacheKey = OEMAPP_BOOTSTRAP_CACHE_KEY_ + '_' + oemAppBootstrapVersion_() + '_' + oemAppCatalogVersion_() + '_' + scope.key;

  var cached = oemAppCacheGetBig_(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {
      // Corrupt/truncated cache entry — fall through and rebuild from the Sheet.
    }
  }

  var payload = oemAppBuildBootstrap_(scope);

  // A cache write failing (quota, size) must never break the actual request.
  try {
    oemAppCachePutBig_(cacheKey, JSON.stringify(payload), OEMAPP_BOOTSTRAP_TTL_);
  } catch (err) {}

  return payload;
}


function oemAppBuildBootstrap_(scope) {
  var catalogBlock = oemAppLoadCatalogBlock_();
  var allTransactions = catalogBlock.allTransactions;
  // Materials are derived from the FULL history on purpose: the product
  // catalogue and its historical pricing are not per-Sale data, and scoping it
  // would leave a Sale unable to order any SKU they had not personally sold.
  var materials = catalogBlock.materials;

  var transactions = scope.all ? allTransactions : allTransactions.filter(function (t) {
    return oemAppMatchesSale_(t.sale, scope);
  });

  var plans = oemAppLoadSalesPlans_().filter(function (p) {
    return oemAppMatchesSale_(p.sale, scope);
  });

  return {
    clients: oemAppLoadClients_(),
    transactions: transactions,
    materials: materials,
    plans: plans,
    planDefaultMonth: oemAppPlanDefaultMonth_(),
    // "Bộ sản phẩm" recipes (optional tab "Kits") — see Ai.gs. Same for every
    // user regardless of scope, like materials: kit definitions aren't per-Sale.
    kits: oemAppLoadKits_()
  };
  // plan2026 và baselines2025 KHÔNG còn ở đây — xem oemAppGetReportContext_.
}


/**
 * Hai khối dữ liệu mà mỗi khối chỉ MỘT màn hình dùng tới.
 *
 * Trước đây cả hai nằm trong getBootstrap, tức mọi người mở app đều tải chúng
 * dù phần lớn không bao giờ mở hai màn đó:
 *   plan2026      -> chỉ SalesPlanProposePanel đọc (màn "Kế hoạch kinh doanh")
 *   baselines2025 -> chỉ DtThangReport đọc (màn "Báo cáo doanh thu")
 * Cả hai màn đều đã tải lười (React.lazy + KeepAliveTab), nên gọi endpoint này
 * đúng lúc mount là không ai phải chờ thêm gì.
 *
 * Ép phạm vi giống hệt bản cũ trong getBootstrap: Sale chỉ thấy số của khách
 * mình phụ trách. Đây là chỗ dễ sai nhất khi tách endpoint — tách ra mà quên
 * ép phạm vi là mở rộng quyền đọc cho mọi Sale.
 */
function oemAppGetReportContext_(token) {
  var user = oemAppRequireSession_(token);
  var scope = oemAppScopeOf_(user);

  var plan2026Full = oemAppLoadPlan2026_();
  var plan2026 = {};
  Object.keys(plan2026Full).forEach(function (code) {
    if (scope.all || oemAppMatchesSale_(plan2026Full[code].pic, scope)) {
      plan2026[code] = plan2026Full[code].months;
    }
  });

  return {
    plan2026: plan2026,
    baselines2025: oemAppLoad2025Baselines_()
  };
}


// Called by every writer so a user always sees their own edit immediately
// instead of waiting out the TTL. Bumps a version rather than hunting down every
// per-scope key: the old entries become unreachable and expire on their own.
function oemAppInvalidateBootstrap_() {
  try {
    CacheService.getScriptCache().put(OEMAPP_BOOTSTRAP_VER_KEY_, Utilities.getUuid().slice(0, 8), 21600);
  } catch (err) {}
}

// ---------- Orders (AI Order Agent → SAP staging tab) ----------
// "Orders" is a flat order-lines tab created directly in the Sheet by the user
// (not tracked here by gid, unlike the tabs above — its columns are: STT, Mã VT,
// Tên Vật Tư, Số Lượng, Đơn Giá, Thành Tiền, Mã tham chiếu SAP SO, Mã KH, Mã KH
// Chữ, Ngày tạo, PIC, Update alias).


// Leader is view-only for the business plan, same posture as orders/SOP.
function oemAppRequirePlanEditRole_(user) {
  if (!['sale', 'admin', 'creator'].includes(user.role)) {
    throw new Error('Không có quyền đề xuất kế hoạch kinh doanh (Leader chỉ xem).');
  }
}

// Bulk upsert — Sale fills in a table of their own clients for one month and
// submits once, same "ghi cả bảng đã lọc" pattern as oemAppSubmitSopDraft_.
// Matches existing rows by (Tháng, Search_code); a client with no existing row
// for this month gets appended. Columns G (Done) and H (Chênh) are NEVER
// touched by an upsert-edit — Done is the actual-achieved figure tracked
// separately, and Chênh is a live formula read back by getValues() as its
// computed number, so blindly writing that number back would silently replace
// the formula with a static value.
function oemAppSubmitSalesPlan_(token, thang, rows) {
  var user = oemAppRequireSession_(token);
  oemAppRequirePlanEditRole_(user);
  if (!thang) throw new Error('Thiếu tháng kế hoạch.');
  if (!rows || !rows.length) throw new Error('Không có dòng nào để lưu.');

  var sheet = oemAppGetSheetByGid_(OEMAPP_GIDS.PLAN_THANG);
  var existing = sheet.getDataRange().getValues();
  var legacyMonth = oemAppPlanLegacyMonth_(existing);

  // Legacy rows (blank Tháng) fall back to legacyMonth here too, so a Sale
  // resubmitting for the current (pre-migration) month upserts into their
  // existing row instead of appending a duplicate that double-counts totals.
  var rowIndexByCode = {};
  for (var i = 2; i < existing.length; i++) {
    var rowMonth = String(existing[i][14] || '').trim() || legacyMonth;
    if (rowMonth === thang && existing[i][1]) {
      rowIndexByCode[String(existing[i][1]).trim()] = i; // 0-indexed into `existing`
    }
  }

  var newRows = [];
  rows.forEach(function (plan) {
    if (!plan || !plan.searchCode) return;
    var planUpdate = (plan.w1 || 0) + (plan.w2 || 0) + (plan.w3 || 0) + (plan.w4 || 0) + (plan.w5 || 0);
    var idx = rowIndexByCode[String(plan.searchCode).trim()];

    if (idx !== undefined) {
      var r = existing[idx];
      r[1] = plan.searchCode || ''; r[2] = plan.clientName || ''; r[3] = plan.sale || ''; // B-D
      r[4] = plan.planKpi || 0; r[5] = planUpdate; // E-F (Plan KPI, Plan_Update)
      // G (Done) and H (Chênh) intentionally skipped.
      r[8] = plan.w1 || 0; r[9] = plan.w2 || 0; r[10] = plan.w3 || 0; r[11] = plan.w4 || 0; r[12] = plan.w5 || 0; // I-M
      r[13] = plan.note || ''; // N
      r[15] = 'Chờ duyệt'; // P (Trạng thái) — any resubmit re-queues for approval
    } else {
      newRows.push([
        '', plan.searchCode || '', plan.clientName || '', plan.sale || '',
        plan.planKpi || 0, planUpdate, 0, '',
        plan.w1 || 0, plan.w2 || 0, plan.w3 || 0, plan.w4 || 0, plan.w5 || 0,
        plan.note || '', thang, 'Chờ duyệt'
      ]);
    }
  });

  var dataRowCount = existing.length - 2;
  if (dataRowCount > 0) {
    var blockBD = [], blockEF = [], blockIM = [], blockN = [], blockP = [];
    for (var r2 = 2; r2 < existing.length; r2++) {
      var row = existing[r2];
      blockBD.push([row[1], row[2], row[3]]);
      blockEF.push([row[4], row[5]]);
      blockIM.push([row[8], row[9], row[10], row[11], row[12]]);
      blockN.push([row[13]]);
      blockP.push([row[15]]);
    }
    sheet.getRange(3, 2, dataRowCount, 3).setValues(blockBD);
    sheet.getRange(3, 5, dataRowCount, 2).setValues(blockEF);
    sheet.getRange(3, 9, dataRowCount, 5).setValues(blockIM);
    sheet.getRange(3, 14, dataRowCount, 1).setValues(blockN);
    sheet.getRange(3, 16, dataRowCount, 1).setValues(blockP);
  }

  if (newRows.length) {
    var startRow = existing.length + 1;
    sheet.getRange(startRow, 1, newRows.length, 16).setValues(newRows);
  }

  oemAppInvalidateBootstrap_();
  return { ok: true, savedCount: rows.length, thang: thang };
}

// Admin/Creator approves every 'Chờ duyệt' row for one month in a single
// action (duyệt cả tháng, không duyệt từng dòng) — mirrors oemAppApproveSop_.
function oemAppApproveSalesPlan_(token, thang) {
  var user = oemAppRequireSession_(token);
  if (!['admin', 'creator'].includes(user.role)) {
    throw new Error('Chỉ Admin mới có quyền duyệt kế hoạch kinh doanh.');
  }
  if (!thang) throw new Error('Thiếu tháng cần duyệt.');

  var sheet = oemAppGetSheetByGid_(OEMAPP_GIDS.PLAN_THANG);
  var rows = sheet.getDataRange().getValues();
  var legacyMonth = oemAppPlanLegacyMonth_(rows);
  var count = 0;
  for (var i = 2; i < rows.length; i++) {
    var rowMonth = String(rows[i][14] || '').trim() || legacyMonth;
    if (rowMonth === thang && String(rows[i][15] || '') === 'Chờ duyệt') {
      sheet.getRange(i + 1, 16, 1, 1).setValues([['Đã duyệt']]);
      count++;
    }
  }
  if (!count) throw new Error('Không có kế hoạch nào đang chờ duyệt cho tháng này.');

  oemAppInvalidateBootstrap_();
  return { ok: true, approvedCount: count, thang: thang };
}
