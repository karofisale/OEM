/**
 * ke-hoach-excel.test.cjs — Kế hoạch kinh doanh tháng: "Xuất Excel mẫu" + "Nhập từ Excel" (02/11/2026).
 *
 *   node test/ke-hoach-excel.test.cjs
 *
 * Logic thuần (utils/salesPlanExcel.js) gọi thẳng: dựng mẫu -> đọc lại phải khớp; ô trống = giữ nguyên, 0 = đặt về 0; số kiểu Việt/Anh;
 * mã lạ, khách của Sale khác, tháng lệch, dòng tổng; không đẩy lại dòng không đổi về "chờ duyệt". Phần React soát bằng mã nguồn.
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
  const x = await imp('utils/salesPlanExcel.js');

  console.log('1. docSoTien');
  check('trống / khoảng trắng / null -> trống', x.docSoTien('').trong && x.docSoTien('   ').trong && x.docSoTien(null).trong && x.docSoTien(undefined).trong);
  check('số thật; 0 là SỐ (không phải trống); làm tròn', x.docSoTien(1500000).so === 1500000 && x.docSoTien(0).so === 0 && x.docSoTien(1234.6).so === 1235);
  check('chuỗi kiểu Việt/Anh: 1.234.567 · 1,234,567 · "1 234 567 đ" · 1234567', ['1.234.567', '1,234,567', '1 234 567 đ', '1234567', ' 1.234.567 VNĐ '].every((s) => x.docSoTien(s).so === 1234567));
  check('thập phân kiểu Việt "1234,5" -> 1235; "12.5" -> 13', x.docSoTien('1234,5').so === 1235 && x.docSoTien('12.5').so === 13);
  check('âm / chữ / vô cực bị từ chối, không thành 0 âm thầm', !!x.docSoTien(-5).loi && !!x.docSoTien('-5').loi && !!x.docSoTien('abc').loi && !!x.docSoTien('12abc').loi && !!x.docSoTien(Infinity).loi);

  console.log('2. dungBangMau');
  const rows = [
    { code: 'TECOM', name: 'Công ty Tecom', sale: 'KH Luyến', planKpi: 5000000000, w: [100, 0, 300, 0, 0], note: 'ghi chú 1', done: 1200 },
    { code: 'MAXIM', name: 'Maxim', sale: 'KH Luyến', planKpi: 0, w: [0, 0, 0, 0, 0], note: '', done: 0 }
  ];
  const mau = x.dungBangMau({ month: 'T11-2026', rows, nguoiXuat: 'luyennt', ngayXuat: '02/11/2026' });
  check('dòng tiêu đề đúng 12 cột; dữ liệu bắt đầu ngay dưới', eq(mau.aoa[mau.dongTieuDe], x.COT) && mau.dongDau === mau.dongTieuDe + 1 && mau.aoa.length === mau.dongDau + 3, mau.aoa.length);
  check('ô tuần = 0 xuất ra TRỐNG (nhất quán với "trống = giữ nguyên"); tuần > 0 giữ số', eq(mau.aoa[mau.dongDau].slice(4, 9), [100, '', 300, '', '']) && eq(mau.aoa[mau.dongDau + 1].slice(4, 9), ['', '', '', '', '']));
  check('Plan update là CÔNG THỨC SUM(E:I) đúng số dòng Excel; có dòng TỔNG', mau.aoa[mau.dongDau][9].f === `SUM(E${mau.dongDau + 1}:I${mau.dongDau + 1})` && mau.aoa[mau.dongDau][9].v === 400 && mau.aoa[mau.aoa.length - 1][0] === 'TỔNG');
  check('có ô "Tháng" + khoá tháng ở dòng 2; không có khách -> không có dòng TỔNG', mau.aoa[1][0] === 'Tháng' && mau.aoa[1][1] === 'T11-2026' && x.dungBangMau({ month: 'T11-2026', rows: [] }).aoa.length === 5);

  console.log('3. docBangKeHoach — vòng đi-về (xuất mẫu rồi đọc lại)');
  const dk = x.docBangKeHoach(mau.aoa);
  check('đọc lại đúng tháng + 2 khách; bỏ qua dòng TỔNG; không lỗi', dk.thang === 'T11-2026' && dk.dong.length === 2 && dk.loi.length === 0 && !dk.dong.some((d) => /TONG/i.test(d.code)), dk);
  check('tuần có số -> số; tuần trống -> null (giữ nguyên); note trống -> null', eq(dk.dong[0].w, [100, null, 300, null, null]) && dk.dong[0].note === 'ghi chú 1' && eq(dk.dong[1].w, [null, null, null, null, null]) && dk.dong[1].note === null);
  check('dongExcel = số dòng thật trong file (1-based)', dk.dong[0].dongExcel === mau.dongDau + 1);

  console.log('4. docBangKeHoach — file người dùng điền tay');
  const aoa = [
    ['Báo cáo của tôi'], ['Tháng', 't11-2026'], [],
    ['  mã kh ', 'Tên', 'TUẦN 1', 'Tuần 2', 'Tuần 3', 'Tuần 4', 'Tuần 5', 'Ghi chú'],
    ['tecom', 'x', '1.000.000', 0, '', 2500000, ' 3 000 000 đ', 'ok'],
    ['MAXIM', 'y', 'abc', 1, 1, 1, 1, ''],
    ['KHONGCO', 'z', -5, 1, 1, 1, 1, ''],
    ['tecom', 'x', 7, '', '', '', '', 'bản sau'],
    ['Σ TỔNG CỘNG', '', 99],
    []
  ];
  const d2 = x.docBangKeHoach(aoa);
  check('tiêu đề không phân biệt hoa/thường/dấu/khoảng trắng; khoá tháng chuẩn hoá thành chữ hoa', d2.thang === 'T11-2026' && d2.dong.length === 1, d2);
  check('mã lặp: dòng SAU thắng (TECOM = 7, note "bản sau") và được ghi nhận là trùng', eq(d2.dong[0].w, [7, null, null, null, null]) && d2.dong[0].note === 'bản sau' && eq(d2.trung, ['TECOM']), d2);
  check('dòng có ô sai (chữ / âm) vào "loi" kèm số dòng Excel và tên tuần, KHÔNG vào dong', d2.loi.length === 2 && d2.loi[0].dongExcel === 6 && /Tuần 1/.test(d2.loi[0].lyDo) && d2.loi[1].code === 'KHONGCO', d2.loi);
  const d3 = x.docBangKeHoach([['a', 'b'], [1, 2]]);
  check('không thấy tiêu đề -> báo lỗi cấu trúc, không ném lỗi', /Không thấy bảng kế hoạch/.test(d3.loiCauTruc));
  const d4 = x.docBangKeHoach([['KẾ HOẠCH KINH DOANH THÁNG T03-2027'], ['Mã KH', 'Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4', 'Tuần 5'], ['A', 1]]);
  check('không có ô "Tháng" thì tìm "T03-2027" trong tiêu đề; thiếu cột Note vẫn đọc được', d4.thang === 'T03-2027' && d4.dong.length === 1 && d4.dong[0].note === null);
  check('file không ghi tháng -> thang = "" (màn sẽ cảnh báo)', x.docBangKeHoach([['Mã KH', 'Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4', 'Tuần 5'], ['A', 1]]).thang === '');

  console.log('5. ghepVaoNhap');
  const rowByCode = {
    TECOM: { codeSearch: 'TECOM', sale: 'KH Luyến' },
    OTHER: { codeSearch: 'OTHER', sale: 'KH Hải' },
    DONE: { codeSearch: 'DONE', sale: 'KH Luyến' }
  };
  const clientByCode = { TECOM: { sale: 'KH Luyến' }, OTHER: { sale: 'KH Hải' }, DONE: { sale: 'KH Luyến' }, NEWKH: { codeSearch: 'NEWKH', sale: 'KH Luyến', name: 'Khách mới' }, XKH: { codeSearch: 'XKH', sale: 'KH Hải' } };
  const hien = { TECOM: { w1: 100, w2: 0, w3: 300, w4: 0, w5: 0, note: 'cũ' }, DONE: { w1: 5, w2: 5, w3: 5, w4: 5, w5: 5, note: '' } };
  const getDraft = (c) => hien[c] || { w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, note: '' };
  const ctx = { rowByCode, clientByCode, getDraft, canEditRow: (r) => r.sale === 'KH Luyến', canEditClient: (c) => c.sale === 'KH Luyến' };
  const g = x.ghepVaoNhap({
    ...ctx,
    dong: [
      { code: 'tecom', w: [null, 50, null, null, null], note: null, dongExcel: 5 },          // đổi tuần 2
      { code: 'DONE', w: [5, 5, 5, 5, 5], note: null, dongExcel: 6 },                          // y hệt -> không đổi
      { code: 'OTHER', w: [1, 1, 1, 1, 1], note: null, dongExcel: 7 },                         // khách Sale khác
      { code: 'ZZZ', w: [1, null, null, null, null], note: null, dongExcel: 8 },               // mã lạ
      { code: 'NEWKH', w: [9, null, null, null, null], note: 'mới', dongExcel: 9 },            // có trong danh bạ, chưa trên bảng
      { code: 'XKH', w: [1, null, null, null, null], note: null, dongExcel: 10 },              // trong danh bạ nhưng của Sale khác
      { code: 'MAXIM', w: [null, null, null, null, null], note: null, dongExcel: 11 }          // trống hết (mã lạ nhưng không có số — vẫn báo mã lạ)
    ]
  });
  check('tuần để trống GIỮ số hiện có: TECOM chỉ đổi w2=50, w1/w3/note giữ nguyên', eq(g.apply.find((a) => a.code === 'TECOM').draft, { w1: 100, w2: 50, w3: 300, w4: 0, w5: 0, note: 'cũ' }), g.apply);
  check('so không phân biệt hoa/thường: "tecom" khớp TECOM', g.apply.some((a) => a.code === 'TECOM'));
  check('dòng y hệt số hiện có -> "không đổi", KHÔNG vào apply (không đánh dấu CHƯA LƯU / không đẩy lại về chờ duyệt)', g.khongDoi === 1 && !g.apply.some((a) => a.code === 'DONE'));
  check('khách của Sale khác (có trên bảng hoặc chỉ trong danh bạ) -> bỏ qua kèm lý do; mã lạ -> bỏ qua',
    g.boQua.filter((b) => /chỉ xem/.test(b.lyDo)).map((b) => b.code).sort().join() === 'OTHER,XKH' && g.boQua.some((b) => b.code === 'ZZZ' && /không có trong danh sách/.test(b.lyDo)) && g.boQua.some((b) => b.code === 'MAXIM'), g.boQua);
  check('khách có trong danh bạ, chưa trên bảng, của mình -> áp + thêm vào bảng (themKhach)', eq(g.themKhach, ['NEWKH']) && eq(g.apply.find((a) => a.code === 'NEWKH').draft, { w1: 9, w2: 0, w3: 0, w4: 0, w5: 0, note: 'mới' }));
  check('đếm: tổng 7 dòng = 2 áp + 1 không đổi + 4 bỏ qua', g.tong === 7 && g.apply.length === 2 && g.khongDoi === 1 && g.boQua.length === 4, { tong: g.tong, apply: g.apply.length, kd: g.khongDoi, bq: g.boQua.length });
  const g2 = x.ghepVaoNhap({ ...ctx, dong: [{ code: 'TECOM', w: [0, 0, 0, 0, 0], note: '', dongExcel: 1 }] });
  check('nhập 0 tường minh = đặt về 0 (khác ô trống): TECOM w1 100->0, w3 300->0, note "" ', eq(g2.apply[0].draft, { w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, note: '' }), g2);

  console.log('6. Nối vào màn hình');
  const panel = SRC('components/salesplan/SalesPlanProposePanel.jsx');
  check('nút Xuất Excel mẫu + Nhập từ Excel; xlsx tải lười (import("xlsx")), không import tĩnh', /Xuất Excel mẫu/.test(panel) && /Nhập từ Excel/.test(panel) && /await import\('xlsx'\)/.test(panel) && !/^import .* from 'xlsx'/m.test(panel));
  check('mẫu chỉ gồm khách SỬA ĐƯỢC (canEditRow) trong phạm vi đang chọn; số hiện có (kể cả nháp chưa lưu) được đưa vào mẫu', /\[\.\.\.scopedRows\]\.filter\(canEditRow\)/.test(panel) && /dungBangMau\(/.test(panel) && /getDraft\(r\.codeSearch\)/.test(panel));
  check('nhập file: chặn tháng lệch với tháng đang lập; không ghi lên máy chủ — chỉ vào bản nháp (setDraftMap) để Sale kiểm rồi bấm Lưu', /thang !== month|dk\.thang && dk\.thang !== month/.test(panel) && /setDraftMap\(prev => \(\{ \.\.\.prev, \.\.\.moi \}\)\)/.test(panel) && !/handleNhapExcel[\s\S]{0,1800}api\.submitSalesPlan/.test(panel));
  check('có hộp xem trước trước khi áp (ConfirmDialog), mô tả số khách đổi / không đổi / bỏ qua', /msgNhap/.test(panel) && /Áp vào bảng/.test(panel));
  const pk = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('đã đăng ký trong npm test', /ke-hoach-excel\.test\.cjs/.test(pk.scripts.test));

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
