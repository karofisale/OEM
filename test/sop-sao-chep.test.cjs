/**
 * sop-sao-chep.test.cjs — Kế hoạch SOP, "Lập Kế Hoạch": các tháng đã lập trước đây + sao chép tháng (02/11/2026).
 *
 *   node test/sop-sao-chep.test.cjs
 *
 * Ca gốc: quên lập một kỳ -> kỳ sau carry-forward không trùng tháng nào của kỳ đã duyệt cũ -> kế hoạch TRỐNG dù từng lập nhiều tháng.
 * Giờ: dựng bảng "các tháng đã lập" từ MỌI kỳ của Sale (đã duyệt + chờ duyệt, kỳ lập sau ghi đè ở cùng tháng) và cho sao chép
 * số của tháng X sang các tháng TIẾP THEO của kế hoạch đang soạn (chỉ client, chưa gửi gì lên máy chủ).
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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const sp = await imp('utils/sopPlan.js');

  console.log('1. Tháng (congThang / nhanThang / chiSoTrongKy / viTriDichHopLe)');
  check('congThang: qua năm, lùi, 0, đầu vào sai', sp.congThang('2026-11', 2) === '2027-01' && sp.congThang('2026-01', -1) === '2025-12' && sp.congThang('2026-05', 0) === '2026-05' && sp.congThang('x', 1) === '' && sp.congThang('2026-13', 1) === '');
  check('nhanThang: T09-2026; đầu vào lạ giữ nguyên', sp.nhanThang('2026-09') === 'T09-2026' && sp.nhanThang('2027-1') === 'T01-2027' && sp.nhanThang('abc') === 'abc');
  check('chiSoTrongKy: trong/ngoài cửa sổ 4 tháng', sp.chiSoTrongKy('2026-12', '2026-12') === 0 && sp.chiSoTrongKy('2027-03', '2026-12') === 3 && sp.chiSoTrongKy('2027-04', '2026-12') === -1 && sp.chiSoTrongKy('2026-11', '2026-12') === -1);
  check('viTriDichHopLe: nguồn trước kỳ -> cả 4; nguồn trong kỳ -> các tháng SAU; nguồn cuối/sau kỳ -> rỗng',
    eq(sp.viTriDichHopLe('2026-09', '2026-12'), [0, 1, 2, 3]) && eq(sp.viTriDichHopLe('2026-12', '2026-12'), [1, 2, 3]) && eq(sp.viTriDichHopLe('2027-02', '2026-12'), [3]) && eq(sp.viTriDichHopLe('2027-03', '2026-12'), []) && eq(sp.viTriDichHopLe('2028-01', '2026-12'), []) && eq(sp.viTriDichHopLe('x', '2026-12'), []));

  console.log('2. luoiLichSu: gộp mọi kỳ, kỳ lập sau thắng');
  const rows = [
    { period: '2026-06', sku: 'A', sl: [10, 20, 30, 40], status: 'Đã duyệt' },   // T06..T09
    { period: '2026-06', sku: 'B', sl: [5, 0, 0, 0], status: 'Đã duyệt' },
    { period: '2026-08', sku: 'A', sl: [200, 210, 0, 230], status: 'Chờ duyệt' },  // T08..T11 ghi đè T08, T09 của A
    { period: '2026-10', sku: 'A', sl: [999, 999, 999, 999], status: 'Chờ duyệt' }, // kỳ đang soạn -> bỏ qua
    { period: 'rác', sku: 'Z', sl: [1, 1, 1, 1], status: 'Đã duyệt' },
    { sku: 'Y', sl: [1, 1, 1, 1] }
  ];
  const ls = sp.luoiLichSu(rows, '2026-10');
  check('T06/T07 của A giữ số kỳ 06 (đã duyệt); T08/T09 bị kỳ 08 (chờ duyệt) ghi đè; T10/T11 chỉ có ở kỳ 08',
    ls.grid.A['2026-06'].v === 10 && ls.grid.A['2026-07'].v === 20 && ls.grid.A['2026-08'].v === 200 && ls.grid.A['2026-09'].v === 210 && ls.grid.A['2026-10'].v === 0 && ls.grid.A['2026-11'].v === 230, ls.grid.A);
  check('trạng thái theo kỳ thắng: T07 đã duyệt, T08 chờ duyệt', ls.grid.A['2026-07'].status === 'duyet' && ls.grid.A['2026-08'].status === 'cho');
  check('kỳ đang soạn (2026-10) và dòng hỏng (kỳ rác / thiếu kỳ) bị bỏ qua', !('Z' in ls.grid) && !('Y' in ls.grid) && ls.grid.A['2026-10'].period === '2026-08');
  check('thang: chỉ đếm ô SL > 0; T10 (A=0) không tính; T08: A=200 (chờ) + B=0 -> 1 mã',
    ls.thang['2026-08'].soMa === 1 && ls.thang['2026-08'].tongSL === 200 && !('2026-10' in ls.thang) && ls.thang['2026-06'].soMa === 2 && ls.thang['2026-06'].tongSL === 15, ls.thang);
  check('status của tháng: chỉ "duyet" khi mọi ô có SL của tháng đó đã duyệt', ls.thang['2026-06'].status === 'duyet' && ls.thang['2026-08'].status === 'cho');
  check('rỗng/undefined không làm vỡ', eq(sp.luoiLichSu([], 'x'), { grid: {}, thang: {} }) && eq(sp.luoiLichSu(undefined), { grid: {}, thang: {} }));

  console.log('3. thangNguon / giaTriThang');
  const anchor = '2026-12';
  const lichSu = sp.luoiLichSu([
    { period: '2026-08', sku: 'A', sl: [10, 20, 30, 40], status: 'Đã duyệt' },   // T08..T11
    { period: '2026-08', sku: 'B', sl: [1, 2, 3, 4], status: 'Đã duyệt' },
    { period: '2026-10', sku: 'A', sl: [0, 0, 7, 8], status: 'Chờ duyệt' }        // T10..T01: T12=7, T01=8
  ], anchor);
  const inPlan0 = [];
  const tn = sp.thangNguon(anchor, {}, inPlan0, lichSu);
  check('nguồn gồm các tháng lịch sử có số (mới nhất trước); tháng 12 và 01 của kỳ 10 cũng có mặt (nằm trong cửa sổ mới)', eq(tn.map((t) => t.ym), ['2027-01', '2026-12', '2026-11', '2026-10', '2026-09', '2026-08']), tn.map((t) => t.ym));
  const gt = sp.giaTriThang('2026-09', anchor, {}, [], lichSu);
  check('tháng ngoài kỳ lấy từ lịch sử: T09 (ô thứ 2 của kỳ 08) -> A=20, B=2', eq(gt.skus, { A: 20, B: 2 }) && gt.nguon === 'lichSu', gt);
  const draft = { A: [50, 0, 0, 0], C: [0, 9, 0, 0] };
  const gt2 = sp.giaTriThang('2026-12', anchor, draft, ['A', 'C'], lichSu);
  check('tháng TRONG kỳ có số đang soạn -> lấy bản đang soạn (không phải lịch sử)', eq(gt2.skus, { A: 50 }) && gt2.nguon === 'dangSoan', gt2);
  const gt3 = sp.giaTriThang('2026-12', anchor, {}, [], lichSu);
  check('tháng trong kỳ mà bản đang soạn trống -> lấy bản đã lập trước đây', eq(gt3.skus, { A: 7 }) && gt3.nguon === 'lichSu', gt3);
  const tn2 = sp.thangNguon(anchor, draft, ['A', 'C'], lichSu);
  check('tháng đang soạn có số hiện là "dangSoan" và THAY dòng lịch sử cùng tháng (2027-01: soạn C=9, lịch sử A=8 bị che)', tn2.find((t) => t.ym === '2026-12').nguon === 'dangSoan' && tn2.find((t) => t.ym === '2027-01').nguon === 'dangSoan' && tn2.find((t) => t.ym === '2027-01').soMa === 1 && tn2.find((t) => t.ym === '2027-01').tongSL === 9, tn2);

  console.log('4. saoChepThang');
  const nguon = { A: 30, B: 3, Z: 0 };
  let kq = sp.saoChepThang([], {}, nguon, [0, 1], true);
  check('kế hoạch trống: thêm mã mới, điền mọi tháng đích; mã SL 0 ở nguồn không vào', eq(kq.inPlan, ['A', 'B']) && eq(kq.draftMap, { A: [30, 30, 0, 0], B: [3, 3, 0, 0] }) && kq.maMoi === 2 && kq.oDien === 4 && kq.oGiu === 0 && kq.tongMa === 2, kq);
  const goc = { A: [5, 0, 0, 0], C: [1, 1, 1, 1] };
  kq = sp.saoChepThang(['A', 'C'], goc, nguon, [0, 1, 2], true);
  check('chỉ điền ô trống: ô A[0]=5 được giữ (oGiu=1), A[1], A[2] điền; B thêm mới; C không đụng', eq(kq.draftMap.A, [5, 30, 30, 0]) && eq(kq.draftMap.B, [3, 3, 3, 0]) && eq(kq.draftMap.C, [1, 1, 1, 1]) && kq.oGiu === 1 && kq.maMoi === 1 && eq(kq.inPlan, ['A', 'C', 'B']), kq);
  kq = sp.saoChepThang(['A', 'C'], goc, nguon, [0], false);
  check('ghi đè: A[0] 5 -> 30', kq.draftMap.A[0] === 30 && kq.oGiu === 0);
  check('không đổi bản gốc (bất biến): draftMap/inPlan cũ nguyên vẹn', eq(goc, { A: [5, 0, 0, 0], C: [1, 1, 1, 1] }));
  kq = sp.saoChepThang(['A'], { A: [30, 0, 0, 0] }, { A: 30 }, [0], false);
  check('ô đã đúng số nguồn -> không tính là đổi; không ô nào đổi thì trả đúng tham chiếu cũ', kq.oDien === 0 && kq.maMoi === 0);
  const inP = ['A'], dm = { A: [5, 6, 7, 8] };
  kq = sp.saoChepThang(inP, dm, { A: 30, B: 3 }, [0, 1, 2, 3], true);
  check('mọi ô của A đã có số + chỉ điền trống: A giữ nguyên; B vẫn được thêm; A không bị tính "mã mới"', eq(kq.draftMap.A, [5, 6, 7, 8]) && eq(kq.inPlan, ['A', 'B']) && kq.oGiu === 4 && kq.maMoi === 1, kq);
  kq = sp.saoChepThang(inP, dm, { A: 30 }, [0, 1], true);
  check('không có ô nào điền được -> trả đúng tham chiếu cũ (inPlan/draftMap), oGiu cho biết lý do', kq.inPlan === inP && kq.draftMap === dm && kq.oDien === 0 && kq.oGiu === 2, kq);
  kq = sp.saoChepThang([], {}, { A: 1 }, [4, -1, 1.5, 'x'], true);
  check('vị trí đích ngoài 0..3 / không nguyên bị loại', kq.oDien === 0 && eq(kq.inPlan, []));
  kq = sp.saoChepThang([], {}, { A: '12', B: 'x', C: null }, [0], true);
  check('SL dạng chữ được đọc; không phải số -> bỏ qua, không NaN', eq(kq.draftMap, { A: [12, 0, 0, 0] }) && eq(kq.inPlan, ['A']));
  const sau = sp.khoiTaoKeHoach({}, []);
  check('ca gốc: carry trống (quên lập kỳ) -> kế hoạch trống; sau sao chép tháng cũ có số để sửa và gửi (dongGui lấy được)',
    eq(sau.inPlan, []) && sp.dongGui(sp.saoChepThang([], {}, gt.skus, [0, 1, 2, 3], true).draftMap, sp.saoChepThang([], {}, gt.skus, [0, 1, 2, 3], true).inPlan).length === 2);

  console.log('5. Nối vào màn hình');
  const panel = SRC('components/sop/SopPlanPanel.jsx');
  const card = SRC('components/sop/SopLichSuSaoChep.jsx');
  check('SopPlanPanel: tải lịch sử bằng getMySopPlan RIÊNG (lỗi không chặn lập kế hoạch) + luoiLichSu loại kỳ đang soạn',
    /api\.getMySopPlan\(token\)/.test(panel) && /luoiLichSu\(\(res && res\.rows\) \|\| \[\], \(res && res\.anchor\) \|\| ''\)/.test(panel) && /useEffect\(\(\) => \{ fetchContext\(\); fetchLichSu\(\); \}, \[token, refreshTick\]\)/.test(panel));
  check('SopPlanPanel: sao chép chỉ sửa bản đang soạn (setInPlan/setDraftMap), có Hoàn tác về bản trước (truoc), KHÔNG gọi submitSopDraft',
    /const handleSaoChep = /.test(panel) && /saoChepThang\(inPlan, draftMap, nguon, dich, chiODangTrong\)/.test(panel) && /setUndo\(\{ truoc, tieuDe:/.test(panel) && /if \(undo\.truoc\)/.test(panel) && !/handleSaoChep[\s\S]{0,1500}api\.submitSopDraft/.test(panel));
  check('SopPlanPanel: thẻ hiện cả khi kế hoạch trống (mở sẵn) và đặt TRƯỚC bảng', /<SopLichSuSaoChep[\s\S]*?moSan=\{inPlan\.length === 0\}[\s\S]*?onSaoChep=\{handleSaoChep\}/.test(panel) && panel.indexOf('<SopLichSuSaoChep') < panel.indexOf('{inPlan.length === 0 ? ('));
  check('thẻ: chọn tháng nguồn, tick tháng đích (chỉ tháng sau), "Chỉ điền ô đang trống" mặc định bật, nút sao chép',
    /viTriDichHopLe\(ym, anchor\)/.test(card) && /useState\(true\)/.test(card) && /Chỉ điền ô đang trống/.test(card) && /Sao chép vào kế hoạch đang soạn/.test(card) && /Tháng nguồn để sao chép/.test(card));
  check('thẻ: lỗi tải lịch sử có Thử lại; chưa có kế hoạch nào thì báo rõ', /onThuLai/.test(card) && /Bạn chưa lập kế hoạch tháng nào trước đây/.test(card));
  const pk = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('đã đăng ký trong npm test', /sop-sao-chep\.test\.cjs/.test(pk.scripts.test));

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
