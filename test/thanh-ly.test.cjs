/**
 * thanh-ly.test.cjs — Bán hàng thanh lý (21/10/2026).   node test/thanh-ly.test.cjs
 *
 * Logic thuần (utils/thanhLy.js) gọi thẳng; phần giao diện (ThanhLy.jsx, thanhly/*.jsx, nối vào App / navMeta / api / OrdersReview)
 * soát bằng mã nguồn. Phần server nằm ở Karofi-ID/test/oem-api-thanh-ly.test.mjs.
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

(async () => {
  const t = await imp('utils/thanhLy.js');
  const nm = await imp('utils/navMeta.js');

  // ===========================================================================
  console.log('\n1. Lọc / tìm / nhóm');
  const IT = [
    { sku: '1001', name: 'Máy lọc nước K9', group: 'Máy lọc nước', qty: 15, pending: 8, avail: 7, price: 99000, priceSource: 'admin' },
    { sku: '2003030365', name: 'Lõi Nano V xanh DMAX LNT003 (DM)', group: 'Lõi', qty: 394, pending: 0, avail: 394, price: 54000, priceSource: 'kho1402', priceDate: '2026-03-01' },
    { sku: '2012010005', name: '(Mẫu) Màng RO', group: '', qty: 49, pending: 0, avail: 49, price: 0, priceSource: '' },
    { sku: '2007030101', name: 'Van điện từ 24/4U Spring', group: 'Linh kiện', qty: 32, pending: 32, avail: 0, price: 12000, priceSource: 'lichsu', priceDate: '2026-07-07' }
  ];
  check('tìm không dấu, không phân biệt hoa/thường: "mang ro" ra Màng RO', t.locTon(IT, { q: 'mang ro' }).map((i) => i.sku).join() === '2012010005');
  check('tìm theo mã', t.locTon(IT, { q: '2003030365' }).length === 1 && t.locTon(IT, { q: '1001' }).length === 1);
  check('nhiều từ: phải có ĐỦ mọi từ, thứ tự tuỳ ý ("nano lõi")', t.locTon(IT, { q: 'nano loi' }).length === 1 && t.locTon(IT, { q: 'nano van' }).length === 0);
  check('lọc theo nhóm; nhóm rỗng = "Chưa phân nhóm"', t.locTon(IT, { nhom: 'Lõi' }).length === 1 && t.locTon(IT, { nhom: t.NHOM_TRONG }).map((i) => i.sku).join() === '2012010005');
  check('chỉ mã còn hàng / chỉ mã có giá', t.locTon(IT, { chiConHang: true }).length === 3 && t.locTon(IT, { chiCoGia: true }).length === 3);
  check('lọc nguồn giá: chưa có / kho1402 / lichsu / admin', t.locTon(IT, { nguon: 'chua' }).length === 1 && t.locTon(IT, { nguon: 'kho1402' }).length === 1 && t.locTon(IT, { nguon: 'lichsu' }).length === 1 && t.locTon(IT, { nguon: 'admin' }).length === 1);
  const nh = t.danhSachNhom(IT);
  check('danh sách nhóm kèm số mã, "Chưa phân nhóm" xuống cuối', nh.length === 4 && nh[nh.length - 1].nhom === t.NHOM_TRONG && nh.find((g) => g.nhom === 'Lõi').soMa === 1, nh);

  // ===========================================================================
  console.log('\n2. Chọn bán + đơn');
  check('không chọn được: chưa có giá / hết hàng khả dụng (còn trong đơn chờ) ', /Chưa có giá/.test(t.lyDoKhongChon(IT[2])) && /đơn chờ duyệt/.test(t.lyDoKhongChon(IT[3])) && t.lyDoKhongChon(IT[0]) === '' && t.lyDoKhongChon({ price: 5, avail: 0, pending: 0 }) === 'Hết hàng');
  const sel = { '1001': '5', '2003030365': '10', KHONGCO: '3', '2007030101': '0', abc: 'x' };
  const dd = t.dongDon(sel, IT);
  check('dongDon bỏ mã không còn, SL 0, chữ rác; tính thành tiền', dd.length === 2 && dd[0].total === 495000 && dd[1].total === 540000, dd);
  const tg = t.tongDon(sel, IT);
  check('tongDon: 2 mã, 15 cái, 1.035.000', tg.soMa === 2 && tg.tongSl === 15 && tg.tongTien === 1035000, tg);
  check('SL lẻ bị làm tròn xuống', t.dongDon({ '1001': '2.9' }, IT)[0].qty === 2);
  const KH = { code: '1000700', codeSearch: 'TECOM' };
  check('loiDon: thiếu khách', t.loiDon({ '1001': '1' }, IT, null).some((x) => /Chưa chọn khách/.test(x)));
  check('loiDon: chưa chọn mã', t.loiDon({}, IT, KH).some((x) => /Chưa chọn mã/.test(x)));
  check('loiDon: vượt còn lại (còn 7, chọn 8)', t.loiDon({ '1001': '8' }, IT, KH).some((x) => /chọn 8 nhưng chỉ còn 7/.test(x)));
  check('loiDon: mã chưa có giá', t.loiDon({ '2012010005': '1' }, IT, KH).some((x) => /chưa có giá/.test(x)));
  check('loiDon: hợp lệ -> rỗng', t.loiDon({ '1001': '7', '2003030365': '1' }, IT, KH).length === 0);

  // ===========================================================================
  console.log('\n3. Giá: đọc chữ gõ, đặt hàng loạt');
  check('giaTuChuoi: 1.250.000 / 1,250,000 / 1250000 / 12.5 / "150.000 đ"', t.giaTuChuoi('1.250.000') === 1250000 && t.giaTuChuoi('1,250,000') === 1250000 && t.giaTuChuoi('1250000') === 1250000 && t.giaTuChuoi('12.5') === 13 && t.giaTuChuoi('150.000 đ') === 150000);
  check('giaTuChuoi: rỗng / rác / âm -> null, số 0 hợp lệ', t.giaTuChuoi('') === null && t.giaTuChuoi('abc') === null && t.giaTuChuoi('-5') === null && t.giaTuChuoi('0') === 0 && t.giaTuChuoi(null) === null);
  check('dinhDangTien kiểu Việt', t.dinhDangTien(1250000) === (1250000).toLocaleString('vi-VN') && t.dinhDangTien('x') === '0');
  const hienTai = (it) => it.price || 0;
  let kq = t.tinhGiaNhom(IT, hienTai, { kieu: 'dat', gia: '150.000', lam: 1000 });
  check('đặt giá chung 150.000 cho mọi mã đang lọc (kể cả mã chưa có giá)', Object.keys(kq).length === 4 && kq['1001'] === 150000 && kq['2012010005'] === 150000, kq);
  kq = t.tinhGiaNhom(IT, hienTai, { kieu: 'phanTram', phanTram: '-10', lam: 1000 });
  check('giảm 10%, làm tròn 1.000: 99.000 -> 89.000; 54.000 -> 49.000; mã chưa có giá KHÔNG đổi (không có gốc)', kq['1001'] === 89000 && kq['2003030365'] === 49000 && !('2012010005' in kq), kq);
  kq = t.tinhGiaNhom(IT, hienTai, { kieu: 'phanTram', phanTram: '5,5', lam: 1 });
  check('tăng 5,5% (dấu phẩy) làm tròn 1 đ', kq['1001'] === Math.round(99000 * 1.055), kq);
  check('chỉ trả mã ĐỔI giá thật (đặt giá = giá hiện tại thì bỏ qua)', Object.keys(t.tinhGiaNhom([IT[0]], hienTai, { kieu: 'dat', gia: '99000', lam: 1 })).length === 0);
  check('% rác / giá chung rác -> không đổi gì', Object.keys(t.tinhGiaNhom(IT, hienTai, { kieu: 'phanTram', phanTram: 'x' })).length === 0 && Object.keys(t.tinhGiaNhom(IT, hienTai, { kieu: 'dat', gia: '' })).length === 0);
  check('giá không bao giờ âm (giảm 150%)', t.tinhGiaNhom(IT, hienTai, { kieu: 'phanTram', phanTram: '-150', lam: 1 })['1001'] === 0);
  const tdg = t.thayDoiGia({ '1001': '99.000', '2003030365': '60000', '2012010005': 'abc', KHONGCO: '5' }, IT);
  check('thayDoiGia: chỉ ô khác giá hiện tại VÀ hợp lệ (99.000 = giá cũ bị bỏ, "abc" bị bỏ, mã lạ bị bỏ)', tdg.length === 1 && tdg[0].sku === '2003030365' && tdg[0].price === 60000, tdg);
  check('nhãn nguồn giá', t.nhanNguonGia(IT[2]) === 'Chưa có giá' && t.nhanNguonGia(IT[0]) === 'Admin nhập' && /kho 1402|xuất kho 1402/.test(t.nhanNguonGia(IT[1])) && /01\/03\/2026/.test(t.nhanNguonGia(IT[1])) && /gần nhất/.test(t.nhanNguonGia(IT[3])));

  // ===========================================================================
  console.log('\n4. Nối vào app (menu, tab con, api, App, đơn chờ duyệt)');
  const nav = nm.NAV.find((m) => m.id === 'thanh-ly');
  check('NAV có mục "Bán hàng thanh lý" (icon Recycle), là tab thật', !!nav && nav.icon === 'Recycle' && nm.TAB_IDS.includes('thanh-ly'));
  check('kế toán (account) KHÔNG vào được: không thuộc ACCOUNT_TAB_IDS, tabHopLe đẩy về mặc định', !nm.ACCOUNT_TAB_IDS.includes('thanh-ly') && nm.tabHopLe('thanh-ly', 'account') === nm.tabMacDinh('account') && nm.tabHopLe('thanh-ly', 'sale') === 'thanh-ly');
  check('3 tab con: order / price / rules, icon riêng', (nm.SUBTABS['thanh-ly'] || []).map((x) => x.id).join() === 'order,price,rules');
  const icons = nm.moiIcon().map((x) => x.icon);
  check('không icon nào trùng trong toàn app (luật navMeta)', new Set(icons).size === icons.length);
  const api = SRC('services/api.js');
  check('api.js: 7 hàm tl*/getThanhLy gọi đúng tên route', ['getThanhLy', 'tlRequestRefresh', 'tlSetPrices', 'tlSeedPrices', 'tlAddExclude', 'tlRemoveExclude', 'tlSubmitOrder'].every((f) => new RegExp("callApi\\('" + f + "'").test(api)));
  check('chỉ tlSubmitOrder bị chặn tự thử lại (gửi lại = đơn nhân đôi)', /NON_IDEMPOTENT_FNS = new Set\(\[[^\]]*'tlSubmitOrder'/.test(api) && !/NON_IDEMPOTENT_FNS = new Set\(\[[^\]]*'tlSetPrices'/.test(api));
  const app = SRC('App.jsx');
  check('App: tải ThanhLy bằng React.lazy + KeepAliveTab, báo đơn mới cho OrdersReview (ordersStale) và có đường mở Đơn chờ duyệt',
    /lazy\(\(\) => import\('\.\/components\/ThanhLy'\)\)/.test(app) && /isActive=\{activeTab === 'thanh-ly'\}/.test(app) && /<ThanhLy[\s\S]*?onOrderSaved=\{\(\) => setOrdersStale\(true\)\}[\s\S]*?onOpenOrders=\{\(\) => requestTab\('pending-orders'\)\}/.test(app));
  const orders = SRC('components/OrdersReview.jsx');
  check('Đơn chờ duyệt: đơn mã TL- có nhãn "Thanh lý · giá gồm VAT"', /laDonThanhLy = \(orderNo\) => \/\^TL-\/i/.test(orders) && /Thanh lý · giá gồm VAT/.test(orders));
  const main = SRC('components/ThanhLy.jsx');
  check('ThanhLy: tab Bộ lọc chỉ dựng cho admin/creator; nút "Cập nhật tồn ngay" chỉ admin/creator', /t\.id !== 'rules' \|\| laQuanTri/.test(main) && /\{laQuanTri && \(\s*<button onClick=\{yeuCauCapNhat\}/.test(main) && /\{laQuanTri && \(\s*<KeepAliveTab isActive=\{subView === 'rules'\}/.test(main));
  check('ThanhLy: cảnh báo khi dữ liệu chưa cập nhật hôm nay + tự hỏi lại khi đang chờ máy SAP', /updatedToday/.test(main) && /CHƯA cập nhật hôm nay/.test(main) && /setInterval/.test(main));
  const tk = SRC('components/thanhly/TonKhoPanel.jsx');
  check('TonKhoPanel: gửi server CHỈ mã + SL (giá do server quyết), xác nhận trước khi xuất, chống bấm đúp, báo OrdersReview', /items: dongs\.map\(\(d\) => \(\{ sku: d\.sku, qty: d\.qty \}\)\)/.test(tk) && /<ConfirmDialog/.test(tk) && /if \(dangGui\) return;/.test(tk) && /onOrderSaved\(\)/.test(tk));
  check('TonKhoPanel: leader (canOrder=false) không có cột chọn / khung đơn', /canOrder &&/.test(tk) && /const canOrder = !!data\.canOrder;/.test(tk));
  const bg = SRC('components/thanhly/BangGiaPanel.jsx');
  check('BangGiaPanel: ô giá + đặt hàng loạt chỉ khi canEdit; Lưu có xác nhận; cảnh báo thoát khi chưa lưu', /canEdit \? \(/.test(bg) && /\{canEdit && \(/.test(bg) && /<ConfirmDialog/.test(bg) && /useUnsavedGuard\(thayDoi\.length > 0/.test(bg));
  const bl = SRC('components/thanhly/BoLocPanel.jsx');
  check('BoLocPanel: thêm/xoá từ khoá (xoá có xác nhận) + bảng "Đang ẩn"', /tlAddExclude/.test(bl) && /tlRemoveExclude/.test(bl) && /<ConfirmDialog/.test(bl) && /Đang ẩn/.test(bl));

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})();
