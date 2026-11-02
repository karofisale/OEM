/**
 * ke-hoach-yeu-cau-sua.test.cjs — Admin "Yêu cầu sửa lại" kế hoạch tháng đã duyệt (02/11/2026).
 *
 *   node test/ke-hoach-yeu-cau-sua.test.cjs
 *
 * Vòng đời dòng kế hoạch: Chờ duyệt -> Đã duyệt -> (Admin trả lại + lý do) -> Cần sửa -> (Sale gửi lại) -> Chờ duyệt.
 * Logic thuần (utils/salesPlanRevision.js) gọi thẳng; phần React soát bằng mã nguồn. Server: Karofi-ID/test/oem-api.test.mjs mục 5.
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
  const x = await imp('utils/salesPlanRevision.js');
  const roles = await imp('utils/roles.js');
  const gl = await imp('utils/glossary.js');

  const plans = [
    { month: 'T09-2026', searchCode: 'A', sale: 'KH Luyến', status: 'Đã duyệt' },
    { month: 'T10-2026', searchCode: 'A', sale: 'KH Luyến', status: 'Đã duyệt' },
    { month: 'T10-2026', searchCode: 'B', sale: 'KH Hải', status: 'Chờ duyệt' },
    { month: 'T10-2026', searchCode: 'C', sale: 'KH Luyến', status: 'Cần sửa', revisionNote: 'Tuần 2 thấp', revisionBy: 'hai' },
    { month: 'T10-2026', searchCode: 'D', sale: 'KH Hải', status: 'Cần sửa', revisionNote: 'Tuần 2 thấp' },
    { month: 'T08-2026', searchCode: 'E', sale: 'KH Luyến', status: 'Cần sửa', revisionNote: 'Làm lại' },
    { month: 'T07-2026', searchCode: 'F', sale: 'KH Luyến', status: '' },
    { month: 'T07-2026', searchCode: 'G', sale: 'KH Luyến', status: 'Từ chối' }
  ];

  console.log('1. Trạng thái + tháng');
  check('hằng số trạng thái khớp server (Chờ duyệt / Đã duyệt / Cần sửa); trả lại được: chờ + đã duyệt, KHÔNG phải dòng đang Cần sửa',
    x.TT_CHO === 'Chờ duyệt' && x.TT_DUYET === 'Đã duyệt' && x.TT_SUA === 'Cần sửa' && eq(x.TT_TRA_LAI_DUOC, ['Chờ duyệt', 'Đã duyệt']));
  check('demTheoTrangThai: đếm 3 trạng thái; dòng rỗng/trạng thái lạ không tính', eq(x.demTheoTrangThai(plans), { cho: 1, duyet: 2, sua: 3, tong: 6 }), x.demTheoTrangThai(plans));
  check('cacThangCoKeHoach: mới nhất trước; tháng chỉ có dòng rỗng/lạ (T07) KHÔNG hiện', eq(x.cacThangCoKeHoach(plans), ['T10-2026', 'T09-2026', 'T08-2026']), x.cacThangCoKeHoach(plans));
  check('thangMacDinh: tháng mới nhất CÓ dòng chờ duyệt; không có chờ duyệt thì tháng mới nhất; không có gì -> ""',
    x.thangMacDinh(plans) === 'T10-2026' && x.thangMacDinh(plans.filter((p) => p.status !== 'Chờ duyệt')) === 'T10-2026' &&
    x.thangMacDinh([{ month: 'T05-2026', status: 'Chờ duyệt' }, { month: 'T10-2026', status: 'Đã duyệt' }]) === 'T05-2026' && x.thangMacDinh([]) === '' && x.thangMacDinh(undefined) === '');
  check('locTheoTrangThai: ALL = cả 3 trạng thái; chọn một trạng thái -> đúng nó', x.locTheoTrangThai(plans, 'ALL').length === 6 && x.locTheoTrangThai(plans, 'Cần sửa').length === 3 && x.locTheoTrangThai(plans, 'Chờ duyệt').length === 1 && x.locTheoTrangThai(plans).length === 6);

  console.log('2. Của tôi (Sale) + lý do');
  const toiLaLuyen = (ten) => roles.laCuaToi({ saleId: 'Luyến' }, ten);
  const mine = x.dongCanSuaCuaToi(plans, toiLaLuyen);
  check('dongCanSuaCuaToi: gom theo tháng, chỉ dòng "Cần sửa" của Sale này (KH Hải bị loại)', eq(Object.keys(mine).sort(), ['T08-2026', 'T10-2026']) && mine['T10-2026'].length === 1 && mine['T10-2026'][0].searchCode === 'C', mine);
  check('không truyền hàm "của tôi" -> trả mọi dòng Cần sửa; không có gì -> {}', Object.keys(x.dongCanSuaCuaToi(plans)).length === 2 && eq(x.dongCanSuaCuaToi([], toiLaLuyen), {}) && eq(x.dongCanSuaCuaToi(undefined), {}));
  check('lyDoRiengBiet: bỏ trùng/trống, tối đa 3 rồi "…"', eq(x.lyDoRiengBiet([{ revisionNote: 'a' }, { revisionNote: 'a' }, { revisionNote: ' ' }, {}, { revisionNote: 'b' }]), ['a', 'b']) &&
    eq(x.lyDoRiengBiet(['1', '2', '3', '4'].map((n) => ({ revisionNote: n }))), ['1', '2', '3', '…']));
  check('maTraLaiDuoc: chỉ mã được chọn VÀ đang Chờ/Đã duyệt (mã Cần sửa, mã ngoài tháng bị bỏ)', eq(x.maTraLaiDuoc(plans.filter((p) => p.month === 'T10-2026'), new Set(['A', 'B', 'C', 'ZZ'])), ['A', 'B']));
  check('nhãn trạng thái "Cần sửa" có trong glossary (tông rose), không hiện chữ thô', gl.trangThai('Cần sửa').label === 'Cần sửa' && gl.trangThai('Cần sửa').tone === 'rose' && gl.trangThai('cần sửa lại').label === 'Cần sửa');

  console.log('3. Nối vào màn hình');
  const api = SRC('services/api.js');
  const ap = SRC('components/salesplan/SalesPlanApprovePanel.jsx');
  const pp = SRC('components/salesplan/SalesPlanProposePanel.jsx');
  const sp = SRC('components/SalesPlan.jsx');
  check('api: requestSalesPlanRevision(token, thang, codes, reason) gọi đúng hàm server; KHÔNG tự thử lại (nhóm hàm không idempotent)',
    /callApi\('requestSalesPlanRevision', \[token, thang, codes \|\| \[\], reason\]\)/.test(api) && /'requestSalesPlanRevision'\s*\/\/ nhóm B/.test(api));
  check('màn duyệt: hộp lý do bắt buộc (ReasonDialog), gọi API đúng, chặn bấm lặp (dangTraLai), cả tháng = codes rỗng',
    /<ReasonDialog/.test(ap) && /api\.requestSalesPlanRevision\(token, month, hoiSua\.codes, lyDo\)/.test(ap) && /if \(dangTraLai \|\| !hoiSua\) return/.test(ap) && /setHoiSua\(\{ codes: \[\] \}\)/.test(ap) && /busy=\{dangTraLai\}/.test(ap));
  check('màn duyệt: vẫn duyệt cả tháng như cũ (chặn bấm lặp), chọn khách chỉ cho dòng trả lại được, hiện lý do trên dòng Cần sửa',
    /busy=\{isApproving\}/.test(ap) && /if \(isApproving\) return/.test(ap) && /disabled=\{!duoc\}/.test(ap) && /p\.revisionNote/.test(ap) && /Yêu cầu sửa cả tháng/.test(ap));
  check('SalesPlan truyền onChanged (làm mới kế hoạch, KHÔNG nhảy sang tab Xem) cho màn duyệt', /onChanged=\{\(\) => \{ if \(onDataChanged\) onDataChanged\(\['plans'\]\); \}\}/.test(sp));
  check('màn Sale: banner + nhãn CẦN SỬA + lý do + "Giữ nguyên số, gửi lại" + lọc "Chỉ hiện khách cần sửa"; chỉ vai Sale thấy',
    /dongCanSuaCuaToi\(plans/.test(pp) && /isSale \?/.test(pp) && /CẦN SỬA/.test(pp) && /Giữ nguyên số, gửi lại/.test(pp) && /Chỉ hiện khách cần sửa/.test(pp) && /const guiLaiKhongDoi = /.test(pp));
  check('"Giữ nguyên số, gửi lại" đưa dòng vào bản nháp y hệt số hiện có (để nút Lưu bật) — không gọi máy chủ',
    /guiLaiKhongDoi = \(code\) => \{\s*setDraftMap\(prev => \(\{ \.\.\.prev, \[code\]: \{ \.\.\.getDraft\(code\) \} \}\)\);/.test(pp));
  check('màn chọn tháng nhắc các tháng còn khách cần sửa và mở thẳng tháng đó', /khoiCanSua\(\(m\) => \{ setMonth\(m\); setPeriodConfirmed\(true\); \}\)/.test(pp));
  const pk = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('đã đăng ký trong npm test', /ke-hoach-yeu-cau-sua\.test\.cjs/.test(pk.scripts.test));

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
