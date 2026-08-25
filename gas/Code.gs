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


function oemAppDoPost_(body) {
  var handler = oemAppApiMap_[body.fn];
  if (!handler) return jsonOutput_({ error: 'Unknown function: ' + body.fn });
  try {
    var result = handler.apply(null, body.args || []);
    return jsonOutput_({ result: result });
  } catch (err) {
    return jsonOutput_({ error: err.message || String(err) });
  }
}


function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


var oemAppApiMap_ = {
  ping: oemAppPing_,
  getUserList: oemAppGetUserList_,
  login: oemAppLogin_,
  getBootstrap: oemAppGetBootstrap_,
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
  sopDiag: oemAppSopDiag_,
  kitsDiag: oemAppKitsDiag_,
  forceRefreshBootstrap: oemAppForceRefreshBootstrap_,
  aiParseOrder: oemAppAiParseOrder_,
  aiChat: oemAppAiChat_
};


function oemAppPing_() {
  return { ok: true, time: new Date().toISOString() };
}

// ---------- Sheet helpers ----------
