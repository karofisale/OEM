/** Transactions (tab "Data"), sales plans, 2025 baselines, combined getBootstrap payload. */

// Perf (2026-08-26): reading + mapping tab "Data" is the single most expensive
// read in this backend, and several helpers reach for it independently within
// ONE doPost (oemAppAiParseOrder_ pulls the catalog block AND the transaction
// history to work out what this client has bought before). Memoized per
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
    // Tháng để rỗng khi cột trống, KHÔNG mặc định 'T08-2026'. Giá trị mặc định
    // đó dồn mọi dòng thiếu tháng vào đúng một tháng thật, làm phồng doanh thu
    // tháng đó bằng số của tháng khác. Dashboard.jsx đã chữa phần hiện của lỗi
    // này (gom vào rổ 'Chưa rõ tháng') nhưng nguồn vẫn trả về T08-2026, nên mọi
    // phép cộng theo tháng ở nơi khác vẫn sai — kể cả số tổng quan trên cổng.
    // Mọi nơi tiêu thụ đều đã chịu được chuỗi rỗng (xem utils/period.js).
    var month = row[40] ? String(row[40]).trim() : '';
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
//
// Trả thêm `name` (2026-09-10): màn "Đề xuất kế hoạch" giờ dựng bảng TỪ danh
// sách này chứ không từ tab Clients, nên một khách có KPI năm mà tab Clients
// chưa có dòng (hoặc để Inactive) vẫn phải hiện ra được — mà muốn hiện thì phải
// có tên lấy từ đâu đó, và chỗ duy nhất còn lại là chính tab này.
//
// Bỏ qua dòng tổng hợp: tab này có sẵn mấy dòng cộng ở đầu (đã nhảy qua bằng
// i = 6) nhưng cũng có thể có dòng cộng nằm giữa/cuối do người dùng tự thêm.
// Trước đây chúng vô hại vì chỉ dùng để TRA KPI theo mã khách; giờ mỗi mã trong
// map này thành một DÒNG NHẬP trên màn đề xuất, nên một dòng "Tổng cộng" sẽ
// biến thành một khách hàng giả mà Sale nhập số vào được.
//
// CHỈ soi cột Mã KH, KHÔNG soi cột tên: mã khách ở đây là token ngắn kiểu
// TECOM/CTMAXIMVN, còn tên thật rất hay bắt đầu bằng "Tổng công ty ..." — lọc
// theo tên là tự tay xoá khách thật khỏi bảng kế hoạch. Và so KHỚP TRỌN mã chứ
// không so theo tiền tố: một mã thật là "CONGTYABC" mà bị tiền tố "cong" ăn mất
// thì Sale mất luôn khả năng lập kế hoạch cho khách đó — hỏng nặng hơn nhiều so
// với việc để lọt một dòng tổng.
var OEMAPP_PLAN2026_SKIP_CODES_ = {
  'TONG': 1, 'TỔNG': 1, 'TONGCONG': 1, 'TỔNGCỘNG': 1, 'CONG': 1, 'CỘNG': 1,
  'TOTAL': 1, 'SUBTOTAL': 1, 'GRANDTOTAL': 1, 'MAKH': 1, 'MÃKH': 1
};

function oemAppPlan2026IsAggregateCode_(code) {
  var key = String(code || '').trim().toUpperCase().replace(/[ ._-]/g, '');
  return !!OEMAPP_PLAN2026_SKIP_CODES_[key];
}

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
    if (oemAppPlan2026IsAggregateCode_(code)) continue;
    var name = String(rows[i][1] || '').trim();
    var months = [];
    for (var m = 0; m < 12; m++) months.push(oemAppParseNum_(rows[i][4 + m]));
    map[code] = { name: name, pic: String(rows[i][2] || ''), months: months };
  }
  return map;
}


/**
 * Doanh thu NỀN năm 2025 của từng khách — mốc so sánh cột "% vs 2025" trên báo
 * cáo DT Tháng khi lọc "Tất cả các Tháng" (xem DtThangReport.jsx).
 *
 * Tính THẲNG từ lịch sử giao dịch (tab Data), cộng netRevenue (doanh thu
 * THUẦN — cùng quy ước với mọi báo cáo khác, xem sửa doanh thu thuần
 * 21/09/2026) của mọi dòng có tháng kết thúc "-2025", gộp theo clientCode.
 *
 * TRƯỚC ĐÂY (tới 2026-09-25) hàm này đọc tab "Plan2026" qua gid
 * OEMAPP_GIDS.SALES_REVENUE — trùng vật lý với tab đó chỉ vì lịch sử gid, và
 * hỏng theo thiết kế: cột D "Năm 2026" của Plan2026 là chỗ Sale sẽ ghi chỉ
 * tiêu NĂM TỚI khi tính năng "Lập kế hoạch năm" ra đời (xác nhận với người
 * dùng), lúc đó "doanh thu nền 2025" sẽ lặng lẽ đọc nhầm thành chỉ tiêu 2026
 * của chính khách đó. Tách hẳn khỏi Plan2026 để tab kia rảnh tay dùng cho kế
 * hoạch mà không đụng vào con số so sánh này.
 *
 * 6 giá trị dưới đây là số 2025 đã biết của các khách hàng lớn (khớp đúng số
 * đang nằm ở tab Plan2026 trước khi tách) — dùng làm SÀN, ghi đè bằng số tính
 * được từ tab Data bất cứ khi nào tính được > 0 (ví dụ lịch sử Data chưa lùi
 * đủ về hết 2025 cho khách nào thì khách đó vẫn có sàn để so sánh).
 */
function oemAppLoad2025Baselines_() {
  var map = {
    TECOM: 30323700000,
    CTMAXIMVN: 23500000000,
    CTQTSONHA: 9546500000,
    CTVIETTOANCAU: 8598500000,
    CHTUANDP: 7546800000,
    CHABACHN: 4000000000
  };

  var tong = {};
  oemAppLoadTransactions_().forEach(function (t) {
    if (!t.clientCode || !/-2025$/.test(t.month || '')) return;
    tong[t.clientCode] = (tong[t.clientCode] || 0) + (t.netRevenue || 0);
  });

  Object.keys(tong).forEach(function (code) {
    if (tong[code] > 0) map[code] = tong[code];
  });

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

// Sàn chống bấm dồn cho nút "Đồng bộ Sheet". Mỗi lượt ép làm mới là dựng lại
// TOÀN BỘ payload (đọc trọn tab Data rồi dẫn xuất materials từ đó), nên 5 lần
// bấm liên tiếp không được thành 5 lượt dựng. Lần bấm đầu dọn cache, các lần
// trong 15s sau đó dùng chính kết quả vừa dựng — vẫn là dữ liệu mới, chỉ là
// không dựng lại lần nữa.
var OEMAPP_FORCE_FLOOR_KEY_ = 'oemapp_force_floor';
var OEMAPP_FORCE_FLOOR_SECONDS_ = 15;


// Which slice of the data this user is allowed to see. A Sale only ever gets
// their own rows; Creator/Admin/Leader get everything.
//
// This is a real permission boundary now, not a display filter. Until 2026-08-20
// the backend returned every transaction to everyone and the frontend hid the
// other Sales' rows — except the "Lịch sử doanh thu" tab, which never filtered at
// all, so one Sale could simply read another's revenue there. Even where the UI
// did hide it, the data still sat in the browser.
/**
 * Phạm vi ĐỌC trong app. Từ 14/09/2026: mọi role đều thấy toàn bộ dữ liệu.
 *
 * Trước đó role 'sale' chỉ thấy dòng của chính mình. Theo yêu cầu 14/09/2026,
 * các Sale cần xem được số của nhau — đúng bằng những gì role 'leader' đã thấy
 * sẵn. Mở ở ĐÂY chứ không sửa rải rác từng hàm: mọi đường đọc dữ liệu trong
 * backend này đều đi qua oemAppScopeOf_ + oemAppMatchesSale_, nên một chỗ này
 * là đủ và không màn nào bị bỏ sót hay lệch luật với màn khác.
 *
 * MỞ ĐỌC KHÔNG PHẢI MỞ GHI. Xem được của nhau nhưng không sửa được của nhau —
 * ràng buộc chủ sở hữu nằm ở oemAppRequirePlanOwnership_ (kế hoạch tháng) và
 * oemAppRequireOrderOwnership_ (đơn hàng). Hai chốt đó là thật, giao diện chỉ
 * làm cho dễ nhìn.
 *
 * key = 'all' cho mọi người nên cache bootstrap giờ dùng chung một mục thay vì
 * mỗi Sale một mục — đúng vì payload đã giống hệt nhau.
 *
 * Vẫn trả kèm saleId cho chỗ nào cần biết danh tính người gọi.
 */
function oemAppScopeOf_(user) {
  return { all: true, saleId: String(user.saleId || '').trim().toLowerCase(), key: 'all' };
}


/**
 * Phạm vi CÁ NHÂN — chỉ dòng của chính người này. Dùng cho thẻ tổng quan trên
 * cổng Karofi ID (PortalStats.gs).
 *
 * Vì sao thẻ đó KHÔNG mở theo oemAppScopeOf_: nó không có bộ lọc chọn xem của
 * ai, chỉ là một con số duy nhất. Đổi nó thành số toàn công ty thì Sale nhìn
 * vào tưởng đó là doanh số mình làm ra — sai lệch chứ không phải minh bạch hơn.
 *
 * Fail CLOSED. saleId trống thì KHÔNG trả gì, chứ không trả tất cả:
 * `indexOf('')` đúng với mọi dòng.
 */
function oemAppScopeCaNhan_(user) {
  var role = String(user.role || '').toLowerCase();
  if (role !== 'sale') return { all: true, key: 'all' };
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


function oemAppGetBootstrap_(token, forceRefresh) {
  var user = oemAppRequireSession_(token);
  var scope = oemAppScopeOf_(user);

  // Nút "Đồng bộ Sheet" phải THẬT SỰ đọc lại Sheet (2026-09-07).
  //
  // Hai lớp cache dưới đây (payload theo phạm vi, và khối catalog dùng chung)
  // đều có TTL 10 phút và CHỈ được dọn khi chính app ghi dữ liệu. Sửa tay trực
  // tiếp trên Sheet, hoặc skill up-dt-oem đổ số vào tab Data, không có đường
  // nào báo cho backend biết — nên người dùng bấm Đồng bộ bao nhiêu lần cũng
  // vẫn nhận đúng payload cũ cho tới khi TTL hết. Chú thích cũ ở trên coi 10
  // phút là "an toàn" vì cho rằng tab Data chỉ đổi theo ngày/tuần; thực tế
  // người dùng sửa Sheet rồi muốn thấy ngay.
  //
  // Bump version = mọi entry cũ (của MỌI người, mọi phạm vi) thành không thể
  // với tới, nên lượt dựng ngay dưới đây buộc phải đọc từ Sheet. Một người bấm
  // Đồng bộ là cả nhóm thấy số mới, không ai phải chờ hết TTL.
  //
  // Đây từng là endpoint riêng `forceRefreshBootstrap`, đã gỡ khỏi bảng định
  // tuyến 2026-09-04 vì nó KHÔNG kiểm token — người lạ ép backend dựng lại
  // payload liên tục được. Gộp vào đây thì thao tác nằm sau
  // oemAppRequireSession_ ở trên, cộng thêm sàn chống bấm dồn.
  if (forceRefresh === true) {
    var floorCache = CacheService.getScriptCache();
    if (!floorCache.get(OEMAPP_FORCE_FLOOR_KEY_)) {
      floorCache.put(OEMAPP_FORCE_FLOOR_KEY_, '1', OEMAPP_FORCE_FLOOR_SECONDS_);
      oemAppInvalidateBootstrap_();
      oemAppInvalidateCatalog_();
    }
  }

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

  // Giữ nguyên phép ép phạm vi; chỉ đổi HÌNH DẠNG giá trị trả về từ mảng 12
  // tháng thành { months, name, pic } (2026-09-10) — màn đề xuất cần tên + PIC
  // để dựng dòng cho khách chưa có trong tab Clients. Không nơi nào khác đọc
  // plan2026 (xem ghi chú đầu hàm), nên đổi hình dạng ở đây là an toàn.
  var plan2026Full = oemAppLoadPlan2026_();
  var plan2026 = {};
  Object.keys(plan2026Full).forEach(function (code) {
    var entry = plan2026Full[code];
    if (scope.all || oemAppMatchesSale_(entry.pic, scope)) {
      plan2026[code] = { months: entry.months, name: entry.name, pic: entry.pic };
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

/**
 * Sale chỉ được lưu kế hoạch cho khách của CHÍNH MÌNH.
 *
 * Cần từ 14/09/2026, khi phạm vi đọc mở ra cho mọi Sale xem số của nhau
 * (oemAppScopeOf_): bảng "Đề xuất kế hoạch" giờ liệt kê khách của tất cả Sale,
 * nên khoá ô nhập ở giao diện thôi là không đủ — đây mới là chốt thật.
 *
 * Chủ sở hữu xác định BÊN SERVER, KHÔNG tin `plan.sale` client gửi lên (client
 * gửi gì cũng được). Thứ tự tra: dòng đã có trong Plan_Thang -> cột D; chưa có
 * -> PIC trong Plan2026; cuối cùng -> cột Sale của tab Clients.
 *
 * Khách không tra được chủ ở cả ba nơi thì CHO QUA: đó là khách mới Sale tự bổ
 * sung vào kế hoạch, đúng quy trình. Chốt này chỉ để không ai giẫm lên khách đã
 * có chủ khác.
 *
 * Hai lượt đọc Sheet phụ (Plan2026, Clients) chỉ chạy khi thật sự cần — Sale
 * sửa các dòng đã có của mình là trường hợp thường gặp nhất, và trường hợp đó
 * tra xong ngay từ `existing`.
 */
function oemAppRequirePlanOwnership_(user, rows, existing, rowIndexByCode) {
  if (String(user.role || '').toLowerCase() !== 'sale') return;

  var saleId = String(user.saleId || '').trim().toLowerCase();
  if (!saleId) {
    throw new Error('Tài khoản chưa được gán mã Sale nên chưa lưu được kế hoạch. ' +
                    'Nhờ Admin bổ sung cột Sale ID cho tài khoản này trong tab Users.');
  }

  var plan2026 = null, clientSaleByCode = null;
  var viPham = [];

  rows.forEach(function (plan) {
    if (!plan || !plan.searchCode) return;
    var code = String(plan.searchCode).trim();

    var chu = '';
    var idx = rowIndexByCode[code];
    if (idx !== undefined) chu = String(existing[idx][3] || '').trim();

    if (!chu) {
      if (plan2026 === null) plan2026 = oemAppLoadPlan2026_();
      if (plan2026[code]) chu = String(plan2026[code].pic || '').trim();
    }
    if (!chu) {
      if (clientSaleByCode === null) {
        clientSaleByCode = {};
        oemAppLoadClients_().forEach(function (c) {
          if (c.codeSearch && !clientSaleByCode[c.codeSearch]) clientSaleByCode[c.codeSearch] = c.sale;
        });
      }
      chu = String(clientSaleByCode[code] || '').trim();
    }

    if (!chu) return; // khách mới, chưa có chủ -> cho qua
    if (chu.toLowerCase().indexOf(saleId) === -1) viPham.push(code);
  });

  if (viPham.length) {
    throw new Error('Chưa lưu gì cả. ' + viPham.slice(0, 5).join(', ') +
      (viPham.length > 5 ? ' và ' + (viPham.length - 5) + ' khách nữa' : '') +
      ' là khách của Sale khác. Anh/chị XEM được kế hoạch của mọi Sale nhưng chỉ SỬA được khách mình phụ trách.');
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

  oemAppRequirePlanOwnership_(user, rows, existing, rowIndexByCode);

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
