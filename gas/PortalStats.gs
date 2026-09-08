/**
 * PortalStats.gs — số liệu tổng quan của OEM cho cổng VHKD.
 *
 * VÌ SAO NẰM Ở ĐÂY chứ không ở dự án Karofi ID: năm con số dưới đây lấy từ BA
 * TAB KHÁC NHAU, mỗi tab một bố cục riêng của app này. Chép các quy ước đó
 * sang cổng là tạo bản sao thứ hai sẽ trôi lệch.
 *
 * MỖI CON SỐ MỘT NGUỒN, do người dùng chốt (2026-09-08):
 *
 *   Doanh thu tháng trước  tab Data     — số thật từ SAP
 *   Doanh thu Done MTD     tab Data     — cùng nguồn, chỉ khác tháng
 *   Plan update của sale   Plan_Thang   — cột F, bản sale tự cập nhật trong tháng
 *   Mục tiêu Plan KPI      Plan2026     — lưới KPI cả năm theo khách
 *   Tổng công nợ           Debt         — tiêu đề ở HÀNG 3, không phải hàng 1
 *
 * Cột `Done` (G) của Plan_Thang KHÔNG còn được dùng cho con số Done: nó là ô
 * người ta điền/dán tay, còn tab Data là bản đổ từ SAP. Hai chỗ này lệch nhau
 * là chuyện thường, và cổng phải nói con số của nguồn nào.
 *
 * Cột `Plan KPI` (E) của Plan_Thang cũng KHÔNG còn được dùng: nó là bản chép
 * lại của Plan2026 tại thời điểm sale lập kế hoạch, nên tháng nào sale chưa
 * lập dòng thì mục tiêu biến mất khỏi tổng. Đọc thẳng Plan2026 thì mục tiêu
 * của tháng luôn đủ, không phụ thuộc sale đã lập kế hoạch hay chưa.
 *
 * VÌ SAO ĐÚNG PHÂN QUYỀN: dùng đúng oemAppScopeOf_ + oemAppMatchesSale_ mà
 * getBootstrap và bảng công nợ đang dùng. Sale chỉ cộng được dòng của chính
 * mình; saleId trống thì KHÔNG cộng gì (fail closed) chứ không cộng tất cả.
 *
 * Tiền ở đây là VND.
 */

var OEMAPP_PSTATS_CACHE_KEY_ = 'oemapp_pstats_v1';
/**
 * 10 phút, và khoá cache có scope trong tên.
 *
 * Vì sao cần cache: hàm này đọc trọn tab Data (lượt đọc đắt nhất của backend
 * này — xem chú thích đầu SalesData.gs), mà cổng gọi nó mỗi lần có người mở
 * trang. Vì sao chia theo scope: nếu dùng chung một khoá thì bản chụp của
 * admin sẽ được trả về cho sale mở trang sau đó — đúng kiểu lọt dữ liệu mà
 * getBootstrap đã phải sửa hồi 2026-08-20.
 */
var OEMAPP_PSTATS_TTL_ = 600;

function oemAppPstatsThang_(lech) {
  var now = new Date();
  var tz = 'GMT+7';
  var nam = parseInt(Utilities.formatDate(now, tz, 'yyyy'), 10);
  var thang = parseInt(Utilities.formatDate(now, tz, 'MM'), 10) + (lech || 0);
  while (thang < 1) { thang += 12; nam -= 1; }
  while (thang > 12) { thang -= 12; nam += 1; }
  return oemAppPlanFormatMonth_(nam, thang);
}

/**
 * Cột tháng hiện tại trong lưới Plan2026, hoặc -1 nếu năm đang chạy không phải
 * năm của lưới đó.
 *
 * `oemAppLoadPlan2026_` đọc tab tên cứng 'Plan2026' với 12 cột tháng, nên sang
 * 2027 nó không còn là kế hoạch của năm hiện tại. Trả -1 để nơi gọi báo ra
 * thay vì lặng lẽ hiện mục tiêu của năm cũ như mục tiêu tháng này.
 */
function oemAppPstatsCotPlan2026_() {
  var tz = 'GMT+7';
  var now = new Date();
  if (parseInt(Utilities.formatDate(now, tz, 'yyyy'), 10) !== 2026) return -1;
  return parseInt(Utilities.formatDate(now, tz, 'MM'), 10) - 1;
}

function oemAppBuildPortalStats_(scope) {
  var thangNay = oemAppPstatsThang_(0);
  var thangTruoc = oemAppPstatsThang_(-1);

  // Hai con số doanh thu cùng đi qua tab Data trong MỘT lượt quét: đó là lượt
  // đọc đắt nhất của backend này (xem chú thích đầu SalesData.gs).
  var dtThangTruoc = 0, done = 0;
  var soDongThieuThang = 0;
  oemAppLoadTransactions_().forEach(function (t) {
    if (!oemAppMatchesSale_(t.sale, scope)) return;
    if (!t.month) { soDongThieuThang++; return; }
    var tien = t.netRevenue || t.revenue || 0;
    if (t.month === thangTruoc) dtThangTruoc += tien;
    else if (t.month === thangNay) done += tien;
  });

  var planUpdate = 0, soKhach = 0, choDuyet = 0;
  oemAppLoadSalesPlans_().forEach(function (p) {
    if (p.month !== thangNay) return;
    if (!oemAppMatchesSale_(p.sale, scope)) return;
    planUpdate += p.planUpdate || 0;
    soKhach++;
    if (String(p.status || '') === 'Chờ duyệt') choDuyet++;
  });

  // Mục tiêu tháng lấy từ lưới KPI cả năm, lọc theo PIC bằng đúng cách mà
  // oemAppGetReportContext_ đang dùng cho cùng bảng này.
  var planKpi = 0;
  var cotKpi = oemAppPstatsCotPlan2026_();
  if (cotKpi >= 0) {
    var luoi = oemAppLoadPlan2026_();
    Object.keys(luoi).forEach(function (code) {
      if (!oemAppMatchesSale_(luoi[code].pic, scope)) return;
      planKpi += luoi[code].months[cotKpi] || 0;
    });
  }

  var congNo = 0, soKhachNo = 0;
  oemAppLoadDebtRowsCached_().forEach(function (r) {
    if (!oemAppMatchesSale_(r.pic, scope)) return;
    congNo += r.balance || 0;
    if (r.balance) soKhachNo++;
  });

  return {
    thangNay: thangNay,
    thangTruoc: thangTruoc,
    dtThangTruoc: dtThangTruoc,
    done: done,
    planUpdate: planUpdate,
    planKpi: planKpi,
    // Rỗng khi năm hiện tại không phải 2026: tab Plan2026 có tên cứng, nên
    // cổng phải nói ra chứ không hiện số 0 như một mục tiêu thật.
    kpiHetHan: cotKpi < 0,
    soKhachCoKeHoach: soKhach,
    soDongChoDuyet: choDuyet,
    congNo: congNo,
    soKhachNo: soKhachNo,
    // Dòng trên tab Data không có tháng thì không cộng vào tháng nào. Báo số
    // lượng ra ngoài để cổng nói được là con số đang thiếu bao nhiêu dòng,
    // thay vì im lặng bỏ qua chúng.
    soDongThieuThang: soDongThieuThang,
    phamVi: scope.all ? '' : scope.saleId
  };
}

function oemAppGetPortalStats_(token) {
  var user = oemAppRequireSession_(token);
  var scope = oemAppScopeOf_(user);

  var cache = CacheService.getScriptCache();
  var key = OEMAPP_PSTATS_CACHE_KEY_ + '_' + oemAppBootstrapVersion_() + '_' + scope.key;
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (err) {}
  }

  var out = oemAppBuildPortalStats_(scope);
  try { cache.put(key, JSON.stringify(out), OEMAPP_PSTATS_TTL_); } catch (err) {}
  return out;
}
