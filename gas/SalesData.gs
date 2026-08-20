/** Transactions (tab "Data"), sales plans, 2025 baselines, combined getBootstrap payload. */

function oemAppLoadTransactions_() {
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

function oemAppLoadSalesPlans_() {
  var rows = oemAppGetRows_(OEMAPP_GIDS.PLAN_THANG);
  var dataRows = rows.slice(2); // row0 = title/totals, row1 = column labels
  return dataRows.map(function (r) {
    var clientName = String(r[2] || 'Khách hàng OEM');
    var searchCode = r[1] ? String(r[1]).trim() : oemAppGetClientTextCode_(clientName, r[0], r[1]);
    return {
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
      note: String(r[13] || '')
      // No `status` field: tab Plan_Thang has no approval column, so this used to
      // hardcode 'Đã duyệt' for every row — the UI then showed every plan as
      // approved regardless of reality. Until a real approval column exists, the
      // frontend renders "chưa theo dõi" rather than inventing a state.
    };
  }).filter(function (p) { return p.searchCode && p.searchCode !== 'Search_code'; });
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


// Bootstrap cache. The payload is currently IDENTICAL for every user (role-based
// filtering is still done client-side, see the note in oemAppBuildBootstrap_), so
// one shared script-cache entry serves everyone — the first user of the day pays
// the full cost and everyone after them gets a near-instant response.
//
// TTL is safe at 10 minutes: tab "Data" is written by the separate up-dt-oem
// import skill on a daily/weekly cadence, not continuously. The tabs this app
// writes itself (Clients, Plan_Thang, Products) explicitly drop the cache on
// write, so a user never sees their own edit missing.
//
// IMPORTANT: if per-Sale server-side filtering is ever added, this key MUST gain
// a per-user component, otherwise one Sale would be served another Sale's data.
var OEMAPP_BOOTSTRAP_CACHE_KEY_ = 'oemapp_bootstrap_v1';
var OEMAPP_BOOTSTRAP_TTL_ = 600; // 10 minutes


function oemAppGetBootstrap_(token) {
  oemAppRequireSession_(token); // any authenticated user may read — role-based UI filtering stays client-side

  var cached = oemAppCacheGetBig_(OEMAPP_BOOTSTRAP_CACHE_KEY_);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {
      // Corrupt/truncated cache entry — fall through and rebuild from the Sheet.
    }
  }

  var payload = oemAppBuildBootstrap_();

  // A cache write failing (quota, size) must never break the actual request.
  try {
    oemAppCachePutBig_(OEMAPP_BOOTSTRAP_CACHE_KEY_, JSON.stringify(payload), OEMAPP_BOOTSTRAP_TTL_);
  } catch (err) {}

  return payload;
}


function oemAppBuildBootstrap_() {
  var transactions = oemAppLoadTransactions_();
  var aliasHints = oemAppLoadOrderAliasHints_();
  var catalog = oemAppLoadMaterialCatalog_();
  return {
    clients: oemAppLoadClients_(),
    transactions: transactions,
    materials: oemAppDeriveMaterials_(transactions, aliasHints, catalog.bySku),
    plans: oemAppLoadSalesPlans_(),
    baselines2025: oemAppLoad2025Baselines_()
  };
}


// Called by every writer so a user always sees their own edit immediately
// instead of waiting out the TTL.
function oemAppInvalidateBootstrap_() {
  try {
    oemAppCacheDropBig_(OEMAPP_BOOTSTRAP_CACHE_KEY_);
  } catch (err) {}
}

// ---------- Orders (AI Order Agent → SAP staging tab) ----------
// "Orders" is a flat order-lines tab created directly in the Sheet by the user
// (not tracked here by gid, unlike the tabs above — its columns are: STT, Mã VT,
// Tên Vật Tư, Số Lượng, Đơn Giá, Thành Tiền, Mã tham chiếu SAP SO, Mã KH, Mã KH
// Chữ, Ngày tạo, PIC, Update alias).


function oemAppAddPlan_(token, plan) {
  oemAppRequireSession_(token);
  oemAppGetSheetByGid_(OEMAPP_GIDS.PLAN_THANG).appendRow([
    '',
    plan.searchCode || '',
    plan.clientName || '',
    plan.sale || '',
    plan.planKpi || 0,
    plan.planUpdate || 0,
    plan.done || 0,
    '',
    plan.w1 || 0,
    plan.w2 || 0,
    plan.w3 || 0,
    plan.w4 || 0,
    plan.w5 || 0,
    plan.note || ''
  ]);
  oemAppInvalidateBootstrap_();
  return { ok: true };
}
