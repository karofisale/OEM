/**
 * cai-dat.test.cjs — Cài đặt cá nhân lưu theo tài khoản (14/10/2026).
 *
 *   node test/cai-dat.test.cjs
 *
 * Logic thuần (utils/settings.js, utils/pinRule.js) gọi thẳng. Lớp đồng bộ (services/prefsSync.js) chạy với localStorage giả +
 * máy chủ giả (getMyPrefs/setMyPrefs): gộp "máy chủ thắng", tải bản cục bộ lên lần đầu, debounce chỉ gửi khoá đã đổi, nuốt lỗi,
 * khôi phục mặc định. Phần giao diện (Settings.jsx, nối vào App/Navbar/các màn) soát bằng mã nguồn; hành vi thật đã thử trên
 * trình duyệt qua /ui-harness.html (xem báo cáo cuối việc).
 */
const fs = require('fs');
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
const cho = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ===========================================================================
  console.log('\n1. Luật PIN chung (utils/pinRule.js)');
  const pin = await imp('utils/pinRule.js');
  check('hợp lệ: 6+ chữ số, không đều, không dãy liên tiếp', ['135790', '482913', '100200', '7391026'].every((p) => pin.kiemTraPin(p) === ''));
  check('dưới 6 ký tự -> "PIN phải có ít nhất 6 ký tự." (đúng câu máy chủ dùng)', pin.kiemTraPin('1234') === 'PIN phải có ít nhất 6 ký tự.' && pin.kiemTraPin('') === 'PIN phải có ít nhất 6 ký tự.' && pin.kiemTraPin(null) === 'PIN phải có ít nhất 6 ký tự.');
  check('có chữ / ký tự lạ -> chặn (chỉ chữ số)', /chữ số/.test(pin.kiemTraPin('12ab56')) && /chữ số/.test(pin.kiemTraPin('abcdef')) && /chữ số/.test(pin.kiemTraPin('12 456')));
  check('toàn chữ số giống nhau -> chặn (000000, 111111, 99999999)', ['000000', '111111', '99999999'].every((p) => /giống nhau/.test(pin.kiemTraPin(p))));
  check('đoạn liên tiếp của 01234567890 -> chặn (012345, 123456, 234567, 345678, 456789, 567890, 1234567890)', ['012345', '123456', '234567', '345678', '456789', '567890', '1234567890', '01234567890'].every((p) => /liên tiếp/.test(pin.kiemTraPin(p))));
  check('đoạn gần giống nhưng KHÔNG phải substring thì được (123457, 654321, 123123)', ['123457', '654321', '123123'].every((p) => pin.kiemTraPin(p) === ''));
  check('đúng 6 ký tự là đủ (biên 5/6)', pin.kiemTraPin('13579') !== '' && pin.kiemTraPin('135790') === '');

  const mod = SRC('components/ChangePasswordModal.jsx');
  check('ChangePasswordModal dùng kiemTraPin (bỏ luật "< 4 ký tự" cũ), placeholder "Ít nhất 6 chữ số"', /kiemTraPin\(newPin\)/.test(mod) && !/newPin\.length < 4/.test(mod) && /Ít nhất 6 chữ số/.test(mod) && !/Ít nhất 4 ký tự/.test(mod));
  check('phiên SSO (cổng VHKD): modal hiện hướng dẫn "đổi PIN tại cổng VHKD" thay form; App truyền sso = fromPortal', /sso \? \(/.test(mod) && /HUONG_DAN_PIN_SSO/.test(mod) && /sso=\{!!session\.fromPortal\}/.test(SRC('App.jsx')) && /đổi PIN tại cổng VHKD/.test(pin.HUONG_DAN_PIN_SSO));

  // ===========================================================================
  console.log('\n2. Khoá + giá trị cài đặt (utils/settings.js)');
  const st = await imp('utils/settings.js');
  const nm = await imp('utils/navMeta.js');
  check('mọi khoá đồng bộ khớp luật khoá của máy chủ /^[a-z][A-Za-z0-9_.:-]{0,47}$/ và là khoá cục bộ khác nhau', st.SYNC_KEYS.every((k) => st.KEY_RE.test(k)) && new Set(st.SYNC_KEYS.map((k) => st.DEFS[k].local)).size === st.SYNC_KEYS.length);
  check('đủ 9 cài đặt st.* đúng tên đã chốt', JSON.stringify(st.SETTING_KEYS.slice().sort()) === JSON.stringify(['st.calcMargin', 'st.density', 'st.landing', 'st.pageSize', 'st.reportSale', 'st.reportYear', 'st.sidebarCollapsed', 'st.theme', 'st.toastSec']));
  check('số khoá tối đa của một người (st + ui) nằm gọn dưới giới hạn 80 của máy chủ, và dưới 40 để một lệnh đủ', st.SYNC_KEYS.length < 40);
  check('mặc định của mọi khoá là giá trị HỢP LỆ của chính nó', st.SYNC_KEYS.every((k) => st.hopLe(k, st.DEFS[k].def)));
  check('mặc định = hành vi hiện tại: theme system, thoáng, menu mở, trang đầu auto, cỡ trang theo màn (0), LNG 20, toast 4s',
    st.DEFS['st.theme'].def === 'system' && st.DEFS['st.density'].def === 'comfortable' && st.DEFS['st.sidebarCollapsed'].def === false && st.DEFS['st.landing'].def === 'auto' && st.DEFS['st.pageSize'].def === 0 && st.DEFS['st.calcMargin'].def === 20 && st.DEFS['st.toastSec'].def === 4 && st.DEFS['st.reportYear'].def === 'latest' && st.DEFS['st.reportSale'].def === 'all');
  check('theme: chỉ system/light/dark', ['system', 'light', 'dark'].every((v) => st.hopLe('st.theme', v)) && !st.hopLe('st.theme', 'purple') && !st.hopLe('st.theme', null) && !st.hopLe('st.theme', 1));
  check('density: chỉ comfortable/compact; sidebarCollapsed: chỉ boolean', st.hopLe('st.density', 'compact') && !st.hopLe('st.density', 'tight') && st.hopLe('st.sidebarCollapsed', true) && !st.hopLe('st.sidebarCollapsed', 'true') && !st.hopLe('st.sidebarCollapsed', 1));
  check('landing: auto hoặc id tab thật; "settings" và tab lạ bị loại', st.hopLe('st.landing', 'auto') && nm.TAB_IDS.every((t) => st.hopLe('st.landing', t)) && !st.hopLe('st.landing', 'settings') && !st.hopLe('st.landing', 'xyz') && !st.hopLe('st.landing', ''));
  check('pageSize: 0 hoặc 25/50/100/200 (số, không phải chuỗi)', [0, 25, 50, 100, 200].every((v) => st.hopLe('st.pageSize', v)) && !st.hopLe('st.pageSize', 30) && !st.hopLe('st.pageSize', '50') && !st.hopLe('st.pageSize', -25));
  check('calcMargin: số nguyên 1..60 (0, 61, 12.5, "20" bị loại)', [1, 20, 60].every((v) => st.hopLe('st.calcMargin', v)) && [0, 61, 12.5, '20', NaN, -5, null].every((v) => !st.hopLe('st.calcMargin', v)));
  check('toastSec: 3/4/6/10', [3, 4, 6, 10].every((v) => st.hopLe('st.toastSec', v)) && !st.hopLe('st.toastSec', 5) && !st.hopLe('st.toastSec', '4'));
  check('reportYear latest|current; reportSale all|mine; kiểu xem table|grid', st.hopLe('st.reportYear', 'current') && !st.hopLe('st.reportYear', '2026') && st.hopLe('st.reportSale', 'mine') && !st.hopLe('st.reportSale', 'ALL') && st.hopLe('ui.reports.view', 'grid') && !st.hopLe('ui.reports.view', 'list'));
  check('giaTri: không hợp lệ/khoá lạ -> mặc định / undefined', st.giaTri('st.toastSec', 99) === 4 && st.giaTri('st.toastSec', 10) === 10 && st.giaTri('st.theme', 'x') === 'system' && st.giaTri('st.khongco', 1) === undefined);
  check('chuanLng: kẹp 1..60, làm tròn, nhận dấu phẩy, rác -> null', st.chuanLng('25') === 25 && st.chuanLng('0') === 1 && st.chuanLng('999') === 60 && st.chuanLng('-3') === 1 && st.chuanLng('12,6') === 13 && st.chuanLng(' 30 ') === 30 && st.chuanLng('') === null && st.chuanLng('abc') === null && st.chuanLng(null) === null);
  check('guiDuoc: khoá sai dạng bị loại; JSON > 1000 ký tự bị loại; null (xoá) luôn được', st.guiDuoc('st.theme', 'dark') && !st.guiDuoc('St.theme', 'dark') && !st.guiDuoc('1abc', 1) && !st.guiDuoc('a'.repeat(49), 1) && st.guiDuoc('a'.repeat(48), 1) && !st.guiDuoc('st.x', 'x'.repeat(1001)) && st.guiDuoc('st.x', null));
  check('lamSachTuMayChu: bỏ khoá lạ + giá trị hỏng, chịu được phản hồi rác', JSON.stringify(st.lamSachTuMayChu({ prefs: { 'st.theme': 'dark', 'st.toastSec': 77, 'st.la': 1, 'ui.reports.view': 'grid' } })) === JSON.stringify({ 'st.theme': 'dark', 'ui.reports.view': 'grid' })
    && JSON.stringify(st.lamSachTuMayChu(null)) === '{}' && JSON.stringify(st.lamSachTuMayChu({ prefs: 'x' })) === '{}' && JSON.stringify(st.lamSachTuMayChu({})) === '{}' && JSON.stringify(st.lamSachTuMayChu({ prefs: [1] })) === '{}');

  // ===========================================================================
  console.log('\n3. Luật gộp máy chủ ↔ cục bộ (gopMayChu) + chia lệnh');
  const gm = (server, local, pending, seeded) => st.gopMayChu({ server, local, pending, seeded });
  let r = gm({ 'st.theme': 'dark' }, { 'st.theme': 'light' }, {}, true);
  check('MÁY CHỦ THẮNG: khác nhau -> ghi đè cục bộ, không tải lên', r.setLocal['st.theme'] === 'dark' && !('st.theme' in r.upload) && r.clearLocal.length === 0);
  r = gm({ 'st.theme': 'dark' }, { 'st.theme': 'dark' }, {}, true);
  check('giống nhau -> không làm gì', Object.keys(r.setLocal).length === 0 && Object.keys(r.upload).length === 0);
  r = gm({}, { 'st.density': 'compact', 'st.toastSec': 6 }, {}, false);
  check('LẦN ĐẦU (chưa seeded): máy chủ trống mà cục bộ có -> tải cục bộ lên', r.upload['st.density'] === 'compact' && r.upload['st.toastSec'] === 6 && r.clearLocal.length === 0);
  r = gm({}, { 'st.density': 'compact' }, {}, true);
  check('đã từng đồng bộ mà máy chủ trống (khôi phục ở máy khác) -> XOÁ cục bộ, không tải lên (khỏi sống lại)', r.clearLocal.includes('st.density') && !('st.density' in r.upload));
  r = gm({ 'st.theme': 'dark' }, { 'st.theme': 'dark', 'st.density': 'compact' }, { 'st.theme': 'light', 'st.density': null }, true);
  check('khoá còn chờ gửi (pending) thắng máy chủ: gửi lại giá trị đang chờ, kể cả null (xoá)', r.upload['st.theme'] === 'light' && r.upload['st.density'] === null && !('st.theme' in r.setLocal));
  r = gm({ 'st.theme': 'dark' }, {}, {}, false);
  check('máy chủ có, cục bộ chưa chọn -> ghi cục bộ', r.setLocal['st.theme'] === 'dark');
  r = gm(st.lamSachTuMayChu({ prefs: { 'st.toastSec': 99 } }), { 'st.toastSec': 6 }, {}, true);
  check('giá trị hỏng từ máy chủ bị bỏ trước khi gộp -> coi như máy chủ chưa có, không đè bản tốt', !('st.toastSec' in r.setLocal));
  const nhieu = {}; for (let i = 0; i < 45; i++) nhieu['k' + i] = i;
  const lenhs = st.chiaLenh(nhieu);
  check('chiaLenh: 45 khoá -> 2 lệnh (40 + 5), không mất khoá nào', lenhs.length === 2 && Object.keys(lenhs[0]).length === 40 && Object.keys(lenhs[1]).length === 5 && lenhs.reduce((a, l) => a + Object.keys(l).length, 0) === 45);
  check('chiaLenh: bỏ khoá sai dạng / giá trị quá dài', st.chiaLenh({ 'st.theme': 'dark', 'Bad Key': 1, 'st.y': 'x'.repeat(2000) }).length === 1 && Object.keys(st.chiaLenh({ 'st.theme': 'dark', 'Bad Key': 1 })[0]).join() === 'st.theme' && st.chiaLenh({}).length === 0);
  const sau = st.boDaGui({ a: 1, b: 2, c: null }, { a: 1, b: 5, c: null });
  check('boDaGui: chỉ bỏ khoá chưa bị sửa lại trong lúc gửi (b đổi 2->5 trong lúc đó thì giữ)', JSON.stringify(sau) === JSON.stringify({ b: 2 }));
  const kp = st.lenhKhoiPhuc();
  check('lenhKhoiPhuc: null cho đúng 9 khoá st.*, không đụng kiểu xem ui.*', Object.keys(kp).length === 9 && Object.values(kp).every((v) => v === null) && Object.keys(kp).every((k) => k.startsWith('st.')));
  check('UI_LOCAL_TO_SERVER: chỉ 3 kiểu xem Bảng/Lưới (clients/products/reports)', JSON.stringify(Object.keys(st.UI_LOCAL_TO_SERVER).sort()) === JSON.stringify(['clients.view', 'products.view', 'reports.view']));

  console.log('\n4. Trang đầu + danh sách tab theo vai trò + Sale mặc định');
  const td = (landing, saved, role) => st.tabMoDau({ landing, saved, role, tabHopLe: nm.tabHopLe });
  check('auto = hành vi cũ: tab đã nhớ nếu hợp lệ, không thì mặc định vai trò', td('auto', 'sales-plan', 'admin') === 'sales-plan' && td('auto', 'sop', 'admin') === 'sales-plan' && td('auto', null, 'admin') === 'revenue-reports' && td('auto', null, 'sale') === 'sale-dashboard' && td('auto', null, 'creator') === 'ai-agent' && td('auto', null, 'account') === 'products' && td('auto', 'ai-agent', 'account') === 'products');
  check('chọn tab cụ thể: luôn mở tab đó, thắng tab đã nhớ', td('clients', 'sales-plan', 'sale') === 'clients' && td('dashboard', null, 'leader') === 'dashboard');
  check('vai trò không được vào tab đã chọn (kế toán chọn dashboard) -> rơi về mặc định vai trò, không lỗi', td('dashboard', null, 'account') === 'products' && td('sop', 'products', 'account') === 'products');
  check('landing rác/chưa có -> như auto', td('xyz', 'clients', 'sale') === 'clients' && td(undefined, null, 'sale') === 'sale-dashboard');
  check('tab Cài đặt: mọi vai trò (kể cả account) vào được, không nằm trong NAV/TAB_IDS', nm.tabHopLe('settings', 'account') === 'settings' && nm.tabHopLe('settings', 'sale') === 'settings' && !nm.TAB_IDS.includes('settings') && !nm.NAV.some((m) => m.id === 'settings' || (m.children || []).some((c) => c.id === 'settings')));
  const tcAcc = st.tabChoPhep('account', nm.NAV, nm.ACCOUNT_TAB_IDS).map((x) => x.id);
  const tcAdm = st.tabChoPhep('admin', nm.NAV, nm.ACCOUNT_TAB_IDS).map((x) => x.id);
  check('tab được chọn làm Trang đầu: kế toán đúng 3 mục; vai khác đủ mọi tab thật', JSON.stringify(tcAcc) === JSON.stringify(nm.ACCOUNT_TAB_IDS) && JSON.stringify(tcAdm) === JSON.stringify(nm.TAB_IDS));
  const ds = ['KH Luyến', 'KH Hải'];
  const cua = (u, ten) => u.saleId && ten.toLowerCase().includes(u.saleId.toLowerCase());
  check('saleMacDinh: all -> ALL; mine -> Sale của mình; không có mã Sale / không khớp -> ALL', st.saleMacDinh('all', ds, { saleId: 'Hải' }, cua) === 'ALL' && st.saleMacDinh('mine', ds, { saleId: 'Hải' }, cua) === 'KH Hải' && st.saleMacDinh('mine', ds, { saleId: '' }, cua) === 'ALL' && st.saleMacDinh('mine', ds, { saleId: 'Nam' }, cua) === 'ALL' && st.saleMacDinh('mine', [], { saleId: 'Hải' }, cua) === 'ALL');

  // ===========================================================================
  console.log('\n5. Lớp đồng bộ (services/prefsSync.js) với localStorage giả + máy chủ giả');
  const mem = new Map();
  global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
  const attrs = {};
  global.document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } } };
  const ui = await imp('utils/uiState.js');
  const ps = await imp('services/prefsSync.js');

  const may = (init, opts = {}) => {
    const db = { ...init };
    const calls = { get: 0, set: [] };
    return {
      db, calls,
      api: {
        async getMyPrefs() { calls.get++; if (opts.getLoi) throw new Error('relation "oem.user_prefs" does not exist'); return { prefs: { ...db } }; },
        async setMyPrefs(_t, ch) { calls.set.push(ch); if (opts.setLoi) throw new Error('Unknown function'); Object.keys(ch).forEach((k) => { if (ch[k] === null) delete db[k]; else db[k] = ch[k]; }); return { ok: true }; }
      }
    };
  };

  // 5a: máy chủ thắng, áp theme + cục bộ
  ui.setUiScope('Hải');
  ui.writeUi('st.toastSec', 10, true);
  let m = may({ 'st.theme': 'dark', 'st.density': 'compact', 'st.pageSize': 77 });
  let kq = await ps.attach({ token: 't1', api: m.api });
  check('attach: tải getMyPrefs đúng MỘT lần, ok', kq.ok === true && m.calls.get === 1);
  check('máy chủ thắng: st.theme/st.density về cục bộ, theme được ÁP (data-theme=dark), giá trị hỏng (pageSize 77) bị bỏ', ps.getSetting('st.theme') === 'dark' && attrs['data-theme'] === 'dark' && ps.getSetting('st.density') === 'compact' && ps.getSetting('st.pageSize') === 0);
  check('lần đầu: khoá chỉ có ở cục bộ (toastSec 10) được tải lên một lần', m.db['st.toastSec'] === 10 && m.calls.set.length === 1 && Object.keys(m.calls.set[0]).join() === 'st.toastSec');
  check('khoá cục bộ tách theo người dùng: oem_ui_v1:hải:st.theme', [...mem.keys()].some((k) => k === 'oem_ui_v1:hải:st.theme') && ps.getSetting('st.calcMargin') === 20);
  check('trạng thái đồng bộ = ok', ps.getTrangThai() === 'ok');

  // 5b: debounce, chỉ gửi khoá đổi
  m.calls.set.length = 0;
  ps.setSetting('st.toastSec', 3);
  ps.setSetting('st.toastSec', 6);
  ps.setSetting('st.calcMargin', 35);
  check('ghi cục bộ NGAY (chưa chờ mạng) + báo người nghe', ps.getSetting('st.toastSec') === 6 && ps.getSetting('st.calcMargin') === 35 && m.calls.set.length === 0);
  check('setSetting từ chối giá trị hỏng / khoá lạ, không đổi gì', ps.setSetting('st.toastSec', 5) === false && ps.setSetting('st.zzz', 1) === false && ps.setSetting('st.calcMargin', 99) === false && ps.getSetting('st.toastSec') === 6);
  await cho(900);
  check('debounce ~600ms: hai lần sửa toastSec + calcMargin gộp thành MỘT lệnh, chỉ chứa khoá đã đổi (không chứa theme/density)',
    m.calls.set.length === 1 && JSON.stringify(m.calls.set[0]) === JSON.stringify({ 'st.toastSec': 6, 'st.calcMargin': 35 }), m.calls.set);
  check('gửi xong thì pending sạch (không gửi lại)', Object.keys(ps._debug.pending()).length === 0 && !mem.has('oem_ui_v1:hải:st.pending'));

  // 5c: kiểu xem ui.* đi qua usePersistentState -> writeUi -> máy chủ; khoá khác không đi
  m.calls.set.length = 0;
  ui.writeUi('reports.view', 'grid');
  ui.writeUi('tx.year', '2025');
  await cho(900);
  check('kiểu xem Bảng/Lưới (reports.view) đồng bộ thành ui.reports.view; bộ lọc (tx.year) thì KHÔNG', m.calls.set.length === 1 && JSON.stringify(m.calls.set[0]) === JSON.stringify({ 'ui.reports.view': 'grid' }) && !('tx.year' in m.db));

  // 5d: khôi phục mặc định
  m.calls.set.length = 0;
  ps.resetSettings();
  check('khôi phục: cục bộ về mặc định ngay (toastSec 4, density thoáng, theme system -> bỏ data-theme)', ps.getSetting('st.toastSec') === 4 && ps.getSetting('st.density') === 'comfortable' && ps.getSetting('st.theme') === 'system' && !('data-theme' in attrs));
  await cho(100);
  check('khôi phục: gửi null cho đủ 9 khoá st.*, máy chủ xoá hết st.* (giữ ui.reports.view)', m.calls.set.length === 1 && Object.keys(m.calls.set[0]).length === 9 && Object.values(m.calls.set[0]).every((v) => v === null) && Object.keys(m.db).every((k) => !k.startsWith('st.')) && m.db['ui.reports.view'] === 'grid', [m.calls.set, m.db]);
  ps.detach();

  // 5e: máy chủ lỗi -> nuốt lỗi, dùng cục bộ, giữ pending, KHÔNG ném
  ui.setUiScope('Luyến');
  ui.writeUi('st.density', 'compact', true);
  m = may({}, { getLoi: true, setLoi: true });
  let nem = false;
  try { kq = await ps.attach({ token: 't2', api: m.api }); } catch { nem = true; }
  check('getMyPrefs lỗi (bảng chưa có): attach KHÔNG ném, trả ok=false, giá trị cục bộ vẫn dùng được', !nem && kq.ok === false && ps.getSetting('st.density') === 'compact' && ps.getTrangThai() === 'loi');
  nem = false;
  try { ps.setSetting('st.toastSec', 10); await cho(900); } catch { nem = true; }
  check('setMyPrefs lỗi: không ném, giá trị vẫn lưu cục bộ, pending được GIỮ (và ghi xuống localStorage để lần sau gửi lại)', !nem && ps.getSetting('st.toastSec') === 10 && ps._debug.pending()['st.toastSec'] === 10 && mem.has('oem_ui_v1:luyến:st.pending') && m.calls.set.length >= 1);
  ps.detach();

  // 5f: lần sau, máy chủ khoẻ lại -> gửi lại phần đang chờ, pending thắng máy chủ
  m = may({ 'st.toastSec': 3, 'st.theme': 'light' });
  kq = await ps.attach({ token: 't3', api: m.api });
  await cho(100);
  check('lần sau: pending (toastSec 10 sửa lúc máy chủ chết) THẮNG giá trị cũ của máy chủ và được gửi lại; theme của máy chủ vẫn về cục bộ',
    kq.ok && m.db['st.toastSec'] === 10 && ps.getSetting('st.toastSec') === 10 && ps.getSetting('st.theme') === 'light' && Object.keys(ps._debug.pending()).length === 0);
  check('lần này là lần đầu của người này (chưa seeded): density cục bộ chưa lên máy chủ thì được tải lên', m.db['st.density'] === 'compact');
  ps.detach();

  // 5g: đã seeded + máy chủ xoá ở máy khác -> xoá cục bộ
  m = may({});
  kq = await ps.attach({ token: 't4', api: m.api });
  check('đã đồng bộ trước đó mà máy chủ trống (khôi phục ở máy khác): cục bộ bị xoá, không tự sống lại', ps.getSetting('st.density') === 'comfortable' && ps.getSetting('st.toastSec') === 4 && Object.keys(m.db).length === 0 && m.calls.set.length === 0);
  ps.detach();

  // 5h: đổi người -> không lẫn
  ui.setUiScope('Hải');
  m = may({});
  await ps.attach({ token: 't5', api: m.api });
  check('đổi người dùng: cài đặt của người này không lẫn người kia (Hải đã khôi phục -> mặc định)', ps.getSetting('st.density') === 'comfortable');
  ps.detach();
  check('detach: không còn gắn phiên', ps._debug.attached() === false);
  delete global.localStorage; delete global.document;

  // ===========================================================================
  console.log('\n6. Nối vào giao diện (soát mã nguồn)');
  const app = SRC('App.jsx'), nav = SRC('components/Navbar.jsx'), stg = SRC('components/Settings.jsx'), css = SRC('index.css');
  check('App: tải Settings bằng React.lazy + KeepAliveTab, route "settings" KHÔNG nằm trong NAV; Navbar có nút Cài đặt gọi requestTab', /lazy\(\(\) => import\('\.\/components\/Settings'\)\)/.test(app) && /isActive=\{activeTab === TAB_SETTINGS\}/.test(app) && /onOpenSettings=\{\(\) => requestTab\(TAB_SETTINGS\)\}/.test(app) && /onOpenSettings/.test(nav) && /Cài đặt/.test(nav));
  check('App: attach sau bootstrap (hasLoadedOnce), detach khi đổi phiên, flush khi đăng xuất', /prefs\.attach\(\{ token: session\.token, api \}\)/.test(app) && /prefs\.detach\(\); sysvals\.detach\(\)/.test(app) && /prefs\.flushNow\(\)/.test(app) && /hasLoadedOnce\]\);/.test(app));
  check('App: trang Settings không được nhớ làm tab cuối (F5 về tab làm việc); Trang đầu áp ở khởi tạo + khi đăng nhập + khi bản máy chủ về muộn', /if \(id !== TAB_SETTINGS && id !== TAB_SYSTEM\) writeUi\('tab', id\)/.test(app) && (app.match(/tabMoDau\(/g) || []).length >= 3 && /navigatedRef/.test(app));
  check('App: menu thu gọn mặc định theo st.sidebarCollapsed; mật độ gắn qua useApplyDensity', /useSetting\('st\.sidebarCollapsed'\)/.test(app) && /useApplyDensity\(/.test(app));
  check('CSS: class density-compact thu hẹp đệm bảng (th/td) và dòng tổng dính', /\.density-compact \.custom-table th \{ padding/.test(css) && /\.density-compact \.custom-table td \{ padding/.test(css) && /\.density-compact \.top-summary-row td \{ top:/.test(css));
  check('Settings: đủ 4 mục Giao diện / Khi mở app / Công cụ / Bảo mật + nút Khôi phục mặc định (có hộp xác nhận) + Đổi PIN', ['Giao diện', 'Khi mở app', 'Công cụ', 'Bảo mật', 'Khôi phục mặc định', 'Đổi PIN'].every((t) => stg.includes(t)) && /<ConfirmDialog/.test(stg) && /resetSettings\(\)/.test(stg));
  check('Settings: kế toán không thấy mục báo cáo (không có màn đó); Trang đầu chỉ liệt kê tab vai trò được vào', /coBaoCao/.test(stg) && /tabChoPhep\(role, NAV, ACCOUNT_TAB_IDS\)/.test(stg));
  check('Settings: ô Biên lợi nhuận máy tính giá chỉ hiện cho Admin/Creator (tab Tính Giá chỉ có với hai vai trò đó)', /coMayTinhGia = \['admin', 'creator'\]\.includes\(role\)/.test(stg) && /\{coMayTinhGia && \(/.test(stg) && /canCalculate = \['admin', 'creator'\]/.test(SRC('components/ProductPricing.jsx')));
  const pageFiles = ['components/ClientManagement.jsx', 'components/debt/DebtViewPanel.jsx', 'components/pricing/PriceProposePanel.jsx', 'components/ProductManagement.jsx', 'components/reports/DtNgayReport.jsx', 'components/salesplan/SalesPlanProposePanel.jsx', 'components/salesplan/SalesPlanViewPanel.jsx', 'components/sop/SopPlanPanel.jsx', 'components/sop/SopViewPanel.jsx'];
  check('cỡ trang mặc định: 9 màn phân trang đều qua useDefaultPageSize (giữ mặc định riêng: 25, DT Ngày 50)', pageFiles.every((f) => /const PAGE_SIZE = useDefaultPageSize\(PAGE_SIZE_MAC_DINH\);/.test(SRC(f)) && !/^const PAGE_SIZE = \d+;/m.test(SRC(f))) && /PAGE_SIZE_MAC_DINH = 50/.test(SRC('components/reports/DtNgayReport.jsx')) && pageFiles.filter((f) => /PAGE_SIZE_MAC_DINH = 25/.test(SRC(f))).length === 8);
  check('Lịch sử doanh thu: cỡ trang đã tự chọn thắng; chưa chọn theo cài đặt; đổi cài đặt thì bỏ lựa chọn cũ', /usePersistentState\('tx\.pageSize', null/.test(SRC('components/TransactionGrid.jsx')) && /useOnSettingChange\('st\.pageSize'/.test(SRC('components/TransactionGrid.jsx')));
  const calc = SRC('components/pricing/PriceCalculatorPanel.jsx');
  // 14/10/2026: panel đọc qua useCalcMargin (hooks/useSystemValue.js) = st.calcMargin nếu đã chọn, không thì mặc định HỆ THỐNG; chi tiết ở test/cai-dat-he-thong.test.cjs.
  check('Máy tính giá: % LNG điền sẵn từ st.calcMargin (qua useCalcMargin; chưa chọn thì mặc định hệ thống; không còn cứng "20")', /useCalcMargin\(\)/.test(calc) && /useSetting\('st\.calcMargin'\)/.test(SRC('hooks/useSystemValue.js')) && !/useState\('20'\)/.test(calc));
  const toast = SRC('components/ToastProvider.jsx');
  check('Toast: toast thường lấy thời gian từ st.toastSec, toast lỗi vẫn không tự tắt, { ms } truyền vào vẫn thắng', /getSetting\('st\.toastSec'\)/.test(toast) && /bien === 'error' \? undefined/.test(toast) && /opts\.ms != null \? opts\.ms/.test(toast));
  const rp = SRC('components/RevenueReports.jsx');
  check('Báo cáo: năm/Sale mặc định theo cài đặt chỉ khi CHƯA chọn (bộ lọc đã nhớ vẫn thắng), 3 báo cáo đều nhận', /useReportDefaults\(activeUser, salesList\)/.test(rp) && (rp.match(/macDinhNam=\{macDinh\.nam\}/g) || []).length === 3 && (rp.match(/macDinhSale=\{macDinh\.sale\}/g) || []).length === 2
    && /\|\| macDinhNam \|\| null/.test(SRC('components/reports/DtThangReport.jsx')) && /saleRaw == null \? macDinhSale : saleRaw/.test(SRC('components/reports/DtNgayReport.jsx')));
  const api = SRC('services/api.js');
  check('api.js: getMyPrefs(token) / setMyPrefs(token, changes) gọi cùng kiểu callApi, hạn giờ ngắn; setMyPrefs không nằm trong NON_IDEMPOTENT_FNS', /callApi\('getMyPrefs', \[token\], 15000\)/.test(api) && /callApi\('setMyPrefs', \[token, changes\], 15000\)/.test(api) && !/NON_IDEMPOTENT_FNS = new Set\(\[[^\]]*MyPrefs/.test(api));
  const ps2 = SRC('services/prefsSync.js');
  const ps2code = ps2.split(String.fromCharCode(10)).filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join(String.fromCharCode(10));
  check('prefsSync không toast/alert/hộp thoại: mọi lỗi mạng bị nuốt (không chặn người dùng)', !/toast|alert\(|confirm\(/.test(ps2code));
  const harness = SRC('dev/uiHarness.jsx');
  check('UI harness có máy chủ giả getMyPrefs/setMyPrefs (&noprefs=1 giả bảng chưa có) + &sso=1', /case 'getMyPrefs'/.test(harness) && /case 'setMyPrefs'/.test(harness) && /noprefs/.test(harness) && /sso/.test(harness));

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
