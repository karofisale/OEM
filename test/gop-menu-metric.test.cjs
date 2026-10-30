/**
 * gop-menu-metric.test.cjs — gộp menu + thẻ KPI "Tổng quan Metric" (30/10/2026).
 *
 *   node test/gop-menu-metric.test.cjs
 *
 *  1. Menu: Dashboard Sale là trang đầu của Sale; "AI Nhận Đơn" + "Đơn Hàng Chờ Duyệt" -> mục "Đơn hàng" (2 tab con);
 *     Kế hoạch SOP là tab con của Kế hoạch kinh doanh; Công nợ là tab con của Khách hàng OEM. Id tab cũ vẫn dẫn tới đúng mục.
 *  2. Thẻ KPI: Sản lượng Máy / Bơm tách riêng, Khách active đếm theo Search Code, Số đơn = số mã SO khác nhau.
 *  3. Nối vào App/hub: các màn con còn được dựng, nút "Mở Chờ duyệt" + lệnh mở tab con (useJump).
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
  const nm = await import(url('navMeta.js'));
  const dm = await import(url('dashboardMetric.js'));
  const roles = await import(url('roles.js'));
  const st = await import(url('settings.js'));

  console.log('1. Menu gộp');
  const idMenu = nm.NAV.map((m) => m.id);
  check('menu không còn mục riêng pending-orders / sop / debt-importer', !idMenu.includes('pending-orders') && !idMenu.includes('sop') && !idMenu.includes('debt-importer') && !nm.TAB_IDS.some((t) => ['pending-orders', 'sop', 'debt-importer'].includes(t)), nm.TAB_IDS);
  const donHang = nm.NAV.find((m) => m.id === 'ai-agent');
  check('"AI Nhận Đơn Hàng" đổi tên thành "Đơn hàng"', !!donHang && donHang.label === 'Đơn hàng' && !nm.NAV.some((m) => /AI Nhận Đơn|Chờ Duyệt/i.test(m.label)));
  check('Đơn hàng có 2 tab con: Nhận đơn + Chờ duyệt', JSON.stringify(nm.SUBTABS.orders.map((t) => t.id)) === JSON.stringify(['receive', 'review']) && nm.SUBTABS.orders[1].label === 'Chờ duyệt');
  check('Khách hàng OEM có tab con Danh sách khách + Công nợ', JSON.stringify(nm.SUBTABS.clients.map((t) => t.id)) === JSON.stringify(['list', 'debt']) && nm.SUBTABS.clients[1].label === 'Công nợ');
  check('Kế hoạch kinh doanh có thêm tab con "Kế hoạch SOP" (cuối thanh tab)', nm.SUBTABS['sales-plan'].map((t) => t.id).slice(-1)[0] === 'sop' && nm.SUBTABS['sales-plan'].slice(-1)[0].label === 'Kế hoạch SOP');
  check('SOP vẫn giữ 3 tab con của nó (Xem / Lập kế hoạch / Chờ duyệt)', nm.SUBTABS.sop.map((t) => t.id).join() === 'view,plan,approve');
  const icons = nm.moiIcon().map((x) => x.icon);
  check('mỗi mục menu/tab con một icon RIÊNG (không trùng sau khi gộp)', new Set(icons).size === icons.length, icons.filter((x, i) => icons.indexOf(x) !== i));
  check('kế toán: chỉ Sản phẩm + Khách hàng OEM (Công nợ nằm trong Khách hàng OEM)', JSON.stringify(nm.ACCOUNT_TAB_IDS) === JSON.stringify(['products', 'clients']) && nm.tabMacDinh('account') === 'products');
  check('Sale mở đầu bằng Dashboard Sale; creator vẫn vào Đơn hàng; admin/leader vào báo cáo doanh thu',
    nm.tabMacDinh('sale') === 'sale-dashboard' && nm.tabMacDinh('SALE') === 'sale-dashboard' && nm.tabMacDinh('creator') === 'ai-agent' && nm.tabMacDinh(undefined) === 'ai-agent' && nm.tabMacDinh('admin') === 'revenue-reports' && nm.tabMacDinh('leader') === 'revenue-reports');
  check('Sale: tab rác -> Dashboard Sale; tab đã nhớ hợp lệ thì giữ', nm.tabHopLe('xyz', 'sale') === 'sale-dashboard' && nm.tabHopLe(null, 'sale') === 'sale-dashboard' && nm.tabHopLe('clients', 'sale') === 'clients');
  check('Trang đầu "auto" của Sale chưa nhớ gì -> Dashboard Sale; chọn tab cụ thể vẫn thắng',
    st.tabMoDau({ landing: 'auto', saved: null, role: 'sale', tabHopLe: nm.tabHopLe }) === 'sale-dashboard' && st.tabMoDau({ landing: 'ai-agent', saved: null, role: 'sale', tabHopLe: nm.tabHopLe }) === 'ai-agent');
  check('id tab CŨ đã nhớ vẫn dẫn tới mục chứa nó: pending-orders -> Đơn hàng, sop -> Kế hoạch KD, debt-importer -> Khách hàng OEM',
    nm.tabHopLe('pending-orders', 'sale') === 'ai-agent' && nm.tabHopLe('sop', 'admin') === 'sales-plan' && nm.tabHopLe('debt-importer', 'sale') === 'clients');
  check('kế toán nhớ "debt-importer" cũ -> Khách hàng OEM (vẫn vào được); nhớ "sop" cũ -> mặc định, không lọt vào Kế hoạch KD',
    nm.tabHopLe('debt-importer', 'account') === 'clients' && nm.tabHopLe('sop', 'account') === 'products');
  const tcAcc = st.tabChoPhep('account', nm.NAV, nm.ACCOUNT_TAB_IDS).map((x) => x.id);
  check('Trang đầu cho kế toán: đúng 2 mục', JSON.stringify(tcAcc) === JSON.stringify(['products', 'clients']), tcAcc);

  console.log('2. Thẻ KPI Tổng quan Metric');
  const may = { sku: '1002020005', skuName: 'Máy RO BCN-50', group: 'Máy', qty: 10 };
  const mayTenCoBom = { sku: '1003030001', skuName: 'Máy lọc RO có bơm tăng áp', group: 'Máy', qty: 4 };
  const bom = { sku: '2008010042', skuName: 'Bơm 24-S 8369T-LC', group: 'Linh kiện', qty: 30 };
  const bomTheoNhom = { sku: '2008010099', skuName: 'Pump 8369', group: 'Bơm', qty: 5 };
  const bomHoa = { sku: '2008010050', skuName: 'BƠM TĂNG ÁP', group: '', qty: 2 };
  const lk = { sku: '2007030101', skuName: 'Van điện từ 24/4U', group: 'Linh kiện', qty: 100 };
  const tenCoChuBom = { sku: '2009000001', skuName: 'Bộ lọc bombo', group: 'Lõi', qty: 7 };
  check('máy = mã SAP bắt đầu bằng 1; bơm = tên/nhóm có từ "bơm" (không dấu, hoa/thường đều được); còn lại = khác',
    dm.loaiSanPham(may) === 'may' && dm.loaiSanPham(bom) === 'bom' && dm.loaiSanPham(bomTheoNhom) === 'bom' && dm.loaiSanPham(bomHoa) === 'bom' && dm.loaiSanPham(lk) === 'khac');
  check('máy mà tên có chữ "bơm" vẫn là MÁY (xét mã trước); chữ chỉ chứa "bom" (bombo) KHÔNG là bơm', dm.loaiSanPham(mayTenCoBom) === 'may' && dm.loaiSanPham(tenCoChuBom) === 'khac');
  check('dòng thiếu dữ liệu không làm lỗi', dm.loaiSanPham(null) === 'khac' && dm.loaiSanPham({}) === 'khac' && dm.loaiSanPham({ sku: 1002, skuName: null }) === 'may');
  const sl = dm.sanLuongTheoLoai([may, mayTenCoBom, bom, bomTheoNhom, bomHoa, lk, tenCoChuBom, { sku: '1', qty: null }, { sku: '2', qty: 'x' }]);
  check('sản lượng cộng đúng theo loại (qty rỗng/chữ tính 0)', sl.may === 14 && sl.bom === 37 && sl.khac === 107, sl);
  check('máy + bơm + khác = tổng cũ (không mất hàng nào)', sl.may + sl.bom + sl.khac === 10 + 4 + 30 + 5 + 2 + 100 + 7);
  check('rỗng/undefined -> 0', JSON.stringify(dm.sanLuongTheoLoai([])) === '{"may":0,"bom":0,"khac":0}' && dm.sanLuongTheoLoai(undefined).may === 0);

  check('số đơn = số mã SO KHÁC NHAU (một đơn nhiều dòng tính một); bỏ dòng không có mã đơn; không phân biệt hoa/thường/khoảng trắng',
    dm.demDon([{ orderNo: 'SO1' }, { orderNo: 'SO1' }, { orderNo: ' so1 ' }, { orderNo: 'SO2' }, { orderNo: '' }, {}, { orderNo: null }]) === 2);
  check('không có dòng nào -> 0 đơn', dm.demDon([]) === 0 && dm.demDon(undefined) === 0);

  const khop = roles.khopSale;
  const clients = [
    { code: '1000001', codeSearch: 'TECOM', status: 'Active', sale: 'KH Luyến' },
    { code: '1000002', codeSearch: 'tecom', status: 'Active', sale: 'KH Luyến' },      // cùng Search Code, mã SAP khác
    { code: '1000003', codeSearch: 'TECOM ', status: 'Inactive', sale: 'KH Luyến' },
    { code: '1000004', codeSearch: 'MAXIM', status: 'Inactive', sale: 'KH Hải' },
    { code: '1000005', codeSearch: 'MAXIM', status: 'Active', sale: 'KH Hải' },
    { code: '1000006', codeSearch: 'ALPHA', status: ' Active ', sale: 'KH Hải' },
    { code: '1000007', codeSearch: '', status: 'Active', sale: 'KH Hải' },                // thiếu Search Code -> tính theo mã SAP
    { code: '1000008', codeSearch: '', status: 'Active', sale: 'KH Hải' }
  ];
  check('Khách active đếm theo Search Code: TECOM (2 mã SAP) = 1, MAXIM = 1, ALPHA = 1, 2 khách thiếu Search Code = 2 -> 5', dm.demKhachActive(clients, 'ALL', khop) === 5, dm.demKhachActive(clients, 'ALL', khop));
  check('trước đây đếm theo dòng/mã SAP sẽ ra 6 — nay là 5', clients.filter((c) => c.status.trim() === 'Active').length === 6);
  check('lọc theo Sale vẫn áp: KH Luyến = 1 (TECOM), KH Hải = 4', dm.demKhachActive(clients, 'KH Luyến', khop) === 1 && dm.demKhachActive(clients, 'KH Hải', khop) === 4);
  check('không có khách -> 0', dm.demKhachActive([], 'ALL', khop) === 0 && dm.demKhachActive(undefined, 'ALL', khop) === 0);

  console.log('3. Nối vào App / màn hình');
  const app = SRC('App.jsx');
  const dash = SRC('components/Dashboard.jsx');
  const hub = SRC('components/OrdersHub.jsx');
  const chub = SRC('components/ClientsHub.jsx');
  const sp = SRC('components/SalesPlan.jsx');
  const sop = SRC('components/SopPlan.jsx');
  const debt = SRC('components/DebtManagement.jsx');
  const ai = SRC('components/AIOrderAgent.jsx');
  check('App: OrdersHub + ClientsHub tải lười; không còn dựng riêng OrdersReview/SopPlan/DebtManagement/ClientManagement',
    /lazy\(\(\) => import\('\.\/components\/OrdersHub'\)\)/.test(app) && /lazy\(\(\) => import\('\.\/components\/ClientsHub'\)\)/.test(app) && !/<OrdersReview|<SopPlan|<DebtManagement|<ClientManagement|<AIOrderAgent/.test(app) && !/activeTab === 'pending-orders'|activeTab === 'sop'|activeTab === 'debt-importer'/.test(app));
  check('App: lệnh mở tab con đi qua guard (còn thay đổi chưa lưu thì hỏi) và Bán hàng thanh lý mở thẳng Chờ duyệt',
    /const moTabCon = \(tab, sub\) => guard\(\(\) => \{ setJump\(/.test(app) && /onOpenOrders=\{\(\) => moTabCon\('ai-agent', 'review'\)\}/.test(app) && /jump=\{jump\.tab === 'ai-agent' \? jump : null\}/.test(app) && /jump=\{jump\.tab === 'clients' \? jump : null\}/.test(app));
  check('App: Kế hoạch KD nhận materials + onAddMaterial để dựng tab SOP', /<SalesPlan[\s\S]*?materials=\{materials\}[\s\S]*?onAddMaterial=\{handleAddMaterial\}/.test(app));
  check('OrdersHub: cả hai tab giữ nguyên (KeepAliveTab); Chờ duyệt chỉ "active" khi đang ở đúng tab con; nhận lệnh jump',
    /<KeepAliveTab isActive=\{subView === 'receive'\}>/.test(hub) && /<KeepAliveTab isActive=\{subView === 'review'\}>/.test(hub) && /isActive=\{isActive && subView === 'review'\}/.test(hub) && /useJump\(jump, tabs, setSubView\)/.test(hub) && /onOpenReview=\{\(\) => setSubView\('review'\)\}/.test(hub));
  check('AIOrderAgent: có nút "Mở Đơn hàng chờ duyệt" sau khi lưu; chữ hướng dẫn trỏ về tab "Chờ duyệt" (không còn nhắc mục cũ)',
    /onOpenReview/.test(ai) && /Mở Đơn hàng chờ duyệt/.test(ai) && !/vào mục "Đơn hàng chờ duyệt"/.test(ai));
  check('ClientsHub: Danh sách khách + Công nợ (embedded), Công nợ tải lười', /<ClientManagement /.test(chub) && /<DebtManagement[^>]*embedded/.test(chub) && /lazy\(\(\) => import\('\.\/DebtManagement'\)\)/.test(chub) && /useJump\(jump, tabs, setSubView\)/.test(chub));
  check('SalesPlan: tab SOP (tải lười) NẰM NGOÀI khối chờ doanh thu năm cũ; SopPlan/DebtManagement có chế độ embedded bỏ thẻ tiêu đề',
    /lazy\(\(\) => import\('\.\/SopPlan'\)\)/.test(sp) && /<KeepAliveTab isActive=\{subView === 'sop'\}>[\s\S]*?<SopPlan [^>]*embedded/.test(sp) && sp.indexOf("subView === 'sop'") > sp.indexOf('</>)}') && /embedded = false/.test(sop) && /embedded = false/.test(debt));
  check('Dashboard: thẻ Sản Lượng Máy + Sản Lượng Bơm thay thẻ Sản Lượng Xuất Bán; Số Lượng Đơn thay Số Lượt Giao Dịch; Khách active qua demKhachActive',
    /Sản Lượng Máy/.test(dash) && /Sản Lượng Bơm/.test(dash) && !/Sản Lượng Xuất Bán/.test(dash) && /Số Lượng Đơn/.test(dash) && !/Số Lượt Giao Dịch/.test(dash) && !/} Bản ghi/.test(dash) && /demKhachActive\(clients, saleFilter, khopSale\)/.test(dash) && /sanLuongTheoLoai\(rows\)/.test(dash) && /demDon\(rows\)/.test(dash));
  const jmp = SRC('hooks/useJump.js');
  check('useJump: áp lệnh có số thứ tự mới (kể cả lệnh đến lúc dựng lần đầu), bỏ tab con vai trò không có', /useRef\(0\)/.test(jmp) && /jump\.n === daAp\.current/.test(jmp) && /tabs\.some\(\(t\) => t\.id === jump\.sub\)/.test(jmp));

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
