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
 *   Đợt 4 (tải giao dịch theo năm): máy chủ giả có doanh thu 2024 + 2025 + 2026. Như máy chủ thật, getBootstrap({recent:true}) chỉ trả
 *   2025 + 2026 kèm olderYears=[2024]; năm 2024 tải bằng getTransactionsByYear.
 *   &legacy=1      "máy chủ cũ": bỏ qua tham số của getBootstrap, trả ĐỦ cả 3 năm, không có olderYears (thử client mới + server cũ)
 *   &failyear=1    getTransactionsByYear báo lỗi (thử trạng thái lỗi + Thử lại ở màn báo cáo/Dashboard)
 *   &slowyear=1    getTransactionsByYear chậm 2,5 giây (thử trạng thái "Đang tải doanh thu năm ...")
 *   &norej=1       không có đề xuất giá bị từ chối (mặc định có 2 đợt, kèm lý do)
 *   Kế hoạch SOP (Lập Kế Hoạch): &sop=carry (mặc định: 12 mã mang sang từ kỳ đã duyệt) | draft (kèm bản nháp đã gửi: 5 mã) | empty (kế hoạch trống)
 *   &failsubmit=1  submitSopDraft báo lỗi;  &failadd=1  addMaterial báo lỗi thô;  &slowadd=1  addMaterial chậm 2 giây.
 *   addMaterial giả kiểm trùng SKU (không phân biệt hoa/thường) + giá âm như máy chủ thật rồi GHI vào danh mục giả.
 *   Lần gửi SOP gần nhất: window.__lastSopSubmit ({ anchor, rows }).
 *   Cài đặt cá nhân (14/10/2026): máy chủ giả có getMyPrefs/setMyPrefs trong bộ nhớ (cất ở window.__prefsDb).
 *   &prefs={"st.theme":"dark"}  gieo sẵn bản "trên máy chủ" (JSON, nhớ mã hoá URL);  &noprefs=1  giả máy chủ CHƯA có bảng (cả hai hàm báo lỗi);
 *   &sso=1  phiên đăng nhập qua cổng VHKD (fromPortal) -> "Đổi PIN" hiện hướng dẫn thay vì form.
 *   Cài đặt HỆ THỐNG (14/10/2026): máy chủ giả có getSystemValues / getSystemSettings / setSystemSetting (lịch sử cất ở sessionStorage 'harness_sys' + window.__sysDb).
 *   &role=creator mới mở được trang (vai khác nhận đúng câu lỗi của máy chủ thật).
 *   &sysseed=1     gieo sẵn lịch sử: VAT đặt 10% (hiệu lực 01/10/2026, bởi "master"), kèm một thay đổi sắp hiệu lực (8% từ 01/11/2026);  &sysseed=reset xoá.
 *   &systable=missing  giả bảng cài đặt hệ thống CHƯA có (getSystemSettings báo tableMissing, getSystemValues trả mặc định, setSystemSetting báo lỗi)
 *   &syserr=1      getSystemSettings báo lỗi;  &nosys=1  getSystemValues báo lỗi (client phải im lặng dùng mặc định 8% / 20)
 *   &sysfail=1     setSystemSetting luôn báo một câu lỗi tiếng Việt (thử hiện lỗi ngay trong trang)
 *   Bán hàng thanh lý (21/10/2026): máy chủ giả có getThanhLy / tlSetPrices / tlSeedPrices / tlRequestRefresh / tlAddExclude / tlRemoveExclude / tlSubmitOrder
 *   (tồn kho giả 14 mã, trong bộ nhớ; tlSubmitOrder ghi đơn 'TL-xxxxxx' vào danh sách đơn chờ duyệt giả).  &tlstale=1 dữ liệu cũ 3 ngày (chưa cập nhật hôm nay);
 *   &tlempty=1 chưa có tồn;  &tlerr=1 getThanhLy báo lỗi;  &tljob=pending|error  trạng thái lượt cào.
 * Lỗi/cảnh báo console: window.__consoleErrors (phải rỗng sau khi duyệt hết các tab).
 * Nhật ký lệnh ĐỌC: window.__harnessReads (mảng { fn, args }) — để soát client có gọi getTransactionsByYear đúng lúc không.
 * Nhật ký lệnh ghi: window.__harnessLog (mảng { fn, args }) — để soát gửi gì lên máy chủ (vd lý do từ chối).
 */
// Gom MỌI lỗi/cảnh báo console + lỗi chưa bắt từ lúc tải trang -> window.__consoleErrors (soát "console sạch" khi duyệt các tab).
window.__consoleErrors = [];
['error', 'warn'].forEach((k) => {
  const goc = console[k].bind(console);
  console[k] = (...a) => { window.__consoleErrors.push(k + ': ' + a.map((x) => (x && x.message) || String(x)).join(' ').slice(0, 400)); goc(...a); };
});
window.addEventListener('error', (e) => window.__consoleErrors.push('onerror: ' + e.message));
window.addEventListener('unhandledrejection', (e) => window.__consoleErrors.push('unhandledrejection: ' + ((e.reason && e.reason.message) || e.reason)));
const q = new URLSearchParams(window.location.search);
const role = q.get('role') || 'admin';

// ---- phiên giả (api.loadSession đọc khoá này) --------------------------------
localStorage.setItem('oem_session_v1', JSON.stringify({
  token: 'harness', expiresAt: Date.UTC(2030, 0, 1), // xa, để đồng hồ giả (&gio=) không làm phiên hết hạn
  user: { name: role === 'sale' ? 'luyen' : 'hai', role, saleId: role === 'sale' ? 'Luyến' : 'Hải' },
  ...(q.get('sso') ? { fromPortal: true } : {})
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
// Đợt 4: doanh thu năm cũ. Mỗi năm 12 tháng x 24 dòng; số tiền dễ tính nhẩm (mỗi dòng 1.000.000) để soát tổng trên màn hình:
// 2024 = 12 x 24 = 288 dòng = 288.000.000 ₫; 2025 cùng như vậy. (Số dòng 2026 theo vòng lặp phía trên.)
const txNamCu = { 2024: [], 2025: [] };
[2024, 2025].forEach((y) => {
  for (let m = 1; m <= 12; m++) for (let i = 0; i < 24; i++) {
    const c = clients[i % 25]; const mat = materials[(i * 3) % 60];
    txNamCu[y].push({
      month: 'T' + String(m).padStart(2, '0') + '-' + y, week: 'W' + (1 + (i % 4)), date: `${String(1 + (i % 28)).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
      orderNo: 'SO' + y + m + i, billingNo: 'B' + y + m + i, clientCode: c.codeSearch, clientName: c.name, clientAlias: c.alias,
      sku: mat.sku, skuName: mat.name, qty: 10, price: 100000, netRevenue: 1000000, sale: c.sale, group: mat.group
    });
  }
});
const NAM_CU_NHAT = 2025;   // cắt: năm >= 2025 là "gần đây" (server thật: năm nay - 1)
const rejected = q.get('norej') ? [] : [
  { batchId: '20261008-101500-aa11', sale: 'Luyến', submittedAt: '08/10/2026 10:15', rejectedAt: '09/10/2026 08:30', rejectedBy: 'hai', note: 'Giá thấp hơn giá vốn, đề xuất lại.',
    rows: [{ sku: materials[0].sku, name: materials[0].name, clientCode: '', retail: 41000, promoQty: 0, promoPrice: 0 }, { sku: materials[1].sku, name: materials[1].name, clientCode: '', retail: 52000, promoQty: 5, promoPrice: 50000 }] },
  { batchId: '20261005-090000-bb22', sale: 'Luyến', submittedAt: '05/10/2026 09:00', rejectedAt: '05/10/2026 15:00', rejectedBy: 'hai', note: '',
    rows: [{ sku: materials[2].sku, name: materials[2].name, clientCode: clients[0].codeSearch, retail: 61000, promoQty: 0, promoPrice: 0 }] }
];
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

// Kế hoạch SOP giả: carry = số mang sang từ kỳ đã duyệt; draft = bản đã gửi của kỳ này (cập nhật khi submitSopDraft).
const sopMode = q.get('sop') || 'carry';
const sopCarry = sopMode === 'empty' ? {} : Object.fromEntries(materials.slice(0, 12).map((m, i) => [m.sku, [10 + i, 20 + i, 30 + i, 0]]));
let sopDraft = sopMode === 'draft' ? materials.slice(20, 25).map((m, i) => ({ sku: m.sku, sl1: 5 + i, sl2: 6, sl3: 0, sl4: 1 })) : [];

// Cài đặt cá nhân giả (getMyPrefs/setMyPrefs): bản "trên máy chủ" cất ở sessionStorage của tab (sống qua F5, mất khi đóng tab);
// &prefs=... gieo đè bản đó, &prefs=reset xoá. Dùng sessionStorage để thử được "tải lại -> cài đặt còn" mà không cần backend thật.
let prefsDb = {};
try {
  const gieo = q.get('prefs');
  if (gieo === 'reset') sessionStorage.removeItem('harness_prefs');
  prefsDb = gieo && gieo !== 'reset' ? JSON.parse(gieo) : JSON.parse(sessionStorage.getItem('harness_prefs') || '{}');
} catch { prefsDb = {}; }
window.__prefsDb = prefsDb;

// Cài đặt hệ thống giả. Lịch sử mỗi khoá: [{ giaTri | null, hieuLucTu, nguoiSua, ghiChu, lucSua }]. Giá trị hiệu lực hôm nay tính như máy chủ thật:
// bản có hieuLucTu <= hôm nay, ngày lớn nhất, cùng ngày thì bản ghi sau thắng; null = về mặc định; chưa có bản nào = mặc định.
const SYS_DEFS = [
  { khoa: 'oem.vatRate', nhom: 'Thuế & giá', nhan: 'Thuế VAT', ghiChu: 'Thuế suất VAT dùng cho tổng giá trị đơn hàng và giá vốn đã gồm VAT.', kieu: 'number', min: 0, max: 0.2, buoc: 0.005, donVi: '', fmt: 'percent', macDinh: 0.08 },
  { khoa: 'oem.defaultMargin', nhom: 'Thuế & giá', nhan: '% LNG mặc định của máy tính giá', ghiChu: 'Điền sẵn vào ô % LNG khi người dùng chưa chọn số riêng.', kieu: 'integer', min: 1, max: 60, buoc: 1, donVi: '%', fmt: '', macDinh: 20 },
  { khoa: 'oem.demoDays', nhom: 'Công nợ (thử)', nhan: 'Số ngày cảnh báo công nợ (khoá thử)', ghiChu: 'Khoá chỉ có ở harness — để kiểm tra trang dựng tổng quát theo nhóm.', kieu: 'integer', min: 0, max: 365, buoc: 1, donVi: 'ngày', fmt: '', macDinh: 30 }
];
const homNayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
let sysDb = {};
try {
  const gs = q.get('sysseed');
  if (gs === 'reset') sessionStorage.removeItem('harness_sys');
  sysDb = JSON.parse(sessionStorage.getItem('harness_sys') || '{}');
  if (gs === '1' && !Object.keys(sysDb).length) {
    sysDb = { 'oem.vatRate': [
      { giaTri: 0.1, hieuLucTu: '2026-10-01', nguoiSua: 'master', ghiChu: 'Theo thông báo thuế mới', lucSua: '2026-09-28T03:00:00Z' },
      { giaTri: 0.08, hieuLucTu: '2026-11-01', nguoiSua: 'master', ghiChu: 'Hết ưu đãi', lucSua: '2026-10-10T08:15:00Z' }
    ] };
  }
} catch { sysDb = {}; }
window.__sysDb = sysDb;
const sysLuu = () => { try { sessionStorage.setItem('harness_sys', JSON.stringify(sysDb)); } catch { /* không sao */ } };
function sysHieuLuc(d, today) {
  const ds = (sysDb[d.khoa] || []).map((e, i) => ({ ...e, i })).filter((e) => e.hieuLucTu <= today).sort((a, b) => (b.hieuLucTu < a.hieuLucTu ? -1 : b.hieuLucTu > a.hieuLucTu ? 1 : b.i - a.i));
  const e = ds[0];
  return { giaTri: e && e.giaTri !== null ? e.giaTri : d.macDinh, daDat: !!(e && e.giaTri !== null), hieuLucTu: e ? e.hieuLucTu : '' };
}

// ---- Bán hàng thanh lý giả -----------------------------------------------------
const tlBoDau = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
let tlKw = [['bếp từ', 'gia dụng'], ['quạt', 'gia dụng'], ['nồi cơm', 'gia dụng'], ['máy xay', 'gia dụng'], ['EZ270', 'lõi / màng RO EZ270...']].map((k, i) => ({ id: i + 1, keyword: k[0], note: k[1], by: 'mặc định' }));
const tlStock = [
  ['1001020053', 'Sơ lọc KoriHome PFK-501 /DC', 'Phin lọc', 166, 12000, 'kho1402'], ['2003030365', 'Lõi Nano V xanh DMAX LNT003 (DM)', 'Lõi', 394, 54000, 'kho1402'],
  ['2003030541', 'Lõi T33 102 xanh (TB2) (FLOW)', 'Lõi', 310, 38000, 'lichsu'], ['2003030713', 'Lõi khoáng EZ270T-2RV v2 (DM)', 'Lõi', 48, 0, ''],
  ['2007030101', 'Van điện từ 24/4U Spring', 'Linh kiện', 32, 0, ''], ['2008010042', 'Bơm 24-S 8369T-LC', 'Bơm', 82, 245000, 'admin'],
  ['2011020017', 'Cút EZ V-4U-6 ST', 'Linh kiện', 635, 0, ''], ['2012010005', '(Mẫu) Màng RO', '', 49, 0, ''], ['2012020008', 'Màng ULP 1812-50S', 'Màng RO', 259, 189000, 'kho1402'],
  ['2013100167', 'Bình áp nhựa trắng 3.2G-S Karofi', 'Bình áp', 346, 98000, 'lichsu'], ['4006070041', 'ACEP00370 Module nguồn 12V 6A K28-U72S12', 'Linh kiện', 6859, 31000, 'lichsu'],
  ['1003010036', 'Bếp từ Livotec LIS-668', 'Gia dụng', 17, 0, ''], ['1004010048', 'Quạt cây Livotec S-100 (đen)', 'Gia dụng', 21, 0, ''], ['1003010057', 'Nồi cơm điện LVT LRC-6118P Hồng', 'Gia dụng', 4, 0, '']
].map((r) => ({ sku: r[0], name: r[1], group: r[2], qty: r[3], price: r[4], priceSource: r[5], priceDate: r[5] && r[5] !== 'admin' ? '2026-07-07' : '', priceBy: r[5] === 'admin' ? 'hai' : '', priceAt: '' }));
// Mã 2008010042 đã có 40 cái nằm trong đơn thanh lý chờ duyệt TL-100001
orders.push({ rowIndex: 9001, orderNo: 'TL-100001', sku: '2008010042', name: 'Bơm 24-S 8369T-LC', qty: 40, price: 245000, total: 9800000, clientCode: clients[2].code, clientCodeSearch: clients[2].codeSearch, createdAt: '21/10/2026 09:00', pic: 'Luyến' });
const tlJob = () => ({ status: q.get('tljob') === 'error' ? 'error' : (q.get('tljob') === 'pending' ? '' : 'ok'), message: q.get('tljob') === 'error' ? 'SAP chưa đăng nhập (mô phỏng)' : '', pending: q.get('tljob') === 'pending',
  requestedBy: 'hai', requestedAt: '2026-10-21 12:00', lastOk: '2026-10-21 12:30', gioChay: ['08:30', '12:30', '16:30'] });
function tlThanhLy() {
  if (q.get('tlerr')) throw new Error('Mô phỏng lỗi tải tồn thanh lý (tlerr=1)');
  if (!['sale', 'admin', 'creator', 'leader', 'lead'].includes(role)) throw new Error('Vai trò của anh/chị không dùng chức năng Bán hàng thanh lý.');
  const quanTri = ['admin', 'creator'].includes(role);
  const cho = {};
  orders.filter((o) => /^TL-/.test(o.orderNo)).forEach((o) => { cho[o.sku] = (cho[o.sku] || 0) + o.qty; });
  const kws = tlKw.map((k) => k.keyword);
  const hit = (n) => kws.find((k) => (' ' + tlBoDau(n)).indexOf(' ' + tlBoDau(k)) >= 0) || '';
  const items = [], hidden = [];
  (q.get('tlempty') ? [] : tlStock).forEach((r) => {
    const k = hit(r.name);
    if (k) { hidden.push({ sku: r.sku, name: r.name, qty: r.qty, keyword: k }); return; }
    items.push({ ...r, pending: cho[r.sku] || 0, avail: Math.max(0, r.qty - (cho[r.sku] || 0)) });
  });
  return { updatedAt: q.get('tlempty') ? '' : (q.get('tlstale') ? '2026-10-18 12:30' : '2026-10-21 12:30'), updatedToday: !q.get('tlstale') && !q.get('tlempty'), today: '2026-10-21',
    job: tlJob(), plant: '0400', slocs: ['1402'], items, hiddenCount: hidden.length, hidden: quanTri ? hidden : [], keywords: quanTri ? tlKw : [],
    canEditPrice: quanTri, canOrder: ['sale', 'admin', 'creator'].includes(role) };
}

const RAW_PG = 'duplicate key value violates unique constraint "products_sku_key"';
window.__harnessLog = [];
window.__harnessReads = [];
let nextId = 500;

function doc(fn, args) {
  if (q.get('fail') && /^get|^ping/.test(fn) && fn !== 'getBootstrap') throw new Error('Mô phỏng lỗi mạng (fail=1)');
  if (!/^get|^ping|^login/.test(fn)) window.__harnessLog.push({ fn, args: args.slice(1) });
  else window.__harnessReads.push({ fn, args: args.slice(1) });
  if (q.get('failwrite') && !/^get|^ping|^login/.test(fn)) throw new Error(RAW_PG);
  if (q.get('failadd') && fn === 'addMaterial') throw new Error(RAW_PG);
  if (q.get('failrow') && fn === 'updateOrderLine' && String(args[1]) === q.get('failrow')) throw new Error(RAW_PG);
  switch (fn) {
    case 'updateOrderLine': { const o = orders.find((x) => x.rowIndex === Number(args[1])); if (o) Object.assign(o, args[2]); return { ok: true }; }
    case 'insertOrderLine': {
      const i = orders.findIndex((x) => x.rowIndex === Number(args[1])); const ref = orders[i];
      const nu = { rowIndex: nextId++, orderNo: ref.orderNo, sku: '', name: '', qty: 0, price: 0, total: 0, clientCode: ref.clientCode, clientCodeSearch: ref.clientCodeSearch, createdAt: ref.createdAt, pic: ref.pic };
      orders.splice(args[2] === 'above' ? i : i + 1, 0, nu); return { ok: true, insertedRowIndex: nu.rowIndex };
    }
    case 'deleteOrderLine': { const i = orders.findIndex((x) => x.rowIndex === Number(args[1])); if (i >= 0) orders.splice(i, 1); return { ok: true }; }
    case 'getBootstrap': {
      const opts = q.get('legacy') ? null : (args[2] && typeof args[2] === 'object' ? args[2] : null);
      const tatCa = txNamCu[2024].concat(txNamCu[2025], transactions);
      const day = { clients, transactions: tatCa, materials, plans, planDefaultMonth: '', kits: [] };
      if (!opts) return day;
      if (Array.isArray(opts.parts) && opts.parts.length) {
        const out = { planDefaultMonth: '' };
        opts.parts.forEach((p) => { if (p in day) out[p] = day[p]; });
        if (out.transactions) out.transactions = opts.recent ? txNamCu[2025].concat(transactions) : tatCa;
        return out;
      }
      if (opts.recent) return { ...day, transactions: txNamCu[2025].concat(transactions), olderYears: [2024], txRecentFromYear: NAM_CU_NHAT, txTotal: tatCa.length };
      return day;
    }
    case 'getTransactionsByYear': {
      if (q.get('failyear')) throw new Error('Mô phỏng lỗi tải năm cũ (failyear=1)');
      const y = Number(args[1]);
      return { year: y, transactions: (txNamCu[y] || []).slice() };
    }
    case 'getMyPrefs':
      if (q.get('noprefs')) throw new Error('relation "oem.user_prefs" does not exist');
      return { prefs: { ...prefsDb } };
    case 'setMyPrefs': {
      if (q.get('noprefs')) throw new Error('relation "oem.user_prefs" does not exist');
      const ch = args[1] || {};
      Object.keys(ch).forEach((k) => { if (ch[k] === null) delete prefsDb[k]; else prefsDb[k] = ch[k]; });
      try { sessionStorage.setItem('harness_prefs', JSON.stringify(prefsDb)); } catch { /* không sao */ }
      return { ok: true };
    }
    case 'getSystemValues': {
      if (q.get('nosys')) throw new Error('relation "oem.system_settings" does not exist');
      const today = homNayVN();
      const missing = q.get('systable') === 'missing';
      const values = {};
      SYS_DEFS.slice(0, 2).forEach((d) => { values[d.khoa] = missing ? d.macDinh : sysHieuLuc(d, today).giaTri; });
      return { values };
    }
    case 'getSystemSettings': {
      if (role !== 'creator') throw new Error('Chỉ master mới xem được cài đặt hệ thống.');
      if (q.get('syserr')) throw new Error('Mô phỏng lỗi tải cài đặt hệ thống (syserr=1)');
      const today = homNayVN();
      const missing = q.get('systable') === 'missing';
      return {
        app: 'oem', canEdit: true, today, tableMissing: missing,
        settings: SYS_DEFS.map((d) => {
          const h = missing ? { giaTri: d.macDinh, daDat: false, hieuLucTu: '' } : sysHieuLuc(d, today);
          const ls = missing ? [] : (sysDb[d.khoa] || []);
          return { ...d, giaTri: h.giaTri, daDat: h.daDat, hieuLucTu: h.hieuLucTu, choHieuLuc: ls.filter((e) => e.hieuLucTu > today), lichSu: ls.slice().reverse() };
        })
      };
    }
    case 'setSystemSetting': {
      if (role !== 'creator') throw new Error('Chỉ master mới đổi được cài đặt hệ thống.');
      if (q.get('systable') === 'missing') throw new Error('Chưa chạy SQL đợt 8 — chưa lưu được cài đặt hệ thống.');
      if (q.get('sysfail')) throw new Error('Không lưu được: cài đặt này đang được khoá để bảo trì (sysfail=1).');
      const p = args[1] || {};
      const d = SYS_DEFS.find((x) => x.khoa === p.khoa);
      if (!d) throw new Error('Không có cài đặt "' + p.khoa + '".');
      const today = homNayVN();
      const hl = p.hieuLucTu || today;
      if (hl < today) throw new Error('Ngày hiệu lực không được trước hôm nay.');
      if (p.giaTri !== null) {
        if (typeof p.giaTri !== 'number' || !Number.isFinite(p.giaTri)) throw new Error('Giá trị phải là một con số.');
        if (p.giaTri < d.min || p.giaTri > d.max) throw new Error(d.nhan + ' phải nằm trong khoảng ' + d.min + ' … ' + d.max + '.');
        if (d.kieu === 'integer' && !Number.isInteger(p.giaTri)) throw new Error(d.nhan + ' phải là số nguyên.');
      }
      (sysDb[d.khoa] = sysDb[d.khoa] || []).push({ giaTri: p.giaTri, hieuLucTu: hl, nguoiSua: 'hai', ghiChu: p.ghiChu || '', lucSua: new Date().toISOString() });
      sysLuu();
      return { ok: true, khoa: d.khoa, hieuLucTu: hl };
    }
    case 'getThanhLy': return tlThanhLy();
    case 'tlRequestRefresh': return { ok: true, job: { ...tlJob(), pending: true } };
    case 'tlSeedPrices': return { ok: true, added: 2 };
    case 'tlSetPrices': {
      (args[1] || []).forEach((r) => { const it = tlStock.find((x) => x.sku === String(r.sku)); if (it) { it.price = r.price; it.priceSource = 'admin'; it.priceBy = 'hai'; it.priceDate = ''; } });
      return { ok: true, saved: (args[1] || []).length };
    }
    case 'tlAddExclude': {
      const kw = String(args[1] || '').trim();
      if (!kw) throw new Error('Từ khoá trống.');
      const moi = !tlKw.some((k) => tlBoDau(k.keyword) === tlBoDau(kw));
      if (moi) tlKw.push({ id: nextId++, keyword: kw, note: args[2] || '', by: 'hai' });
      return { ok: true, added: moi, keywords: tlKw };
    }
    case 'tlRemoveExclude': { tlKw = tlKw.filter((k) => k.id !== Number(args[1])); return { ok: true, keywords: tlKw }; }
    case 'tlSubmitOrder': {
      const o = args[1] || {}; const view = tlThanhLy();
      if (!o.client || !o.client.code) throw new Error('Chưa chọn khách hàng.');
      const no = 'TL-' + (200000 + nextId++);
      let total = 0;
      (o.items || []).forEach((i) => {
        const it = view.items.find((x) => x.sku === String(i.sku));
        if (!it) throw new Error('Mã ' + i.sku + ' không còn trong tồn kho thanh lý (hoặc đã bị loại khỏi danh sách).');
        if (i.qty > it.avail) throw new Error('Mã ' + i.sku + ': chỉ còn ' + it.avail + '.');
        total += i.qty * it.price;
        orders.push({ rowIndex: nextId++, orderNo: no, sku: it.sku, name: it.name, qty: i.qty, price: it.price, total: i.qty * it.price, clientCode: o.client.code, clientCodeSearch: o.client.codeSearch, createdAt: '21/10/2026 14:00', pic: role === 'sale' ? 'luyen' : 'hai' });
      });
      return { ok: true, orderNo: no, savedCount: (o.items || []).length, total };
    }
    case 'getMyRejectedPriceProposals': return { batches: rejected };
    case 'getReportContext': return { plan2026: {}, baselines2025: {} };
    case 'getOrders': return orders;
    case 'getDebtView': return { rows: debtRows, lastUpdated: '2026-10-09T08:00:00Z' };
    case 'getSopView': return { rows: sopRows, monthLabels: labels };
    case 'getMySopPlan': return { anchor: '', rows: [] };
    case 'getSopPlanningContext': return { anchor: '2026-10', monthLabels: labels, myDraft: sopDraft.map((d) => ({ ...d })), carryForwardBySku: sopMode === 'draft' ? Object.fromEntries(materials.slice(0, 12).map((m, i) => [m.sku, [10 + i, 20 + i, 30 + i, 0]])) : sopCarry, priorApprovedBySku: {} };
    case 'submitSopDraft': {
      if (q.get('failsubmit')) throw new Error('Mô phỏng lỗi gửi kế hoạch (failsubmit=1)');
      const rows = (args[2] || []).filter((r) => r.sl1 > 0 || r.sl2 > 0 || r.sl3 > 0 || r.sl4 > 0);
      if (!rows.length) throw new Error('Không có dòng nào để lưu.');
      window.__lastSopSubmit = { anchor: args[1], rows: JSON.parse(JSON.stringify(args[2] || [])) };
      sopDraft = rows.map((r) => ({ ...r }));
      return { ok: true, savedCount: rows.length, skippedZeroCount: (args[2] || []).length - rows.length, removedCount: 0 };
    }
    case 'addMaterial': {
      const m = args[1] || {};
      const sku = String(m.sku || '').trim();
      if (!sku) throw new Error('Thiếu mã SKU.');
      const trung = materials.find((x) => x.sku.toLowerCase() === sku.toLowerCase());
      if (trung) throw new Error('Mã SKU ' + trung.sku + ' đã có trong danh mục sản phẩm — dùng nút "Sửa" của sản phẩm đó để cập nhật.');
      if (Number(m.suggestedPrice) < 0) throw new Error('Giá bán đề xuất không được là số âm.');
      materials.unshift({ ...m, sku });
      return { ok: true };
    }
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
      await new Promise((r) => setTimeout(r, (body.fn === 'getTransactionsByYear' && q.get('slowyear')) || (body.fn === 'addMaterial' && q.get('slowadd')) ? 2500 : 120));
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
