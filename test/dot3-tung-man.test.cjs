/**
 * dot3-tung-man.test.cjs — Đợt 3 (10/10/2026): sửa từng màn (OEM).
 *
 *   node test/dot3-tung-man.test.cjs
 *
 * Logic thuần (formClean, errorText, ordersEdit, paging, transactionsExport, navMeta) gọi thẳng.
 * Component dùng chung (ReasonDialog, Pagination, Sidebar, TableState) được esbuild gói rồi render tĩnh.
 * Phần còn lại là trạng thái React bên trong màn lớn — soát bằng mã nguồn để chặn hồi quy; hành vi thật
 * (chuột/phím, lưu cả đơn, đổi khách, từ chối có lý do...) đã thử trên trình duyệt qua /ui-harness.html.
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
const rel = (f) => path.relative(path.join(ROOT, 'src'), f).replace(/\\/g, '/');
const jsxFiles = walk(path.join(ROOT, 'src')).filter((f) => /\.jsx$/.test(f) && !/[\\/]dev[\\/]/.test(f));
const khongCmt = (s) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

(async () => {
  // ===========================================================================
  console.log('\n1. Khách hàng / Sản phẩm: cắt khoảng trắng, so trùng, giá không âm');
  const fc = await imp('utils/formClean.js');
  check('catKhoangTrang cắt đầu-cuối kể cả NBSP / zero-width / BOM, giữ khoảng trắng ở giữa',
    fc.catKhoangTrang('  MAT 1000 ​﻿') === 'MAT 1000' && fc.catKhoangTrang(null) === '' && fc.catKhoangTrang(undefined) === '' && fc.catKhoangTrang(12) === '12');
  check('khoaMa: "MAT1000 " và "mat1000" cùng khoá (không phân biệt hoa/thường, đã cắt)', fc.khoaMa('MAT1000 ') === fc.khoaMa(' mat1000'));
  const ds = [{ id: 1, sku: 'MAT1000 ', name: 'A' }, { id: 2, sku: 'MAT2000', name: 'B' }];
  check('timMaTrung: mã dính dấu cách trong danh sách VẪN bị nhận ra là trùng', fc.timMaTrung(ds, (m) => m.sku, ' mat1000').id === 1);
  check('timMaTrung: loại chính bản ghi đang sửa; mã rỗng không bao giờ trùng; không trùng -> null',
    fc.timMaTrung(ds, (m) => m.sku, 'MAT1000', (m) => m.id === 1) === null && fc.timMaTrung(ds, (m) => m.sku, '   ') === null && fc.timMaTrung(ds, (m) => m.sku, 'ZZZ') === null && fc.timMaTrung(null, (m) => m.sku, 'A') === null);
  check('kiemGia: âm bị chặn, chữ bị chặn, rỗng/0/số dương hợp lệ',
    /không được âm/.test(fc.kiemGia(-1, 'Giá bán')) && /Giá bán/.test(fc.kiemGia(-0.5, 'Giá bán')) && /phải là một số/.test(fc.kiemGia('abc')) && fc.kiemGia('') === '' && fc.kiemGia(null) === '' && fc.kiemGia(0) === '' && fc.kiemGia('50000') === '' && fc.kiemGia('1.5') === '');

  const pm = SRC('components/ProductManagement.jsx');
  check('Sản phẩm: SKU/tên cắt khoảng trắng + so trùng với danh mục TRƯỚC khi gọi onAddMaterial, nháp giữ nguyên khi chặn',
    /catKhoangTrang\(newSku\)/.test(pm) && /timMaTrung\(materials, \(m\) => m\.sku, sku\)/.test(pm) && /sku,\s*\n\s*name,/.test(pm) && pm.indexOf('timMaTrung(materials') < pm.indexOf('await onAddMaterial(mat)'));
  check('Sản phẩm: ô giá có min="0" cả 2 form + chặn khi lưu (kiemGia) ở cả Thêm và Sửa',
    (pm.match(/type="number" min="0"/g) || []).length === 2 && (pm.match(/kiemGia\(/g) || []).length === 2);
  check('Sản phẩm: lưu hỏng vẫn GIỮ modal (kq.ok === false -> báo lỗi trong form, không đóng, không xoá chữ)',
    /kq\.ok === false\) \{ setAddError/.test(pm) && /kq\.ok === false\) \{ setEditError/.test(pm));
  const cm = SRC('components/ClientManagement.jsx');
  check('Khách hàng: mọi ô cắt khoảng trắng (catKhoangTrang), Code trùng khách KHÁC bị chặn sớm (loại chính mình), Search Code trùng không chặn',
    /catKhoangTrang\(f\.code\)/.test(cm) && /catKhoangTrang\(f\.codeSearch\)\.toUpperCase\(\)/.test(cm) && /timMaTrung\(clients,/.test(cm) && /c === editingClient/.test(cm) && cm.indexOf('timMaTrung(clients') < cm.indexOf('await onEditClient'));
  check('Khách hàng: lưu hỏng giữ modal (saveError) như Đợt 1', /kq && kq\.ok === false\) setSaveError/.test(cm));
  const css = SRC('index.css');
  check('CSS có .btn:disabled và .btn-ghost (đã làm Đợt 1/2, giữ)', /\.btn:disabled/.test(css) && /\.btn-ghost \{/.test(css));

  // ===========================================================================
  console.log('\n2. Đơn chờ duyệt: Lưu cả đơn, Copy SAP đúng số, thêm/xoá không mất sửa, tìm + lọc ngày');
  const oe = await imp('utils/ordersEdit.js');
  const rowsA = [
    { rowIndex: 10, orderNo: 'SO-A', sku: 'A1', name: 'Ao\tdài', qty: 1, price: 100, total: 100, clientCode: 'C1', clientCodeSearch: 'TECOM', createdAt: '09/10/2026 10:00', pic: 'Hải' },
    { rowIndex: 11, orderNo: 'SO-A', sku: 'A2', name: 'Quan', qty: 2, price: 50, total: 100, clientCode: 'C1', clientCodeSearch: 'TECOM', createdAt: '09/10/2026 10:00', pic: 'Hải' },
    { rowIndex: 12, orderNo: 'SO-A', sku: 'A3', name: 'Non', qty: 5, price: 10, total: 50, clientCode: 'C1', clientCodeSearch: 'TECOM', createdAt: '09/10/2026 10:00', pic: 'Hải' }
  ];
  const g1 = oe.giaTriDong(rowsA[0], { qty: '3', sku: ' B9 ' });
  check('giaTriDong: số đang sửa phủ lên số gốc; dòng có sửa -> Thành tiền = SL x Giá; cắt khoảng trắng SKU', g1.qty === 3 && g1.price === 100 && g1.total === 300 && g1.sku === 'B9');
  check('giaTriDong: dòng không sửa giữ Thành tiền server; ô giá xoá trắng -> 0 (không NaN)', oe.giaTriDong(rowsA[2], null).total === 50 && oe.giaTriDong(rowsA[0], { price: '' }).price === 0 && oe.giaTriDong(rowsA[0], { price: '' }).total === 0);
  const tsv = oe.dungTsvDon(rowsA, { 10: { qty: '3' }, 11: { price: '75' } });
  const dongTsv = tsv.trim().split('\n');
  check('Copy SAP lấy SỐ ĐANG SỬA: dòng 1 SL 3 / thành tiền 300, dòng 2 giá 75 / thành tiền 150 (không phải số cũ chưa sửa)',
    dongTsv[1] === 'A1\tAo dài\t3\t100\t300\tC1\tTECOM' && dongTsv[2] === 'A2\tQuan\t2\t75\t150\tC1\tTECOM' && dongTsv[3] === 'A3\tNon\t5\t10\t50\tC1\tTECOM', dongTsv);
  check('TSV: tab/xuống dòng trong tên vật tư không làm lệch cột (đổi thành dấu cách); 7 cột mỗi dòng', dongTsv.every((l) => l.split('\t').length === 7) && dongTsv.length === 4);
  check('dongDaSua chỉ lấy dòng có sửa', JSON.stringify(oe.dongDaSua(rowsA, { 11: { qty: 9 } }).map((r) => r.rowIndex)) === '[11]' && oe.dongDaSua(rowsA, {}).length === 0);

  let dangChay = 0, toiDa = 0; const thuTu = [];
  const kq = await oe.luuTuanTu([{ k: 1 }, { k: 2 }, { k: 3 }], async (it) => {
    dangChay++; toiDa = Math.max(toiDa, dangChay);
    await new Promise((r) => setTimeout(r, 5));
    thuTu.push(it.k); dangChay--;
    if (it.k === 2) throw new Error('Mã KH không hợp lệ');
    return it.k;
  });
  check('luuTuanTu: lần lượt (không bao giờ 2 lệnh ghi cùng lúc), đúng thứ tự', toiDa === 1 && JSON.stringify(thuTu) === '[1,2,3]');
  check('luuTuanTu: dòng 2 hỏng KHÔNG chặn dòng 3; kết quả từng dòng theo thứ tự', kq.length === 3 && kq[0].ok && !kq[1].ok && kq[1].error === 'Mã KH không hợp lệ' && kq[2].ok);
  const tt = oe.cauKetQuaLuu(kq, (it) => 'dòng ' + it.k);
  check('cauKetQuaLuu: nói rõ đã lưu 2/3, dòng nào hỏng + lý do, và số sửa dở được giữ', tt.daLuu === 2 && tt.loi === 1 && /Đã lưu 2\/3/.test(tt.text) && /dòng 2 \(Mã KH không hợp lệ\)/.test(tt.text) && /giữ nguyên/.test(tt.text));
  const loiTho = oe.cauKetQuaLuu([{ ok: true }, { ok: false, item: { sku: 'MAT1001' }, error: 'duplicate key value violates unique constraint "orders_pkey"' }], (it) => it.sku);
  check('cauKetQuaLuu: lỗi thô của dòng được dịch NGAY trong câu, vẫn giữ nhãn dòng (MAT1001) và không lộ tên ràng buộc', /MAT1001 \(Dữ liệu này đã có/.test(loiTho.text) && !/orders_pkey|duplicate/.test(loiTho.text) && /Mã tham chiếu: E-/.test(loiTho.text), loiTho.text);
  check('cauKetQuaLuu: tất cả ok -> "Đã lưu N dòng."', oe.cauKetQuaLuu([{ ok: true }, { ok: true }]).text === 'Đã lưu 2 dòng.' && (await oe.luuTuanTu([], async () => 1)).length === 0);

  // --- khôi phục sửa đổi sau chèn/xoá ---
  const cu = [
    { rowIndex: 2, orderNo: 'S', sku: 'A', name: 'a', qty: 1, price: 1, clientCode: 'C' },
    { rowIndex: 3, orderNo: 'S', sku: 'B', name: 'b', qty: 2, price: 2, clientCode: 'C' },
    { rowIndex: 4, orderNo: 'S', sku: 'C', name: 'c', qty: 3, price: 3, clientCode: 'C' }
  ];
  const suaB = { 3: { qty: '20' }, 4: { price: '30' } };
  // (a) id ổn định (Postgres): chèn thêm dòng id 99 -> sửa đổi giữ NGUYÊN, không mất
  let kp = oe.khoiPhucSuaDo(suaB, cu, [...cu, { rowIndex: 99, orderNo: 'S', sku: '', name: '', qty: 0, price: 0, clientCode: 'C' }]);
  check('chèn dòng (id ổn định): sửa đổi của dòng khác GIỮ NGUYÊN, không dòng nào mất', JSON.stringify(kp.edited) === JSON.stringify({ 3: { qty: '20' }, 4: { price: '30' } }) && kp.mat.length === 0, kp);
  // (b) chỉ số dịch (Sheet cũ): chèn trên dòng 2 -> A,B,C nay ở 3,4,5; sửa đổi phải đi theo nội dung
  const moiDich = [{ rowIndex: 2, orderNo: 'S', sku: '', name: '', qty: 0, price: 0, clientCode: 'C' }, { ...cu[0], rowIndex: 3 }, { ...cu[1], rowIndex: 4 }, { ...cu[2], rowIndex: 5 }];
  kp = oe.khoiPhucSuaDo(suaB, cu, moiDich);
  check('chỉ số dịch (backend cũ): sửa đổi đi theo NỘI DUNG dòng (B: 3->4, C: 4->5), không gắn nhầm vào dòng khác', JSON.stringify(kp.edited) === JSON.stringify({ 4: { qty: '20' }, 5: { price: '30' } }) && kp.mat.length === 0, kp);
  // (c) dòng bị xoá ở nơi khác -> bỏ + báo
  kp = oe.khoiPhucSuaDo(suaB, cu, [cu[0], cu[2]]);
  check('dòng đang sửa biến mất khỏi danh sách -> bỏ sửa đổi đó và BÁO (mat), dòng còn lại giữ', JSON.stringify(kp.edited) === JSON.stringify({ 4: { price: '30' } }) && kp.mat.length === 1 && kp.mat[0].sku === 'B', kp);
  check('boSuaDo: bỏ đúng các dòng chỉ định, không đụng bản gốc', JSON.stringify(oe.boSuaDo({ 1: { a: 1 }, 2: { b: 2 } }, [2])) === '{"1":{"a":1}}' && Object.keys(suaB).length === 2);

  // --- tìm + lọc ngày ---
  check('ngayDon theo GIỜ VN: dd/MM giữ nguyên; ISO UTC 17:30 ngày 31/10 là NGÀY 01/11 giờ VN; ISO ngày; rác -> null',
    oe.ngayDon('31/10/2026 23:30') === '2026-10-31' && oe.ngayDon('2026-10-31T17:30:00Z') === '2026-11-01' && oe.ngayDon('2026-10-05') === '2026-10-05' && oe.ngayDon('abc') === null && oe.ngayDon('') === null);
  const khach = new Map([['C1', { code: 'C1', name: 'Công ty Hoàng Phát', alias: 'HP' }]]);
  const groups = [
    ['SO-A', [{ ...rowsA[0], createdAt: '31/10/2026 23:30' }]],
    ['SO-B', [{ rowIndex: 20, orderNo: 'SO-B', sku: 'X1', name: 'Mút xốp', qty: 1, price: 1, total: 1, clientCode: 'C9', clientCodeSearch: 'MAXIM', createdAt: '2026-10-31T17:30:00Z' }]],
    ['SO-C', [{ rowIndex: 30, orderNo: 'SO-C', sku: 'Y1', name: 'Ống', qty: 1, price: 1, total: 1, clientCode: 'C1', clientCodeSearch: 'HP', createdAt: '15/09/2026 09:00' }]],
    ['SO-D', [{ rowIndex: 40, orderNo: 'SO-D', sku: 'Z1', name: 'Zin', qty: 1, price: 1, total: 1, clientCode: 'C9', clientCodeSearch: 'MAXIM', createdAt: 'không đọc được' }]]
  ];
  const ten = (arr) => arr.map((g) => g[0]).join(',');
  check('lọc ngày Từ–Đến gồm cả hai đầu, theo giờ VN (SO-B 17:30Z ngày 31/10 thuộc 01/11)', ten(oe.locNhomDon(groups, { tu: '2026-10-31', den: '2026-10-31' })) === 'SO-A' && ten(oe.locNhomDon(groups, { tu: '2026-11-01', den: '2026-11-01' })) === 'SO-B');
  check('lọc ngày: chỉ "Từ" hoặc chỉ "Đến"; đơn không đọc được ngày bị loại khi đang lọc ngày (không đoán bừa)', ten(oe.locNhomDon(groups, { tu: '2026-10-01' })) === 'SO-A,SO-B' && ten(oe.locNhomDon(groups, { den: '2026-09-30' })) === 'SO-C');
  check('tìm theo Mã SO / mã VT / mã khách chữ (không phân biệt hoa-thường)', ten(oe.locNhomDon(groups, { q: 'so-c' })) === 'SO-C' && ten(oe.locNhomDon(groups, { q: 'x1' })) === 'SO-B' && ten(oe.locNhomDon(groups, { q: 'maxim' })) === 'SO-B,SO-D');
  check('tìm theo TÊN khách đầy đủ + alias, không cần gõ dấu ("hoang phat" ra "Hoàng Phát")', ten(oe.locNhomDon(groups, { q: 'hoang phat', khachTheoMa: khach })) === 'SO-A,SO-C' && ten(oe.locNhomDon(groups, { q: 'hp', khachTheoMa: khach })) === 'SO-A,SO-C' && ten(oe.locNhomDon(groups, { q: 'hoang phat' })) === '');
  check('tìm + ngày kết hợp (AND); không lọc gì -> trả nguyên danh sách; coLocDon', ten(oe.locNhomDon(groups, { q: 'maxim', tu: '2026-11-01' })) === 'SO-B' && oe.locNhomDon(groups, {}) === groups && oe.coLocDon({ q: ' ' }) === false && oe.coLocDon({ den: '2026-01-01' }) === true);

  const or = SRC('components/OrdersReview.jsx');
  check('Đơn chờ duyệt: có nút "Lưu cả đơn (N)" gọi handleSaveOrder -> luuTuanTu (tuần tự), báo từng dòng bằng cauKetQuaLuu',
    /Lưu cả đơn \(\$\{soSuaDon\}\)/.test(or) && /luuTuanTu\(dirty, luuMotDong\)/.test(or) && /cauKetQuaLuu\(kq/.test(or));
  check('Lưu: chỉ xoá bản sửa nếu người dùng chưa gõ thêm trong lúc chờ (so tham chiếu), lỗi giữ nguyên sửa dở', /prev\[row\.rowIndex\] !== sua\) return prev/.test(or));
  check('Lưu cả đơn khoá nút Lưu từng dòng + chèn/xoá (savingOrderNo) để hai đường không chồng nhau', /savingRow === row\.rowIndex \|\| !!savingOrderNo/.test(or) && /if \(savingOrderNo\) return;/.test(or));
  check('Copy dán SAP: dựng TSV từ số đang sửa (dungTsvDon), còn dòng dirty thì HỎI (ConfirmDialog "Lưu rồi Copy"), không copy số chưa lưu',
    /dungTsvDon\(rows, editedRef\.current\)/.test(or) && /confirmLabel: 'Lưu rồi Copy'/.test(or) && /cancelLabel: 'Để sau'/.test(or) && /kq\.some\(\(r\) => !r\.ok\)\) return;/.test(or) && !/r\.sku\}\\t\$\{r\.name\}/.test(or));
  check('Copy: chụp TSV TRƯỚC khi lưu (sau lưu bản sửa bị xoá) và có lối ra khi trình duyệt chặn clipboard', /const tsv = dungTsvDon\(rows, editedRef\.current\);\s*\/\/ chụp số đang sửa TRƯỚC/.test(or) && /navigator\.clipboard\.writeText\(tsv\)/.test(or) && /catch \(err\) \{\s*\n\s*\/\/ Trình duyệt chỉ cho sao chép/.test(or));
  check('Thêm/xoá dòng KHÔNG còn setEditedRows({}) — dùng taiLaiGiuSua (khôi phục theo nội dung); xoá đơn chỉ bỏ sửa đổi của chính đơn đó',
    !/setEditedRows\(\{\}\)/.test(or) && (or.match(/await taiLaiGiuSua\(/g) || []).length === 3 && /taiLaiGiuSua\(ids\)/.test(or) && /taiLaiGiuSua\(\[row\.rowIndex\]\)/.test(or));
  check('Có ô tìm (debounce) + lọc ngày Từ/Đến + "Xoá lọc" + banner đơn sửa dở bị lọc ẩn', /useDebouncedValue\(searchTerm\)/.test(or) && /type="date"/.test(or) && /Xoá lọc/.test(or) && /donSuaDoBiAn/.test(or) && /locNhomDon\(groups/.test(or));
  check('F5/đổi tab chỉ cảnh báo với dòng còn tồn tại (soDongChuaLuu), tải lại thường dọn sửa đổi của dòng đã biến mất', /useUnsavedGuard\(soDongChuaLuu > 0/.test(or) && /giuSua === true/.test(or));

  // ===========================================================================
  console.log('\n3. Lịch sử doanh thu: debounce, xuất Excel, phân trang');
  const pg = await imp('utils/paging.js');
  check('chuanTrang: gõ 9999 trên 160 trang -> 160; 0/âm -> 1; "  7 " -> 7; chữ -> null', pg.chuanTrang('9999', 160) === 160 && pg.chuanTrang('0', 160) === 1 && pg.chuanTrang('-5', 160) === 1 && pg.chuanTrang('  7 ', 160) === 7 && pg.chuanTrang('abc', 160) === null && pg.chuanTrang('', 10) === null && pg.chuanTrang(5, 0) === 1);
  check('tongSoTrang: 4000 dòng / 25 = 160 trang; rỗng vẫn 1 trang; coTrangHopLe: rác -> mặc định', pg.tongSoTrang(4000, 25) === 160 && pg.tongSoTrang(0, 25) === 1 && pg.tongSoTrang(4001, 200) === 21 && pg.coTrangHopLe(100) === 100 && pg.coTrangHopLe(33) === 25 && pg.coTrangHopLe('x', 50) === 50);
  const tx = await imp('utils/transactionsExport.js');
  const txRows = [{ date: '09/10/2026', orderNo: 'SO1', clientCode: 'TECOM', clientName: 'Tecom', sku: 'M1', skuName: 'Ống', qty: 3, price: 1000, netRevenue: 3000, sale: 'KH Hải', group: 'LK', month: 'T10-2026' }, { date: '2026-10-05', qty: '2' }];
  const xr = tx.dongXuatDoanhThu(txRows);
  check('dongXuatDoanhThu: đủ 12 cột đúng tên + thứ tự, số là số, ngày dd/mm/yyyy, thiếu trường không nổ',
    Object.keys(xr[0]).join('|') === tx.COT_XUAT_DOANH_THU.join('|') && xr[0]['DT thuần (VND)'] === 3000 && xr[0]['Ngày chứng từ'] === '09/10/2026' && xr[1]['Ngày chứng từ'] === '05/10/2026' && xr[1]['Số lượng'] === 2 && xr[1]['Order SO'] === '' && tx.dongXuatDoanhThu(null).length === 0);
  check('tenFileDoanhThu: theo tháng / cả năm, không ký tự lạ', tx.tenFileDoanhThu('T10-2026', 2026, '10-10-2026') === 'Lich_su_doanh_thu_T10-2026_10-10-2026.xlsx' && tx.tenFileDoanhThu('ALL', 2026, '10-10-2026') === 'Lich_su_doanh_thu_Nam_2026_10-10-2026.xlsx');
  const tg = SRC('components/TransactionGrid.jsx');
  check('Lịch sử doanh thu: ô tìm debounce (useDebouncedValue) và bộ lọc dùng giá trị đã debounce', /useDebouncedValue\(searchTerm\)/.test(tg) && /debouncedSearch\.trim\(\)\.toLowerCase\(\)/.test(tg) && !/const q = searchTerm\.trim/.test(tg));
  check('Xuất Excel: xlsx tải LƯỜI (import động), xuất đúng kết quả đang lọc + sắp xếp (sortedData, không chỉ trang đang xem)', /await import\('xlsx'\)/.test(tg) && /dongXuatDoanhThu\(sortedData\)/.test(tg) && !/^import .*xlsx/m.test(tg));
  check('Cỡ trang chọn được (25/50/100/200), nhớ qua F5, đổi cỡ về trang 1', /usePersistentState\('tx\.pageSize'/.test(tg) && /onPageSizeChange=\{\(n\) => \{ setPageSize\(n\); setCurrentPage\(1\); \}\}/.test(tg));

  // ===========================================================================
  console.log('\n4. Bảng giá: chọn khách tìm được, đổi khách, Từ chối có lý do, duyệt xong ở lại');
  const pp = SRC('components/pricing/PriceProposePanel.jsx');
  check('Chọn khách = Combobox gõ để lọc (không còn <select> khách), có "Áp dụng chung" ở đầu, bỏ trùng theo Search Code',
    /<Combobox/.test(pp) && !/clients\.map\(\(c\) => <option/.test(pp) && /KHACH_CHUNG/.test(pp) && /seen\.has\(c\.codeSearch\)/.test(pp) && /chuanTim/.test(pp));
  check('Combobox khách: dựng lại theo khách đã chọn (key), rời ô thì trả về lựa chọn thật (restoreText), khoá khi đang gửi',
    /key=\{clientCode \|\| '__chung__'\}/.test(pp) && /restoreText=\{nhanDangChon\}/.test(pp) && /disabled=\{isSaving\}/.test(pp) && /restoreText/.test(SRC('components/Combobox.jsx')));
  check('Đổi khách còn nháp -> hỏi (ConfirmDialog nói rõ từ khách nào sang khách nào) rồi BỎ nháp (setDraftMap({})); không còn nháp thì đổi ngay',
    /if \(draftCount > 0\) \{ setPendingClientCode\(code\); return; \}/.test(pp) && /setDraftMap\(\{\}\);\s*\n\s*setClientCode\(pendingClientCode/.test(pp) && /Bấm "Ở lại"/.test(pp) && /Bỏ nháp và đổi khách/.test(pp));
  const pa = SRC('components/pricing/PriceApprovePanel.jsx');
  check('Từ chối: ReasonDialog (lý do bắt buộc) thay ConfirmDialog, lý do gửi kèm làm tham số note của rejectPriceBatch',
    /<ReasonDialog/.test(pa) && /handleReject = async \(lyDo\)/.test(pa) && /api\.rejectPriceBatch\(token, currentBatch\.batchId, String\(lyDo \|\| ''\)\.trim\(\)\)/.test(pa) && !/rejectPriceBatch\(token, currentBatch\.batchId, ''\)/.test(pa));
  check('Ô giá/SL ở màn duyệt: min=0 và kẹp số âm về 0', (pa.match(/type="number" min="0"/g) || []).length === 3 && /Math\.max\(0, parseFloat\(value\) \|\| 0\)/.test(pa));
  const ppr = SRC('components/ProductPricing.jsx');
  check('Duyệt xong KHÔNG đẩy về tab Danh Mục (onApproved không setSubView), vẫn nạp lại dữ liệu nền', /onApproved=\{\(\) => \{ if \(onDataChanged\) onDataChanged\(\['materials'\]\); \}\}/.test(ppr) && !/onApproved=\{[^}]*setSubView\('catalog'\)/.test(ppr));
  check('ProductPricing import useState (trước Đợt 3 thiếu -> mở "Sản phẩm & Bảng giá" là lỗi ReferenceError)', /import React, \{ useState \} from 'react'/.test(ppr));

  const E = require('esbuild');
  const out = E.buildSync({
    stdin: {
      contents: "import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';" +
        "import ReasonDialog from './src/components/ReasonDialog.jsx'; import Pagination from './src/components/Pagination.jsx';" +
        "import Sidebar from './src/components/Sidebar.jsx'; import TableState from './src/components/TableState.jsx';" +
        "const h = React.createElement; const r = (c, p, ...k) => renderToStaticMarkup(h(c, p, ...k));" +
        "export const ve = { ReasonDialog: (p) => r(ReasonDialog, p), Pagination: (p) => r(Pagination, p), Sidebar: (p) => r(Sidebar, p), TableState: (p, k) => r(TableState, p, k) };",
      resolveDir: ROOT, loader: 'jsx'
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' }
  });
  const tmp = path.join(os.tmpdir(), 'oem-dot3-' + process.pid + '.cjs');
  fs.writeFileSync(tmp, out.outputFiles[0].text);
  const { ve } = require(tmp);
  fs.unlinkSync(tmp);
  const noop = () => {};

  let html = ve.ReasonDialog({ title: 'Từ chối đợt?', message: 'M', reasonLabel: 'Lý do từ chối', confirmLabel: 'Từ Chối', danger: true, onConfirm: noop, onCancel: noop });
  check('ReasonDialog: role=alertdialog + aria-modal, có ô nhiều dòng bắt buộc (data-autofocus, aria-required), nhãn "Lý do từ chối *"', /role="alertdialog"/.test(html) && /aria-modal="true"/.test(html) && /<textarea[^>]*data-autofocus/.test(html) && /aria-required="true"/.test(html) && /Lý do từ chối \*/.test(html));
  check('ReasonDialog: chưa nhập lý do -> nút "Từ Chối" bị khoá + gợi ý "Bắt buộc"; danger -> nút đỏ', /<button[^>]*btn-danger[^>]*disabled[^>]*>Từ Chối<|<button[^>]*disabled[^>]*btn-danger[^>]*>Từ Chối</.test(html) && /Bắt buộc, tối thiểu 3 ký tự/.test(html));
  const rd = SRC('components/ReasonDialog.jsx');
  check('ReasonDialog: chỉ xác nhận khi đủ ký tự (sau khi cắt khoảng trắng) và không busy; gửi lý do đã cắt; Esc/nền huỷ qua DialogShell', /const duDai = sach\.length >= minLength/.test(rd) && /if \(!busy && duDai\) onConfirm\(sach\)/.test(rd) && /onEscape=\{onCancel\}/.test(rd) && /onBackdrop=\{onCancel\}/.test(rd) && /import DialogShell/.test(rd));
  html = ve.Pagination({ page: 5, pageSize: 25, totalItems: 4000, onPageChange: noop, onPageSizeChange: noop });
  check('Pagination: có Đầu / Trước / ô "tới trang" (aria-label, /160) / Sau / Cuối', /aria-label="Về trang đầu"[^>]*>Đầu</.test(html) && />Trước</.test(html) && /aria-label="Tới trang \(1–160\)"/.test(html) && /\/ 160/.test(html) && />Sau</.test(html) && /aria-label="Tới trang cuối"[^>]*>Cuối</.test(html), html.slice(0, 300));
  check('Pagination: ô chọn cỡ trang 25/50/100/200 khi có onPageSizeChange, đúng cỡ đang chọn', /aria-label="Số dòng mỗi trang"/.test(html) && /<option value="25" selected|<option value="25"[^>]*selected/.test(html) && /<option value="200"/.test(html));
  check('Pagination: trang đầu -> Đầu/Trước khoá; trang cuối -> Sau/Cuối khoá', /disabled=""[^>]*aria-label="Về trang đầu"|aria-label="Về trang đầu"[^>]*disabled/.test(ve.Pagination({ page: 1, pageSize: 25, totalItems: 100, onPageChange: noop })) && /aria-label="Tới trang cuối"[^>]*disabled|disabled=""[^>]*aria-label="Tới trang cuối"/.test(ve.Pagination({ page: 4, pageSize: 25, totalItems: 100, onPageChange: noop })));
  html = ve.Pagination({ page: 1, pageSize: 25, totalItems: 10, onPageChange: noop });
  check('Pagination: 1 trang -> không hiện nút điều hướng, không có ô chọn cỡ nếu không truyền onPageSizeChange; vẫn ghi tổng số', !/Đầu/.test(html) && !/Số dòng mỗi trang/.test(html) && /10/.test(html) && ve.Pagination({ page: 1, pageSize: 25, totalItems: 0, onPageChange: noop }) === '');

  // ===========================================================================
  console.log('\n5. Kế hoạch KD: đổi tháng không cần F5');
  const sp = SRC('components/salesplan/SalesPlanProposePanel.jsx');
  check('Có nút "Đổi tháng" ở màn nhập (sau khi đã xác nhận tháng) -> quay về bước chọn tháng (setPeriodConfirmed(false))', /Tháng \{month\} · Đổi tháng/.test(sp) && /yeuCauDoiThang/.test(sp) && /setPeriodConfirmed\(false\)/.test(sp));
  check('Còn nháp chưa lưu -> hỏi xác nhận ("Bỏ nháp và đổi tháng", "Ở lại"); không còn nháp -> đổi ngay',
    /if \(pendingCodes\.length\) setHoiDoiThang\(true\); else doiThang\(\)/.test(sp) && /confirmLabel="Bỏ nháp và đổi tháng"/.test(sp) && /cancelLabel="Ở lại"/.test(sp));
  check('Đổi tháng dọn sạch nháp/đã-lưu/khách thêm tay (nháp gắn theo THÁNG, giữ lại là ghi số tháng này vào tháng kia)', /doiThang = \(\) => \{[\s\S]*?setDraftMap\(\{\}\);[\s\S]*?setSavedMap\(\{\}\);[\s\S]*?setExtraCodes\(\[\]\);[\s\S]*?setPeriodConfirmed\(false\)/.test(sp));

  // ===========================================================================
  console.log('\n6. Toàn app: nhãn Sheet cũ, thẻ Karofi AI Engine, tab mặc định theo vai trò');
  const nm = await imp('utils/navMeta.js');
  check('tabMacDinh: Sale/Creator -> ai-agent; admin/leader/lead -> revenue-reports; kế toán -> products; vai trò lạ -> ai-agent',
    nm.tabMacDinh('sale') === 'ai-agent' && nm.tabMacDinh('creator') === 'ai-agent' && nm.tabMacDinh('admin') === 'revenue-reports' && nm.tabMacDinh('leader') === 'revenue-reports' && nm.tabMacDinh('lead') === 'revenue-reports' && nm.tabMacDinh('ADMIN') === 'revenue-reports' && nm.tabMacDinh('account') === 'products' && nm.tabMacDinh(undefined) === 'ai-agent');
  check('tab ĐÃ NHỚ vẫn thắng mặc định (admin + "ai-agent" đã nhớ -> ai-agent); chưa nhớ/rác -> mặc định vai trò; tab mặc định luôn hợp lệ',
    nm.tabHopLe('ai-agent', 'admin') === 'ai-agent' && nm.tabHopLe('sop', 'leader') === 'sop' && nm.tabHopLe(null, 'admin') === 'revenue-reports' && nm.tabHopLe('ten-la', 'leader') === 'revenue-reports' && nm.tabHopLe(undefined, 'sale') === 'ai-agent' && nm.TAB_IDS.includes(nm.tabMacDinh('admin')));
  check('kế toán không bị đẩy vào báo cáo; tab AI đã nhớ của kế toán vẫn bị chặn', nm.tabHopLe(null, 'account') === 'products' && nm.tabHopLe('ai-agent', 'account') === 'products' && nm.tabHopLe('revenue-reports', 'account') === 'products');
  const app = SRC('App.jsx');
  check('App: đăng nhập xong dùng tab đã nhớ của NGƯỜI MỚI (readUi null) hoặc mặc định vai trò — không thừa hưởng activeTab của người trước, và không ghi mặc định vào bộ nhớ',
    /setActiveTabRaw\(tabHopLe\(readUi\('tab', null\), newSession\?\.user\?\.role\)\)/.test(app) && !/readUi\('tab', activeTab\)/.test(app) && !/setActiveTab\('products'\)/.test(app));
  const sb = SRC('components/Sidebar.jsx');
  check('Sidebar: bỏ thẻ "Karofi AI Engine" + Sparkles; thay bằng vai trò + phiên bản (nhanVaiTro, version trong package.json)', !/Karofi AI Engine/.test(sb) && !/Sparkles/.test(sb) && /nhanVaiTro\(activeUser\.role/.test(sb) && /version as APP_VERSION/.test(sb));
  html = ve.Sidebar({ activeTab: 'ai-agent', setActiveTab: noop, isCollapsed: false, onToggleCollapse: noop, isMobileOpen: false, onCloseMobile: noop, transactionCount: 0, activeUser: { name: 'hai', role: 'admin', saleId: '' } });
  const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  check('Sidebar render: hiện "Admin" và "OEM Portal · v' + ver + '", không còn "Karofi AI Engine"', />Admin</.test(html) && html.includes('OEM Portal · v' + ver) && !/Karofi AI Engine/.test(html), html.slice(-400));
  html = ve.Sidebar({ activeTab: 'ai-agent', setActiveTab: noop, isCollapsed: true, onToggleCollapse: noop, isMobileOpen: false, onCloseMobile: noop, transactionCount: 0, activeUser: { name: 'hai', role: 'admin', saleId: '' } });
  check('Sidebar thu gọn: không hiện chân menu (tiết kiệm chỗ)', !/OEM Portal/.test(html));

  const cu_ten = /Plan_Thang|Gia_KhachHang|\bPlan2026\b|Gia_DeXuat|Plan_Update|trên Products|Google Apps Script|từ backend|\btab \"(Data|Debt|Products|Clients|Orders|Kits)\"/;
  const sot = [];
  jsxFiles.forEach((f) => khongCmt(fs.readFileSync(f, 'utf8')).split('\n').forEach((l, i) => {
    if (cu_ten.test(l)) sot.push(rel(f) + ':' + (i + 1) + ' ' + l.trim().slice(0, 90));
  }));
  check('không còn nhãn HIỂN THỊ nào trỏ tên tab Sheet cũ (Plan_Thang, Gia_KhachHang, Plan2026, Gia_DeXuat, Plan_Update, "trên Products", Apps Script, "từ backend")', sot.length === 0, sot);
  check('tiêu đề cột đổi "Plan_Update" -> "Plan update" ở cả 3 bảng kế hoạch', ['salesplan/SalesPlanViewPanel.jsx', 'salesplan/SalesPlanProposePanel.jsx', 'salesplan/SalesPlanApprovePanel.jsx'].every((f) => />Plan update</.test(SRC('components/' + f))));

  // ===========================================================================
  console.log('\n7. Lỗi Postgres/server thô -> tiếng Việt + mã tham chiếu; CLAUDE.md đúng Supabase');
  const et = await imp('utils/errorText.js');
  const logGoc = console.error; console.error = () => {};
  const dup = et.lamSachLoi(new Error('duplicate key value violates unique constraint "products_sku_key"'));
  check('duplicate key -> câu tiếng Việt "trùng mã", kèm "Mã tham chiếu: E-XXXX", KHÔNG lộ tên ràng buộc/bảng', /đã có trong hệ thống/.test(dup) && /\(Mã tham chiếu: E-[0-9A-F]{4}\)$/.test(dup) && !/products_sku_key|constraint|duplicate/i.test(dup), dup);
  const goc = 'Không lưu được thay đổi: relation "oem.orders" does not exist';
  const tien = et.lamSachLoi(goc);
  check('giữ phần mở đầu tiếng Việt, chỉ thay phần lỗi thô; không lộ "oem.orders"', tien.startsWith('Không lưu được thay đổi: ') && /Lỗi hệ thống phía máy chủ/.test(tien) && !/oem\.orders|relation/.test(tien) && /Mã tham chiếu: E-/.test(tien), tien);
  check('nhận ra các mẫu thường gặp: foreign key, not-null, check, input syntax, permission, timeout, network, JSON hỏng, deadlock, 502',
    [['update or delete on table "x" violates foreign key constraint', /đang được dùng ở nơi khác/], ['null value in column "name" violates not-null constraint', /Thiếu thông tin bắt buộc/],
      ['new row violates check constraint "price_pos"', /không hợp lệ/], ['invalid input syntax for type numeric: "abc"', /sai định dạng/], ['permission denied for table orders', /không có quyền/],
      ['canceling statement due to statement timeout', /quá lâu/], ['Failed to fetch', /Không kết nối được/], ['Unexpected token < in JSON at position 0', /không đọc được/], ['deadlock detected', /đang bận/], ['502 Bad Gateway', /sự cố tạm thời/]]
      .every(([raw, re]) => re.test(et.lamSachLoi(raw))));
  check('câu đã là TIẾNG VIỆT (có dấu) giữ NGUYÊN — kể cả câu nghiệp vụ của server và câu lỗi mạng của api.js',
    et.lamSachLoi('Mã KH 1000700 đã có trong danh bạ — dùng nút Sửa của khách đó.') === 'Mã KH 1000700 đã có trong danh bạ — dùng nút Sửa của khách đó.' &&
    et.lamSachLoi('Không kết nối được tới máy chủ — mạng có thể đang chập chờn.') === 'Không kết nối được tới máy chủ — mạng có thể đang chập chờn.' && et.lamSachLoi('') === '' && et.lamSachLoi(null) === '');
  check('tiếng Việt KHÔNG DẤU của server (vd "Khong co quyen them san pham moi.") không bị nhầm là lỗi thô', et.lamSachLoi('Khong co quyen them san pham moi.') === 'Khong co quyen them san pham moi.' && et.lamSachLoi('Thieu ma SKU.') === 'Thieu ma SKU.');
  const la = et.lamSachLoi('Something went wrong while processing the request: invalid state');
  check('câu tiếng Anh không khớp mẫu nào vẫn không hiện nguyên: khung chung + mã tham chiếu', /không rõ nguyên nhân/.test(la) && /Mã tham chiếu/.test(la) && !/Something went wrong/.test(la), la);
  check('idempotent (chạy lại trên kết quả không đổi gì, không chồng mã) và mã tham chiếu ổn định theo câu gốc',
    et.lamSachLoi(dup) === dup && et.lamSachLoi(tien) === tien && et.maThamChieu('abc') === et.maThamChieu('abc') && et.maThamChieu('abc') !== et.maThamChieu('abd') && /^E-[0-9A-F]{4}$/.test(et.maThamChieu('xyz')));
  const op = await imp('utils/optimistic.js');
  const r1 = await op.chayLacQuan(() => {}, () => {}, async () => { throw new Error('duplicate key value violates unique constraint "clients_code_key"'); }, 'Không ghi được khách hàng mới');
  check('chayLacQuan: lỗi Postgres thô qua lớp dịch -> modal Khách/Sản phẩm hiện tiếng Việt (error), không lộ tên bảng', r1.ok === false && /^Không ghi được khách hàng mới: Dữ liệu này đã có/.test(r1.error) && !/clients_code_key/.test(r1.error), r1);
  const ts = SRC('components/ToastProvider.jsx'), tb = SRC('components/TableState.jsx');
  check('toast.error và TableState (lỗi + Thử lại) đều đi qua lamSachLoi', /api\.current\.error = \(m, o\) => push\(lamSachLoi\(m\), 'error', o\)/.test(ts) && /\{errorPrefix\}: \{lamSachLoi\(error\)\}/.test(tb));
  html = ve.TableState({ error: 'relation "oem.orders" does not exist', errorPrefix: 'Không tải được', onRetry: noop });
  check('TableState render: lỗi thô -> tiếng Việt + mã tham chiếu, nút Thử lại vẫn còn', /Không tải được: Lỗi hệ thống/.test(html) && /Mã tham chiếu: E-/.test(html) && !/oem\.orders/.test(html) && /Thử lại/.test(html), html);
  const lamSachGoi = ['App.jsx', 'components/LoginModal.jsx', 'components/ChangePasswordModal.jsx', 'components/transactions/NhipDoanhThu.jsx', 'components/transactions/CaoSapPanel.jsx', 'components/products/BomModal.jsx'];
  check('các chỗ hiện lỗi trực tiếp (không qua toast/TableState) cũng dùng lamSachLoi: ' + lamSachGoi.length + ' file', lamSachGoi.every((f) => /lamSachLoi\(/.test(SRC(f))));

  console.error = logGoc;

  const md = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n');
  const muc = md.slice(md.indexOf('## Deploy'), md.indexOf('## Chạy tay'));
  check('CLAUDE.md mục Deploy: backend là Supabase Edge Function oem-api (functions deploy), client là GitHub Pages — không còn lệnh clasp push/redeploy làm hướng dẫn',
    /supabase functions deploy oem-api/.test(muc) && /GitHub Actions/.test(muc) && /Karofi-ID/.test(muc) && !/^cd .*clasp push/m.test(muc) && !/^```bash\ncd .*\/gas/m.test(muc) && /đóng\s+băng/.test(muc));

  // ===========================================================================
  console.log('\nKhông lọt harness vào bản build + script test');
  const distHarness = fs.existsSync(path.join(ROOT, 'dist')) ? walk(path.join(ROOT, 'dist')).filter((f) => /harness/i.test(path.basename(f))) : [];
  check('dist/ không chứa file harness; không file nguồn ngoài src/dev import uiHarness', distHarness.length === 0 && jsxFiles.every((f) => !/uiHarness/.test(fs.readFileSync(f, 'utf8'))));
  check('npm test chạy cả dot3-tung-man.test.cjs', /node test\/dot3-tung-man\.test\.cjs/.test(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')));

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
