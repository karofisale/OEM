/**
 * portalstats.test.cjs — kiểm gas/PortalStats.gs (số tổng quan cho cổng VHKD).
 *
 *   node test/portalstats.test.cjs
 *
 * Đuôi .cjs chứ không .js: package.json của dự án có "type": "module", nên một
 * file .js trong kho này là ES module và `require` không tồn tại. Bài test cần
 * `vm` + `require` để nạp mã .gs, nên nó phải là CommonJS.
 *
 * Nạp TOÀN BỘ mã .gs của dự án vào một phạm vi chung, đúng như Apps Script
 * làm, và chỉ giả lập những service của nền tảng mà Node không có
 * (SpreadsheetApp, CacheService, Utilities, LockService...). KHÔNG giả lập một
 * hàm nào của dự án — kể cả oemAppMatchesSale_, thứ đang quyết định phân
 * quyền: giả lập nó là bài test tự nghĩ ra luật quyền của riêng nó.
 *
 * Nạp cả dự án cũng là cách bắt lỗi gọi tên hàm không tồn tại. Lỗi đó chạy
 * được trong một bài test có bản giả rồi nổ ReferenceError trên Apps Script —
 * đã xảy ra thật ở dự án Karofi ID.
 *
 * Ba việc được chốt ở đây:
 *   1. Doanh thu tháng trước KHÔNG cộng dòng thiếu tháng trên tab Data.
 *   2. Sale chỉ cộng số của chính mình; saleId trống thì không cộng gì.
 *   3. Ba cột Plan KPI / Plan_Update / Done đọc đúng cột của tab Plan_Thang.
 */

process.env.TZ = 'Asia/Ho_Chi_Minh';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAS = path.join(__dirname, '..', 'gas');

// Code.gs nạp CUỐI: nó có `var oemAppApiMap_ = { ... }` trỏ tới hàm ở các file
// khác, mà trong vm mỗi file là một lượt chạy riêng nên hàm phải tồn tại
// trước. Trên Apps Script không cần thứ tự này (nền tảng hoist cả dự án).
const FILES = fs.readdirSync(GAS)
  .filter((f) => f.endsWith('.gs') && f !== 'Code.gs')
  .concat(['Code.gs']);

let pass = 0, fail = 0;
function check(ten, dieuKien, them) {
  if (dieuKien) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}

const NAY = new Date();
function thangOem(lech) {
  const d = new Date(NAY.getFullYear(), NAY.getMonth() + lech, 1);
  return 'T' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
}
const THANG_NAY = thangOem(0);
const THANG_TRUOC = thangOem(-1);

/** Dòng tab Data: chỉ điền những cột mà oemAppLoadTransactionsUncached_ đọc. */
function dongData(o) {
  const r = new Array(63).fill('');
  r[0] = o.date || '2026-09-01';
  r[6] = o.client;
  r[8] = 'SKU1';
  r[9] = 'Tên hàng';
  r[11] = 1;
  r[17] = o.revenue || 0;
  r[22] = o.netRevenue === undefined ? (o.revenue || 0) : o.netRevenue;
  r[40] = o.month === undefined ? THANG_TRUOC : o.month;
  r[61] = o.sale;
  return r;
}

/** Dòng tab Plan_Thang. */
function dongPlan(o) {
  const r = new Array(16).fill('');
  r[0] = o.code;
  r[1] = o.code;
  r[2] = o.client;
  r[3] = o.sale;
  r[4] = o.planKpi || 0;
  r[5] = o.planUpdate || 0;
  r[6] = o.done || 0;
  r[14] = o.month === undefined ? THANG_NAY : o.month;
  r[15] = o.status || '';
  return r;
}

/** Dòng tab Debt — tiêu đề ở HÀNG 3, dữ liệu từ hàng 4 (xem Debt.gs). */
function dongDebt(o) {
  return [o.code, '', o.client, o.pic, o.creditLimit || 0, 0, o.balance || 0];
}

function nap(cfg) {
  const tabsByGid = {
    1448176667: [new Array(63).fill('h')].concat(cfg.data || []),
    1302921161: [new Array(16).fill('title'), new Array(16).fill('label')].concat(cfg.plan || []),
    276721346: [['Name', 'PIN']],
    385229237: [['Ma KH']],
    965378295: [['a'], ['b'], ['c'], ['d'], ['e']]
  };
  const debtRows = cfg.debt || [];
  const debtValues = [
    ['', '', '', '', '', '', 'rác'],
    ['', '', '', '', '', '', ''],
    ['Mã KH', 'MÃ SỐ CŨ', 'Tên Khách hàng', 'PIC', 'Hạn mức', 'Vượt hạn mức', 'Số dư công nợ']
  ].concat(debtRows);

  function toSheet(values, gid) {
    return {
      getSheetId: () => gid,
      getDataRange: () => ({ getValues: () => values }),
      getLastRow: () => values.length,
      getRange: (row, col, nRows, nCols) => ({
        getValues: () => values.slice(row - 1, row - 1 + nRows)
          .map((r) => r.slice(col - 1, col - 1 + nCols)),
        setValues: () => {}
      })
    };
  }

  const byName = { Debt: toSheet(debtValues, 999) };
  const all = Object.keys(tabsByGid).map((g) => toSheet(tabsByGid[g], Number(g)));

  const sandbox = {
    SpreadsheetApp: {
      openById: () => ({
        getSheets: () => all,
        getSheetByName: (n) => byName[n] || null
      })
    },
    Utilities: {
      formatDate: (d, tz, f) => {
        const p = (x) => String(x).padStart(2, '0');
        if (f === 'yyyy') return String(d.getFullYear());
        if (f === 'MM') return p(d.getMonth() + 1);
        if (f === 'dd') return p(d.getDate());
        return d.toISOString();
      },
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2)
    },
    CacheService: {
      getScriptCache: () => ({
        get: () => null, getAll: () => ({}), put: () => {}, putAll: () => {}, remove: () => {}
      })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 'json' } },
    UrlFetchApp: { fetch: () => { throw new Error('Bài test không gọi mạng'); } },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Logger: { log: () => {} },
    console, JSON, Math, Date, String, Number, Object, Array, RegExp, Error,
    isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  FILES.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(GAS, f), 'utf8'), sandbox, { filename: f });
  });
  return sandbox;
}

const CFG = {
  data: [
    dongData({ client: 'Khách A', sale: 'Sale1', netRevenue: 1000, month: THANG_TRUOC }),
    dongData({ client: 'Khách B', sale: 'Sale2', netRevenue: 2000, month: THANG_TRUOC }),
    dongData({ client: 'Khách A', sale: 'Sale1', netRevenue: 500, month: THANG_NAY }),
    // Dòng thiếu tháng: TRƯỚC ĐÂY bị gán mặc định 'T08-2026' nên cộng nhầm vào
    // đúng một tháng thật. Ca này chốt việc nó không còn cộng vào đâu cả.
    dongData({ client: 'Khách C', sale: 'Sale1', netRevenue: 9999, month: '' })
  ],
  plan: [
    dongPlan({ code: 'KHA', client: 'Khách A', sale: 'Sale1', planKpi: 100, planUpdate: 90, done: 40 }),
    dongPlan({ code: 'KHB', client: 'Khách B', sale: 'Sale2', planKpi: 200, planUpdate: 180, done: 70, status: 'Chờ duyệt' }),
    dongPlan({ code: 'KHZ', client: 'Khách Z', sale: 'Sale1', planKpi: 555, planUpdate: 555, done: 555, month: thangOem(-3) })
  ],
  debt: [
    dongDebt({ code: 'KHA', client: 'Khách A', pic: 'Sale1', balance: 7000 }),
    dongDebt({ code: 'KHB', client: 'Khách B', pic: 'Sale2', balance: 3000 })
  ]
};

const duAn = nap(CFG);

console.log('\n1. Nhãn tháng đúng định dạng của app (T09-2026)');
check('tháng hiện tại', duAn.oemAppPstatsThang_(0) === THANG_NAY, duAn.oemAppPstatsThang_(0));
check('tháng trước', duAn.oemAppPstatsThang_(-1) === THANG_TRUOC, duAn.oemAppPstatsThang_(-1));
check('lùi qua mốc năm vẫn đúng', duAn.oemAppPstatsThang_(-12) === THANG_NAY.replace(
  /(\d{4})$/, (m) => String(Number(m) - 1)), duAn.oemAppPstatsThang_(-12));

console.log('\n2. Toàn quyền (admin) — cộng hết');
{
  const r = duAn.oemAppBuildPortalStats_({ all: true, key: 'all' });
  check('doanh thu tháng trước = 1000 + 2000', r.dtThangTruoc === 3000, r.dtThangTruoc);
  check('KHÔNG cộng dòng thiếu tháng (9999)', r.dtThangTruoc === 3000, r.dtThangTruoc);
  check('báo ra số dòng thiếu tháng', r.soDongThieuThang === 1, r.soDongThieuThang);
  check('Plan KPI = 100 + 200', r.planKpi === 300, r.planKpi);
  check('Plan_Update = 90 + 180', r.planUpdate === 270, r.planUpdate);
  check('Done = 40 + 70', r.done === 110, r.done);
  check('KHÔNG cộng kế hoạch tháng khác (555)', r.planKpi === 300 && r.done === 110);
  check('số khách có kế hoạch tháng này = 2', r.soKhachCoKeHoach === 2, r.soKhachCoKeHoach);
  check('đếm dòng chờ duyệt', r.soDongChoDuyet === 1, r.soDongChoDuyet);
  check('công nợ = 7000 + 3000', r.congNo === 10000, r.congNo);
  check('phạm vi rỗng = toàn bộ', r.phamVi === '', r.phamVi);
}

console.log('\n3. PHÂN QUYỀN — sale chỉ thấy số của mình');
{
  const scope = duAn.oemAppScopeOf_({ role: 'sale', saleId: 'Sale1' });
  const r = duAn.oemAppBuildPortalStats_(scope);
  check('doanh thu tháng trước chỉ của Sale1', r.dtThangTruoc === 1000, r.dtThangTruoc);
  check('Plan KPI chỉ của Sale1', r.planKpi === 100, r.planKpi);
  check('Done chỉ của Sale1', r.done === 40, r.done);
  check('công nợ chỉ của khách mình', r.congNo === 7000, r.congNo);
  check('phạm vi ghi rõ tên sale', r.phamVi === 'sale1', r.phamVi);
}
{
  // Fail closed: saleId trống KHÔNG được thành "thấy tất cả". Đó chính là lỗi
  // mà oemAppScopeOf_ được viết để chặn (xem chú thích của nó).
  const scope = duAn.oemAppScopeOf_({ role: 'sale', saleId: '' });
  const r = duAn.oemAppBuildPortalStats_(scope);
  check('sale thiếu saleId -> không cộng doanh thu nào', r.dtThangTruoc === 0, r.dtThangTruoc);
  check('sale thiếu saleId -> không cộng công nợ nào', r.congNo === 0, r.congNo);
  check('sale thiếu saleId -> không cộng kế hoạch nào', r.planKpi === 0, r.planKpi);
}
{
  // Vai không phải sale (leader/account/creator) được xem tất cả — cùng một
  // hàm oemAppScopeOf_ mà getBootstrap dùng, không phải luật riêng ở đây.
  const r = duAn.oemAppBuildPortalStats_(duAn.oemAppScopeOf_({ role: 'leader', saleId: '' }));
  check('leader thấy toàn bộ', r.congNo === 10000 && r.planKpi === 300, [r.congNo, r.planKpi]);
}

console.log('\n4. Bảng rỗng thì trả 0, không nổ');
{
  const r = nap({ data: [], plan: [], debt: [] }).oemAppBuildPortalStats_({ all: true, key: 'all' });
  check('tất cả bằng 0', r.dtThangTruoc === 0 && r.planKpi === 0 && r.congNo === 0, r);
  check('vẫn có nhãn tháng', !!r.thangNay && !!r.thangTruoc, [r.thangNay, r.thangTruoc]);
}

console.log('\n5. getPortalStats có mặt trong bảng định tuyến');
check('apiMap có getPortalStats', typeof duAn.oemAppApiMap_.getPortalStats === 'function');
check('và KHÔNG nằm trong danh sách hàm ghi',
  !duAn.OEMAPP_WRITE_FNS_.getPortalStats);

console.log('');
console.log(pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
