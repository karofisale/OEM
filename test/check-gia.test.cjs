/**
 * check-gia.test.cjs — "Check giá bán" cho Sale (07/11/2026).
 *
 *   node test/check-gia.test.cjs
 *
 *  1. Hàm thuần utils/checkGia.js: định dạng, nhãn trạng thái, thông báo, kiểm LNG, gói tham số.
 *  2. Menu: tab con "Check giá bán" có mặt, icon riêng; chỉ Sale/Admin/Creator thấy.
 *  3. api.js: đủ 16 hàm cg*, các hàm GHI không tự thử lại (NON_IDEMPOTENT_FNS).
 *  4. Nối vào App: thông báo trên Dashboard, huy hiệu menu, lệnh mở thẳng yêu cầu.
 *  5. Sale không bao giờ được vẽ giá vốn / thuế / chi phí trong màn của Sale (đọc mã nguồn).
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}
const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8').replace(/\r\n/g, '\n');
const url = (f) => pathToFileURL(path.join(__dirname, '..', 'src', 'utils', f)).href;

(async () => {
  const cg = await import(url('checkGia.js'));
  const nm = await import(url('navMeta.js'));

  console.log('1. Hàm thuần');
  check('dinhDangTien làm tròn + dấu chấm nghìn', cg.dinhDangTien(1234567.4) === (1234567).toLocaleString('vi-VN') && cg.dinhDangTien(null) === '' && cg.dinhDangTien('') === '' && cg.dinhDangTien('abc') === '');
  check('dinhDangUsd giữ tối đa 2 số lẻ', cg.dinhDangUsd(45.5) === (45.5).toLocaleString('vi-VN') && cg.dinhDangUsd(undefined) === '');
  check('nhãn yêu cầu', cg.nhanTrangThai('cho_vhkd', 'kho').text === 'Chờ VHKD kiểm tra' && cg.nhanTrangThai('cho_review', 'nhap_khau').text === 'Chờ tính giá' && cg.nhanTrangThai('da_tra_loi', 'kho').tone === 'emerald');
  check('nhãn dòng: co_gia/da_co có giá, kiem_tra_lai đỏ, còn lại chưa có thông tin', cg.nhanDong('co_gia').text === 'Có giá' && cg.nhanDong('da_co').text === 'Có giá' && cg.nhanDong('kiem_tra_lai').text === 'Kiểm tra lại thông tin' && cg.nhanDong('chua_co').text === 'Chưa có thông tin');
  check('lý do chưa có', cg.nhanLyDo('chua_co_csdl') === 'Chưa có trong CSDL' && cg.nhanLyDo('chua_co_gv') === 'Chưa có giá vốn' && cg.nhanLyDo('') === '');
  check('nhãn loại', cg.nhanLoai('nhap_khau') === 'Hàng nhập khẩu' && cg.nhanLoai('kho') === 'Giá bán từ kho');

  check('thông báo Admin: "Hỏi giá cần kiểm tra (n)"', cg.cauThongBao({ bat: true, loai: 'quan-tri', soLuong: 3 }) === 'Hỏi giá cần kiểm tra (3)');
  check('thông báo Sale: "Hỏi giá được trả lời (n)"', cg.cauThongBao({ bat: true, loai: 'sale', soLuong: 2 }) === 'Hỏi giá được trả lời (2)');
  check('không có gì / chưa chạy SQL → không hiện', cg.cauThongBao(null) === null && cg.cauThongBao({ bat: false, soLuong: 5 }) === null && cg.cauThongBao({ bat: true, loai: 'sale', soLuong: 0 }) === null);
  check('mô tả mục thông báo', /^#7 · Giá bán từ kho · An · 07\/11\/2026 10:00 · 12 mã$/.test(cg.moTaMucThongBao({ id: 7, kind: 'kho', by: 'An', at: '07/11/2026 10:00', soDong: 12 }, 'quan-tri')));

  check('LNG dưới mức tối thiểu: TCM < 8, giao thẳng khách < 5', cg.lngDuoiToiThieu(7.9, 'tcm') && !cg.lngDuoiToiThieu(8, 'tcm') && cg.lngDuoiToiThieu(4.9, 'khach') && !cg.lngDuoiToiThieu(5, 'khach') && !cg.lngDuoiToiThieu('', 'tcm'));
  check('mức tối thiểu theo nơi giao', cg.lngToiThieu('tcm') === 8 && cg.lngToiThieu('khach') === 5);
  check('demThieu đếm chua_co + kiem_tra_lai', cg.demThieu([{ status: 'co_gia' }, { status: 'chua_co' }, { status: 'kiem_tra_lai' }, { status: 'da_co' }]) === 2 && cg.demThieu(null) === 0);
  check('duongDanSap đúng giao thức cầu nối', cg.duongDanSap(12) === 'karofi-oem://gia-von?req=12');
  check('trạng thái cào SAP', cg.dangCaoSap({ status: 'pending' }) && cg.dangCaoSap({ status: 'running' }) && !cg.dangCaoSap({ status: 'done' }) && !cg.dangCaoSap(null)
    && cg.nhanCaoSap({ status: 'running', done: 2, total: 5 }) === 'Đang cào SAP (2/5)…' && /Lỗi cào SAP: hết hạn/.test(cg.nhanCaoSap({ status: 'error', message: 'hết hạn' })));

  const tsv = cg.bangGiaThanhTsv([{ code: 'A1', name: 'Máy', price: 108700.2, status: 'co_gia' }, { code: 'B2', name: '', price: null, status: 'chua_co' }, { code: 'C3', name: 'X', price: null, status: 'kiem_tra_lai', note: 'Kiểm tra lại thông tin' }]).split('\n');
  check('TSV: tiêu đề + 3 dòng, dòng chưa có giá để trống giá + ghi chú', tsv.length === 4 && tsv[0] === 'Mã\tTên\tGiá bán có VAT\tGhi chú' && tsv[1] === 'A1\tMáy\t108700\t' && tsv[2] === 'B2\t\t\tChưa có thông tin' && tsv[3] === 'C3\tX\t\tKiểm tra lại thông tin', tsv);

  const ps = cg.thamSoTuForm({ freightUsd: '1000', customsVnd: '', truckingVnd: '4500000', fx: '25500', fxSource: 'vcb', lngPct: '8', lngConfirmed: false });
  check('gói tham số: chuỗi rỗng → null, số → số, nguồn tỷ giá', ps.freightUsd === 1000 && ps.customsVnd === null && ps.truckingVnd === 4500000 && ps.fx === 25500 && ps.fxSource === 'vcb' && ps.lngPct === 8 && ps.lngConfirmed === false);
  check('nguồn tỷ giá lạ → tay', cg.thamSoTuForm({ fxSource: 'x' }).fxSource === 'tay');
  const dl = cg.dongTuForm([{ id: 5, name: 'A', taxImportPct: '0', vatPct: '8', note: '' }, { id: 6, name: 'B', taxImportPct: '', vatPct: '', note: undefined }]);
  check('gói dòng: 0 vẫn là 0 (không thành null), rỗng → null', dl[0].taxImportPct === 0 && dl[0].vatPct === 8 && dl[1].taxImportPct === null && dl[1].vatPct === null && dl[1].note === '');

  console.log('2. Menu');
  const sub = nm.SUBTABS.products.map((t) => t.id);
  check('tab con Check giá bán nằm trong Sản phẩm & Bảng giá, sau Đề xuất giá', sub.join() === 'catalog,propose,checkgia,approve,calculator,cost,kits', sub);
  check('có nhãn + icon', nm.SUBTABS.products.find((t) => t.id === 'checkgia').label === 'Check giá bán' && nm.SUBTABS.products.find((t) => t.id === 'checkgia').icon === 'SearchCheck' && !!nm.iconOf('SearchCheck'));
  const icons = nm.moiIcon().map((x) => x.icon);
  check('mỗi mục menu/tab con vẫn một icon RIÊNG', new Set(icons).size === icons.length, icons.filter((x, i) => icons.indexOf(x) !== i));
  const pp = SRC('components/ProductPricing.jsx');
  check("tab chỉ hiện cho sale / admin / creator", /canCheckGia = \['sale', 'admin', 'creator'\]\.includes\(activeUser\.role\)/.test(pp) && /checkgia: canCheckGia/.test(pp));
  check('có tab con → được dựng + nhận lệnh mở từ thông báo', /<CheckGiaPanel[^>]*jump=\{jump\}/.test(pp) && /useJump\(jump, tabs, setSubView\)/.test(pp));

  console.log('3. api.js');
  const api = SRC('services/api.js');
  const HAM = ['cgTraGiaKho', 'cgGuiKho', 'cgGuiNhapKhau', 'cgDanhSach', 'cgThongBao', 'cgChiTiet', 'cgDaXem', 'cgSapYeuCau', 'cgNhapGiaVonTay', 'cgGhiChuDong', 'cgGuiTraLoiKho', 'cgNhapKhauLuu', 'cgNhapKhauTinh', 'cgNhapKhauGui', 'cgYeuCauTinhLai', 'cgTyGia'];
  check('đủ 16 hàm cg* gọi đúng tên action', HAM.every((h) => new RegExp("export async function " + h + "\\(token[^)]*\\) \\{ return callApi\\('" + h + "'").test(api)), HAM.filter((h) => !new RegExp("callApi\\('" + h + "'").test(api)));
  const nonIdem = (/const NON_IDEMPOTENT_FNS = new Set\(\[([\s\S]*?)\]\);/.exec(api) || [])[1] || '';
  const GHI = ['cgGuiKho', 'cgGuiNhapKhau', 'cgSapYeuCau', 'cgGuiTraLoiKho', 'cgNhapKhauGui', 'cgYeuCauTinhLai'];
  check('hàm tạo yêu cầu / gửi trả lời KHÔNG tự thử lại', GHI.every((h) => nonIdem.includes("'" + h + "'")), GHI.filter((h) => !nonIdem.includes("'" + h + "'")));
  check('hàm đọc không nằm trong danh sách không-thử-lại', ['cgTraGiaKho', 'cgDanhSach', 'cgThongBao', 'cgChiTiet', 'cgTyGia'].every((h) => !nonIdem.includes("'" + h + "'")));

  console.log('4. Nối vào App');
  const app = SRC('App.jsx');
  check('lệnh mở tab con mang thêm tham số (id / view)', /const moTabCon = \(tab, sub, extra\) =>/.test(app) && /\.\.\.\(extra \|\| \{\}\)/.test(app));
  check('thông báo chỉ hỏi máy chủ khi đã đăng nhập, theo vai trò', /useThongBaoGia\(session && session\.token/.test(app));
  check('khung thông báo ở Dashboard + Dashboard Sale, bấm → mở Check giá bán', /activeTab === 'dashboard' \|\| activeTab === 'sale-dashboard'/.test(app) && /moTabCon\('products', 'checkgia', extra\)/.test(app));
  check('huy hiệu số trên mục Sản phẩm & Bảng giá', /productsBadge=\{/.test(app) && /m\.id === 'products'/.test(SRC('components/Sidebar.jsx')));
  check('ProductPricing nhận jump riêng của mục products', /jump=\{jump\.tab === 'products' \? jump : null\}/.test(app));
  const hook = SRC('hooks/useThongBaoGia.js');
  check('hook: chỉ sale / admin / creator, hỏi lại mỗi phút, bỏ qua khi tab ẩn', /\['sale', 'admin', 'creator'\]/.test(hook) && /NHIP_MS = 60000/.test(hook) && /document\.hidden/.test(hook));

  console.log('5. Sale không thấy giá vốn / thuế / chi phí');
  const kho = SRC('components/checkgia/ChiTietKho.jsx');
  check('màn kho: cột Giá vốn chỉ vẽ khi là Admin/Creator', /\{laQuanTri && <th[^>]*>Giá vốn/.test(kho) && /\{laQuanTri && \(\s*<td/.test(kho));
  check('màn kho: nhập tay / sửa ghi chú / Kiểm tra SAP chỉ khi sua (Admin/Creator + chờ VHKD)', /const sua = laQuanTri && cho;/.test(kho) && /\{sua && \(\s*<div/.test(kho));
  const nk = SRC('components/checkgia/ChiTietNhapKhau.jsx');
  const saleView = (/function SaleView[\s\S]*?\n}\n\n\/\*\* Màn Admin/.exec(nk) || [''])[0];
  check('màn nhập khẩu của Sale có nội dung', saleView.length > 500);
  check('màn nhập khẩu của Sale: không vẽ thuế / chi phí phân bổ / giá vốn', !/dutyVnd|allocVnd|costExvat|costIncvat|goodsVnd|taxImportPct|vatPct|Giá vốn|Thuế NK|phân bổ/i.test(saleView), (/dutyVnd|allocVnd|costExvat|costIncvat|goodsVnd|taxImportPct|vatPct|Giá vốn|Thuế NK|phân bổ/i.exec(saleView) || [])[0]);
  check('màn nhập khẩu của Sale: chỉ thêm cột Giá bán có VAT khi đã trả lời', /\{tra && <th[^>]*>Giá bán có VAT/.test(saleView) && /priceVnd/.test(saleView));
  const tra = SRC('components/checkgia/KhoTraGia.jsx');
  check('tra giá kho: chỉ vẽ giá bán — không đụng trường cost, không có cột Giá vốn', !/cost/i.test(tra) && !/<th[^>]*>Giá vốn/.test(tra));
  check('Chi tiết yêu cầu: Sale mở bảng đã trả lời → báo đã xem', /api\.cgDaXem\(token, rq\.id\)/.test(SRC('components/checkgia/YeuCauChiTiet.jsx')) && /!d \|\| laQuanTri\) return/.test(SRC('components/checkgia/YeuCauChiTiet.jsx')));
  check('Kiểm tra SAP mở đúng giao thức + tự hỏi lại khi đang cào', /duongDanSap\(rq\.id\)/.test(kho) && /dangCaoSap\(d\.scrape\)/.test(SRC('components/checkgia/YeuCauChiTiet.jsx')) && /NHIP_CAO_MS = 5000/.test(SRC('components/checkgia/YeuCauChiTiet.jsx')));
  const quanTri = (/function QuanTriView[\s\S]*$/.exec(nk) || [''])[0];
  check('Admin: Gửi chỉ bật khi đã Calculate và chưa sửa lại sau đó', /const duocGui = cho && daTinh && !dirty;/.test(quanTri) && /disabled=\{!!ban \|\| !duocGui\}/.test(quanTri));
  check('Admin: LNG dưới mức tối thiểu phải tick xác nhận mới Calculate', /duoiMin && !f\.lngConfirmed/.test(quanTri));

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
