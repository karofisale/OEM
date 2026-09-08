/**
 * PortalStats.gs — số liệu tổng quan của OEM cho cổng VHKD.
 *
 * VÌ SAO NẰM Ở ĐÂY chứ không ở dự án Karofi ID: bốn con số dưới đây có định
 * nghĩa riêng của app này — Plan KPI/Plan_Update/Done là ba cột của tab
 * Plan_Thang, doanh thu thực là tab Data do skill up-dt-oem đổ từ SAP, công nợ
 * là tab Debt với dòng tiêu đề ở HÀNG 3 chứ không phải hàng 1. Chép các quy
 * ước đó sang cổng là tạo bản sao thứ hai sẽ trôi lệch.
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

function oemAppBuildPortalStats_(scope) {
  var thangNay = oemAppPstatsThang_(0);
  var thangTruoc = oemAppPstatsThang_(-1);

  var dtThangTruoc = 0;
  var soDongThieuThang = 0;
  oemAppLoadTransactions_().forEach(function (t) {
    if (!oemAppMatchesSale_(t.sale, scope)) return;
    if (!t.month) { soDongThieuThang++; return; }
    if (t.month !== thangTruoc) return;
    dtThangTruoc += (t.netRevenue || t.revenue || 0);
  });

  var planKpi = 0, planUpdate = 0, done = 0, soKhach = 0, choDuyet = 0;
  oemAppLoadSalesPlans_().forEach(function (p) {
    if (p.month !== thangNay) return;
    if (!oemAppMatchesSale_(p.sale, scope)) return;
    planKpi += p.planKpi || 0;
    planUpdate += p.planUpdate || 0;
    done += p.done || 0;
    soKhach++;
    if (String(p.status || '') === 'Chờ duyệt') choDuyet++;
  });

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
