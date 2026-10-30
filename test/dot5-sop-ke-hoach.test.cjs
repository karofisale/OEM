/**
 * dot5-sop-ke-hoach.test.cjs — Kế hoạch SOP, "Lập Kế Hoạch": tìm/lọc, tick bỏ mã, thêm mã (12/10/2026).
 *
 *   node test/dot5-sop-ke-hoach.test.cjs
 *
 * Logic thuần (utils/sopPlan.js, formClean.dungSanPhamMoi) gọi thẳng. Phần React (SopPlanPanel / SopAddProductModal) soát bằng mã
 * nguồn để chặn hồi quy; hành vi thật (lọc, tick, bỏ + hoàn tác, thêm nhiều mã, thêm SP mới thành công/trùng/lỗi server, gửi đúng
 * payload, F5 cảnh báo, giao diện tối, 375px) đã thử trên trình duyệt qua /ui-harness.html?role=sale (&sop= &failadd= &failsubmit=).
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
  const fc = await imp('utils/formClean.js');

  // ===========================================================================
  console.log('\n1. khoiTaoKeHoach: kế hoạch lúc tải');
  const carry = { A: [1, 2, 3, 0], B: [0, 0, 0, 0], C: [5, 0, 0, 0] };
  let kh = sp.khoiTaoKeHoach(carry, []);
  check('chưa có nháp -> lấy carry-forward; chỉ mã có SL > 0 (B toàn 0 không vào kế hoạch)', eq(kh.inPlan, ['A', 'C']) && kh.nguon === 'carry' && !('B' in kh.draftMap), kh);
  check('draftMap chỉ có khoá cho mã trong kế hoạch; mỗi mã đủ 4 tháng', eq(Object.keys(kh.draftMap), ['A', 'C']) && kh.draftMap.A.length === 4);
  kh = sp.khoiTaoKeHoach(carry, [{ sku: 'C', sl1: 9, sl2: 0, sl3: 0, sl4: 0 }, { sku: 'D', sl1: 0, sl2: 4 }]);
  check('có nháp của kỳ này -> CHÍNH NÓ là kế hoạch (A từ carry không sống lại: mã đã bỏ lúc gửi không quay lại khi tải)',
    eq(kh.inPlan, ['C', 'D']) && kh.nguon === 'nhap' && kh.draftMap.C[0] === 9 && !('A' in kh.draftMap), kh);
  check('thiếu sl -> 0, không NaN', eq(kh.draftMap.D, [0, 4, 0, 0]));
  kh = sp.khoiTaoKeHoach(undefined, undefined);
  check('không có gì -> kế hoạch trống (server cũ/rỗng không làm vỡ)', eq(kh.inPlan, []) && eq(kh.draftMap, {}));
  kh = sp.khoiTaoKeHoach({ A: [1, 'x', null, undefined] }, null);
  check('giá trị rác trong carry -> 0', eq(kh.draftMap.A, [1, 0, 0, 0]));

  // ===========================================================================
  console.log('\n2. dongGui / chuKy: chỉ mã THUỘC kế hoạch có SL > 0');
  const inPlan = ['A', 'C', 'E'];
  const map = { A: [1, 0, 0, 0], C: [0, 0, 0, 0], E: [0, 0, 0, 2], ZOMBIE: [9, 9, 9, 9] };
  let rows = sp.dongGui(map, inPlan);
  check('bỏ mã toàn 0 (C, "chưa nhập SL") và mã không thuộc kế hoạch (ZOMBIE)', eq(rows.map((r) => r.sku), ['A', 'E']), rows);
  check('dòng gửi đúng dạng {sku,sl1..sl4}', eq(rows[1], { sku: 'E', sl1: 0, sl2: 0, sl3: 0, sl4: 2 }));
  check('chữ ký không phụ thuộc thứ tự inPlan', sp.chuKy(map, ['E', 'A', 'C']) === sp.chuKy(map, ['A', 'C', 'E']));
  check('chữ ký đổi khi đổi SL', sp.chuKy(map, inPlan) !== sp.chuKy({ ...map, A: [2, 0, 0, 0] }, inPlan));
  check('thêm mã SL 0 KHÔNG đổi chữ ký (không đổi nội dung gửi)', sp.chuKy(map, inPlan) === sp.chuKy({ ...map, N: [0, 0, 0, 0] }, inPlan.concat('N')));
  check('đưa SL của một mã về 0 (hoặc bỏ mã) đổi chữ ký', sp.chuKy(map, inPlan) !== sp.chuKy({ ...map, A: [0, 0, 0, 0] }, inPlan) && sp.chuKy(map, inPlan) !== sp.chuKy(map, ['A', 'C']));

  // ===========================================================================
  console.log('\n3. boKhoiKeHoach + hoanTacBo');
  let r = sp.boKhoiKeHoach(inPlan, map, ['A', 'KHONGCO']);
  check('bỏ A: ra khỏi inPlan và draftMap; mã không thuộc kế hoạch bị bỏ qua', eq(r.inPlan, ['C', 'E']) && !('A' in r.draftMap) && eq(r.daBo.skus, ['A']), r);
  check('draftMap gốc không bị sửa (bất biến)', 'A' in map && inPlan.length === 3);
  check('payload gửi không còn mã đã bỏ', !sp.dongGui(r.draftMap, r.inPlan).some((x) => x.sku === 'A'));
  r = sp.boKhoiKeHoach(inPlan, map, []);
  check('không chọn gì -> trả đúng tham chiếu cũ, daBo = null', r.inPlan === inPlan && r.draftMap === map && r.daBo === null);
  r = sp.boKhoiKeHoach(inPlan, map, ['KHONGCO']);
  check('chọn toàn mã lạ -> không đổi gì', r.daBo === null && r.inPlan === inPlan);
  const b = sp.boKhoiKeHoach(inPlan, map, ['A', 'E']);
  const h = sp.hoanTacBo(b.inPlan, b.draftMap, b.daBo);
  check('hoàn tác khôi phục mã VÀ số lượng cũ', eq(h.khoiPhuc, ['A', 'E']) && eq(h.draftMap.A, [1, 0, 0, 0]) && eq(h.draftMap.E, [0, 0, 0, 2]) && h.inPlan.length === 3, h);
  check('sau hoàn tác chữ ký quay về đúng như trước khi bỏ', sp.chuKy(h.draftMap, h.inPlan) === sp.chuKy(map, inPlan));
  const lai = sp.themVaoKeHoach(b.inPlan, b.draftMap, ['A']);   // sale tự thêm lại A (SL 0) rồi mới bấm hoàn tác
  const h2 = sp.hoanTacBo(lai.inPlan, { ...lai.draftMap, A: [7, 0, 0, 0] }, b.daBo);
  check('hoàn tác không ghi đè mã đã được thêm lại (giữ số hiện tại, không nhân đôi)', eq(h2.khoiPhuc, ['E']) && h2.draftMap.A[0] === 7 && h2.inPlan.filter((s) => s === 'A').length === 1, h2);
  check('hoàn tác với daBo rỗng/null không làm gì', sp.hoanTacBo(inPlan, map, null).khoiPhuc.length === 0);
  const mapSach = { A: [1, 0, 0, 0], C: [0, 0, 0, 0], E: [0, 0, 0, 2] };
  const tatCa = sp.boKhoiKeHoach(inPlan, mapSach, inPlan);
  check('"Tạo mới từ đầu" = bỏ hết: kế hoạch trống, hoàn tác khôi phục đủ', tatCa.inPlan.length === 0 && Object.keys(tatCa.draftMap).length === 0 &&
    sp.chuKy(sp.hoanTacBo(tatCa.inPlan, tatCa.draftMap, tatCa.daBo).draftMap, sp.hoanTacBo(tatCa.inPlan, tatCa.draftMap, tatCa.daBo).inPlan) === sp.chuKy(mapSach, inPlan));

  // ===========================================================================
  console.log('\n4. themVaoKeHoach');
  r = sp.themVaoKeHoach(['A'], { A: [1, 0, 0, 0] }, ['B', 'A', 'B', '', 'C']);
  check('thêm mã mới (SL 0), bỏ mã đã có / lặp / rỗng; mã cũ giữ nguyên số', eq(r.themMoi, ['B', 'C']) && eq(r.inPlan, ['A', 'B', 'C']) && eq(r.draftMap.B, [0, 0, 0, 0]) && r.draftMap.A[0] === 1, r);
  const tru = sp.themVaoKeHoach(['A'], { A: [1, 0, 0, 0] }, ['A']);
  check('không có gì mới -> trả đúng tham chiếu cũ', tru.themMoi.length === 0 && eq(tru.inPlan, ['A']));
  check('mã mới SL 0 chưa vào payload gửi', eq(sp.dongGui(r.draftMap, r.inPlan).map((x) => x.sku), ['A']));

  // ===========================================================================
  console.log('\n5. diffGui + tomTatMa');
  const d = sp.diffGui(['A', 'B', 'C'], ['B', 'C', 'D', 'E']);
  check('bỏ = có ở bản gốc mà giờ không gửi; mới = thêm; giữ = còn lại', eq(d.bo, ['A']) && eq(d.moi, ['D', 'E']) && eq(d.giu, ['B', 'C']), d);
  check('không đổi gì -> bo/moi rỗng', eq(sp.diffGui(['A'], ['A']).bo, []) && eq(sp.diffGui(['A'], ['A']).moi, []));
  check('bản gốc rỗng (kế hoạch mới tinh)', eq(sp.diffGui([], ['A']).moi, ['A']) && sp.diffGui(undefined, undefined).bo.length === 0);
  check('tomTatMa ≤ 5 mã: liệt kê hết', sp.tomTatMa(['A', 'B', 'C']) === 'A, B, C');
  check('tomTatMa > 5: 5 mã đầu + "…và N mã khác"', sp.tomTatMa(['A', 'B', 'C', 'D', 'E', 'F', 'G']) === 'A, B, C, D, E …và 2 mã khác');
  check('tomTatMa đúng ranh giới 5 / 6', sp.tomTatMa(['1', '2', '3', '4', '5']) === '1, 2, 3, 4, 5' && sp.tomTatMa(['1', '2', '3', '4', '5', '6']).endsWith('…và 1 mã khác'));

  // ===========================================================================
  console.log('\n6. Chọn nhiều dòng');
  const vis = ['A', 'B', 'C'];
  check('trangThaiChonTatCa: không chọn / một phần (indeterminate) / tất cả',
    eq(sp.trangThaiChonTatCa(new Set(), vis), { checked: false, indeterminate: false, count: 0 }) &&
    eq(sp.trangThaiChonTatCa(new Set(['A']), vis), { checked: false, indeterminate: true, count: 1 }) &&
    eq(sp.trangThaiChonTatCa(new Set(vis), vis), { checked: true, indeterminate: false, count: 3 }));
  check('danh sách đang lọc rỗng -> không bao giờ "đã chọn hết"', sp.trangThaiChonTatCa(new Set(), []).checked === false);
  check('mã chọn nhưng ngoài bộ lọc không tính vào trạng thái', eq(sp.trangThaiChonTatCa(new Set(['A', 'Z']), vis), { checked: false, indeterminate: true, count: 1 }));
  check('chonTatCa bật: thêm mọi mã đang lọc, giữ mã ngoài lọc; tắt: chỉ gỡ mã đang lọc',
    eq([...sp.chonTatCa(new Set(['Z']), vis, true)].sort(), ['A', 'B', 'C', 'Z']) && eq([...sp.chonTatCa(new Set(['Z', 'A']), vis, false)], ['Z']));
  const giu = new Set(['A', 'B']);
  check('giuChonConHien: không đổi gì thì trả đúng tập cũ (không render thừa)', sp.giuChonConHien(giu, ['A', 'B', 'C']) === giu);
  check('giuChonConHien: bộ lọc đổi -> bỏ chọn mã không còn hiển thị', eq([...sp.giuChonConHien(new Set(['A', 'B']), ['B', 'C'])], ['B']));
  check('giuChonConHien: tập rỗng trả nguyên', (() => { const e = new Set(); return sp.giuChonConHien(e, []) === e; })());

  // ===========================================================================
  console.log('\n7. Lọc / dòng bảng / ghim lên đầu / doanh thu');
  const mats = [
    { sku: 'MAT1000', name: 'Vật tư màng lọc', alias: 'mang', group: 'Màng RO', exclusiveTo: '', suggestedPrice: 1000 },
    { sku: 'MAT1001', name: 'Phin lọc thô', alias: 'PP', group: 'Phin lọc', exclusiveTo: 'TECOM', suggestedPrice: 2000 },
    { sku: 'abc-77', name: 'Đầu nối nhanh', alias: '', group: 'Phin lọc', exclusiveTo: '', suggestedPrice: 0 }
  ];
  check('khopLoc: tìm không dấu, không phân biệt hoa/thường ("vat tu mang" khớp "Vật tư màng")', sp.khopLoc(mats[0], { q: 'vat tu mang' }) && !sp.khopLoc(mats[1], { q: 'vat tu mang' }));
  check('khopLoc: theo mã, alias, "dau noi" ra "Đầu nối"', sp.khopLoc(mats[1], { q: 'mat1001' }) && sp.khopLoc(mats[1], { q: 'pp' }) && sp.khopLoc(mats[2], { q: 'dau noi' }) && sp.khopLoc(mats[2], { q: 'ABC-77' }));
  check('khopLoc: nhóm + độc quyền; ALL = không lọc', sp.khopLoc(mats[1], { group: 'Phin lọc', exclusive: 'TECOM' }) && !sp.khopLoc(mats[2], { group: 'Phin lọc', exclusive: 'TECOM' }) && sp.khopLoc(mats[2], { group: 'ALL', exclusive: 'ALL', q: '' }));
  const dong = sp.dongKeHoach(mats, ['abc-77', 'MAT1000', 'MAT9999']);
  check('dongKeHoach: chỉ mã trong kế hoạch, theo thứ tự danh mục; mã mất khỏi danh mục vẫn hiện (đánh dấu) để còn bỏ được',
    eq(dong.map((x) => x.sku), ['MAT1000', 'abc-77', 'MAT9999']) && dong[2].thieuDanhMuc === true && dong[2].suggestedPrice === 0, dong);
  check('datLenDau: mã ghim lên đầu, giữ thứ tự tương đối; không ghim/không khớp trả đúng mảng cũ',
    eq(sp.datLenDau(dong, new Set(['MAT9999', 'abc-77'])).map((x) => x.sku), ['abc-77', 'MAT9999', 'MAT1000']) && sp.datLenDau(dong, new Set()) === dong && sp.datLenDau(dong, new Set(['x'])) === dong);
  const dt = sp.doanhThuTheoThang(dong, { MAT1000: [2, 0, 0, 1], 'abc-77': [9, 9, 9, 9], MAT9999: [5, 5, 5, 5] });
  check('doanhThuTheoThang: Σ SL × giá trên các mã trong kế hoạch (mã giá 0 / mất khỏi danh mục = 0)', eq(dt, [2000, 0, 0, 1000]), dt);

  // ===========================================================================
  console.log('\n8. timSanPhamChuaCo (hộp Thêm sản phẩm)');
  const nhieu = Array.from({ length: 70 }, (_, i) => ({ sku: 'SKU' + String(i).padStart(3, '0'), name: 'Sản phẩm ' + i, alias: '', group: i % 2 ? 'B' : 'A', exclusiveTo: '', suggestedPrice: 1 }));
  let t = sp.timSanPhamChuaCo(nhieu, new Set(['SKU000', 'SKU001']), { q: '', group: 'ALL' });
  check('loại mã đã trong kế hoạch, tối đa 50 dòng, báo tổng và số đã nằm trong kế hoạch', t.items.length === 50 && t.total === 68 && t.daTrongKeHoach === 2 && !t.items.some((m) => m.sku === 'SKU000'), { n: t.items.length, total: t.total });
  t = sp.timSanPhamChuaCo(nhieu, new Set(), { q: 'san pham', group: 'ALL' }, 5);
  check('tìm không dấu ("san pham" ra "Sản phẩm") + giới hạn tuỳ chỉnh', t.items.length === 5 && t.total === 70, t.total);
  t = sp.timSanPhamChuaCo(nhieu, new Set(), { q: 'sku005', group: 'ALL' });
  check('mã khớp chính xác lên đầu', t.items[0].sku === 'SKU005', t.items[0]);
  t = sp.timSanPhamChuaCo(nhieu, new Set(), { q: '', group: 'B' });
  check('lọc nhóm', t.total === 35 && t.items.every((m) => m.group === 'B'));
  t = sp.timSanPhamChuaCo(nhieu, new Set(nhieu.map((m) => m.sku)), { q: 'sku', group: 'ALL' });
  check('mọi SP khớp đều đã trong kế hoạch -> 0 kết quả, báo số đã có', t.total === 0 && t.daTrongKeHoach === 70);
  check('trongGiongMa: mã (một từ, có số) vs chữ thường', sp.trongGiongMa('MAT1000') && sp.trongGiongMa(' abc-77 ') && sp.trongGiongMa('KG-123/4') && !sp.trongGiongMa('màng lọc') && !sp.trongGiongMa('mang loc 10') && !sp.trongGiongMa('ab') && !sp.trongGiongMa('abcdef') && !sp.trongGiongMa(''));

  // ===========================================================================
  console.log('\n9. dungSanPhamMoi (cùng quy tắc form Thêm sản phẩm của Danh mục)');
  const dm = [{ sku: 'MAT1000', name: 'Màng RO' }, { sku: 'abc-77', name: 'Đầu nối' }];
  const nhom = ['Màng RO', 'Phin lọc'];
  let n = fc.dungSanPhamMoi({ sku: '  NEW-1 ', name: ' Lõi mới  ', group: 'phin lọc', price: '1500', alias: '', exclusiveTo: ' TECOM ' }, dm, nhom);
  check('cắt khoảng trắng, gộp nhóm gõ khác hoa/thường về nhóm đã có, alias mặc định = từ đầu của tên, đơn vị PC',
    n.mat && n.mat.sku === 'NEW-1' && n.mat.name === 'Lõi mới' && n.mat.group === 'Phin lọc' && n.mat.alias === 'Lõi' && n.mat.unit === 'PC' && n.mat.exclusiveTo === 'TECOM' && n.mat.suggestedPrice === 1500, n);
  check('bản ghi có đủ trường như form Danh mục (avgPrice, latestPrice, latestPriceVat, totalQty)', n.mat.avgPrice === 1500 && n.mat.latestPrice === 0 && n.mat.latestPriceVat === 0 && n.mat.totalQty === 0);
  n = fc.dungSanPhamMoi({ sku: 'X1', name: 'Mới', group: 'Nhóm hoàn toàn mới', price: '' }, dm, nhom);
  check('nhóm mới gõ tay giữ nguyên; giá trống = 0 (server cũng nhận trống/0)', n.mat && n.mat.group === 'Nhóm hoàn toàn mới' && n.mat.suggestedPrice === 0, n);
  check('thiếu SKU / tên / chỉ khoảng trắng / thiếu nhóm -> câu báo lỗi, không có mat',
    fc.dungSanPhamMoi({ sku: ' ', name: 'x', group: 'A' }, dm, nhom).error && fc.dungSanPhamMoi({ sku: 'x', name: ' ', group: 'A' }, dm, nhom).error &&
    /Nhóm SP/.test(fc.dungSanPhamMoi({ sku: 'x', name: 'y', group: ' ' }, dm, nhom).error));
  check('giá âm / không phải số bị chặn', /không được âm/.test(fc.dungSanPhamMoi({ sku: 'x', name: 'y', group: 'A', price: '-1' }, dm, nhom).error) && /phải là một số/.test(fc.dungSanPhamMoi({ sku: 'x', name: 'y', group: 'A', price: 'abc' }, dm, nhom).error));
  n = fc.dungSanPhamMoi({ sku: ' ABC-77 ', name: 'y', group: 'A' }, dm, nhom);
  check('trùng mã KHÔNG phân biệt hoa/thường + đã cắt khoảng trắng (kể cả NBSP) -> báo lỗi và trả bản ghi trùng', /abc-77/.test(n.error) && n.trung && n.trung.sku === 'abc-77' && !n.mat, n);

  // ===========================================================================
  console.log('\n10. Mã nguồn: khung chung, nối props, không còn thứ đã bỏ');
  const panel = SRC('components/sop/SopPlanPanel.jsx');
  const modal = SRC('components/sop/SopAddProductModal.jsx');
  check('SopPlan.jsx + App.jsx (qua SalesPlan, tab con SOP từ 30/10/2026) truyền onAddMaterial (handleAddMaterial) xuống panel',
    /onAddMaterial=\{handleAddMaterial\}/.test(SRC('App.jsx')) && /onAddMaterial=\{onAddMaterial\}/.test(SRC('components/SopPlan.jsx')) && /<SopPlan [^>]*onAddMaterial=\{onAddMaterial\}/.test(SRC('components/SalesPlan.jsx')) && /SopPlan\(\{ token, activeUser, materials, onAddMaterial(, embedded = false)? \}\)/.test(SRC('components/SopPlan.jsx')));
  check('bảng chỉ hiện mã trong kế hoạch (dongKeHoach), không còn checkbox "Chỉ SP có SL kế hoạch tháng trước" / "hiện SP đang ẩn"',
    /dongKeHoach\(materials, inPlan\)/.test(panel) && !/onlyPriorPlanned/.test(panel) && !/SP đang ẩn/.test(panel) && !/priorApprovedBySku/.test(panel));
  check('ô tìm đổi placeholder; có "Trong kế hoạch: N SKU"', /Tìm trong kế hoạch theo mã SKU, tên, alias/.test(panel) && /Trong kế hoạch: \{inPlan\.length/.test(panel));
  check('khung chung: ConfirmDialog, useToast, useUnsavedGuard, SortableTh, TableState, Pagination; hộp thêm dựng trên Modal',
    /import ConfirmDialog/.test(panel) && /useToast/.test(panel) && /useUnsavedGuard/.test(panel) && /SortableTh/.test(panel) && /TableState/.test(panel) && /Pagination/.test(panel) && /import Modal from '..\/Modal'/.test(modal) && /<Modal\b/.test(modal) && /dirty=\{dirty\}/.test(modal));
  check('payload gửi = dongGui(draftMap, inPlan) (không gửi mã đã bỏ); chữ ký = chuKy(draftMap, inPlan)', /dongGui\(draftMap, inPlan\)/.test(panel) && /chuKy\(draftMap, inPlan\)/.test(panel) && /api\.submitSopDraft\(token, context\.anchor, submissionRows\)/.test(panel));
  check('xác nhận bỏ mã liệt kê bằng tomTatMa + nói rõ SL bị xoá & Hoàn tác; hộp Gửi nêu mã mới / mã bị bỏ (diffGui)',
    /tomTatMa\(selectedList\)/.test(panel) && /Số lượng đang nhập của các mã này sẽ bị xoá/.test(panel) && /diff\.bo\.length/.test(panel) && /diff\.moi\.length/.test(panel) && /sẽ bị bỏ/.test(panel));
  check('Hoàn tác tự hết hiệu lực (15 giây) và bị huỷ khi sửa số / thêm mã', /UNDO_MS = 15000/.test(panel) && /setUndo\(null\)/.test(panel) && /const setCell[\s\S]{0,120}setUndo\(null\)/.test(panel));
  check('checkbox có aria-label (từng dòng + chọn tất cả), ô chọn tất cả có indeterminate', /aria-label=\{`Chọn \$\{m\.sku\}`\}/.test(panel) && /aria-label="Chọn tất cả sản phẩm đang lọc"/.test(panel) && /indeterminate = chonTT\.indeterminate/.test(panel));
  check('hộp thêm: tìm không dấu (khopLoc/timSanPhamChuaCo), debounce, ≤ 50 dòng + "gõ thêm để thu hẹp", liên kết thêm mới, báo trùng mã + thêm vào kế hoạch',
    /useDebouncedValue/.test(modal) && /timSanPhamChuaCo/.test(modal) && /gõ thêm để thu hẹp/.test(modal) && /Không thấy sản phẩm\? Thêm mới vào danh mục/.test(modal) && /Mã này đã có — bấm để thêm vào kế hoạch/.test(modal) && /dungSanPhamMoi/.test(modal));
  check('lỗi lưu giữ form: onCreate trả { ok:false, error } -> setError, không đóng', /r\.ok === false\) setError/.test(modal) && /kq && kq\.ok === false\) return kq/.test(panel));
  check('Tạo mới từ đầu: làm kế hoạch TRỐNG (boKhoiKeHoach tất cả) + Hoàn tác', /boKhoiKeHoach\(inPlan, draftMap, inPlan\)/.test(panel));
  check('trạng thái rỗng: khối hướng dẫn lớn + nút "Thêm sản phẩm vào kế hoạch"; dòng chưa có SL hiện gợi ý', /sop-empty-plan/.test(panel) && /chưa nhập SL/.test(panel));

  console.log('\n' + '='.repeat(52));
  console.log(pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
