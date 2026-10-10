/**
 * dot4-toc-do.test.cjs — Đợt 4 (10/10/2026): tốc độ (OEM).
 *
 *   node test/dot4-toc-do.test.cjs
 *
 * Logic thuần (txYears, period.resolvePeriod, priceDraft, errorText) gọi thẳng; api.js được esbuild gói rồi chạy với fetch giả
 * để soát ĐÚNG những gì client gửi lên (tham số opt-in). Phần React bên trong màn lớn soát bằng mã nguồn để chặn hồi quy; hành
 * vi thật (chọn năm cũ -> "Đang tải" -> số đúng; lỗi + Thử lại; server cũ; Sửa & gửi lại) đã thử trên trình duyệt qua
 * /ui-harness.html (&slowyear=1 &failyear=1 &legacy=1).
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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  // ===========================================================================
  console.log('\n1. utils/txYears: chia năm, gộp, khử trùng, trạng thái tải');
  const ty = await imp('utils/txYears.js');
  check('chuanNam: nhận số + chuỗi, bỏ rác và trùng', eq(ty.chuanNam([2024, '2024', ' 2023 ', 'abc', '', null, 99999, '2022']), ['2024', '2023', '2022']));
  check('namCanTai: chỉ năm CŨ có dữ liệu trên server (năm gần đây / không có dữ liệu thì không phải tải)',
    eq(ty.namCanTai(['2026', '2025', '2024', '1999'], [2024, 2023]), ['2024']));
  check('namCanTai: "ALL" = mọi năm cũ (không thêm gì khi không có năm cũ)', eq(ty.namCanTai(['ALL'], [2024, '2023']), ['2024', '2023']) && eq(ty.namCanTai(['ALL'], []), []) && eq(ty.namCanTai(['ALL'], undefined), []));
  check('namCanTai: server cũ (không có olderYears) -> không bao giờ có gì để tải', eq(ty.namCanTai(['2024', 'ALL'], undefined), []));
  const rec = [{ id: 'r1' }, { id: 'r2' }];
  check('gopGiaoDich: năm cũ trước (tăng dần) rồi tới phần gần đây; chưa tải gì thì trả NGUYÊN mảng gần đây',
    eq(ty.gopGiaoDich(rec, { 2024: [{ id: 'a' }], 2023: [{ id: 'b' }] }).map((t) => t.id), ['b', 'a', 'r1', 'r2']) && ty.gopGiaoDich(rec, {}) === rec && ty.gopGiaoDich(rec, undefined) === rec);
  check('boNamDaTrongGanDay: qua năm mới thì năm từng là "cũ" mà nay nằm trong phần gần đây bị bỏ (tránh nhân đôi tổng)',
    eq(Object.keys(ty.boNamDaTrongGanDay({ 2024: [1], 2025: [2] }, 2025)), ['2024']) && eq(Object.keys(ty.boNamDaTrongGanDay({ 2024: [1] }, 2025)), ['2024']));
  check('boNamDaTrongGanDay: không biết mốc cắt thì giữ nguyên', eq(ty.boNamDaTrongGanDay({ 2024: [1] }, undefined), { 2024: [1] }) && eq(ty.boNamDaTrongGanDay({ 2024: [1] }, null), { 2024: [1] }));
  check('namCuaCacThang: năm của danh sách tháng "T09-2026" (cả T9-2026), bỏ rác', eq(ty.namCuaCacThang(['T09-2026', 'T10-2026', 'T9-2024', 'xx', '', null]), ['2026', '2024']));
  let st = ty.trangThaiNam(['2024'], [], null, {});
  check('trangThaiNam: chưa có + chưa lỗi = đang tải', st.dangTai === true && st.loi === '' && eq(st.namThieu, ['2024']));
  st = ty.trangThaiNam(['2024'], ['2024'], null, {});
  check('trangThaiNam: đã có = xong (không đang tải, không lỗi)', st.dangTai === false && st.loi === '' && st.namThieu.length === 0);
  st = ty.trangThaiNam(['2024', '2023'], ['2024'], null, { 2023: 'Mạng lỗi' });
  check('trangThaiNam: một năm lỗi -> hiện lỗi (KHÔNG đang tải) để có nút Thử lại; năm đã có không bị tính là thiếu', st.dangTai === false && st.loi === 'Mạng lỗi' && eq(st.namThieu, ['2023']));
  check('trangThaiNam: không cần tải năm nào -> xong ngay', ty.trangThaiNam([], [], null, {}).dangTai === false);

  // ===========================================================================
  console.log('\n2. period.resolvePeriod: năm cũ chưa tải vẫn chọn được');
  const pe = await imp('utils/period.js');
  const tx = [{ month: 'T10-2026' }, { month: 'T09-2026' }, { month: 'T12-2025' }];
  let rp = pe.resolvePeriod(tx, null, null);
  check('không extraYears: như cũ (năm có trong dữ liệu, mới nhất trước)', eq(rp.years, ['2026', '2025']) && rp.year === '2026' && rp.month === 'T10-2026');
  rp = pe.resolvePeriod(tx, '2024', null, [2024, 2023]);
  check('extraYears: danh sách năm có thêm năm cũ (sắp giảm dần); chọn năm cũ -> năm hiệu lực là năm đó, CHƯA có tháng nên "cả năm" (chờ tải)',
    eq(rp.years, ['2026', '2025', '2024', '2023']) && rp.year === '2024' && rp.months.length === 0 && rp.month === 'ALL', rp);
  rp = pe.resolvePeriod(tx.concat([{ month: 'T05-2024' }, { month: 'T03-2024' }]), '2024', null, [2024]);
  check('sau khi tải năm cũ: tháng của năm đó hiện ra, mặc định tháng mới nhất; năm không bị nhân đôi trong danh sách', eq(rp.years, ['2026', '2025', '2024']) && rp.month === 'T05-2024' && eq(rp.months, ['T05-2024', 'T03-2024']));
  rp = pe.resolvePeriod(tx, '2019', null, [2024]);
  check('năm không còn trong dữ liệu lẫn danh sách năm cũ -> rơi về năm mới nhất', rp.year === '2026');
  check('extraYears rác bị bỏ', eq(pe.resolvePeriod(tx, null, null, ['abc', 12, null]).years, ['2026', '2025']));

  // ===========================================================================
  console.log('\n3. priceDraft.napLaiTuDotBiTuChoi (Sửa & gửi lại)');
  const pd = await imp('utils/priceDraft.js');
  const mats = [{ sku: 'A' }, { sku: 'B' }];
  let nl = pd.napLaiTuDotBiTuChoi({ rows: [{ sku: 'A', clientCode: '', retail: 100, promoQty: 2, promoPrice: 90 }, { sku: 'B', clientCode: '', retail: 50, promoQty: 0, promoPrice: 0 }] }, mats);
  check('nạp đủ dòng thành bản nháp đúng dạng draftMap; giá chung -> clientCode rỗng', nl.soMa === 2 && nl.clientCode === '' && eq(nl.draft.A, { retail: 100, promoQty: 2, promoPrice: 90 }) && nl.draft.B.promoQty === '' && nl.thieu.length === 0, nl);
  nl = pd.napLaiTuDotBiTuChoi({ rows: [{ sku: 'A', clientCode: 'TECOM', retail: 7 }, { sku: 'GONE', clientCode: 'TECOM', retail: 1 }] }, mats);
  check('đề xuất RIÊNG khách: lấy đúng mã khách; SKU không còn trong danh mục bị bỏ và được nêu', nl.clientCode === 'TECOM' && nl.soMa === 1 && eq(nl.thieu, ['GONE']));
  check('đợt rỗng / không có batch -> không nạp gì, không ném lỗi', pd.napLaiTuDotBiTuChoi({ rows: [] }, mats).soMa === 0 && pd.napLaiTuDotBiTuChoi(null, mats).soMa === 0 && pd.napLaiTuDotBiTuChoi({ rows: [{ sku: 'A' }] }, null).soMa === 0);
  check('draft nạp lại đi qua dongDeXuat như bản nháp thường (Giá lẻ > 0 mới gửi được)', pd.dongDeXuat(mats, pd.napLaiTuDotBiTuChoi({ rows: [{ sku: 'A', retail: 5 }, { sku: 'B', retail: 0, promoQty: 3 }] }, mats).draft).map((m) => m.sku).join() === 'A');

  // ===========================================================================
  console.log('\n4. errorText: mã tham chiếu do MÁY CHỦ sinh được giữ nguyên');
  const et = await imp('utils/errorText.js');
  const tu = 'Hệ thống gặp lỗi bất ngờ nên chưa hoàn tất được thao tác. Anh/chị thử lại; nếu vẫn lỗi, báo quản trị kèm mã tham chiếu. (Mã tham chiếu: E-3F9A)';
  check('lamSachLoi giữ nguyên câu có mã của máy chủ (không băm lại, không thêm mã thứ hai)', et.lamSachLoi(tu) === tu && et.lamSachLoi(new Error(tu)) === tu && (et.lamSachLoi(tu).match(/Mã tham chiếu/g) || []).length === 1);
  check('lỗi thô tự sinh mã băm như cũ (client cũ / lỗi mạng)', /\(Mã tham chiếu: E-[0-9A-F]{4}\)$/.test(et.lamSachLoi('relation "oem.orders" does not exist')));
  check('câu nghiệp vụ tiếng Việt của máy chủ (vd mới viết cho addMaterial) không bị đụng', et.lamSachLoi('Mã SKU ABC đã có trong danh mục sản phẩm — dùng nút "Sửa" của sản phẩm đó để cập nhật.') === 'Mã SKU ABC đã có trong danh mục sản phẩm — dùng nút "Sửa" của sản phẩm đó để cập nhật.');

  // ===========================================================================
  console.log('\n5. api.js: tham số opt-in gửi đúng, client cũ/server cũ không gãy');
  const E = require('esbuild');
  const out = E.buildSync({
    entryPoints: [path.join(ROOT, 'src', 'services', 'api.js')], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
    define: { 'import.meta.env': '{}' }
  });
  const tmp = path.join(os.tmpdir(), 'oem-dot4-api-' + process.pid + '.cjs');
  fs.writeFileSync(tmp, out.outputFiles[0].text);
  const sent = [];
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  global.window = global;
  global.fetch = async (url, opts) => { const b = JSON.parse(opts.body); sent.push(b); return { ok: true, json: async () => ({ result: { ok: true, fn: b.fn } }) }; };
  const api = require(tmp);
  fs.unlinkSync(tmp);
  await api.getBootstrap('tok', false);
  await api.getBootstrap('tok', true);
  await api.getBootstrap('tok', false, { recent: true });
  await api.getBootstrap('tok', undefined, { parts: ['plans'] });
  await api.getBootstrap('tok', false, 'khong-phai-object');
  await api.getTransactionsByYear('tok', 2024);
  await api.getMyRejectedPriceProposals('tok');
  check('getBootstrap không opts: ĐÚNG như trước ([token, forceRefresh]) — client/server cũ không thấy gì khác', eq(sent[0].args, ['tok', false]) && eq(sent[1].args, ['tok', true]));
  check('getBootstrap({recent:true}) và ({parts}) gửi opts làm tham số thứ 3', eq(sent[2].args, ['tok', false, { recent: true }]) && eq(sent[3].args, ['tok', false, { parts: ['plans'] }]));
  check('opts không phải object bị bỏ (không gửi rác lên máy chủ)', eq(sent[4].args, ['tok', false]));
  check('getTransactionsByYear / getMyRejectedPriceProposals gọi đúng tên hàm + tham số', sent[5].fn === 'getTransactionsByYear' && eq(sent[5].args, ['tok', 2024]) && sent[6].fn === 'getMyRejectedPriceProposals' && eq(sent[6].args, ['tok']));
  const khoiKhongLap = (/const NON_IDEMPOTENT_FNS = new Set\(\[([\s\S]*?)\]\);/.exec(SRC('services/api.js')) || [])[1] || '';
  check('hàm ĐỌC mới KHÔNG nằm trong NON_IDEMPOTENT_FNS (mạng chập thì tự thử lại được)', khoiKhongLap.length > 20 && !/getTransactionsByYear|getMyRejectedPriceProposals|getBootstrap/.test(khoiKhongLap));

  // ===========================================================================
  console.log('\n6. Soát mã nguồn: App + các màn dùng giao dịch');
  const app = SRC('App.jsx');
  check('App xin getBootstrap({recent:true}) khi mở app / Đồng bộ', /api\.getBootstrap\(session\.token, forceRefresh === true, \{ recent: true \}\)/.test(app));
  check('App giữ năm cũ ở olderTx + ensureYears/retryYears ổn định (useCallback) + gộp bằng gopGiaoDich', /const ensureYears = useCallback/.test(app) && /const retryYears = useCallback/.test(app) && /gopGiaoDich\(transactions, olderTx\)/.test(app) && /getTransactionsByYear\(tokenRef\.current, y\)/.test(app));
  check('App: nhận bootstrap mới chỉ giữ các năm cũ server VẪN coi là cũ (tránh nhân đôi khi qua năm / server trả đủ)', /olderTxRef\.current\)\.forEach\(\(k\) => \{ if \(od\.includes\(k\)\) giu\[k\] = olderTxRef\.current\[k\]; \}\)/.test(app));
  check('App: Đồng bộ (forceRefresh) tải lại các năm cũ đã tải; đăng xuất / đổi người xoá năm cũ', /forceRefresh === true && daTai\.length/.test(app) && /olderTxRef\.current = \{\};\s*\n\s*olderYearsRef\.current = \[\];/.test(app) && /Đổi người \/ phiên/.test(app));
  check('App: số đếm Lịch sử doanh thu = tổng do server báo (txTotal), không phải số dòng đang giữ', /transactionCount=\{txTotal != null \? txTotal : allTransactions\.length\}/.test(app));
  check('App: mọi màn dùng giao dịch nhận allTransactions (đã gộp năm cũ) + txYears (Báo cáo, Dashboard, Lịch sử, Kế hoạch KD)',
    /<RevenueReports\s*\n\s*transactions=\{allTransactions\}\s*\n\s*txYears=\{txYears\}/.test(app) && /<Dashboard\s*\n\s*transactions=\{allTransactions\}\s*\n\s*txYears=\{txYears\}/.test(app) &&
    /<TransactionGrid\s*\n\s*transactions=\{allTransactions\}\s*\n\s*txYears=\{txYears\}/.test(app) && /<SalesPlan[\s\S]{0,300}transactions=\{allTransactions\}\s*\n\s*txYears=\{txYears\}/.test(app) && !/transactions=\{transactions\}/.test(app));
  check('App: sửa một chỗ -> lamMoiKhoi(parts) làm mới đúng khối, rơi về tải đủ khi lỗi; Kế hoạch KD/Sản phẩm dùng nó', /const lamMoiKhoi = async \(parts\)/.test(app) && /api\.getBootstrap\(session\.token, false, \{ parts \}\)/.test(app) && (app.match(/onDataChanged=\{lamMoiKhoi\}/g) || []).length === 2 && !/onDataChanged=\{fetchAllData\}/.test(app));
  const cache = SRC('services/dataCache.js');
  check('dataCache: SCHEMA_VERSION = 2 (transactions đổi nghĩa: chỉ năm nay + năm trước)', /const SCHEMA_VERSION = 2;/.test(cache));
  const ap = (f) => SRC('components/' + f);
  check('3 báo cáo doanh thu + Lịch sử + Dashboard + Kế hoạch KD dùng useEnsureYears và TableState loading/error/onRetry (không hiện số khi thiếu năm)',
    ['reports/DtSaleReport.jsx', 'reports/DtNgayReport.jsx', 'reports/DtThangReport.jsx', 'TransactionGrid.jsx', 'Dashboard.jsx', 'SalesPlan.jsx'].every((f) => {
      const s = ap(f); return /useEnsureYears\(txYears,/.test(s) && /carga\.dangTai/.test(s) && /carga\.loi/.test(s) && /carga\.retry/.test(s);
    }));
  check('DT Tháng đòi cả NĂM TRƯỚC (so sánh) chứ không chỉ năm đang xem', /useEnsureYears\(txYears, \[effectiveYear, prevYear\]\)/.test(ap('reports/DtThangReport.jsx')));
  check('Dashboard: "Tất cả năm" đòi mọi năm cũ (truyền yearFilter, có thể là ALL), ẩn KPI khi chưa đủ', /useEnsureYears\(txYears, \[yearFilter\]\)/.test(ap('Dashboard.jsx')) && /chuaDu \? \(/.test(ap('Dashboard.jsx')));
  check('Lịch sử doanh thu: tổng / số bản ghi / phân trang / xuất Excel đều chờ dữ liệu đủ', /chuaDu \? '…' : totals\.qty/.test(ap('TransactionGrid.jsx')) && /disabled=\{exporting \|\| chuaDu/.test(ap('TransactionGrid.jsx')) && /\{!chuaDu && \(\s*\n\s*<Pagination/.test(ap('TransactionGrid.jsx')));
  check('Kế hoạch KD: đòi các năm của tháng kế hoạch (Done tính từ giao dịch); gửi/duyệt kế hoạch chỉ làm mới plans',
    /namCuaCacThang\(\(plans \|\| \[\]\)\.map/.test(ap('SalesPlan.jsx')) && (ap('SalesPlan.jsx').match(/onDataChanged\(\['plans'\]\)/g) || []).length === 2);
  const pp = ap('ProductPricing.jsx');
  check('Sản phẩm & Bảng giá: duyệt giá chỉ làm mới materials; lưu bộ sản phẩm chỉ làm mới kits', /onDataChanged\(\['materials'\]\)/.test(pp) && /onDataChanged\(\['kits'\]\)/.test(pp));
  const hk = SRC('hooks/useEnsureYears.js');
  check('useEnsureYears: effect chỉ chạy khi tập năm cần tải đổi (ck) — không lặp vô hạn', /\[ck, ensure\]/.test(hk));
  const rjp = ap('pricing/RejectedProposals.jsx');
  check('RejectedProposals: gọi getMyRejectedPriceProposals, hiện lý do / ngày / người từ chối, nút "Sửa & gửi lại", server cũ thì im lặng',
    /api\.getMyRejectedPriceProposals\(token\)/.test(rjp) && /b\.note \?/.test(rjp) && /Không ghi lý do/.test(rjp) && /Sửa &amp; gửi lại/.test(rjp) && /Unknown function/.test(rjp) && /b\.rejectedAt/.test(rjp));
  const pr = ap('pricing/PriceProposePanel.jsx');
  check('PriceProposePanel: nạp lại đợt bị từ chối (hỏi trước khi thay nháp đang có; chặn khi khách không còn trong danh bạ)', /<RejectedProposals/.test(pr) && /requestResubmit/.test(pr) && /pendingResubmit/.test(pr) && /không còn trong danh bạ/.test(pr));
  check('Harness dev: máy chủ giả có năm cũ, getTransactionsByYear, đợt bị từ chối, &legacy &failyear &slowyear; gom lỗi console',
    /getTransactionsByYear/.test(SRC('dev/uiHarness.jsx')) && /legacy/.test(SRC('dev/uiHarness.jsx')) && /__consoleErrors/.test(SRC('dev/uiHarness.jsx')));

  console.log('\n' + '='.repeat(52));
  console.log(pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})();
