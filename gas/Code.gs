/**
 * OEM App backend — Google Apps Script Web App.
 *
 * SUPERSEDED (2026-08-18): this code is now merged into the SAME Apps Script
 * project already used by the "up-dt-oem" and "cong-no-oem" skills, so only one
 * Google account needs Editor access to the Sheet. The canonical, deployed
 * source is:
 *
 *   D:\Operation\Claude\Scripts\up-dt-oem\Code.gs
 *   (search for "===== OEM APP BACKEND =====" — everything below that marker
 *   is this file's logic, prefixed oemApp* to avoid colliding with the
 *   up-dt-oem/cong-no-oem code sharing that project)
 *
 * This file is kept only as a historical/standalone reference of what the
 * OEM App's backend contract looks like — DO NOT deploy this file on its own,
 * and do not edit it expecting it to be live; edit the file above instead.
 * See gas/SETUP.md for the actual deploy/update steps.
 *
 * Original design notes (still accurate for the merged version too):
 *   - login() verifies the PIN server-side; PINs never leave this script.
 *   - Every read/write below requires a valid session token from login().
 */

const SHEET_ID = '1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk';

const GIDS = {
  USERS: 276721346,
  CLIENTS: 385229237,
  TRANSACTIONS: 1448176667,
  PLAN_THANG: 1302921161,
  SALES_REVENUE: 965378295
};

const SESSION_TTL_SECONDS = 6 * 60 * 60; // 6h — matches the Export Ops Hub convention

// ---------- HTTP entry point ----------

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ error: 'Bad request body' });
  }

  const handler = apiMap_[body.fn];
  if (!handler) return jsonOutput_({ error: 'Unknown function: ' + body.fn });

  try {
    const result = handler.apply(null, body.args || []);
    return jsonOutput_({ result: result });
  } catch (err) {
    return jsonOutput_({ error: err.message || String(err) });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

const apiMap_ = {
  ping: ping_,
  getUserList: getUserList_,
  login: login_,
  getBootstrap: getBootstrap_,
  addClient: addClient_,
  addPlan: addPlan_
};

function ping_() {
  return { ok: true, time: new Date().toISOString() };
}

// ---------- Sheet helpers ----------

function getSheetByGid_(gid) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  throw new Error('Không tìm thấy tab với gid ' + gid);
}

function getRows_(gid) {
  return getSheetByGid_(gid).getDataRange().getValues();
}

function parseNum_(val) {
  if (val === '' || val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/,/g, '').replace(/\s/g, '').replace(/-/g, '0');
  return parseFloat(clean) || 0;
}

// Sheet cells formatted as dates come back from getValues() as JS Date
// objects, not "dd/MM/yyyy" strings like the old CSV export gave us — normalize
// so downstream logic (and the React app, unchanged) keeps working.
function normalizeDateStr_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'GMT+7', 'dd/MM/yyyy');
  }
  return val ? String(val) : '';
}

function getClientTextCode_(clientName, clientCode, rawCodeSearch) {
  if (rawCodeSearch && String(rawCodeSearch).length > 1 && !/^\d+$/.test(String(rawCodeSearch))) {
    return String(rawCodeSearch);
  }
  const nameUpper = String(clientName || '').toUpperCase();
  if (nameUpper.includes('TECOM')) return 'TECOM';
  if (nameUpper.includes('MAKXIM')) return 'CTMAXIMVN';
  if (nameUpper.includes('VIỆT TOÀN CẦU') || nameUpper.includes('VIETTOANCAU')) return 'CTVIETTOANCAU';
  if (nameUpper.includes('THÀNH ĐẠT')) return 'CTTHANHDAT';
  if (nameUpper.includes('SƠN HÀ') || nameUpper.includes('SONHA')) return 'CTQTSONHA';
  if (nameUpper.includes('THIÊN SƠN')) return 'CHTUANDP';
  if (nameUpper.includes('A BẮC')) return 'CHABACHN';
  return String(clientCode || rawCodeSearch || 'OEM-CLIENT');
}

function computeWeekFromDate_(dateStr, rawWeekNum) {
  if (rawWeekNum && parseInt(rawWeekNum, 10) > 0) return 'W' + parseInt(rawWeekNum, 10);
  if (!dateStr) return 'W1';
  const parts = String(dateStr).split(/[\/.\-]/);
  if (parts.length >= 1) {
    const day = parseInt(parts[0], 10);
    if (day >= 1 && day <= 7) return 'W1';
    if (day >= 8 && day <= 14) return 'W2';
    if (day >= 15 && day <= 21) return 'W3';
    if (day >= 22 && day <= 28) return 'W4';
    if (day >= 29) return 'W5';
  }
  return 'W1';
}

// ---------- Auth ----------

function findUserRow_(name) {
  const rows = getRows_(GIDS.USERS);
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(name).trim().toLowerCase()) {
      return rows[i];
    }
  }
  return null;
}

// Public (no token needed) — used to populate the login picker. Never
// includes the PIN column.
function getUserList_() {
  const rows = getRows_(GIDS.USERS);
  return rows.slice(1)
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        name: String(r[0]),
        role: String(r[2] || 'sale').toLowerCase(),
        saleId: String(r[4] || r[3] || '')
      };
    });
}

function login_(name, pin) {
  const row = findUserRow_(name);
  if (!row || String(row[1]) !== String(pin)) {
    throw new Error('Sai tên đăng nhập hoặc mã PIN.');
  }
  const user = {
    name: String(row[0]),
    role: String(row[2] || 'sale').toLowerCase(),
    saleId: String(row[4] || row[3] || '')
  };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(token, JSON.stringify(user), SESSION_TTL_SECONDS);
  return { token: token, user: user };
}

function requireSession_(token) {
  const raw = token ? CacheService.getScriptCache().get(token) : null;
  if (!raw) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
  return JSON.parse(raw);
}

// ---------- Data readers (all require a valid session) ----------

function loadClients_() {
  const rows = getRows_(GIDS.CLIENTS);
  return rows.slice(1).map(function (row, idx) {
    return {
      code: String(row[1] || ('CLI-' + (1000 + idx))),
      codeSearch: getClientTextCode_(row[3] || row[2], row[1], row[2]),
      name: String(row[3] || row[2] || 'Khách hàng OEM'),
      alias: String(row[4] || ''),
      type: String(row[5] || 'Doanh nghiệp'),
      sale: String(row[6] || 'KH Đình Hoan'),
      address: String(row[7] || ''),
      status: String(row[8] || 'Active').trim()
    };
  }).filter(function (c) { return c.name && c.name !== 'Client name'; });
}

function loadTransactions_() {
  const rows = getRows_(GIDS.TRANSACTIONS);
  return rows.slice(1).map(function (row) {
    const dateStr = normalizeDateStr_(row[0]) || normalizeDateStr_(row[1]);
    const clientName = row[6] || '';
    const rawCode = row[60] || row[5] || '';
    const codeSearch = getClientTextCode_(clientName, rawCode, row[60]);
    const month = row[40] || 'T08-2026';
    const week = computeWeekFromDate_(dateStr, row[42]);

    return {
      date: dateStr,
      billingNo: String(row[2] || ''),
      docType: String(row[4] || ''),
      clientCode: codeSearch,
      clientName: String(clientName),
      sku: String(row[8] || ''),
      skuName: String(row[9] || ''),
      qty: parseNum_(row[11] || row[10]),
      unit: String(row[12] || 'PC'),
      price: parseNum_(row[14]),
      revenue: parseNum_(row[17]),
      netRevenue: parseNum_(row[22]),
      orderNo: String(row[24] || row[2] || 'SO-10002'),
      month: month,
      week: week,
      sale: String(row[61] || row[36] || 'KH Đình Hoan'),
      group: String(row[62] || row[27] || 'Linh kiện OEM'),
      netVat: parseNum_(row[59])
    };
  }).filter(function (t) { return t.clientName && t.skuName; });
}

// There is no dedicated product-catalogue tab in this Sheet — Materials is a
// month-by-SKU pivot, not a catalogue — so materials are derived from
// transactions, same as the old sheetService.js did.
function deriveMaterials_(transactions) {
  const map = {};
  transactions.forEach(function (t) {
    if (!t.sku) return;
    if (!map[t.sku]) {
      const words = t.skuName.split(' ');
      map[t.sku] = {
        sku: t.sku,
        name: t.skuName,
        alias: words[0] + ' ' + (words[1] || ''),
        unit: t.unit || 'PC',
        group: t.group || 'Linh kiện OEM',
        totalQty: 0,
        totalRevenue: 0,
        prices: []
      };
    }
    const mat = map[t.sku];
    mat.totalQty += t.qty;
    mat.totalRevenue += t.netRevenue;
    if (t.price > 0) mat.prices.push(t.price);
  });

  return Object.keys(map).map(function (sku) {
    const m = map[sku];
    const minPrice = m.prices.length ? Math.min.apply(null, m.prices) : 0;
    const maxPrice = m.prices.length ? Math.max.apply(null, m.prices) : 0;
    const avgPrice = m.prices.length
      ? Math.round(m.prices.reduce(function (a, b) { return a + b; }, 0) / m.prices.length)
      : 0;
    return {
      sku: m.sku, name: m.name, alias: m.alias, unit: m.unit, group: m.group,
      totalQty: m.totalQty, avgPrice: avgPrice, minPrice: minPrice, maxPrice: maxPrice
    };
  });
}

function loadSalesPlans_() {
  const rows = getRows_(GIDS.PLAN_THANG);
  const dataRows = rows.slice(2); // row0 = title/totals, row1 = column labels
  return dataRows.map(function (r) {
    const clientName = String(r[2] || 'Khách hàng OEM');
    const searchCode = r[1] ? String(r[1]).trim() : getClientTextCode_(clientName, r[0], r[1]);
    return {
      searchCode: searchCode,
      clientName: clientName,
      sale: String(r[3] || 'KH Đình Hoan'),
      planKpi: parseNum_(r[4]),
      planUpdate: parseNum_(r[5]),
      done: parseNum_(r[6]),
      w1: parseNum_(r[8]),
      w2: parseNum_(r[9]),
      w3: parseNum_(r[10]),
      w4: parseNum_(r[11]),
      w5: parseNum_(r[12]),
      note: String(r[13] || ''),
      status: 'Đã duyệt'
    };
  }).filter(function (p) { return p.searchCode && p.searchCode !== 'Search_code'; });
}

function load2025Baselines_() {
  const rows = getRows_(GIDS.SALES_REVENUE);
  const map = {
    TECOM: 30323700000,
    CTMAXIMVN: 23500000000,
    CTQTSONHA: 9546500000,
    CTVIETTOANCAU: 8598500000,
    CHTUANDP: 7546800000,
    CHABACHN: 4000000000
  };
  if (rows.length > 5) {
    rows.slice(5).forEach(function (row) {
      const code = row[0] || getClientTextCode_(row[1], '', row[0]);
      const rev2025 = parseNum_(row[3]);
      if (code && rev2025 > 0) map[code] = rev2025;
    });
  }
  return map;
}

function getBootstrap_(token) {
  requireSession_(token); // any authenticated user may read — role-based UI filtering stays client-side
  const transactions = loadTransactions_();
  return {
    clients: loadClients_(),
    transactions: transactions,
    materials: deriveMaterials_(transactions),
    plans: loadSalesPlans_(),
    baselines2025: load2025Baselines_()
  };
}

// ---------- Writers ----------
// Both are plain appendRow — never overwrite/rewrite existing rows — to keep
// this safe against the live production data in this Sheet.

function addClient_(token, client) {
  requireSession_(token);
  getSheetByGid_(GIDS.CLIENTS).appendRow([
    '', // Reconciliation Acct — left blank, not used by the app
    client.code || '',
    client.codeSearch || '',
    client.name || '',
    client.alias || '',
    client.type || 'Doanh nghiệp',
    client.sale || '',
    client.address || '',
    client.status || 'Active'
  ]);
  return { ok: true };
}

function addPlan_(token, plan) {
  requireSession_(token);
  getSheetByGid_(GIDS.PLAN_THANG).appendRow([
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
  return { ok: true };
}
