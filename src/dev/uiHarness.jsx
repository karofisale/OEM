/**
 * uiHarness.jsx — CHỈ DEV. Chạy cả <App/> với "máy chủ giả" + phiên giả, để thử khung giao diện dùng chung
 * (Đợt 2) ngoài trình duyệt thật mà không cần backend / đăng nhập.
 *
 * Mở /ui-harness.html?role=admin  (role: admin | sale | account | leader)
 *   &fail=1   mọi lệnh ĐỌC trả lỗi (xem trạng thái lỗi + nút Thử lại)
 *   &theme=dark|light
 *   &gio=0030 đồng hồ giả: 00:30 giờ VN ngày 01/11/2026 (xem tháng/ngày mặc định theo giờ VN)
 *   &failwrite=1   mọi lệnh GHI báo lỗi Postgres thô (xem lớp dịch lỗi errorText: tiếng Việt + mã tham chiếu)
 *   &failrow=11    chỉ updateOrderLine của dòng rowIndex=11 báo lỗi thô (thử "Lưu cả đơn" một phần)
 *   &big=1         4.000+ dòng doanh thu (thử phân trang Đầu/Cuối/nhảy trang/cỡ trang + xuất Excel)
 * Nhật ký lệnh ghi: window.__harnessLog (mảng { fn, args }) — để soát gửi gì lên máy chủ (vd lý do từ chối).
 */
const q = new URLSearchParams(window.location.search);
const role = q.get('role') || 'admin';

// ---- phiên giả (api.loadSession đọc khoá này) --------------------------------
localStorage.setItem('oem_session_v1', JSON.stringify({
  token: 'harness', expiresAt: Date.UTC(2030, 0, 1), // xa, để đồng hồ giả (&gio=) không làm phiên hết hạn
  user: { name: role === 'sale' ? 'luyen' : 'hai', role, saleId: role === 'sale' ? 'Luyến' : 'Hải' }
}));
if (q.get('theme')) localStorage.setItem('oem_theme_v1', q.get('theme'));

// ---- đồng hồ giả (tuỳ chọn) --------------------------------------------------
if (q.get('gio') === '0030') {
  // 00:30 ngày 01/11/2026 giờ VN = 17:30 ngày 31/10/2026 UTC
  const fake = Date.UTC(2026, 9, 31, 17, 30, 0);
  const RealDate = Date;
  const offset = fake - RealDate.now();
  // eslint-disable-next-line no-global-assign
  Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
    static now() { return RealDate.now() + offset; }
  };
}

// ---- dữ liệu giả --------------------------------------------------------------
const SALES = ['KH Luyến', 'KH Hải', 'KH Đình Hoan'];
const clients = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1, code: String(1000700 + i), rawCode: String(1000700 + i), codeSearch: ['TECOM', 'MAXIM', 'ALPHA', 'BETA', 'GAMMA'][i % 5] + (i < 5 ? '' : i),
  name: 'Công ty khách hàng số ' + (i + 1), alias: 'KH' + (i + 1), type: i % 4 ? 'Doanh nghiệp' : 'Cá nhân',
  sale: SALES[i % 3], address: 'Hà Nội', status: i % 7 === 0 ? 'Inactive' : 'Active', reconciliationAcct: '131'
}));
const GROUPS = ['LK nóng lạnh', 'Màng RO', 'Phin lọc'];
const materials = Array.from({ length: 60 }, (_, i) => ({
  sku: 'MAT' + String(1000 + i), name: 'Vật tư linh kiện số ' + (i + 1), alias: 'VT' + i, group: GROUPS[i % 3], unit: 'PC',
  suggestedPrice: 50000 + i * 1500, promoPrice: i % 5 ? 0 : 45000, promoQty: i % 5 ? 0 : 10,
  latestPriceVat: 48000 + i * 1200, totalQty: 100 * (i + 1), exclusiveTo: ''
}));
const months = ['T08-2026', 'T09-2026', 'T10-2026'];
const transactions = [];
for (let m = 0; m < 3; m++) for (let i = 0; i < (q.get('big') ? 1400 : 70); i++) {
  const c = clients[i % 25]; const mat = materials[(i * 3) % 60]; const day = 1 + (i % 28);
  const qty = 10 + ((i * 7) % 90);
  transactions.push({
    month: months[m], week: 'W' + (1 + (i % 4)), date: `${String(day).padStart(2, '0')}/${String(8 + m).padStart(2, '0')}/2026`,
    orderNo: 'SO' + (4500000 + m * 1000 + i), billingNo: 'B' + (m * 100 + i), clientCode: c.codeSearch, clientName: c.name, clientAlias: c.alias,
    sku: mat.sku, skuName: mat.name, qty, price: mat.suggestedPrice, netRevenue: qty * mat.suggestedPrice, sale: c.sale, group: mat.group
  });
}
const plans = clients.slice(0, 12).flatMap((c, i) => ['T10-2026', 'T09-2026'].map((mo, k) => ({
  month: mo, searchCode: c.codeSearch, clientName: c.name, sale: c.sale, planKpi: 1e9 * (i + 1), planUpdate: 8e8 * (i + 1), done: 0,
  w1: 2e8 * (i + 1), w2: 2e8 * (i + 1), w3: 2e8 * (i + 1), w4: 2e8 * (i + 1), w5: 0, note: i % 3 ? '' : 'Ghi chú', status: k && i % 2 ? 'Đã duyệt' : 'Chờ duyệt'
})));
const orders = [];
['SO-A001', 'SO-A002', 'SO-A003'].forEach((no, n) => {
  [0, 1, 2].forEach((k) => orders.push({
    rowIndex: orders.length + 2, orderNo: no, sku: materials[n * 3 + k].sku, name: materials[n * 3 + k].name, qty: 10 * (k + 1), price: 50000, total: 500000 * (k + 1),
    clientCode: clients[n].code, clientCodeSearch: clients[n].codeSearch, createdAt: ['09/10/2026 10:00', '15/09/2026 09:00', '2026-10-05T03:00:00Z'][n], pic: 'Hải'
  }));
});
const debtRows = clients.slice(0, 15).map((c, i) => ({ code: c.code, name: c.name, pic: c.sale, creditLimit: 1e9, overLimit: i % 4 ? 0 : 2e8, balance: 3e8 * (i + 1), updatedAt: '2026-10-0' + (1 + (i % 8)) }));
const sopRows = materials.slice(0, 20).map((m) => ({ sku: m.sku, name: m.name, price: m.suggestedPrice, sl: [10, 20, 0, 5], contributors: ['Luyến'] }));
const labels = ['T10/2026', 'T11/2026', 'T12/2026', 'T01/2027'];
const pendingProposals = materials.slice(0, 6).map((m) => ({
  batchId: '20261009-100000-ab12', sale: 'KH Luyến', clientCode: '', submittedAt: '09/10/2026 10:00', sku: m.sku, name: m.name,
  currentRetail: m.suggestedPrice, currentPromo: 0, retailPropose: m.suggestedPrice + 2000, promoQtyPropose: 0, promoPricePropose: 0, pctChange: 0.04
}));

const RAW_PG = 'duplicate key value violates unique constraint "products_sku_key"';
window.__harnessLog = [];
let nextId = 500;

function doc(fn, args) {
  if (q.get('fail') && /^get|^ping/.test(fn) && fn !== 'getBootstrap') throw new Error('Mô phỏng lỗi mạng (fail=1)');
  if (!/^get|^ping|^login/.test(fn)) window.__harnessLog.push({ fn, args: args.slice(1) });
  if (q.get('failwrite') && !/^get|^ping|^login/.test(fn)) throw new Error(RAW_PG);
  if (q.get('failrow') && fn === 'updateOrderLine' && String(args[1]) === q.get('failrow')) throw new Error(RAW_PG);
  switch (fn) {
    case 'updateOrderLine': { const o = orders.find((x) => x.rowIndex === Number(args[1])); if (o) Object.assign(o, args[2]); return { ok: true }; }
    case 'insertOrderLine': {
      const i = orders.findIndex((x) => x.rowIndex === Number(args[1])); const ref = orders[i];
      const nu = { rowIndex: nextId++, orderNo: ref.orderNo, sku: '', name: '', qty: 0, price: 0, total: 0, clientCode: ref.clientCode, clientCodeSearch: ref.clientCodeSearch, createdAt: ref.createdAt, pic: ref.pic };
      orders.splice(args[2] === 'above' ? i : i + 1, 0, nu); return { ok: true, insertedRowIndex: nu.rowIndex };
    }
    case 'deleteOrderLine': { const i = orders.findIndex((x) => x.rowIndex === Number(args[1])); if (i >= 0) orders.splice(i, 1); return { ok: true }; }
    case 'getBootstrap': return { clients, transactions, materials, plans, planDefaultMonth: '', kits: [] };
    case 'getReportContext': return { plan2026: {}, baselines2025: {} };
    case 'getOrders': return orders;
    case 'getDebtView': return { rows: debtRows, lastUpdated: '2026-10-09T08:00:00Z' };
    case 'getSopView': return { rows: sopRows, monthLabels: labels };
    case 'getMySopPlan': return { anchor: '', rows: [] };
    case 'getSopPlanningContext': return { anchor: '2026-10', monthLabels: labels, myDraft: [], carryForwardBySku: {}, priorApprovedBySku: Object.fromEntries(materials.map((m) => [m.sku, 5])) };
    case 'getSopPendingReview': return { rows: sopRows, detail: sopRows.map((r) => ({ ...r, sale: 'Luyến' })), monthLabels: labels, pendingCount: 20, anchor: '2026-10' };
    case 'getPendingPriceProposals': return { rows: pendingProposals, costBySku: {} };
    case 'getClientPriceOverrides': return { overrides: {} };
    case 'getNhipTim': return [];
    case 'getPlanNam': return { nam: args[1], rows: [], nguon: null };
    default: return { ok: true };
  }
}

const realFetch = window.fetch.bind(window);
window.fetch = async (url, opts) => {
  try {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (body && body.fn) {
      await new Promise((r) => setTimeout(r, 120));
      try { return new Response(JSON.stringify({ result: doc(body.fn, body.args || []) }), { status: 200 }); }
      catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 200 }); }
    }
  } catch (e) { /* rơi xuống fetch thật */ }
  return realFetch(url, opts);
};

const [{ StrictMode }, { createRoot }, { ToastProvider }, { NavGuardProvider }, { default: App }, { initTheme }] = await Promise.all([
  import('react'), import('react-dom/client'), import('../components/ToastProvider'), import('../components/NavGuard'), import('../App'),
  import('../services/theme'), import('../index.css')
]);
initTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <NavGuardProvider>
        <App />
      </NavGuardProvider>
    </ToastProvider>
  </StrictMode>
);
