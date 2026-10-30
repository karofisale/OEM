/**
 * cai-dat-he-thong.test.cjs — Cài đặt HỆ THỐNG: VAT + % LNG mặc định + trang của master (14/10/2026).
 *
 *   node test/cai-dat-he-thong.test.cjs
 *
 * Logic thuần (utils/systemSettings.js) gọi thẳng; kho giá trị (services/systemValues.js) chạy với máy chủ giả (fail-soft, mặc định,
 * đua phiên); VAT trong tổng đơn hàng (services/aiAgent.js) gọi thẳng với hệ số truyền vào và với hệ số đọc từ kho. Phần giao diện
 * (SystemSettings.jsx, nối vào App/Navbar/Sidebar/máy tính giá) soát bằng mã nguồn; hành vi thật đã thử trên trình duyệt qua
 * /ui-harness.html?role=creator (xem báo cáo cuối việc).
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
const gan = (a, b) => Math.abs(a - b) < 1e-9;

(async () => {
  const ss = await imp('utils/systemSettings.js');

  // ===========================================================================
  console.log('\n1. Mặc định + làm sạch phản hồi getSystemValues');
  check('mặc định có sẵn: VAT 0.08, % LNG 20 (đúng hành vi trước khi có cài đặt hệ thống)', ss.SYS_DEFAULTS['oem.vatRate'] === 0.08 && ss.SYS_DEFAULTS['oem.defaultMargin'] === 20);
  check('phản hồi đúng -> lấy giá trị máy chủ', JSON.stringify(ss.lamSachGiaTriHeThong({ values: { 'oem.vatRate': 0.1, 'oem.defaultMargin': 25 } })) === JSON.stringify({ 'oem.vatRate': 0.1, 'oem.defaultMargin': 25 }));
  check('thiếu khoá -> khoá đó về mặc định, luôn đủ mọi khoá đã biết', JSON.stringify(ss.lamSachGiaTriHeThong({ values: { 'oem.vatRate': 0.05 } })) === JSON.stringify({ 'oem.vatRate': 0.05, 'oem.defaultMargin': 20 }));
  check('rác (null / chuỗi / mảng / thiếu values) -> toàn bộ mặc định, không ném', [null, undefined, 'x', 5, [], {}, { values: null }, { values: [1] }, { values: 'a' }].every((r) => JSON.stringify(ss.lamSachGiaTriHeThong(r)) === JSON.stringify(ss.SYS_DEFAULTS)));
  check('giá trị hỏng (chuỗi, NaN, âm, VAT > 100%, LNG 0 hoặc ≥ 100) -> mặc định của khoá đó', ss.lamSachGiaTriHeThong({ values: { 'oem.vatRate': '0.1', 'oem.defaultMargin': 150 } })['oem.vatRate'] === 0.08
    && ss.lamSachGiaTriHeThong({ values: { 'oem.vatRate': -0.1, 'oem.defaultMargin': 0 } })['oem.defaultMargin'] === 20 && ss.lamSachGiaTriHeThong({ values: { 'oem.vatRate': 2 } })['oem.vatRate'] === 0.08
    && ss.lamSachGiaTriHeThong({ values: { 'oem.vatRate': NaN } })['oem.vatRate'] === 0.08);
  check('VAT 0% là giá trị hợp lệ (không bị coi là "trống" rồi về 8%)', ss.lamSachGiaTriHeThong({ values: { 'oem.vatRate': 0 } })['oem.vatRate'] === 0 && ss.heSoVat(0) === 1);
  check('khoá lạ từ máy chủ bị bỏ (client chỉ đọc khoá đã biết)', !('oem.khac' in ss.lamSachGiaTriHeThong({ values: { 'oem.khac': 1 } })));
  check('heSoVat: 0.08 -> 1.08; 0.1 -> 1.1; rác -> 1.08', gan(ss.heSoVat(0.08), 1.08) && gan(ss.heSoVat(0.1), 1.1) && gan(ss.heSoVat('x'), 1.08) && gan(ss.heSoVat(undefined), 1.08) && gan(ss.heSoVat(5), 1.08));
  check('chuVatPhanTram: 0.08 -> "8", 0.1 -> "10", 0.075 -> "7,5", 0.07 -> "7" (không lộ 7.000000000000001)', ss.chuVatPhanTram(0.08) === '8' && ss.chuVatPhanTram(0.1) === '10' && ss.chuVatPhanTram(0.075) === '7,5' && ss.chuVatPhanTram(0.07) === '7');

  // ===========================================================================
  console.log('\n2. Đổi phần trăm <-> số thực, kiểm giá trị');
  const VAT = { khoa: 'oem.vatRate', nhan: 'Thuế VAT', kieu: 'number', min: 0, max: 0.2, buoc: 0.005, donVi: '', fmt: 'percent', macDinh: 0.08 };
  const LNG = { khoa: 'oem.defaultMargin', nhan: '% LNG', kieu: 'integer', min: 1, max: 60, buoc: 1, donVi: '%', fmt: '', macDinh: 20 };
  check('giaTriVaoO: percent nhân 100 (0.08 -> "8", 0.07 -> "7", 0.075 -> "7.5", 0 -> "0"); không percent giữ nguyên', ss.giaTriVaoO(VAT, 0.08) === '8' && ss.giaTriVaoO(VAT, 0.07) === '7' && ss.giaTriVaoO(VAT, 0.075) === '7.5' && ss.giaTriVaoO(VAT, 0) === '0' && ss.giaTriVaoO(LNG, 20) === '20');
  check('giaTriVaoO: null / rác -> ""', ss.giaTriVaoO(VAT, null) === '' && ss.giaTriVaoO(VAT, undefined) === '' && ss.giaTriVaoO(VAT, 'x') === '' && ss.giaTriVaoO(VAT, NaN) === '');
  let r = ss.docGiaTriTuO(VAT, '8');
  check('docGiaTriTuO percent: "8" -> 0.08 (chia 100, không dư sai số: "7" -> 0.07 đúng, "7,5" -> 0.075)', r.ok && r.value === 0.08 && ss.docGiaTriTuO(VAT, '7').value === 0.07 && ss.docGiaTriTuO(VAT, '7,5').value === 0.075 && ss.docGiaTriTuO(VAT, ' 10 ').value === 0.1);
  check('khứ hồi: 0.08 -> "8" -> 0.08 với mọi bước 0.5%', Array.from({ length: 41 }, (_, i) => i * 0.005).every((v) => { const t = ss.giaTriVaoO(VAT, ss.lamTronPt(v)); const k = ss.docGiaTriTuO(VAT, t); return k.ok && gan(k.value, ss.lamTronPt(v)); }));
  check('docGiaTriTuO: ngoài khoảng bị chặn kèm câu tiếng Việt (VAT 25% > 20%, âm)', !ss.docGiaTriTuO(VAT, '25').ok && /lớn hơn 20%/.test(ss.docGiaTriTuO(VAT, '25').error) && !ss.docGiaTriTuO(VAT, '-1').ok && /nhỏ hơn 0%/.test(ss.docGiaTriTuO(VAT, '-1').error));
  check('docGiaTriTuO: biên được nhận (VAT 0% và 20%; LNG 1 và 60)', ss.docGiaTriTuO(VAT, '0').ok && ss.docGiaTriTuO(VAT, '20').ok && ss.docGiaTriTuO(LNG, '1').ok && ss.docGiaTriTuO(LNG, '60').ok && !ss.docGiaTriTuO(LNG, '61').ok && !ss.docGiaTriTuO(LNG, '0').ok);
  check('docGiaTriTuO: kieu integer chặn số lẻ ("12.5"), nhận số nguyên; value không bị chia 100 khi không percent', !ss.docGiaTriTuO(LNG, '12.5').ok && /số nguyên/.test(ss.docGiaTriTuO(LNG, '12,5').error) && ss.docGiaTriTuO(LNG, '25').value === 25);
  check('docGiaTriTuO: rỗng / chữ / "1e3" / "1,2,3" bị chặn', ['', '  ', 'abc', '1e3', '1,2,3', '--5', '8%'].every((t) => !ss.docGiaTriTuO(VAT, t).ok) && ss.docGiaTriTuO(VAT, '').error === 'Chưa nhập giá trị.');
  check('khoangHienThi: percent nhân 100 (0..0.2 bước 0.005 -> 0..20 bước 0.5); không percent giữ; thiếu -> null', JSON.stringify(ss.khoangHienThi(VAT)) === JSON.stringify({ min: 0, max: 20, buoc: 0.5 }) && JSON.stringify(ss.khoangHienThi(LNG)) === JSON.stringify({ min: 1, max: 60, buoc: 1 }) && JSON.stringify(ss.khoangHienThi({ fmt: 'percent' })) === JSON.stringify({ min: null, max: null, buoc: null }));
  check('khoangHienThi: khoá percent mà máy chủ đã ghi min/max theo % (max 100 > 1) thì KHÔNG nhân thêm 100', JSON.stringify(ss.khoangHienThi({ fmt: 'percent', min: 0, max: 20, buoc: 0.5 })) === JSON.stringify({ min: 0, max: 20, buoc: 0.5 }));
  check('dinhDangGiaTri: 0.08 percent -> "8%"; 20 donVi % -> "20%"; ngày; null -> "—"; số lẻ dùng dấu phẩy', ss.dinhDangGiaTri(VAT, 0.08) === '8%' && ss.dinhDangGiaTri(VAT, 0.075) === '7,5%' && ss.dinhDangGiaTri(LNG, 20) === '20%' && ss.dinhDangGiaTri({ donVi: 'ngày' }, 30) === '30 ngày' && ss.dinhDangGiaTri(VAT, null) === '—');

  // ===========================================================================
  console.log('\n3. Ngày hiệu lực (không trước hôm nay, tối đa +1 năm)');
  const TODAY = '2026-10-14';
  check('laNgayChuan: đúng lịch; 30/02, 13 tháng, rác bị loại', ss.laNgayChuan('2026-10-14') && ss.laNgayChuan('2028-02-29') && !ss.laNgayChuan('2026-02-30') && !ss.laNgayChuan('2026-13-01') && !ss.laNgayChuan('14/10/2026') && !ss.laNgayChuan('') && !ss.laNgayChuan(null));
  check('ngayToiDa: hôm nay + 1 năm (14/10/2026 -> 14/10/2027); 29/02/2028 -> 28/02/2029', ss.ngayToiDa('2026-10-14') === '2027-10-14' && ss.ngayToiDa('2028-02-29') === '2029-02-28' && ss.ngayToiDa('rác') === '');
  check('kiemTraNgayHieuLuc: trống = hôm nay (ổn); hôm nay và +1 năm ổn', ss.kiemTraNgayHieuLuc('', TODAY) === '' && ss.kiemTraNgayHieuLuc(undefined, TODAY) === '' && ss.kiemTraNgayHieuLuc('2026-10-14', TODAY) === '' && ss.kiemTraNgayHieuLuc('2027-10-14', TODAY) === '' && ss.kiemTraNgayHieuLuc('2026-11-01', TODAY) === '');
  check('kiemTraNgayHieuLuc: hôm qua bị chặn (nêu ngày hôm nay); +1 năm +1 ngày bị chặn; rác bị chặn', /trước hôm nay \(14\/10\/2026\)/.test(ss.kiemTraNgayHieuLuc('2026-10-13', TODAY)) && /quá 14\/10\/2027/.test(ss.kiemTraNgayHieuLuc('2027-10-15', TODAY)) && ss.kiemTraNgayHieuLuc('abc', TODAY) !== '' && ss.kiemTraNgayHieuLuc('2026-02-30', TODAY) !== '');

  // ===========================================================================
  console.log('\n4. Nội dung hiển thị: trạng thái, xác nhận, gói gửi, nhóm, vai trò');
  const mac = { ...VAT, giaTri: 0.08, daDat: false, hieuLucTu: '', choHieuLuc: [], lichSu: [] };
  const da = { ...VAT, giaTri: 0.1, daDat: true, hieuLucTu: '2026-10-01', choHieuLuc: [], lichSu: [
    { giaTri: 0.09, hieuLucTu: '2026-09-01', nguoiSua: 'cũ', ghiChu: '', lucSua: '2026-08-30T03:00:00Z' },
    { giaTri: 0.1, hieuLucTu: '2026-10-01', nguoiSua: 'master', ghiChu: 'x', lucSua: '2026-09-28T03:00:00Z' },
    { giaTri: 0.12, hieuLucTu: '2026-12-01', nguoiSua: 'sau', ghiChu: '', lucSua: '2026-10-10T03:00:00Z' }
  ] };
  check('trangThaiCaiDat: chưa đặt -> "Đang dùng mặc định (8%)"', ss.trangThaiCaiDat(mac, TODAY) === 'Đang dùng mặc định (8%)');
  check('trangThaiCaiDat: đã đặt -> "Đã đặt bởi master, hiệu lực từ 01/10/2026" (lấy bản đang hiệu lực, bỏ bản tương lai)', ss.trangThaiCaiDat(da, TODAY) === 'Đã đặt bởi master, hiệu lực từ 01/10/2026', ss.trangThaiCaiDat(da, TODAY));
  check('banGhiHienTai: ngày hiệu lực lớn nhất ≤ hôm nay; cùng ngày thì lần sửa muộn nhất; không có -> null', ss.banGhiHienTai(da.lichSu, TODAY).nguoiSua === 'master'
    && ss.banGhiHienTai([{ giaTri: 1, hieuLucTu: '2026-10-01', lucSua: '2026-09-01T00:00:00Z', nguoiSua: 'a' }, { giaTri: 2, hieuLucTu: '2026-10-01', lucSua: '2026-09-02T00:00:00Z', nguoiSua: 'b' }], TODAY).nguoiSua === 'b'
    && ss.banGhiHienTai([], TODAY) === null && ss.banGhiHienTai(null, TODAY) === null && ss.banGhiHienTai([{ giaTri: 1, hieuLucTu: '2027-01-01', nguoiSua: 'a' }], TODAY) === null);
  check('nhanGiaTriLichSu: null -> "Về mặc định (8%)"', ss.nhanGiaTriLichSu(VAT, null) === 'Về mặc định (8%)' && ss.nhanGiaTriLichSu(VAT, 0.1) === '10%');
  check('cauXacNhan: "Đổi <nhãn> từ X sang Y, hiệu lực từ <ngày>?" (X từ giá trị hiện hành)', ss.cauXacNhan(da, 0.08, '2026-11-01', TODAY) === 'Đổi Thuế VAT từ 10% sang 8%, hiệu lực từ 01/11/2026?', ss.cauXacNhan(da, 0.08, '2026-11-01', TODAY));
  check('cauXacNhan: về mặc định ghi rõ mặc định; ngày trống = hôm nay', ss.cauXacNhan(da, null, '', TODAY) === 'Đổi Thuế VAT từ 10% sang mặc định (8%), hiệu lực từ 14/10/2026?');
  check('dungLenhLuu: chỉ gửi hieuLucTu khi khác hôm nay; ghiChu trống bỏ, cắt 300; giaTri null giữ nguyên (về mặc định)', JSON.stringify(ss.dungLenhLuu(da, 0.08, TODAY, '', TODAY)) === JSON.stringify({ khoa: 'oem.vatRate', giaTri: 0.08 })
    && JSON.stringify(ss.dungLenhLuu(da, 0.08, '2026-11-01', '  Hết ưu đãi ', TODAY)) === JSON.stringify({ khoa: 'oem.vatRate', giaTri: 0.08, hieuLucTu: '2026-11-01', ghiChu: 'Hết ưu đãi' })
    && ss.dungLenhLuu(da, null, '', '', TODAY).giaTri === null && !('hieuLucTu' in ss.dungLenhLuu(da, null, '', '', TODAY)) && ss.dungLenhLuu(da, 1, '', 'x'.repeat(500), TODAY).ghiChu.length === 300);
  const nh = ss.gomTheoNhom([{ khoa: 'a', nhom: 'Thuế' }, { khoa: 'b', nhom: 'Giá' }, { khoa: 'c', nhom: 'Thuế' }, { khoa: 'd' }, null, { nhom: 'x' }]);
  check('gomTheoNhom: nhóm theo thứ tự xuất hiện, giữ thứ tự dòng, nhóm trống -> "Khác", bỏ dòng hỏng', JSON.stringify(nh.map((g) => [g.nhom, g.items.map((i) => i.khoa)])) === JSON.stringify([['Thuế', ['a', 'c']], ['Giá', ['b']], ['Khác', ['d']]]) && ss.gomTheoNhom(null).length === 0);
  check('laMaster: chỉ creator (không phân biệt hoa/thường); admin/leader/sale/account/rỗng không', ss.laMaster('creator') && ss.laMaster('Creator') && ['admin', 'leader', 'sale', 'account', '', null, undefined].every((v) => !ss.laMaster(v)));

  // ===========================================================================
  console.log('\n5. Kho giá trị (services/systemValues.js): mặc định, fail-soft, đua phiên');
  const sv = await imp('services/systemValues.js');
  let dem = 0;
  sv.subscribe(() => { dem++; });
  check('chưa gắn phiên: luôn có số hợp lệ (VAT 0.08, LNG 20); hệ số VAT 1.08; khoá lạ undefined', sv.getSystemValue('oem.vatRate') === 0.08 && sv.getSystemValue('oem.defaultMargin') === 20 && gan(sv.getVatFactor(), 1.08) && sv.getSystemValue('oem.khac') === undefined);
  let goi = 0;
  const apiOK = { getSystemValues: async (t) => { goi++; return { values: { 'oem.vatRate': 0.1, 'oem.defaultMargin': 25 } }; } };
  check('attach: tải đúng MỘT lần, nhận giá trị máy chủ, báo người nghe', (await sv.attach({ token: 't1', api: apiOK })) === true && goi === 1 && sv.getSystemValue('oem.vatRate') === 0.1 && sv.getSystemValue('oem.defaultMargin') === 25 && gan(sv.getVatFactor(), 1.1) && dem >= 1);
  const dem1 = dem;
  await sv.refresh();
  check('refresh: tải lại; giá trị y hệt thì KHÔNG báo người nghe (khỏi vẽ lại)', goi === 2 && dem === dem1);
  sv.detach();
  check('detach (đăng xuất): về mặc định, không để giá trị của người trước rơi sang người sau', sv.getSystemValue('oem.vatRate') === 0.08 && sv.getSystemValue('oem.defaultMargin') === 20 && sv._debug.attached() === false);
  let nem = false, kq;
  try { kq = await sv.attach({ token: 't2', api: { getSystemValues: async () => { throw new Error('relation "oem.system_settings" does not exist'); } } }); } catch { nem = true; }
  check('máy chủ lỗi / chưa có bảng: attach KHÔNG ném, trả false, dùng mặc định (VAT 8%, LNG 20) — im lặng', !nem && kq === false && sv.getSystemValue('oem.vatRate') === 0.08 && sv.getSystemValue('oem.defaultMargin') === 20);
  sv.detach();
  nem = false;
  try { kq = await sv.attach({ token: 't3', api: { getSystemValues: async () => ({ values: { 'oem.vatRate': 'x', 'oem.defaultMargin': null } }) } }); } catch { nem = true; }
  check('phản hồi rác: không ném, vẫn mặc định', !nem && sv.getSystemValue('oem.vatRate') === 0.08 && sv.getSystemValue('oem.defaultMargin') === 20);
  sv.detach();
  nem = false;
  try { kq = await sv.attach({ token: 't4', api: {} }); } catch { nem = true; }
  check('server/api cũ chưa có hàm getSystemValues: không ném, mặc định', !nem && kq === false && sv.getSystemValue('oem.vatRate') === 0.08);
  sv.detach();
  check('không token / không api: attach trả false, không gắn phiên', (await sv.attach({ token: '', api: apiOK })) === false && (await sv.attach({ token: 'a', api: null })) === false && sv._debug.attached() === false);
  // đua: phản hồi của phiên cũ về SAU khi đã đổi người thì bị bỏ
  let giai;
  const cham = { getSystemValues: () => new Promise((ok) => { giai = () => ok({ values: { 'oem.vatRate': 0.15, 'oem.defaultMargin': 40 } }); }) };
  const pCu = sv.attach({ token: 'cu', api: cham });
  const pMoi = sv.attach({ token: 'moi', api: { getSystemValues: async () => ({ values: { 'oem.vatRate': 0.05, 'oem.defaultMargin': 10 } }) } });
  await pMoi;
  giai();
  await pCu;
  check('đua phiên: lượt tải chậm của người cũ về sau KHÔNG đè giá trị của người mới', sv.getSystemValue('oem.vatRate') === 0.05 && sv.getSystemValue('oem.defaultMargin') === 10);
  sv.detach();
  check('store không import api.js / import.meta (chạy được ngoài Vite)', !/from '\.\/api'|import\.meta/.test(SRC('services/systemValues.js').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')));

  // ===========================================================================
  console.log('\n6. VAT trong tổng đơn hàng (services/aiAgent.js)');
  const ai = await imp('services/aiAgent.js');
  check('tinhThanhTien: truyền hệ số thì dùng hệ số đó (10 x 1000 x 1.1 = 11000); mặc định đọc kho = 1.08', gan(ai.tinhThanhTien(10, 1000, 1.1), 11000) && gan(ai.tinhThanhTien(10, 1000), 10800) && gan(ai.tinhThanhTien(10, 1000, 1), 10000));
  const cl = [{ name: 'Công ty ABC', code: '1', codeSearch: 'ABC', alias: 'ABC', status: 'Active' }];
  const mt = [{ sku: 'MAT1', name: 'Vat tu 1', alias: '', avgPrice: 1000, unit: 'PC' }];
  const doc = (extra) => ai.parseOrderTextToSAP({ textInput: 'Công ty ABC; 10 cái Vat tu 1', clientList: cl, materialsCatalog: mt, transactions: [], kits: [], ...extra });
  const don0 = doc({});
  check('parseOrderTextToSAP: dựng được dòng (đề phòng test hỏng im lặng) và mặc định tổng = 10 x 1000 x 1,08 = 10.800', don0.items.length === 1 && don0.items[0].qty === 10 && gan(don0.items[0].total, 10800) && gan(don0.grandTotal, 10800), don0);
  const don1 = doc({ vatFactor: 1.1 });
  check('parseOrderTextToSAP({ vatFactor: 1.1 }): tổng 11.000 — hệ số truyền vào thắng', gan(don1.items[0].total, 11000) && gan(don1.grandTotal, 11000));
  check('parseOrderTextToSAP({ vatFactor: 1 }) (VAT 0%): tổng 10.000 — 0 không bị coi là "không truyền"', gan(doc({ vatFactor: 1 }).grandTotal, 10000));
  await sv.attach({ token: 'v', api: { getSystemValues: async () => ({ values: { 'oem.vatRate': 0.1, 'oem.defaultMargin': 20 } }) } });
  check('không truyền hệ số: đọc kho giá trị hệ thống (VAT 10% -> tổng 11.000)', gan(doc({}).grandTotal, 11000));
  const luu = { items: [{ qty: 10, price: 1000, total: 10800 }, { qty: 2, price: 500, total: 1080 }], grandTotal: 11880, client: { code: '1' } };
  const moi = ai.tinhLaiDonTheoVat(luu, 1.1);
  check('tinhLaiDonTheoVat: tính lại từng dòng + tổng khi VAT đổi (10.800 -> 11.000; 1.080 -> 1.100; tổng 12.100), không sửa đơn gốc', gan(moi.items[0].total, 11000) && gan(moi.items[1].total, 1100) && gan(moi.grandTotal, 12100) && luu.items[0].total === 10800 && moi.client === luu.client);
  check('tinhLaiDonTheoVat: hệ số không đổi -> trả NGUYÊN đối tượng cũ (React khỏi vẽ lại); null / không có items an toàn', ai.tinhLaiDonTheoVat(luu, 1.08) === luu && ai.tinhLaiDonTheoVat(null, 1.1) === null && ai.tinhLaiDonTheoVat({}, 1.1) !== undefined);
  sv.detach();
  check('hết phiên (detach): quay về 1,08 — đơn dựng sau đó không mang VAT của người trước', gan(doc({}).grandTotal, 10800));
  const aiSrc = SRC('services/aiAgent.js'), aiUi = SRC('components/AIOrderAgent.jsx');
  check('không còn hằng cứng VAT_RATE = 1.08 ở aiAgent / AIOrderAgent; nhãn "đã gồm VAT 8%" cứng đã thành nhãn theo cài đặt', !/VAT_RATE/.test(aiSrc) && !/VAT_RATE/.test(aiUi) && !/đã gồm VAT 8%/.test(aiUi) && /đã gồm VAT \{chuVatPhanTram\(vatRate\)\}%/.test(aiUi) && /useSystemValue\(KHOA_VAT\)/.test(aiUi));
  check('AIOrderAgent: VAT về muộn / master đổi thì tính lại đơn chưa lưu (effect theo vatRate gọi tinhLaiDonTheoVat)', /tinhLaiDonTheoVat\(cu, 1 \+ vatRate\)/.test(aiUi) && /\[vatRate\]/.test(aiUi));

  // ===========================================================================
  console.log('\n7. Quyền vào trang (navMeta) + nối vào giao diện (soát mã nguồn)');
  const nm = await imp('utils/navMeta.js');
  check('tabHopLe: "system-settings" chỉ creator vào được; admin/leader/sale/account rơi về tab mặc định của vai; không nằm trong NAV/TAB_IDS (không chọn làm Trang đầu)',
    nm.tabHopLe('system-settings', 'creator') === 'system-settings' && nm.tabHopLe('system-settings', 'admin') === 'revenue-reports' && nm.tabHopLe('system-settings', 'leader') === 'revenue-reports'
    && nm.tabHopLe('system-settings', 'sale') === 'sale-dashboard' && nm.tabHopLe('system-settings', 'account') === 'products' && nm.tabHopLe('system-settings', undefined) === 'ai-agent'
    && !nm.TAB_IDS.includes('system-settings') && !nm.NAV.some((m) => m.id === 'system-settings'));
  check('coQuyenHeThong: creator (mọi kiểu chữ) có; vai khác không', nm.coQuyenHeThong('creator') && nm.coQuyenHeThong('CREATOR') && ['admin', 'leader', 'sale', 'account', '', null].every((v) => !nm.coQuyenHeThong(v)));
  check('tab "Cài đặt cá nhân" vẫn mọi vai vào được (không bị ảnh hưởng)', nm.tabHopLe('settings', 'account') === 'settings');
  const app = SRC('App.jsx'), nav = SRC('components/Navbar.jsx'), sb = SRC('components/Sidebar.jsx'), page = SRC('components/SystemSettings.jsx');
  check('App: SystemSettings tải bằng React.lazy; chỉ dựng cho master ({coQuyenHeThong(activeUser.role) && <KeepAliveTab ...>}); requestTab chặn vai khác; không nhớ làm tab cuối',
    /lazy\(\(\) => import\('\.\/components\/SystemSettings'\)\)/.test(app) && /coQuyenHeThong\(activeUser\.role\) && \(\s*<KeepAliveTab isActive=\{activeTab === TAB_SYSTEM\}/.test(app)
    && /id === TAB_SYSTEM && !coQuyenHeThong\(/.test(app) && /id !== TAB_SETTINGS && id !== TAB_SYSTEM\) writeUi\('tab', id\)/.test(app));
  check('App: đang ở trang hệ thống mà không còn là master (đổi người) -> về tab mặc định của vai', /activeTab === TAB_SYSTEM && !coQuyenHeThong\(/.test(app) && /tabMacDinh\(session\.user/.test(app));
  check('App: tải giá trị hệ thống cùng chỗ với cài đặt cá nhân (sau bootstrap), gỡ khi đổi phiên', /sysvals\.attach\(\{ token: session\.token, api \}\)/.test(app) && /prefs\.detach\(\); sysvals\.detach\(\)/.test(app) && /\[session\?\.token, hasLoadedOnce\]/.test(app));
  check('Navbar + Sidebar: nút "Hệ thống" / "Cài đặt hệ thống" chỉ hiện khi App truyền onOpenSystemSettings (chỉ cho master)', /\{onOpenSystemSettings && \(/.test(nav) && /Hệ thống/.test(nav) && /\{onOpenSystemSettings && \(/.test(sb) && /Cài đặt hệ thống/.test(sb)
    && /onOpenSystemSettings=\{coQuyenHeThong\(activeUser\.role\) \? \(\) => requestTab\(TAB_SYSTEM\) : undefined\}/.test(app) && (app.match(/onOpenSystemSettings=/g) || []).length === 2);
  check('SystemSettings: tự chặn khi không phải master (không gọi getSystemSettings); dựng theo nhóm từ máy chủ', /if \(!master \|\| !token\) return;/.test(page) && /if \(!master\) \{/.test(page) && /gomTheoNhom\(settings\)/.test(page) && /api\.getSystemSettings\(token\)/.test(page));
  check('SystemSettings: ô giá trị + "Hiệu lực từ" (min = hôm nay) + ghi chú + Lưu + Về mặc định + Lịch sử + danh sách chờ hiệu lực', /Giá trị mới/.test(page) && /type="date"/.test(page) && /min=\{today \|\| undefined\}/.test(page) && /max=\{ngayToiDa\(today\)/.test(page) && /Ghi chú \(không bắt buộc\)/.test(page) && /<Save size=\{16\} \/>\} Lưu/.test(page)
    && /Về mặc định/.test(page) && /Lịch sử \(/.test(page) && /Sắp có hiệu lực/.test(page) && /choHieuLuc/.test(page));
  check('SystemSettings: hộp xác nhận trước khi lưu (cauXacNhan), tableMissing -> banner "Chưa chạy SQL đợt 8 — chưa lưu được" + khoá lưu, lỗi hiện NGAY trong trang (role=alert), lưu xong tải lại danh sách + làm mới giá trị hệ thống',
    /<ConfirmDialog/.test(page) && /cauXacNhan\(s, xacNhan\.giaTri/.test(page) && /Chưa chạy SQL đợt 8 — chưa lưu được/.test(page) && /tableMissing \|\|/.test(page) && /role="alert"/.test(page) && /setLoi\(lamSachLoi\(/.test(page) && /Promise\.all\(\[tai\(\), lamMoiGiaTriHeThong\(\)\]\)/.test(page));
  check('SystemSettings: kiểm min/max/số nguyên/ngày ở client TRƯỚC khi gửi (docGiaTriTuO + kiemTraNgayHieuLuc), máy chủ vẫn là nơi quyết định', /docGiaTriTuO\(s, text\)/.test(page) && /kiemTraNgayHieuLuc\(ngayDung, today\)/.test(page) && /dungLenhLuu\(s, giaTri, nd, ghiChu, today\)/.test(page));
  const calc = SRC('components/pricing/PriceCalculatorPanel.jsx'), stg = SRC('components/Settings.jsx');
  check('Máy tính giá: % LNG điền sẵn = cá nhân nếu đã chọn, không thì mặc định hệ thống (useCalcMargin); không còn cứng 20', /useCalcMargin\(\)/.test(calc) && !/useState\('20'\)/.test(calc));
  const hk = SRC('hooks/useSystemValue.js');
  check('useCalcMargin: st.calcMargin THẮNG khi đã chọn (daChon), chưa chọn thì oem.defaultMargin', /daChonRieng \? rieng : heThong/.test(hk) && /daChon\('st\.calcMargin'\)/.test(hk) && /useSystemValue\(KHOA_LNG\)/.test(hk));
  check('Cài đặt cá nhân: ô "Biên lợi nhuận" hiện số hiệu lực + gợi ý "Mặc định của hệ thống hiện là X%"; chỉ lưu khi người dùng thật sự sửa', /useCalcMargin\(\)/.test(stg) && /Mặc định của hệ thống hiện là/.test(stg) && /if \(draft === String\(saved\)\) return;/.test(stg));
  const api = SRC('services/api.js'), apiCode = api.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  check('api.js: getSystemValues / getSystemSettings / setSystemSetting cùng kiểu callApi(token); không nằm trong NON_IDEMPOTENT_FNS',
    /callApi\('getSystemValues', \[token\], 15000\)/.test(api) && /callApi\('getSystemSettings', \[token\], 30000\)/.test(api) && /callApi\('setSystemSetting', \[token, payload\], 30000\)/.test(api)
    && !/NON_IDEMPOTENT_FNS = new Set\(\[[^\]]*SystemSetting/.test(apiCode));
  const harness = SRC('dev/uiHarness.jsx');
  check('UI harness có máy chủ giả getSystemValues / getSystemSettings / setSystemSetting + &systable=missing, &syserr=1, &nosys=1, &sysfail=1, &sysseed=1', ['getSystemValues', 'getSystemSettings', 'setSystemSetting', 'systable', 'syserr', 'nosys', 'sysfail', 'sysseed'].every((k) => harness.includes(k)));

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
