// Client for the OEM App Apps Script backend (see gas/Code.gs + gas/SETUP.md).
// Replaces the old direct-to-public-Sheet fetching in sheetService.js.

// Standalone Apps Script Web App (2026-08-19) — separated from the shared
// up-dt-oem/cong-no-oem project (D:\Operation\Claude\Scripts\up-dt-oem\) after
// a controlled latency test showed the container-bound-to-a-huge-Sheet setup
// there was consistently ~5-10x slower per call. Source: gas/Code.gs (+
// Helpers/Auth/Clients/Products/SalesData/Orders.gs in this folder). See
// gas/SETUP.md for deploy steps.
export const API_URL = 'https://script.google.com/macros/s/AKfycbwKe1b7gUOnp9gPF_q6jlzTFIrD3DOtkFM8oMQf41D1iXGrEwmYElWZeupCNG-Szy7DfQ/exec';

const SESSION_KEY = 'oem_session_v1';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches the backend's cache TTL

// The Apps Script Web App round-trip has been measured (12-call controlled
// test, alternating this backend with a brand-new Apps Script that isn't
// even bound to a Sheet) taking anywhere from ~1.4s to over 3 MINUTES, with
// roughly HALF of all calls — to either script — coming back as a non-JSON
// HTML page (a network hop between here and script.google.com misbehaving/
// intercepting the request) instead of a real response. Since the OTHER
// script saw the same ~50% failure rate, this is a general property of the
// network path, not something caused by this app's code — but at a 50%
// per-attempt failure rate, a single retry still fails ~25% of the time
// (both attempts unlucky). Bumped to 3 retries (4 attempts total) to bring
// that down to roughly 6%, which is what actually fixed the
// "Loi tai du lieu tu backend: HTTP 404" users kept hitting even with the
// 1-retry version.
// - REQUEST_TIMEOUT_MS aborts a single attempt that's taking too long (kept
//   above the ~47s worst-case legitimate response we've observed, so it
//   doesn't cut off a slow-but-real answer).
// We deliberately do NOT retry a clean {error: "..."} response from our own
// backend (e.g. wrong PIN, "not found") — that's a real answer, not a fluke.
const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callApi(fn, args = []) {
  if (!API_URL) {
    throw new Error('Backend chưa được cấu hình (API_URL trống trong src/services/api.js). Xem gas/SETUP.md.');
  }
  return callApiAttempt(fn, args, 0);
}

async function callApiAttempt(fn, args, attempt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      // text/plain avoids the CORS preflight request Apps Script Web Apps can't answer
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn, args }),
      signal: controller.signal
    });
  } catch (networkErr) {
    const message = networkErr.name === 'AbortError'
      ? `Máy chủ không phản hồi sau ${REQUEST_TIMEOUT_MS / 1000}s — mạng có thể đang chập chờn.`
      : 'Không kết nối được tới máy chủ — mạng có thể đang chập chờn.';
    return retryOrThrow(fn, args, attempt, new Error(message));
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    return retryOrThrow(fn, args, attempt, new Error(`HTTP ${response.status} — máy chủ phản hồi bất thường (có thể do mạng/proxy chặn giữa đường).`));
  }

  let json;
  try {
    json = await response.json();
  } catch (parseErr) {
    return retryOrThrow(fn, args, attempt, new Error('Phản hồi không đúng định dạng — có thể do mạng chặn giữa đường.'));
  }

  if (json.error) throw new Error(json.error); // real answer from our backend — never retry

  // A response that parses as valid JSON but is neither {result: ...} nor
  // {error: ...} isn't actually our backend talking — most likely something
  // on the network path (proxy/gateway) returning its own valid-but-empty
  // JSON body with a 200 status. Silently returning `undefined` here is what
  // caused "Cannot read properties of undefined" crashes downstream — treat
  // it as a fluke and retry instead.
  if (!json || typeof json !== 'object' || !('result' in json)) {
    return retryOrThrow(fn, args, attempt, new Error('Phản hồi từ máy chủ không hợp lệ — có thể do mạng chặn giữa đường.'));
  }

  return json.result;
}

async function retryOrThrow(fn, args, attempt, err) {
  if (attempt < MAX_RETRIES) {
    await sleep(RETRY_DELAY_MS * (attempt + 1));
    return callApiAttempt(fn, args, attempt + 1);
  }
  throw err;
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session.token || !session.expiresAt || Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function getUserList() {
  return callApi('getUserList');
}

export async function login(name, pin) {
  const result = await callApi('login', [name, pin]);
  const session = {
    token: result.token,
    user: result.user,
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function getBootstrap(token) {
  return callApi('getBootstrap', [token]);
}

export async function addClient(token, client) {
  return callApi('addClient', [token, client]);
}

export async function editClient(token, client) {
  return callApi('editClient', [token, client]);
}

export async function addMaterial(token, material) {
  return callApi('addMaterial', [token, material]);
}

export async function editMaterial(token, sku, updates) {
  return callApi('editMaterial', [token, sku, updates]);
}

export async function addPlan(token, plan) {
  return callApi('addPlan', [token, plan]);
}

export async function changePassword(token, oldPin, newPin) {
  return callApi('changePassword', [token, oldPin, newPin]);
}

export async function saveOrder(token, orderResult) {
  return callApi('saveOrder', [token, orderResult]);
}

export async function getOrders(token) {
  return callApi('getOrders', [token]);
}

export async function updateOrderLine(token, rowIndex, updates) {
  return callApi('updateOrderLine', [token, rowIndex, updates]);
}

export async function insertOrderLine(token, refRowIndex, position, item) {
  return callApi('insertOrderLine', [token, refRowIndex, position, item]);
}

export async function deleteOrderLine(token, rowIndex) {
  return callApi('deleteOrderLine', [token, rowIndex]);
}

export async function deleteOrder(token, orderNo) {
  return callApi('deleteOrder', [token, orderNo]);
}

export async function ping() {
  return callApi('ping');
}

export async function getSopPlanningContext(token) {
  return callApi('getSopPlanningContext', [token]);
}

export async function submitSopDraft(token, anchor, rows) {
  return callApi('submitSopDraft', [token, anchor, rows]);
}

export async function getSopPendingReview(token, anchor) {
  return callApi('getSopPendingReview', [token, anchor]);
}

export async function approveSop(token, anchor) {
  return callApi('approveSop', [token, anchor]);
}

export async function getSopView(token) {
  return callApi('getSopView', [token]);
}

export async function aiParseOrder(token, input) {
  return callApi('aiParseOrder', [token, input]);
}
