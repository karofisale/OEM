/**
 * dot2-khung-ui.test.cjs — Đợt 2 (10/10/2026): khung giao diện dùng chung.
 *
 *   node test/dot2-khung-ui.test.cjs
 *
 * Logic thuần (vnDate, glossary, tableSort, toastQueue, unsavedGuard, uiState, navMeta) gọi thẳng.
 * Component được esbuild gói kèm React rồi render tĩnh (renderToStaticMarkup) để soát role/aria/nhãn.
 * Hành vi phím (Esc/Enter/Tab/focus) cần DOM thật — soát bằng mã nguồn ở đây, và đã thử tay trên
 * trình duyệt bằng `npm run dev` -> /ui-harness.html. Tương phản màu: test/wcag-contrast.cjs (đo thật).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}
const ROOT = path.join(__dirname, '..');
const SRC = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/\r\n/g, '\n');
const imp = (f) => import(pathToFileURL(path.join(ROOT, 'src', f)).href);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const jsxFiles = walk(path.join(ROOT, 'src')).filter((f) => /\.jsx$/.test(f) && !/[\\/]dev[\\/]/.test(f));
const rel = (f) => path.relative(path.join(ROOT, 'src'), f).replace(/\\/g, '/');

(async () => {
  // ===========================================================================
  console.log('\n10. Ngày/tháng mặc định theo giờ Việt Nam (UTC+7)');
  const vn = await imp('utils/vnDate.js');
  const t0030 = Date.UTC(2026, 9, 31, 17, 30, 0);          // 00:30 ngày 01/11/2026 giờ VN
  check('mô phỏng 00:30 mùng 1: UTC còn là tháng 10 (cái bẫy)', new Date(t0030).toISOString().slice(0, 7) === '2026-10');
  check('vnMonth = 2026-11, vnToday = 2026-11-01, vnYear = 2026', vn.vnMonth(t0030) === '2026-11' && vn.vnToday(t0030) === '2026-11-01' && vn.vnYear(t0030) === 2026);
  check('vnMonthKey = T11-2026 (khoá tháng của app)', vn.vnMonthKey(t0030) === 'T11-2026');
  const nye = Date.UTC(2026, 11, 31, 18, 0, 0);            // 01:00 ngày 01/01/2027 giờ VN
  check('qua năm: 01:00 mùng 1/1 giờ VN -> 2027-01 / vnYear 2027', vn.vnMonth(nye) === '2027-01' && vn.vnYear(nye) === 2027);
  check('23:30 cuối tháng giờ VN vẫn là tháng đó (UTC đã là 16:30 cùng ngày)', vn.vnToday(Date.UTC(2026, 9, 31, 16, 30)) === '2026-10-31');
  check('12 tháng gần nhất giờ VN: mới nhất trước, qua năm đúng', JSON.stringify(vn.vnRecentMonths(3, nye)) === '["2027-01","2026-12","2026-11"]' && vn.vnRecentMonths(12, t0030).length === 12);
  check('vnPlanMonthKey: ngày 24 -> tháng này, ngày 25+ -> tháng sau, 25/12 -> T01 năm sau',
    vn.vnPlanMonthKey(Date.UTC(2026, 9, 24, 5)) === 'T10-2026' && vn.vnPlanMonthKey(Date.UTC(2026, 9, 25, 5)) === 'T11-2026' && vn.vnPlanMonthKey(Date.UTC(2026, 11, 26, 5)) === 'T01-2027');
  check('vnDateSlug / vnTimestamp theo giờ VN', vn.vnDateSlug(t0030) === '01-11-2026' && vn.vnTimestamp(t0030) === '01/11/2026 00:30');
  check('hienNgay: ISO ngày -> dd/mm/yyyy; ISO UTC -> giờ VN; dd/MM/yyyy giữ nguyên; rác trả nguyên',
    vn.hienNgay('2026-10-01') === '01/10/2026' && vn.hienNgay('2026-10-31T17:30:00Z') === '01/11/2026 00:30' &&
    vn.hienNgay('09/10/2026 10:00') === '09/10/2026 10:00' && vn.hienNgay('không phải ngày') === 'không phải ngày' && vn.hienNgay(null) === '');
  check('hienNgay {gio:false} bỏ giờ', vn.hienNgay('31/10/2026 17:30', { gio: false }) === '31/10/2026');
  check('sapXepNgay so THỜI ĐIỂM: 31/08 < 01/10 (so chữ sẽ sai), ISO và dd/MM trộn được',
    vn.sapXepNgay('31/08/2026') < vn.sapXepNgay('01/10/2026') && vn.sapXepNgay('2026-09-30') < vn.sapXepNgay('01/10/2026 08:00') && isNaN(vn.sapXepNgay('abc')));
  const lech = ['toISOString().slice', 'toISOString().substring'];
  const sot = [];
  [...jsxFiles, ...walk(path.join(ROOT, 'src', 'services')), ...walk(path.join(ROOT, 'src', 'utils'))].filter((f) => /\.(jsx|js)$/.test(f) && !/vnDate\.js$/.test(f)).forEach((f) => {
    const s = fs.readFileSync(f, 'utf8');
    lech.forEach((p) => { if (s.split('\n').some((l) => l.includes(p) && !/^\s*(\/\/|\*)/.test(l))) sot.push(rel(f) + ': ' + p); });
    if (/new Date\(\)\.(getFullYear|getMonth|getDate|toLocaleDateString|toLocaleString)/.test(s)) sot.push(rel(f) + ': new Date().get*/toLocale*');
  });
  check('không còn toISOString().slice / new Date().getFullYear... cho "hôm nay/tháng này" trong src', sot.length === 0, sot);
  check('các màn đã dùng helper: Dashboard, PlanNam, PriceApprove, CaoSap, OrdersReview, SopView, AI, aiAgent',
    [['components/Dashboard.jsx', 'vnYear'], ['components/salesplan/PlanNamPanel.jsx', 'vnYear'], ['components/pricing/PriceApprovePanel.jsx', 'vnToday'],
      ['components/transactions/CaoSapPanel.jsx', 'vnRecentMonths'], ['components/OrdersReview.jsx', 'vnDateSlug'], ['components/sop/SopViewPanel.jsx', 'vnDateSlug'],
      ['components/AIOrderAgent.jsx', 'vnTimestamp'], ['services/aiAgent.js', 'vnTimestamp']].every(([f, h]) => SRC(f).includes(h)));

  // ===========================================================================
  console.log('\n6. Thuật ngữ & badge trạng thái (utils/glossary.js)');
  const gl = await imp('utils/glossary.js');
  const L = (x) => gl.trangThai(x).label;
  check('mã thô -> nhãn Việt: draft/drafted -> Bản nháp, Active -> Đang hoạt động, Inactive -> Ngừng hoạt động',
    L('draft') === 'Bản nháp' && L('drafted') === 'Bản nháp' && L('Active') === 'Đang hoạt động' && L('Inactive') === 'Ngừng hoạt động');
  check('submitted/pending/Chờ duyệt -> Chờ duyệt; approved -> Đã duyệt; rejected -> Từ chối',
    L('submitted') === 'Chờ duyệt' && L('PENDING') === 'Chờ duyệt' && L('Chờ duyệt') === 'Chờ duyệt' && L('approved') === 'Đã duyệt' && L('rejected') === 'Từ chối');
  check('ISO thô không lộ ra badge: "2026-10-01" -> 01/10/2026', L('2026-10-01') === '01/10/2026' && !/\d{4}-\d{2}-\d{2}/.test(L('2026-10-01T03:00:00Z')));
  check('rỗng -> "—"; chưa biết -> giữ nguyên chữ, tông trung tính', L('') === '—' && L(null) === '—' && L('Đang giao') === 'Đang giao' && gl.trangThai('Đang giao').tone === 'neutral');
  check('tông: Đã duyệt xanh lá, Chờ duyệt vàng, Từ chối đỏ', gl.trangThai('approved').tone === 'emerald' && gl.trangThai('pending').tone === 'amber' && gl.trangThai('rejected').tone === 'rose');
  check('nhãn vai trò có "account" -> Kế toán (Navbar cũ rơi về "Sale: Chung")', gl.nhanVaiTro('account').text === 'Kế toán' && gl.nhanVaiTro('sale', 'Luyến').text === 'Sale: Luyến' && gl.nhanVaiTro('leader').text.includes('chỉ xem'));
  check('thuật ngữ giữ tiếng Anh: PI, SO, FOB, Shipment, ETD, ETA, Booking', ['PI', 'SO', 'FOB', 'Shipment', 'ETD', 'ETA', 'Booking'].every((t) => gl.THUAT_NGU_GIU_NGUYEN.includes(t)));
  check('nhãn xoá là "Xoá" (không "Xóa"/"OK")', gl.NHAN.xoa === 'Xoá' && gl.nhanThang('2026-10') === 'Tháng 10/2026');
  const rawBadge = [];
  jsxFiles.forEach((f) => {
    const s = fs.readFileSync(f, 'utf8');
    if (/badge[^\n]*\{(client|c|r|plan|row)?\.?status\}/.test(s)) rawBadge.push(rel(f));
    if (/View-Only Mode/.test(s)) rawBadge.push(rel(f) + ' (View-Only Mode)');
  });
  check('không badge nào in thẳng `.status` thô, không còn "Leader View-Only Mode"', rawBadge.length === 0, rawBadge);
  check('dùng StatusBadge chung ở Khách hàng, Kế hoạch KD (xem), SOP của tôi',
    ['components/ClientManagement.jsx', 'components/salesplan/SalesPlanViewPanel.jsx', 'components/sop/SopMyPlanPanel.jsx'].every((f) => SRC(f).includes("from '../StatusBadge'") || SRC(f).includes("from './StatusBadge'")));
  check('còn chữ "Xóa" trong giao diện? (đã thống nhất "Xoá")', jsxFiles.every((f) => !/X[óo]a (dòng|cả|toàn|Cả)|Xóa/.test(fs.readFileSync(f, 'utf8'))));

  // ===========================================================================
  console.log('\n3. Sắp xếp bảng (utils/tableSort.js)');
  const ts = await imp('utils/tableSort.js');
  const rows = [{ n: 'Công ty B', q: 10, d: '01/10/2026', m: 'T10-2026' }, { n: 'cong ty A', q: 2, d: '31/08/2026', m: 'T08-2026' },
    { n: '', q: null, d: '', m: '' }, { n: 'Công ty C10', q: 100, d: '2026-09-15', m: 'T12-2025' }, { n: 'Công ty C2', q: 7, d: '15/09/2026 08:00', m: 'T09-2026' }];
  const col = (key, type) => [{ key, type }];
  const ten = (r) => r.map((x) => x.n || '∅').join('|');
  check('số: tăng dần đúng (2,7,10,100), ô trống LUÔN cuối', JSON.stringify(ts.sapXepDong(rows, { key: 'q', dir: 'asc' }, col('q', 'number')).map((r) => r.q)) === '[2,7,10,100,null]');
  check('số: giảm dần, ô trống vẫn cuối (không nhảy lên đầu)', JSON.stringify(ts.sapXepDong(rows, { key: 'q', dir: 'desc' }, col('q', 'number')).map((r) => r.q)) === '[100,10,7,2,null]');
  check('chữ: không phân biệt hoa/thường, "C2" < "C10" (so số trong chuỗi), trống cuối', ten(ts.sapXepDong(rows, { key: 'n', dir: 'asc' }, col('n'))) === 'cong ty A|Công ty B|Công ty C2|Công ty C10|∅', ten(ts.sapXepDong(rows, { key: 'n', dir: 'asc' }, col('n'))));
  check('ngày: so thời điểm (31/08 < 15/09 < 01/10), không so chữ', JSON.stringify(ts.sapXepDong(rows, { key: 'd', dir: 'asc' }, col('d', 'date')).map((r) => r.d)) === '["31/08/2026","2026-09-15","15/09/2026 08:00","01/10/2026",""]');
  check('tháng T..-yyyy: T12-2025 < T08-2026 < T09-2026 < T10-2026', JSON.stringify(ts.sapXepDong(rows, { key: 'm', dir: 'asc' }, col('m', 'month')).map((r) => r.m)) === '["T12-2025","T08-2026","T09-2026","T10-2026",""]');
  check('ổn định + không sửa mảng gốc', (() => { const a = [{ k: 1, i: 'a' }, { k: 1, i: 'b' }, { k: 0, i: 'c' }]; const s = ts.sapXepDong(a, { key: 'k', dir: 'asc' }, col('k', 'number')); return s.map((x) => x.i).join('') === 'cab' && a[0].i === 'a'; })());
  check('get tuỳ biến (cột tính toán)', ts.sapXepDong([{ a: 1, b: 5 }, { a: 9, b: 1 }], { key: 'x', dir: 'asc' }, [{ key: 'x', type: 'number', get: (r) => r.a - r.b }])[0].a === 1);
  check('không có sort / cột lạ -> trả nguyên mảng', ts.sapXepDong(rows, null, []) === rows && ts.sapXepDong(rows, { key: 'zzz', dir: 'asc' }, []) === rows);
  let st = null;
  st = ts.doiSapXep(st, { key: 'q', type: 'number' }); const s1 = JSON.stringify(st);
  st = ts.doiSapXep(st, { key: 'q', type: 'number' }); const s2 = JSON.stringify(st);
  st = ts.doiSapXep(st, { key: 'q', type: 'number' });
  check('bấm tiêu đề cột SỐ: giảm -> tăng -> bỏ', s1 === '{"key":"q","dir":"desc"}' && s2 === '{"key":"q","dir":"asc"}' && st === null);
  let sc = ts.doiSapXep(null, 'n'); const c1 = JSON.stringify(sc); sc = ts.doiSapXep(sc, 'n'); const c2 = JSON.stringify(sc); sc = ts.doiSapXep(sc, 'n');
  check('bấm tiêu đề cột CHỮ: tăng -> giảm -> bỏ; đổi cột thì bắt đầu lại', c1 === '{"key":"n","dir":"asc"}' && c2 === '{"key":"n","dir":"desc"}' && sc === null && ts.doiSapXep({ key: 'n', dir: 'desc' }, { key: 'q', type: 'number' }).key === 'q');
  check('dòng tổng: tongCot cộng đúng, ô chữ/trống tính 0', JSON.stringify(ts.tongCot([{ a: 1, b: '2' }, { a: 'x', b: null }, { a: 4.5 }], [{ key: 'a' }, { key: 'b' }])) === '{"a":5.5,"b":2}');
  check('aria-sort', ts.ariaSort({ key: 'q', dir: 'desc' }, 'q') === 'descending' && ts.ariaSort({ key: 'q', dir: 'asc' }, 'q') === 'ascending' && ts.ariaSort(null, 'q') === 'none');

  // ===========================================================================
  console.log('\n2. Toast xếp hàng đợi (utils/toastQueue.js)');
  const tq = await imp('utils/toastQueue.js');
  let q = [];
  q = tq.themToast(q, 'Lưu A', { id: 1, bien: 'success', now: 0 });
  q = tq.themToast(q, 'Lỗi B', { id: 2, bien: 'error', now: 100 });
  q = tq.themToast(q, 'Thông tin C', { id: 3, bien: 'info', now: 200 });
  check('3 toast cùng lúc xếp chồng, cái sau KHÔNG xoá cái trước', q.length === 3 && q.map((x) => x.id).join() === '1,2,3');
  check('toast lỗi không tự tắt (expiresAt null); thường tự tắt ~4s', q[1].expiresAt === null && q[0].expiresAt === 4000 && tq.TU_TAT_MS === 4000);
  check('hết 4s: toast thường mất, LỖI còn', (() => { const r = tq.hetHan(q, 4300); return r.map((x) => x.id).join() === '2,3' || r.map((x) => x.id).join() === '2'; })() && tq.hetHan(q, 60000).map((x) => x.id).join() === '2');
  check('đóng bằng × (boToast) chỉ bỏ đúng một cái', tq.boToast(q, 2).map((x) => x.id).join() === '1,3');
  q = tq.themToast(q, 'Thông tin C', { id: 4, bien: 'info', now: 3000 });
  check('cùng nội dung bắn liên tiếp -> gộp "×2" và gia hạn, không chồng', q.length === 3 && q[2].count === 2 && q[2].expiresAt === 7000);
  let many = [];
  for (let i = 0; i < 9; i++) many = tq.themToast(many, 'm' + i, { id: 10 + i, bien: i === 0 ? 'error' : 'info', now: 0 });
  check('tối đa ' + tq.MAX_HIENTHI + ' toast; dư thì bỏ toast thường cũ nhất, giữ LỖI', many.length === tq.MAX_HIENTHI && many.some((x) => x.bien === 'error'));
  check('đồng hồ chỉ cần khi còn toast tự tắt', tq.canDongHo(q) === true && tq.canDongHo([q[1]]) === false);
  check('gia hạn khi rê chuột ra', tq.giaHan([{ id: 1, expiresAt: 10, ms: 4000 }, { id: 2, expiresAt: null }], 1000)[0].expiresAt === 5000);
  const tp = SRC('components/ToastProvider.jsx');
  check('chữ ký cũ giữ nguyên: toast.error/success/info(msg) + useToast + ToastProvider; thêm tuỳ chọn thứ hai',
    /api\.current\.error = \(m, o\)/.test(tp) && /api\.current\.success/.test(tp) && /api\.current\.info/.test(tp) && /export function useToast/.test(tp) && /export function ToastProvider/.test(tp));
  check('toast: lỗi role=alert + nút × có aria-label; vùng chứa có nhãn', /role=\{t\.bien === 'error' \? 'alert' : 'status'\}/.test(tp) && /aria-label="Đóng thông báo"/.test(tp));

  // ===========================================================================
  console.log('\n5. Cảnh báo mất dữ liệu (utils/unsavedGuard.js + useUnsavedGuard)');
  const g = await imp('utils/unsavedGuard.js');
  g._resetUnsavedGuard();
  const lis = {}; const fakeWin = { addEventListener: (n, f) => { lis[n] = f; } };
  check('đăng ký beforeunload đúng một lần (idempotent)', g.installBeforeUnload(fakeWin) === true && g.installBeforeUnload(fakeWin) === false && typeof lis.beforeunload === 'function');
  const ev = () => ({ prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } });
  let e1 = ev(); g.beforeUnloadHandler(e1);
  check('không có gì dở -> beforeunload KHÔNG chặn', e1.prevented === false && !g.hasDirty());
  g.setDirty('a', true, 'Đề xuất giá'); g.setDirty('b', true, 'Kế hoạch KD'); g.setDirty('c', true, 'Kế hoạch KD');
  e1 = ev(); g.beforeUnloadHandler(e1);
  check('có màn dở -> beforeunload chặn + returnValue rỗng (Chrome cần)', e1.prevented === true && e1.returnValue === '');
  check('nhãn bỏ trùng: "Đề xuất giá, Kế hoạch KD"', g.dirtyLabels().join(', ') === 'Đề xuất giá, Kế hoạch KD');
  const v1 = g.dirtyVersion(); g.setDirty('a', true, 'Đề xuất giá'); g.setDirty('a', true, 'Đề xuất giá');
  check('version tăng khi mục MỚI chuyển sang chưa lưu, không tăng khi gõ tiếp (để hộp thoại chuyển tab chỉ hỏi một lần/đợt)', g.dirtyVersion() === v1);
  g.setDirty('a', false); g.setDirty('b', false); g.setDirty('c', false);
  check('lưu xong / unmount -> gỡ, không còn chặn', !g.hasDirty() && g.dirtyLabels().length === 0);
  g.setDirty('z', true, 'x'); const v2 = g.dirtyVersion(); g.setDirty('z', false); g.setDirty('z', true, 'x');
  check('rời rồi lại dở dang -> version tăng (hỏi lại)', g.dirtyVersion() === v2 + 1);
  g._resetUnsavedGuard();
  const hook = SRC('hooks/useUnsavedGuard.js');
  check('hook gỡ đăng ký khi unmount', /\(\) => \(\) => setDirty\(id\.current, false\)/.test(hook));
  const guardUse = {
    'components/pricing/PriceProposePanel.jsx': 'Đề xuất giá', 'components/salesplan/SalesPlanProposePanel.jsx': 'Kế hoạch kinh doanh', 'components/sop/SopPlanPanel.jsx': 'Kế hoạch SOP',
    'components/OrdersReview.jsx': 'Đơn hàng chờ duyệt', 'components/salesplan/PlanNamPanel.jsx': 'KPI năm', 'components/pricing/PriceApprovePanel.jsx': 'Duyệt giá',
    'components/sop/SopApprovePanel.jsx': 'Duyệt SOP', 'components/sop/SopMyPlanPanel.jsx': 'Kế hoạch SOP của tôi', 'components/AIOrderAgent.jsx': 'Đơn AI chưa lưu',
    'components/ClientManagement.jsx': 'Form khách hàng', 'components/ProductManagement.jsx': 'Form sản phẩm', 'components/ChangePasswordModal.jsx': 'Đổi mã PIN'
  };
  Object.keys(guardUse).forEach((f) => check('useUnsavedGuard gắn ở ' + path.basename(f), /useUnsavedGuard\(/.test(SRC(f)) && SRC(f).includes("'" + guardUse[f] + "'")));
  const app = SRC('App.jsx'); const ng = SRC('components/NavGuard.jsx'); const sb = SRC('components/SubTabs.jsx');
  check('chuyển tab menu + đăng xuất đi qua guard(); NavGuard dùng ConfirmDialog chung, nhãn "Rời đi, bỏ thay đổi" (đỏ) / "Ở lại để lưu"',
    /guard\(\(\) => setActiveTab\(id\)\)/.test(app) && /guard\(handleLogout\)/.test(app) && /ConfirmDialog/.test(ng) && /confirmLabel="Rời đi, bỏ thay đổi"/.test(ng) && /cancelLabel="Ở lại để lưu"/.test(ng) && /\n\s+danger\n/.test(ng));
  check('tab con cũng đi qua guard; main.jsx bọc NavGuardProvider', /guard\(\(\) => onChange\(t\.id\)\)/.test(sb) && /<NavGuardProvider>/.test(SRC('main.jsx')));

  // ===========================================================================
  console.log('\n9. Nhớ tab + bộ lọc (utils/uiState.js)');
  const ui = await imp('utils/uiState.js');
  const mem = new Map();
  global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
  ui.setUiScope('Hải');
  ui.writeUi('tab', 'sop'); ui.writeUi('thang', 'T10-2026');
  check('ghi/đọc lại được; khoá có tiền tố + tên người dùng (không lẫn giữa người)', ui.readUi('tab', 'x') === 'sop' && [...mem.keys()].every((k) => k.startsWith('oem_ui_v1:hải:')));
  ui.setUiScope('Luyến');
  check('đổi người dùng -> không thừa hưởng bộ lọc người trước', ui.readUi('tab', 'mặc định') === 'mặc định');
  ui.setUiScope('Hải');
  check('validate chặn giá trị cũ không còn hợp lệ', ui.readUi('tab', 'ai-agent', (v) => v === 'clients') === 'ai-agent');
  mem.set('oem_ui_v1:hải:hong', '{không phải json');
  check('JSON hỏng -> trả giá trị mặc định, không ném lỗi', ui.readUi('hong', 'm') === 'm');
  global.localStorage = { getItem() { throw new Error('bị chặn'); }, setItem() { throw new Error('đầy'); }, removeItem() { throw new Error('x'); } };
  check('localStorage bị chặn (chế độ riêng tư / hết dung lượng): đọc trả mặc định, ghi trả false, KHÔNG ném', ui.readUi('tab', 'mặc định') === 'mặc định' && ui.writeUi('tab', 'x') === false);
  delete global.localStorage;
  check('không có localStorage (SSR/test) cũng không nổ', ui.readUi('tab', 'm') === 'm' && ui.writeUi('tab', 'x') === false);
  const nm = await imp('utils/navMeta.js');
  check('tab đã nhớ hợp lệ thì giữ: admin + "sop" -> sop', nm.tabHopLe('sop', 'admin') === 'sop' && nm.tabHopLe('transactions', 'leader') === 'transactions');
  check('F5 không còn luôn về AI nếu có tab đã nhớ; chưa nhớ gì -> mặc định ai-agent', nm.tabHopLe('clients', 'sale') === 'clients' && nm.tabHopLe(null, 'sale') === 'ai-agent');
  // Đợt 3 (mục 6): mặc định THEO VAI TRÒ — admin/leader vào báo cáo thay vì AI (Sale vẫn vào AI). Chi tiết ở dot3-tung-man.test.cjs.
  check('tab rác/đã gỡ -> mặc định theo vai trò (Sale: ai-agent; admin: revenue-reports); kế toán chỉ được 3 mục (tab AI đã nhớ bị chặn)', nm.tabHopLe('ten-la', 'sale') === 'ai-agent' && nm.tabHopLe('ten-la', 'admin') === 'revenue-reports' && nm.tabHopLe('ai-agent', 'account') === 'products' && nm.tabHopLe('debt-importer', 'account') === 'debt-importer');
  check('App.jsx khởi tạo tab từ localStorage + ghi lại mỗi lần đổi + visitedTabs theo tab đó',
    /tabHopLe\(readUi\('tab', null\)/.test(app) && /writeUi\('tab', id\)/.test(app) && /new Set\(\[activeTab\]\)/.test(app) && !/useState\('ai-agent'\)/.test(app));
  const persisted = { 'components/ClientManagement.jsx': ['clients.status', 'clients.sale', 'clients.view'], 'components/TransactionGrid.jsx': ['tx.year', 'tx.month', 'tx.sale', 'tx.group'],
    'components/salesplan/SalesPlanViewPanel.jsx': ['plan.view.month', 'plan.view.sale'], 'components/salesplan/SalesPlanProposePanel.jsx': ['plan.propose.sale'],
    'components/reports/DtThangReport.jsx': ['rpt.thang.year', 'rpt.thang.month', 'rpt.thang.sale'], 'components/reports/DtNgayReport.jsx': ['rpt.ngay.month', 'rpt.ngay.sale'],
    'components/reports/DtSaleReport.jsx': ['rpt.sale.month'], 'components/pricing/PriceProposePanel.jsx': ['price.group'], 'components/sop/SopPlanPanel.jsx': ['sop.group'],
    'components/RevenueReports.jsx': ['reports.tab'], 'components/ProductPricing.jsx': ['sub.products'], 'components/SalesPlan.jsx': ['sub.sales-plan'], 'components/SopPlan.jsx': ['sub.sop'], 'components/DebtManagement.jsx': ['sub.debt'] };
  Object.keys(persisted).forEach((f) => check('nhớ qua F5 ở ' + path.basename(f) + ': ' + persisted[f].join(', '), persisted[f].every((k) => SRC(f).includes("'" + k + "'")) && /usePersistentState/.test(SRC(f))));
  check('bộ lọc đã nhớ nhưng không còn trong dữ liệu -> rơi về mặc định (không ra bảng trống)', /saleSaved === 'ALL' \|\| salesList\.includes\(saleSaved\)/.test(SRC('components/salesplan/SalesPlanViewPanel.jsx')) && /resolvePeriod/.test(SRC('components/TransactionGrid.jsx')));
  check('Kế hoạch KD (xem): "Tất cả tháng" do người dùng chọn không còn bị ép về tháng mới nhất', !/useEffect\(\(\) => \{\s*\n\s*if \(selectedMonth === 'ALL'/.test(SRC('components/salesplan/SalesPlanViewPanel.jsx')));

  // ===========================================================================
  console.log('\n7. Icon riêng cho từng mục menu/tab (utils/navMeta.js)');
  const all = nm.moiIcon();
  const seen = {}; const trung = [];
  all.forEach((x) => { if (seen[x.icon]) trung.push(x.icon + ': ' + seen[x.icon] + ' & ' + x.where); else seen[x.icon] = x.where; });
  check('mọi mục menu + tab (' + all.length + ') có icon KHÁC NHAU', trung.length === 0, trung);
  const navSrc = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'navMeta.js'), 'utf8');
  const importado = (navSrc.match(/import \{([\s\S]*?)\} from 'lucide-react'/)[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  check('mọi icon đặt tên trong NAV/SUBTABS đều được import', all.every((x) => importado.includes(x.icon)), all.filter((x) => !importado.includes(x.icon)));
  check('Sidebar đọc từ NAV (không tự khai báo lại menu/icon)', /NAV\.map/.test(SRC('components/Sidebar.jsx')) && !/Bot,\s*\n\s*BarChart3/.test(SRC('components/Sidebar.jsx')));
  check('tiêu đề màn dùng đúng icon của menu (Báo cáo=PieChart, Công nợ=Wallet)', /PieChart/.test(SRC('components/RevenueReports.jsx')) && /Wallet/.test(SRC('components/DebtManagement.jsx')));

  // ===========================================================================
  console.log('\n1, 3, 4, 6. Component dùng chung (render tĩnh)');
  const esbuild = require('esbuild');
  const out = esbuild.buildSync({
    stdin: {
      contents: "import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';" +
        "import ConfirmDialog from './src/components/ConfirmDialog.jsx'; import Modal from './src/components/Modal.jsx';" +
        "import SubTabs from './src/components/SubTabs.jsx'; import SortableTh from './src/components/SortableTh.jsx';" +
        "import TableState from './src/components/TableState.jsx'; import StatusBadge from './src/components/StatusBadge.jsx';" +
        "import MoreMenu from './src/components/MoreMenu.jsx'; import ViewModeToggle from './src/components/ViewModeToggle.jsx';" +
        "const h = React.createElement; const r = (c, p, ...k) => renderToStaticMarkup(h(c, p, ...k));" +
        "export const ve = { ConfirmDialog: (p) => r(ConfirmDialog, p), Modal: (p, k) => r(Modal, p, k), SubTabs: (p) => r(SubTabs, p), TableState: (p, k) => r(TableState, p, k)," +
        " SortableTh: (p, k) => r('table', null, h('thead', null, h('tr', null, h(SortableTh, p, k)))), StatusBadge: (p) => r(StatusBadge, p), MoreMenu: (p) => r(MoreMenu, p), ViewModeToggle: (p) => r(ViewModeToggle, p) };",
      resolveDir: ROOT, loader: 'jsx'
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' }
  });
  const tmp = path.join(os.tmpdir(), 'oem-dot2-' + process.pid + '.cjs');
  fs.writeFileSync(tmp, out.outputFiles[0].text);
  const { ve } = require(tmp);
  fs.unlinkSync(tmp);
  const noop = () => {};

  let html = ve.ConfirmDialog({ title: 'Xoá dòng này?', message: 'M', confirmLabel: 'Xoá dòng', danger: true, onConfirm: noop, onCancel: noop });
  check('ConfirmDialog: role=alertdialog + aria-modal + aria-labelledby trỏ đúng tiêu đề', /role="alertdialog"/.test(html) && /aria-modal="true"/.test(html) && (() => { const id = /aria-labelledby="([^"]+)"/.exec(html); return id && new RegExp('id="' + id[1] + '"[^>]*>Xoá dòng này\\?').test(html); })());
  check('ConfirmDialog: xoá -> nút "Xoá dòng" màu ĐỎ (btn-danger), có data-autofocus', /<button[^>]*btn-danger[^>]*>Xoá dòng</.test(html) && /data-autofocus/.test(html));
  html = ve.ConfirmDialog({ title: 'T', message: 'M', confirmLabel: 'Gửi duyệt', onConfirm: noop, onCancel: noop });
  check('ConfirmDialog thường: nút chính xanh (btn-primary), nút huỷ "Hủy" (btn-secondary)', /btn-primary[^>]*>Gửi duyệt</.test(html) && /btn-secondary[^>]*>Hủy</.test(html) && !/btn-danger/.test(html));
  const cd = SRC('components/ConfirmDialog.jsx') + SRC('components/DialogShell.jsx');
  check('Esc huỷ, Enter đồng ý (khi con trỏ không ở nút/ô nhập), bấm nền huỷ — trừ khi đang gửi', /onEscape=\{onCancel\}/.test(cd) && /onEnter=\{onConfirm\}/.test(cd) && /onBackdrop=\{onCancel\}/.test(cd) && /e\.key !== 'Enter' \|\| !onEnter \|\| busy/.test(cd));
  check('khung: tự focus (data-autofocus / ô nhập đầu), TRẢ focus khi đóng, Tab quay vòng, chỉ hộp trên cùng nhận phím',
    /querySelector\('\[data-autofocus\]'\)/.test(cd) && /prev\.focus\(\)/.test(cd) && /e\.key === 'Tab'/.test(cd) && /stack\[stack\.length - 1\] !== token/.test(cd));

  html = ve.Modal({ title: 'Thêm khách', onClose: noop }, 'NỘI DUNG');
  check('Modal: role=dialog + aria-modal + tiêu đề + nút × có aria-label "Đóng"', /role="dialog"/.test(html) && /aria-modal="true"/.test(html) && /aria-labelledby=/.test(html) && /aria-label="Đóng"/.test(html) && />Thêm khách</.test(html) && /NỘI DUNG/.test(html));
  html = ve.Modal({ ariaLabel: 'Đăng nhập', title: undefined }, 'x');
  check('Modal không onClose (đăng nhập bắt buộc): không nút ×, có aria-label', !/aria-label="Đóng"/.test(html) && /aria-label="Đăng nhập"/.test(html));
  html = ve.Modal({ title: 'T', onClose: noop, busy: true }, 'x');
  check('Modal đang gửi (busy): khoá nút × + aria-busy', /aria-busy="true"/.test(html) && /<button[^>]*disabled[^>]*aria-label="Đóng"|<button[^>]*aria-label="Đóng"[^>]*disabled/.test(html));
  const md = SRC('components/Modal.jsx');
  check('Modal: có chữ đã gõ (dirty) -> bấm nền KHÔNG đóng; Esc/× hỏi "Bỏ nội dung đã nhập?" bằng ConfirmDialog (nút "Bỏ nội dung", đỏ)',
    /dongDuoc && !dirty \? onClose : undefined/.test(md) && /if \(dirty\) setAskDiscard\(true\)/.test(md) && /confirmLabel="Bỏ nội dung"/.test(md) && /\n\s+danger\n/.test(md));
  const hand = ['components/ChangePasswordModal.jsx', 'components/LoginModal.jsx', 'components/ClientManagement.jsx', 'components/ProductManagement.jsx', 'components/products/BomModal.jsx'];
  hand.forEach((f) => check(path.basename(f) + ' dùng Modal chung, không còn overlay tự viết', /<Modal[\s>]/.test(SRC(f)) && !/position: 'fixed'/.test(SRC(f))));
  check('Sản phẩm: cả 2 modal (Thêm + Sửa) dùng Modal', (SRC('components/ProductManagement.jsx').match(/<Modal /g) || []).length === 2);
  const fixedOk = ['components/DialogShell.jsx', 'components/ToastProvider.jsx', 'components/Combobox.jsx'];
  const overlays = jsxFiles.filter((f) => /position: 'fixed'|position:'fixed'/.test(fs.readFileSync(f, 'utf8')) && !fixedOk.includes(rel(f))).map(rel);
  check('không còn overlay position:fixed tự viết ngoài khung chung (DialogShell/Combobox popup)', overlays.length === 0, overlays);
  const nat = jsxFiles.concat(walk(path.join(ROOT, 'src')).filter((f) => /\.js$/.test(f))).filter((f) => /(^|[^.\w])(window\.)?(confirm|alert|prompt)\(/.test(fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'))).map(rel);
  check('không còn window.confirm/alert/prompt trong src', nat.length === 0, nat);

  // nhãn nút xác nhận: mọi ConfirmDialog có confirmLabel RÕ HÀNH ĐỘNG, không "OK"/chung chung
  const GENERIC = /^(ok|đồng ý|xác nhận|yes|có|lưu|duyệt|gửi|đồng bộ)$/i;
  const dialogs = [];
  jsxFiles.forEach((f) => {
    const s = fs.readFileSync(f, 'utf8');
    if (/ConfirmDialog\.jsx$/.test(f) || /Modal\.jsx$/.test(f) || /NavGuard\.jsx$/.test(f)) return;
    const re = /<ConfirmDialog\b([\s\S]*?)\/>/g; let m;
    while ((m = re.exec(s))) dialogs.push({ f: rel(f), props: m[1] });
  });
  const khongNhan = dialogs.filter((d) => !/confirmLabel=/.test(d.props)).map((d) => d.f);
  const chung = dialogs.map((d) => { const m = /confirmLabel=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\}|\{([^}]*)\})/.exec(d.props); return { f: d.f, v: m ? (m[1] || m[2] || m[3] || m[4] || '') : '' }; })
    .filter((x) => x.v && GENERIC.test(x.v.trim())).map((x) => x.f + ': ' + x.v);
  check('mọi ConfirmDialog (' + dialogs.length + ') truyền confirmLabel; không dùng nhãn chung "OK/Lưu/Duyệt/Gửi/Xác nhận" trơ trọi', khongNhan.length === 0 && chung.length === 0, { khongNhan, chung });
  const xoaKhongDo = dialogs.filter((d) => /confirmLabel=[^\n]*(Xoá|xoá)/.test(d.props) || /confirm\.confirmLabel/.test(d.props)).filter((d) => !/\bdanger\b|destructive/.test(d.props)).map((d) => d.f);
  check('hộp xoá luôn kiểu danger (đỏ)', xoaKhongDo.length === 0, xoaKhongDo);
  const doKhiGhiDe = ['components/debt/DebtImportPanel.jsx', 'components/pricing/CostImportPanel.jsx', 'components/pricing/KitsPanel.jsx', 'components/salesplan/PlanNamPanel.jsx', 'components/transactions/RevenueImportPanel.jsx', 'components/sop/SopPlanPanel.jsx'];
  check('hộp GHI ĐÈ / thay toàn bộ (công nợ, giá vốn, bộ SP, KPI năm, doanh thu, SOP) kiểu danger', doKhiGhiDe.every((f) => /\n\s+(danger|destructive)\n/.test(SRC(f))));
  const labels = ['Ghi đè công nợ', 'Thay công thức bộ SP', 'Thay KPI năm', 'Xoá số đang nhập', 'Gửi đề xuất giá', 'Xoá dòng', 'Xoá cả đơn'];
  check('nhãn đúng hành động xuất hiện: ' + labels.join(' / '), labels.every((l) => jsxFiles.some((f) => fs.readFileSync(f, 'utf8').includes(l))));

  html = ve.SubTabs({ tabs: [{ id: 'a', label: 'Xem', icon: 'Eye' }, { id: 'b', label: 'Duyệt', icon: 'CheckCheck' }], active: 'b', onChange: noop });
  check('SubTabs: role=tablist, aria-selected đúng tab, KHÔNG dùng btn-primary (nhường cho nút chính của màn)', /role="tablist"/.test(html) && /aria-selected="true"[^>]*>.*Duyệt/.test(html) && (html.match(/aria-selected="false"/g) || []).length === 1 && !/btn-primary/.test(html));
  const tabBtn = jsxFiles.filter((f) => /setSubView\('|setReportTab\('/.test(fs.readFileSync(f, 'utf8')) && /btn-primary|btn-secondary/.test(fs.readFileSync(f, 'utf8').split('\n').filter((l) => /setSubView\(|setReportTab\(/.test(l)).join('\n'))).map(rel);
  check('không còn nút tab con kiểu btn-primary/btn-secondary (đã sang SubTabs)', tabBtn.length === 0, tabBtn);
  const chonViewMode = jsxFiles.filter((f) => /setViewMode\('table'\)[^\n]*btn-primary|btn btn-sm \$\{viewMode/.test(fs.readFileSync(f, 'utf8'))).map(rel);
  check('công tắc Dạng Bảng/Lưới dùng ViewModeToggle (không tranh màu nút chính)', chonViewMode.length === 0 && /aria-pressed/.test(ve.ViewModeToggle({ mode: 'table', onChange: noop })), chonViewMode);

  html = ve.SortableTh({ col: 'q', sort: { key: 'q', dir: 'desc' }, onSort: noop, align: 'right' }, 'Số lượng');
  check('SortableTh: aria-sort="descending", nút bấm được, mũi tên', /aria-sort="descending"/.test(html) && /<button[^>]*th-sort/.test(html) && /<svg/.test(html) && /text-align:right/.test(html));
  html = ve.SortableTh({ col: 'q', sort: null, onSort: noop }, 'Tên');
  check('SortableTh chưa sắp: aria-sort="none"', /aria-sort="none"/.test(html));
  const bangChinh = { 'components/ClientManagement.jsx': 6, 'components/ProductManagement.jsx': 8, 'components/pricing/PriceProposePanel.jsx': 4, 'components/pricing/PriceApprovePanel.jsx': 5, 'components/salesplan/SalesPlanViewPanel.jsx': 6,
    'components/salesplan/SalesPlanApprovePanel.jsx': 6, 'components/salesplan/SalesPlanProposePanel.jsx': 4, 'components/sop/SopViewPanel.jsx': 3, 'components/sop/SopApprovePanel.jsx': 4, 'components/sop/SopPlanPanel.jsx': 3,
    'components/debt/DebtViewPanel.jsx': 7, 'components/TransactionGrid.jsx': 9, 'components/reports/DtSaleReport.jsx': 5, 'components/reports/DtThangReport.jsx': 5, 'components/reports/DtNgayReport.jsx': 5 };
  Object.keys(bangChinh).forEach((f) => { const s = SRC(f); check(path.basename(f) + ': bảng sắp xếp được (useTableSort + ≥' + bangChinh[f] + ' cột SortableTh), sắp TRƯỚC khi cắt trang', /useTableSort\(/.test(s) && (s.match(/<SortableTh /g) || []).length >= Math.min(bangChinh[f], 3) && (!/usePagedSlice/.test(s) || /usePagedSlice\(sorted\w+/.test(s))); });
  check('Đơn chờ duyệt: chọn thứ tự (mới nhất/cũ nhất/tổng tiền/mã đơn), so thời điểm thật thay vì so chữ ngày', /orders\.sort/.test(SRC('components/OrdersReview.jsx')) && /sapXepNgay\(g\[1\]\[0\]\.createdAt\)/.test(SRC('components/OrdersReview.jsx')));
  const dongTong = ['components/sop/SopViewPanel.jsx', 'components/sop/SopApprovePanel.jsx', 'components/salesplan/SalesPlanViewPanel.jsx', 'components/debt/DebtViewPanel.jsx', 'components/reports/DtSaleReport.jsx'];
  check('dòng tổng (top-summary-row) có ở các bảng số liệu, kể cả SOP xem/duyệt mới thêm', dongTong.every((f) => /top-summary-row/.test(SRC(f))));

  html = ve.TableState({ error: 'Máy chủ không phản hồi', onRetry: noop, errorPrefix: 'Lỗi tải bảng SOP' }, 'DỮ LIỆU');
  check('TableState lỗi: role=alert, hiện lý do, có nút "Thử lại", KHÔNG hiện dữ liệu', /role="alert"/.test(html) && /Lỗi tải bảng SOP: Máy chủ không phản hồi/.test(html) && /Thử lại/.test(html) && !/DỮ LIỆU/.test(html));
  html = ve.TableState({ loading: true, onRetry: noop, loadingLabel: 'Đang tải X...' }, 'DỮ LIỆU');
  check('TableState đang tải: hiện nhãn chờ, không hiện dữ liệu (nút Thử lại tự hiện nếu chờ quá 45s)', /Đang tải X\.\.\./.test(html) && !/DỮ LIỆU/.test(html) && /SLOW_MS = 45000/.test(SRC('components/TableState.jsx')));
  html = ve.TableState({ isEmpty: true, emptyText: 'Chưa có đơn nào.' }, 'DỮ LIỆU');
  check('TableState rỗng: hiện câu rỗng thống nhất', /state-empty/.test(html) && /Chưa có đơn nào\./.test(html) && !/DỮ LIỆU/.test(html));
  html = ve.TableState({}, 'DỮ LIỆU');
  check('TableState có dữ liệu: chỉ hiện nội dung', html === 'DỮ LIỆU');
  const treo = ['components/pricing/PriceApprovePanel.jsx', 'components/sop/SopViewPanel.jsx', 'components/sop/SopApprovePanel.jsx', 'components/sop/SopPlanPanel.jsx', 'components/debt/DebtViewPanel.jsx', 'components/OrdersReview.jsx', 'components/salesplan/PlanNamPanel.jsx'];
  check('các bảng tải từ máy chủ đều có onRetry (lỗi -> Thử lại, không kẹt "Đang tải…")', treo.every((f) => /<TableState[\s\S]*?onRetry=/.test(SRC(f))));
  check('không màn nào còn `if (isLoading) return <LoadingScreen`/<div>Đang tải...</div> trần', jsxFiles.every((f) => !/if \(isLoading\) return/.test(fs.readFileSync(f, 'utf8'))));

  html = ve.StatusBadge({ status: 'drafted' });
  check('StatusBadge("drafted") -> "Bản nháp", không lộ mã thô', /Bản nháp/.test(html) && !/drafted/.test(html));
  html = ve.StatusBadge({ status: 'Active' });
  check('StatusBadge("Active") -> badge xanh "Đang hoạt động"', /badge-emerald/.test(html) && /Đang hoạt động/.test(html) && !/>Active</.test(html));
  html = ve.StatusBadge({ status: '2026-10-01' });
  check('StatusBadge("2026-10-01") -> "01/10/2026"', /01\/10\/2026/.test(html));

  html = ve.MoreMenu({ items: [{ label: 'Xuất Excel', onClick: noop }, { label: 'Xoá cả đơn', danger: true, onClick: noop }] });
  check('MoreMenu: đóng sẵn, nút "Thêm" có aria-haspopup/aria-expanded=false, chưa lộ mục', /aria-haspopup="menu"/.test(html) && /aria-expanded="false"/.test(html) && !/Xoá cả đơn/.test(html));
  const mm = SRC('components/MoreMenu.jsx');
  check('MoreMenu: Esc đóng, bấm ngoài đóng, mục xoá chữ đỏ, mũi tên chuyển mục', /e\.key === 'Escape'/.test(mm) && /addEventListener\('mousedown', onDown\)/.test(mm) && /is-danger/.test(mm) && /ArrowDown/.test(mm));
  check('Đơn chờ duyệt: một nút chính "Copy Dán SAP", Xuất Excel + Xoá cả đơn (danger) gom vào "Thêm"',
    /btn btn-primary btn-sm[\s\S]{0,200}Copy Dán SAP|Copy Dán SAP/.test(SRC('components/OrdersReview.jsx')) && /<MoreMenu/.test(SRC('components/OrdersReview.jsx')) && /danger: true/.test(SRC('components/OrdersReview.jsx')));
  const emerald = jsxFiles.filter((f) => /btn-emerald|btn-accent/.test(fs.readFileSync(f, 'utf8'))).map(rel);
  check('không còn nút btn-emerald/btn-accent làm nút hành động (mỗi màn một primary)', emerald.length === 0, emerald);
  check('nút xoá nhỏ dùng btn-danger-outline + aria-label (RowActionButtons)', /btn-danger-outline/.test(SRC('components/RowActionButtons.jsx')) && /aria-label="Xoá dòng"/.test(SRC('components/RowActionButtons.jsx')));
  const hoverTrang = /\.custom-table tr:hover td \{\s*background: var\(--row-hover\)/.test(fs.readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8').replace(/\r\n/g, '\n'));
  check('CSS có .btn-danger, .btn-ghost, .btn:disabled, .badge-neutral', ['.btn-danger {', '.btn-ghost {', '.btn:disabled', '.badge-neutral {'].every((x) => fs.readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8').includes(x)));

  // ===========================================================================
  console.log('\n8. Tương phản màu (WCAG 2.x, đo thật từ index.css)');
  const W = require('./wcag-contrast.cjs');
  const { light, dark, darkMedia, darkExplicit, css } = W.load();
  const c = (tm, tk) => W.resolve(tm, tk);
  const oldTh = W.ratio(W.parseColor('#334155'), W.parseColor('#111c27'));
  check('bộ đo tái hiện đúng lỗi đã báo: chữ tiêu đề bảng cũ (#334155 trên nền tối #111c27) = ' + oldTh.toFixed(1) + ':1 (báo cáo ghi 1,6:1)', oldTh > 1.5 && oldTh < 1.7);
  const thSang = W.ratio(c(light, '--th-text'), c(light, '--th-bg')), thToi = W.ratio(c(dark, '--th-text'), c(dark, '--th-bg'));
  check('tiêu đề bảng: sáng ' + thSang.toFixed(1) + ':1, TỐI ' + thToi.toFixed(1) + ':1 (>= 4,5)', thSang >= 4.5 && thToi >= 4.5);
  const hvSang = W.ratio(c(light, '--text-main'), c(light, '--row-hover')), hvToi = W.ratio(c(dark, '--text-main'), c(dark, '--row-hover'));
  check('dòng rê chuột: chữ đọc được ở cả hai giao diện (' + hvSang.toFixed(1) + ' / ' + hvToi.toFixed(1) + ') và nền hover TỐI không còn trắng', hvSang >= 4.5 && hvToi >= 4.5 && W.luminance(c(dark, '--row-hover')) < 0.1);
  check('CSS: tiêu đề bảng dùng --th-text/--th-bg, hover dùng --row-hover (không còn hex #334155/#f8fafc cứng)', /color: var\(--th-text\)/.test(css) && /background: var\(--th-bg\)/.test(css) && hoverTrang && !/color: #334155/.test(css) && !/background: #f8fafc/.test(css));
  const sameDecl = JSON.stringify([...darkMedia].sort()) === JSON.stringify([...darkExplicit].sort());
  check('hai khối tối (theo hệ thống / chọn tay data-theme=dark) GIỐNG HỆT (bản cũ thiếu --badge-*-ink ở khối chọn tay)', sameDecl && darkExplicit.has('--badge-rose-ink') && darkExplicit.has('--row-hover'));
  const { loi, rows: dem } = W.kiemTra();
  check('mọi token dùng làm MÀU CHỮ trong JSX >= 4,5:1 trên mọi nền thường gặp, cả sáng lẫn tối (' + dem.length + ' cặp đã đo)', loi.length === 0, loi.map((l) => l.theme + ' ' + l.fg + '/' + l.bg + '=' + l.ratio.toFixed(2)));
  const chuTho = []; jsxFiles.forEach((f) => { const m = fs.readFileSync(f, 'utf8').match(/\bcolor\s*:\s*['"]#[0-9a-fA-F]{3,8}['"]/g); if (m) m.forEach((x) => { if (!/#fff['"]|#ffffff['"]/i.test(x)) chuTho.push(rel(f) + ' ' + x); }); });
  check('không còn màu chữ hex cứng ngoài #fff (hex cứng không đổi theo giao diện tối)', chuTho.length === 0, chuTho);
  const emerald2 = W.ratio(c(light, '--accent-emerald-text'), c(light, '--bg-card'));
  check('--accent-emerald-text sáng đã sửa từ 3,8 lên ' + emerald2.toFixed(1) + ' ; --text-dim sáng >= 4,5 trên thẻ', emerald2 >= 4.5 && W.ratio(c(light, '--text-dim'), c(light, '--bg-card')) >= 4.5);
  // nút: chữ trắng trên mọi đầu gradient
  const grad = (cls) => { const m = new RegExp('\\.' + cls + '(?::hover)? \\{[^}]*?background: linear-gradient\\(135deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\\)', 'g'); const out = []; let x; while ((x = m.exec(css))) out.push(x[1], x[2]); return out; };
  const nut = {};
  ['btn-primary', 'btn-emerald', 'btn-accent'].forEach((k) => { nut[k] = grad(k); });
  const bad = []; Object.keys(nut).forEach((k) => { check('.' + k + ': tìm thấy màu nền (thường + hover)', nut[k].length >= 4, nut[k]); nut[k].forEach((h) => { const r = W.ratio({ r: 255, g: 255, b: 255, a: 1 }, W.parseColor(h)); if (r < 4.5) bad.push(k + ' ' + h + '=' + r.toFixed(2)); }); });
  const dgr = /\.btn-danger \{[^}]*?background: (#[0-9a-f]{6})/.exec(css), dgh = /\.btn-danger:hover \{[^}]*?background: (#[0-9a-f]{6})/.exec(css);
  [dgr && dgr[1], dgh && dgh[1]].forEach((h) => { const r = W.ratio({ r: 255, g: 255, b: 255, a: 1 }, W.parseColor(h)); if (r < 4.5) bad.push('btn-danger ' + h + '=' + r.toFixed(2)); });
  check('chữ trắng trên nút primary / emerald / accent / danger (cả hover) >= 4,5:1', bad.length === 0 && !!dgr && !!dgh, bad);
  // badge: chữ trên nền tint trộn lên thẻ
  const badBadge = [];
  [['blue', '--badge-blue-ink'], ['emerald', '--badge-emerald-ink'], ['amber', '--badge-amber-ink'], ['purple', '--badge-purple-ink'], ['rose', '--badge-rose-ink']].forEach(([k, ink]) => {
    const m = new RegExp('\\.badge-' + k + ' \\{\\s*background: (rgba\\([^)]*\\))').exec(css);
    [['sáng', light], ['tối', dark]].forEach(([tn, tm]) => { for (const nen of ['--bg-card', '--surface-sunk', '--bg-card-hover', '--row-hover']) { const bg = W.over(W.parseColor(m[1]), c(tm, nen)); const r = W.ratio(c(tm, ink), bg); if (r < 4.5) badBadge.push(k + ' ' + tn + ' ' + nen + '=' + r.toFixed(2)); } });
  });
  check('badge xanh dương/lá/vàng/tím/đỏ: chữ trên nền tint >= 4,5:1 (sáng + tối, trên thẻ/nền chìm/hover)', badBadge.length === 0, badBadge);
  const tabAct = []; [['sáng', light], ['tối', dark]].forEach(([tn, tm]) => { const bg = W.over(W.parseColor('rgba(0, 160, 233, 0.1)'), c(tm, '--bg-card')); const r = W.ratio(c(tm, '--cyan-text'), bg); if (r < 4.5) tabAct.push(tn + '=' + r.toFixed(2)); });
  check('tab đang chọn (chữ --cyan-text trên nền cyan nhạt) >= 4,5:1', tabAct.length === 0, tabAct);
  const toastBad = []; [['sáng', light], ['tối', dark]].forEach(([tn, tm]) => { [['--danger-strong', '--danger-bg'], ['--success-text', '--success-bg'], ['--info-text', '--info-bg'], ['--warning-text', '--warning-bg']].forEach(([fg, bg]) => { ['--bg-card', '--bg-main'].forEach((nen) => { const r = W.ratio(c(tm, fg), c(tm, bg), c(tm, nen)); if (r < 4.5) toastBad.push(tn + ' ' + fg + ' trên ' + bg + '/' + nen + '=' + r.toFixed(2)); }); }); });
  check('toast / thông báo: chữ trên nền tint (lỗi, thành công, thông tin, cảnh báo) >= 4,5:1', toastBad.length === 0, toastBad);

  // ===========================================================================
  console.log('\nKhông lọt harness vào bản build');
  const vite = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8');
  check('vite.config.js không có rollupOptions.input -> chỉ index.html được build; ui-harness chỉ chạy bằng `npm run dev`', !/rollupOptions|input\s*:/.test(vite) && fs.existsSync(path.join(ROOT, 'ui-harness.html')));
  const distHarness = fs.existsSync(path.join(ROOT, 'dist')) ? walk(path.join(ROOT, 'dist')).filter((f) => /harness/i.test(path.basename(f))) : [];
  check('dist/ không chứa file harness', distHarness.length === 0, distHarness);
  check('không file nguồn nào ngoài src/dev import uiHarness', jsxFiles.every((f) => !/uiHarness/.test(fs.readFileSync(f, 'utf8'))) && !/uiHarness/.test(SRC('main.jsx')));

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
