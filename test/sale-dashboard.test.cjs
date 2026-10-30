/**
 * sale-dashboard.test.cjs — Dashboard Sale (src/utils/saleDashboard.js + nối vào App/menu), 30/10/2026.
 *
 *   node test/sale-dashboard.test.cjs
 *
 * Bảng số "Riêng" (phần của chính mình) hoặc "Chung" (cả nhóm, thu hẹp được theo Sale) — chỉ là bộ lọc XEM, không đổi quyền đọc.
 * Kiểm: phạm vi riêng/chung, Done tính từ giao dịch (cùng số với màn Xem kế hoạch), 12 tháng + cùng kỳ + KPI, top khách,
 * khách lâu chưa mua, công nợ, đơn chờ nhập SAP, và việc nối vào menu/App (kế toán không vào được).
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
  const sd = await import(url('saleDashboard.js'));
  const roles = await import(url('roles.js'));

  const hoan = { name: 'hoancd', role: 'sale', saleId: 'Đình Hoan' };
  const luyen = { name: 'luyennt', role: 'sale', saleId: 'Luyến' };
  const admin = { name: 'admin1', role: 'admin', saleId: '' };

  console.log('1. "Của tôi" (laCuaToi / donCuaToi)');
  check('saleId khớp trọn các chữ cuối của tên ("KH Đình Hoan") -> của tôi', roles.laCuaToi(hoan, 'KH Đình Hoan') === true);
  check('khách của Sale khác -> không', roles.laCuaToi(hoan, 'KH Luyến') === false);
  check('saleId chỉ là một phần chữ ("Hoan" vs "Đình Hoan" khác nhau; "oan" không khớp "Hoan")', roles.laCuaToi({ saleId: 'oan' }, 'KH Đình Hoan') === false);
  check('saleId trống -> không có gì là "của tôi" (fail closed), kể cả admin', roles.laCuaToi(admin, 'KH Đình Hoan') === false && roles.laCuaToi({ role: 'sale' }, '') === false);
  check('admin có saleId thì xem được phần của mình (không "sở hữu tất cả" như ownsSaleRow)', roles.laCuaToi({ role: 'admin', saleId: 'Luyến' }, 'KH Luyến') === true && roles.laCuaToi({ role: 'admin', saleId: 'Luyến' }, 'KH Hoan') === false);
  check('đơn: PIC = tên đăng nhập; trống tên -> false', roles.donCuaToi(hoan, ' hoancd ') === true && roles.donCuaToi(hoan, 'luyennt') === false && roles.donCuaToi({ name: '' }, '') === false);
  check('Chung + ALL = mọi dòng; Chung + chọn Sale = đúng Sale đó',
    sd.dungPhamVi({ scope: 'all', saleFilter: 'ALL', user: hoan })('ai cũng được') === true &&
    sd.dungPhamVi({ scope: 'all', saleFilter: 'KH Luyến', user: hoan })('KH Luyến') === true &&
    sd.dungPhamVi({ scope: 'all', saleFilter: 'KH Luyến', user: hoan })('KH Đình Hoan') === false);

  const mine = sd.dungPhamVi({ scope: 'mine', user: hoan });
  const all = sd.dungPhamVi({ scope: 'all', saleFilter: 'ALL', user: hoan });

  const tx = [
    { clientCode: 'TECOM', clientAlias: 'Tecom', sale: 'KH Đình Hoan', month: 'T10-2026', netRevenue: 1000, qty: 5 },
    { clientCode: 'tecom', sale: 'KH Đình Hoan', month: 'T10-2026', netRevenue: 500, qty: 2, revenue: 99999 },
    { clientCode: 'MAKXIM', clientAlias: 'Makxim', sale: 'KH Luyến', month: 'T10-2026', netRevenue: 4000, qty: 10 },
    { clientCode: 'TECOM', sale: 'KH Đình Hoan', month: 'T09-2026', netRevenue: 700, qty: 1 },
    { clientCode: 'TECOM', sale: 'KH Đình Hoan', month: '', date: '12/10/2026', netRevenue: 300, qty: 1 },     // ô tháng trống -> theo ngày
    { clientCode: 'TECOM', sale: 'KH Đình Hoan', month: 'T10-2025', netRevenue: 800, qty: 1 },
    { clientCode: 'CU', clientAlias: 'Khách cũ', sale: 'KH Đình Hoan', month: 'T03-2026', netRevenue: 9000, qty: 1 },
    { clientCode: 'CU2', sale: 'KH Luyến', month: 'T04-2026', netRevenue: 100, qty: 1 }
  ];

  console.log('\n2. Tổng tháng + bảng kế hoạch theo khách (Done từ giao dịch)');
  {
    const r = sd.tongThang(tx, 'T10-2026', mine);
    check('Riêng: chỉ cộng DT THUẦN của mình trong tháng (kể cả dòng ô tháng trống suy từ ngày), không dùng revenue gộp', r.dt === 1800 && r.dong === 3, r);
    check('Chung: cộng cả Sale khác', sd.tongThang(tx, 'T10-2026', all).dt === 5800);
    const plans = [
      { month: 'T10-2026', searchCode: 'TECOM', clientName: 'Tecom', sale: 'KH Đình Hoan', planKpi: 2500, planUpdate: 2000, done: 12345, status: 'Đã duyệt' },
      { month: 'T10-2026', searchCode: 'MAKXIM', clientName: 'Makxim', sale: 'KH Luyến', planKpi: 5000, planUpdate: 4000, done: 0, status: 'Chờ duyệt' },
      { month: 'T9-2026', searchCode: 'TECOM', clientName: 'Tecom', sale: 'KH Đình Hoan', planKpi: 1, planUpdate: 1, done: 1, status: 'Đã duyệt' }
    ];
    const kh = sd.bangKeHoachThang(plans, tx, 'T10-2026', mine);
    check('Riêng: 1 khách, Done tính từ giao dịch (1800), KHÔNG lấy cột done đông cứng 12345', kh.rows.length === 1 && kh.rows[0].done === 1800, kh.rows);
    check('chênh = Done − Plan update; % đạt làm tròn', kh.rows[0].chenh === -200 && kh.rows[0].pct === 90, kh.rows[0]);
    const kh2 = sd.bangKeHoachThang(plans, tx, 'T10-2026', all);
    check('Chung: 2 khách, tổng khớp cộng từng dòng, % đạt tổng', kh2.rows.length === 2 && kh2.tong.planUpdate === 6000 && kh2.tong.done === 5800 && kh2.tong.pct === 97, kh2.tong);
    check('sắp theo Plan update giảm dần', kh2.rows[0].code === 'MAKXIM');
    check('khoá tháng "T9-2026" của kế hoạch được chuẩn hoá, không lọt sang T10', sd.bangKeHoachThang(plans, tx, 'T09-2026', all).rows.length === 1);
    check('không có kế hoạch -> rỗng, % đạt null (không bịa)', sd.bangKeHoachThang([], tx, 'T10-2026', all).tong.pct === null);
  }

  console.log('\n3. Bảng 12 tháng (cùng kỳ + KPI năm)');
  {
    const plan2026 = {
      TECOM: { name: 'Tecom', pic: 'KH Đình Hoan', months: [0, 0, 0, 0, 0, 0, 0, 0, 1000, 3000, 0, 0] },
      MAKXIM: { name: 'Makxim', pic: 'KH Luyến', months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, 0, 0] }
    };
    const b = sd.bang12Thang(tx, 2026, plan2026, mine);
    const t10 = b.rows[9];
    check('Riêng T10: DT 1800, cùng kỳ 2025 = 800, +125%', t10.dt === 1800 && t10.dtTruoc === 800 && t10.tangTruong === 125, t10);
    check('KPI chỉ cộng khách có PIC là mình (3000), % đạt 60', t10.kpi === 3000 && t10.pctKpi === 60, t10);
    check('tháng KPI = 0 -> % đạt null; tháng chưa có cùng kỳ -> % tăng null', b.rows[0].pctKpi === null && b.rows[0].tangTruong === null);
    const c = sd.bang12Thang(tx, 2026, plan2026, all);
    check('Chung: KPI T10 = 8000', c.rows[9].kpi === 8000);
    check('năm trước không có giao dịch -> không hiện % tăng', sd.bang12Thang(tx, 2030, plan2026, all).rows.every((r) => r.tangTruong === null) && sd.bang12Thang(tx, 2030, plan2026, all).daCoNamTruoc === false);
    check('tổng năm cộng đúng', b.tong.dt === 1800 + 700 + 9000 && b.tong.kpi === 4000, b.tong);
  }

  console.log('\n4. Top khách + khách lâu chưa mua');
  {
    const top = sd.topKhach(tx, 2026, all, 10);
    check('gộp theo Search Code hoa-thường (TECOM + tecom), sắp theo DT', top.rows[0].code === 'CU' && top.rows[0].rev === 9000 && top.rows.find((r) => r.code === 'TECOM').rev === 2500, top.rows);
    check('tỷ trọng = DT / tổng năm trong phạm vi', top.rows[0].share === Math.round((9000 / top.tong) * 100));
    check('Riêng không có khách của Sale khác', sd.topKhach(tx, 2026, mine, 10).rows.every((r) => r.code !== 'MAKXIM' && r.code !== 'CU2'));
    const lau = sd.khachLauChuaMua(tx, all, 'T10-2026', 3, 10);
    check('CU (mua cuối T03) và CU2 (T04) lâu chưa mua; TECOM/MAKXIM vừa mua thì không', lau.map((r) => r.code).join() === 'CU,CU2', lau);
    check('khách lớn đứng trước; ghi số tháng chưa mua + tháng mua cuối', lau[0].soThangChua === 7 && lau[0].thangCuoi === 'T03-2026', lau[0]);
    check('Riêng chỉ khách của mình', sd.khachLauChuaMua(tx, mine, 'T10-2026', 3, 10).map((r) => r.code).join() === 'CU');
    check('dòng DT ≤ 0 (hàng tặng/trả) không tính là lần mua', sd.khachLauChuaMua([{ clientCode: 'X', sale: 'KH Đình Hoan', month: 'T10-2026', netRevenue: 0 }, { clientCode: 'X', sale: 'KH Đình Hoan', month: 'T01-2026', netRevenue: 50 }], mine, 'T10-2026', 3, 10)[0].thangCuoi === 'T01-2026');
    check('khoá tháng hiện tại hỏng -> rỗng, không lỗi', sd.khachLauChuaMua(tx, all, '???', 3, 10).length === 0);
  }

  console.log('\n5. Công nợ + đơn chờ nhập SAP');
  {
    const debt = [
      { code: 'A', name: 'A', pic: 'KH Đình Hoan', creditLimit: 100, balance: 300, overLimit: 200 },
      { code: 'B', name: 'B', pic: 'KH Đình Hoan', creditLimit: 500, balance: 50, overLimit: -450 },
      { code: 'C', name: 'C', pic: 'KH Luyến', creditLimit: 100, balance: 900, overLimit: 800 },
      { code: 'D', name: 'D', pic: 'KH Đình Hoan', creditLimit: 100, balance: 0, overLimit: -100 }
    ];
    const m = sd.congNoTheoPhamVi(debt, mine);
    check('Riêng: bỏ số dư 0, sắp giảm dần, đếm khách vượt hạn mức', m.rows.map((r) => r.code).join() === 'A,B' && m.tong.balance === 350 && m.tong.vuot === 1 && m.tong.tienVuot === 200, m);
    check('Chung: có cả khách Sale khác, C lên đầu', sd.congNoTheoPhamVi(debt, all).rows[0].code === 'C');

    const lines = [
      { sku: '1', qty: 2, price: 100, orderNo: 'SAP-SO-1', pic: 'hoancd', clientCodeSearch: 'TECOM', createdAt: '29/10/2026 09:00' },
      { sku: '2', qty: 1, price: 50, orderNo: 'SAP-SO-1', pic: 'hoancd', clientCodeSearch: 'TECOM', createdAt: '29/10/2026 09:00' },
      { sku: '3', qty: 3, price: 10, orderNo: 'TL-123456', pic: 'hoancd', clientCode: '1000700', createdAt: '30/10/2026 08:00' },
      { sku: '4', qty: 1, price: 1000, orderNo: 'SAP-SO-2', pic: 'luyennt', clientCodeSearch: 'MAKXIM', createdAt: '28/10/2026 10:00' },
      { sku: '', name: '', qty: 0, price: 0, orderNo: 'RONG', pic: 'hoancd' }
    ];
    const o = sd.donChoNhapSap(lines, (pic) => roles.donCuaToi(hoan, pic));
    check('Riêng: gom theo mã đơn, chỉ đơn của mình, bỏ dòng rỗng', o.rows.length === 2 && o.rows.find((r) => r.orderNo === 'SAP-SO-1').soDong === 2, o.rows);
    check('thành tiền = Σ qty×đơn giá (cùng cách màn Đơn chờ duyệt hiện), tổng đúng', o.rows.find((r) => r.orderNo === 'SAP-SO-1').tong === 250 && o.tong === 280, o);
    check('đơn mới nhất trước; TL- gắn cờ thanh lý', o.rows[0].orderNo === 'TL-123456' && o.rows[0].thanhLy === true && o.rows[1].thanhLy === false);
    check('Chung: mọi đơn', sd.donChoNhapSap(lines, () => true).rows.length === 3);
  }

  console.log('\n6. Định dạng');
  check('tiền gọn: Tỷ / Tr / số đầy đủ', sd.dinhDangTienGon(2.5e9) === '2,50 Tỷ' && sd.dinhDangTienGon(3.2e6) === '3,2 Tr' && /^1\.?234$/.test(sd.dinhDangTienGon(1234)));
  check('% đạt: mục tiêu ≤ 0 -> null', sd.phanTramDat(5, 0) === null && sd.phanTramDat(5, -1) === null && sd.phanTramDat(50, 100) === 50);

  console.log('\n7. Nối vào app (menu, quyền, App.jsx)');
  {
    const navSrc = SRC('utils/navMeta.js');
    const tabs = (await import(url('navMeta.js'))).TAB_IDS;
    check('menu có mục "Dashboard Sale" (id sale-dashboard) với icon Gauge, import đủ icon', tabs.includes('sale-dashboard') && /id: 'sale-dashboard', label: 'Dashboard Sale', icon: 'Gauge'/.test(navSrc) && /ListFilter, Gauge\n\} from 'lucide-react'/.test(navSrc));
    const navm = await import(url('navMeta.js'));
    check('kế toán KHÔNG vào được Dashboard Sale (rơi về tab mặc định của họ); các vai khác vào được',
      navm.tabHopLe('sale-dashboard', 'account') === 'products' && ['sale', 'admin', 'leader', 'creator'].every((r) => navm.tabHopLe('sale-dashboard', r) === 'sale-dashboard'));
    check('mọi mục menu + tab vẫn có icon khác nhau', (() => { const seen = {}; let ok = true; navm.moiIcon().forEach((x) => { if (seen[x.icon]) ok = false; seen[x.icon] = 1; }); return ok; })());
    const app = SRC('App.jsx');
    check('App: tải lười SaleDashboard, bọc KeepAliveTab, truyền giao dịch đã gộp năm cũ + txYears + plans + plan2026 + isActive',
      /const SaleDashboard = React\.lazy\(\(\) => import\('\.\/components\/SaleDashboard'\)\);/.test(app) &&
      /<KeepAliveTab isActive=\{activeTab === 'sale-dashboard'\}[\s\S]*?<SaleDashboard\s*\n\s*token=\{session\.token\}\s*\n\s*activeUser=\{activeUser\}\s*\n\s*transactions=\{allTransactions\}\s*\n\s*txYears=\{txYears\}\s*\n\s*plans=\{plans\}\s*\n\s*plan2026=\{plan2026\}\s*\n\s*isActive=\{activeTab === 'sale-dashboard'\}/.test(app));
    check('App nạp KPI năm (getReportContext) cả khi mở Dashboard Sale', /activeTab === 'sale-dashboard'/.test(app.split('const canDenBaoCao')[1].split('\n')[0]));
    const cmp = SRC('components/SaleDashboard.jsx');
    check('màn dùng useEnsureYears cho năm đang xem + năm trước và không hiện số khi thiếu năm (TableState)', /useEnsureYears\(txYears, \[nam, nam - 1\]\)/.test(cmp) && /chuaDu \? \(/.test(cmp));
    check('công nợ + đơn chờ gọi API có sẵn (không thêm endpoint), lỗi từng khung riêng (Promise.allSettled)', /api\.getDebtView\(token/.test(cmp) && /api\.getOrders\(token\)/.test(cmp) && /Promise\.allSettled/.test(cmp));
    check('chọn Riêng bị khoá khi tài khoản chưa có saleId', /disabled=\{!coSaleId\}/.test(cmp));
    check('không dùng số `revenue` gộp (chỉ netRevenue)', !/t\.revenue/.test(SRC('utils/saleDashboard.js')));
  }

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
