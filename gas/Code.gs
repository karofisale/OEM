/**
 * OEM App backend -- STANDALONE Google Apps Script Web App (React app at
 * D:\Antigravity\OEM App, deploy https://karofisale.github.io/OEM/).
 *
 * (2026-08-19: SEPARATED from the shared up-dt-oem/cong-no-oem project it was
 * merged into on 2026-08-18. Reason: a controlled latency test showed this
 * backend was consistently ~5-10x slower than a brand-new standalone Apps
 * Script project (11-31s vs 1.4-9.6s for the same trivial call) even on
 * calls NOT hit by a separate, unrelated network-path interception issue (a
 * corporate proxy/security gateway problem -- confirmed via testing, NOT
 * fixed by this change, still expect occasional failures/retries). The
 * up-dt-oem project being container-bound to the huge, formula-heavy "OEM"
 * Data sheet looked like the cause of the extra latency. This standalone
 * project uses SpreadsheetApp.openById() instead of getActiveSpreadsheet()
 * to avoid that container-attach overhead, and gets its own execution
 * quota -- isolated from up-dt-oem/cong-no-oem's automated runs.
 *
 * D:\Operation\Claude\Scripts\up-dt-oem\Code.gs (+ UpDtOem.gs/CongNoOem.gs/
 * OemAppBackend.gs) no longer serves OEM App traffic -- the "if (body.fn)"
 * routing line and OemAppBackend.gs file were removed from that project.
 *
 * Login PIN + session token via CacheService (6h TTL) -- no SECRET, that's
 * only for the up-dt-oem/cong-no-oem skills sharing the OTHER project.
 * Deploy: Execute as Me, Who has access: Anyone.
 *
 * Logic split across files (Apps Script merges every .gs file in a project
 * into one shared scope at runtime -- file count/split has zero effect on
 * behavior or speed, purely for readability):
 *   Code.gs (this file) - router + entry point + shared constants
 *   Helpers.gs           - generic Sheet/number/date helpers
 *   Auth.gs              - login, session tokens, change-PIN
 *   Clients.gs           - client (Khach hang OEM) CRUD
 *   Products.gs          - material/product catalogue
 *   SalesData.gs         - transactions, sales plans, baselines, getBootstrap
 *   Orders.gs            - AI Order Agent -> SAP staging tab "Orders"
 *   Sop.gs                - SOP monthly per-SKU quantity plan (draft + approve)
 *   Debt.gs               - customer debt (công nợ) view + Excel import
 *   PricePlan.gs           - bảng giá bán: đề xuất/duyệt giá lẻ+KM (chung hoặc theo khách)
 *   Cost.gs                - giá vốn theo tháng: so sánh LNG khi duyệt giá, công cụ tính giá gợi ý
 *   Ai.gs                 - Gemini API order parsing (replaces the old client-side heuristic matcher)
 *   AiChat.gs             - Gemini function-calling lookup chat (separate feature from Ai.gs)
 */

var OEMAPP_SHEET_ID = '1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk';


function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ error: String(err) });
  }
  return oemAppDoPost_(body);
}


function doGet(e) {
  return jsonOutput_({ ok: true, info: 'OEM App backend is alive. Use POST.' });
}


var OEMAPP_GIDS = {
  USERS: 276721346,
  CLIENTS: 385229237,
  TRANSACTIONS: 1448176667, // = tab "Data" (UpDtOem.gs), đọc theo gid thay vì tên
  PLAN_THANG: 1302921161,
  SALES_REVENUE: 965378295
};


var OEMAPP_SESSION_TTL_SECONDS = 6 * 60 * 60; // 6h


/**
 * Hàm GHI — phải chạy trong khoá toàn cục, mỗi lúc một người.
 *
 * Vì sao cần: nhiều hàm ở đây theo kiểu đọc-cả-bảng, tính chỉ số dòng, rồi ghi
 * đè lại (submitSalesPlan, submitSopDraft, importDebtExcel, approvePriceBatch).
 * Hai người bấm Lưu gần nhau thì người sau ghi dựa trên bản chụp CHƯA có thay
 * đổi của người trước — số của người trước biến mất, không báo lỗi gì. FC đã
 * gặp đúng lỗi này và sửa bằng LockService (xem Router.gs bên đó); backend này
 * trước đây không dùng LockService ở bất kỳ đâu.
 *
 * Đọc dữ liệu phải nằm BÊN TRONG khoá, không phải trước — đó là nửa quan trọng
 * hơn của cách sửa. Ở đây đúng như vậy vì mỗi hàm tự đọc Sheet trong thân nó,
 * mà thân nó chạy bên trong khoá. Đã rà: không hàm ghi nào đọc dữ liệu nghiệp
 * vụ qua CacheService (chỗ duy nhất đọc cache là oemAppRequireSession_), nên
 * không có đường nào lọt dữ liệu cũ vào trong khoá.
 *
 * `login` CỐ Ý không nằm ở đây dù nó có thể ghi: nhánh ghi của nó chỉ là băm
 * lại PIN còn dạng thô, mà toàn bộ 6 bản ghi đã băm xong từ 2026-09-04 nên
 * nhánh đó đã chết. Đưa login vào khoá là xếp hàng MỌI lượt đăng nhập sau một
 * khoá duy nhất, trên một backend vốn đã chậm.
 */
var OEMAPP_WRITE_FNS_ = {
  addClient: 1, editClient: 1, addMaterial: 1, editMaterial: 1,
  submitSalesPlan: 1, approveSalesPlan: 1, changePassword: 1,
  saveOrder: 1, updateOrderLine: 1, insertOrderLine: 1, deleteOrderLine: 1, deleteOrder: 1,
  submitSopDraft: 1, approveSop: 1, importDebtExcel: 1,
  submitPriceProposal: 1, approvePriceBatch: 1, rejectPriceBatch: 1, importCostExcel: 1
};

/**
 * Chờ tối đa 25 giây — dưới hạn 60 giây của client (api.js) để lỗi hết giờ chờ
 * hiện ra là câu bên dưới, không phải "máy chủ không phản hồi".
 *
 * Dùng tryLock chứ không waitLock: hết giờ thì trả về false cho mình tự soạn
 * câu báo, thay vì ném ra một exception của nền tảng mà người dùng không hiểu.
 * Câu báo nói rõ "chưa lưu" là có chủ ý — client không tự thử lại hàm ghi nữa
 * (xem NON_IDEMPOTENT_FNS), nên người dùng cần biết mình phải bấm lại.
 */
var OEMAPP_LOCK_WAIT_MS_ = 25 * 1000;

function oemAppRunExclusive_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(OEMAPP_LOCK_WAIT_MS_)) {
    throw new Error('Có người khác đang lưu, hệ thống chờ quá lâu nên CHƯA LƯU gì cả. ' +
                    'Đợi vài giây rồi bấm lưu lại.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function oemAppDoPost_(body) {
  var handler = oemAppApiMap_[body.fn];
  if (!handler) return jsonOutput_({ error: 'Unknown function: ' + body.fn });
  try {
    var result = OEMAPP_WRITE_FNS_[body.fn]
      ? oemAppRunExclusive_(function () { return handler.apply(null, body.args || []); })
      : handler.apply(null, body.args || []);
    return jsonOutput_({ result: result });
  } catch (err) {
    return jsonOutput_({ error: err.message || String(err) });
  }
}


function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * Bảng định tuyến = danh sách trắng: chỉ hàm có tên ở đây mới gọi được từ ngoài.
 *
 * Backend deploy ở chế độ "Anyone", nên MỌI hàm trong bảng này đều gọi được từ
 * internet. Hàm nào không tự kiểm token là hàm công khai — hiện chỉ còn `ping`,
 * `getUserList` (chỉ trả về tên) và `login` (có đếm lần sai, xem LoginThrottle).
 *
 * Đã gỡ 2026-09-04: sopDiag / debtDiag / kitsDiag / forceRefreshBootstrap.
 * Bốn hàm này không kiểm token và không nơi nào trong app gọi tới. Ba hàm
 * *Diag viết ra để soi dữ liệu lúc dựng tính năng — chúng trả về danh sách kỳ,
 * danh sách sale, tiêu đề cột bảng công nợ và toàn bộ định nghĩa bộ sản phẩm
 * cho bất kỳ ai hỏi. forceRefreshBootstrap thì cho người lạ ép backend dựng
 * lại payload liên tục. Thân hàm vẫn còn trong Sop.gs/Debt.gs/Ai.gs/SalesData.gs
 * để chạy tay từ trình soạn thảo khi cần soi dữ liệu.
 */
var oemAppApiMap_ = {
  ping: oemAppPing_,
  getUserList: oemAppGetUserList_,
  login: oemAppLogin_,
  getBootstrap: oemAppGetBootstrap_,
  getReportContext: oemAppGetReportContext_,
  addClient: oemAppAddClient_,
  editClient: oemAppEditClient_,
  addMaterial: oemAppAddMaterial_,
  editMaterial: oemAppEditMaterial_,
  submitSalesPlan: oemAppSubmitSalesPlan_,
  approveSalesPlan: oemAppApproveSalesPlan_,
  changePassword: oemAppChangePassword_,
  saveOrder: oemAppSaveOrder_,
  getOrders: oemAppGetOrders_,
  updateOrderLine: oemAppUpdateOrderLine_,
  insertOrderLine: oemAppInsertOrderLine_,
  deleteOrderLine: oemAppDeleteOrderLine_,
  deleteOrder: oemAppDeleteOrder_,
  getSopPlanningContext: oemAppGetSopPlanningContext_,
  submitSopDraft: oemAppSubmitSopDraft_,
  getSopPendingReview: oemAppGetSopPendingReview_,
  approveSop: oemAppApproveSop_,
  getSopView: oemAppGetSopView_,
  getMySopPlan: oemAppGetMySopPlan_,
  getDebtView: oemAppGetDebtView_,
  importDebtExcel: oemAppImportDebtExcel_,
  submitPriceProposal: oemAppSubmitPriceProposal_,
  getPendingPriceProposals: oemAppGetPendingPriceProposals_,
  approvePriceBatch: oemAppApprovePriceBatch_,
  rejectPriceBatch: oemAppRejectPriceBatch_,
  getClientPriceOverrides: oemAppGetClientPriceOverrides_,
  getCostBySku: oemAppGetCostBySku_,
  calculateSuggestedPrice: oemAppCalculateSuggestedPrice_,
  importCostExcel: oemAppImportCostExcel_,
  aiParseOrder: oemAppAiParseOrder_,
  aiChat: oemAppAiChat_
};


function oemAppPing_() {
  return { ok: true, time: new Date().toISOString() };
}

// ---------- Sheet helpers ----------
