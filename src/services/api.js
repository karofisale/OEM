// Client for the OEM App Apps Script backend (see gas/Code.gs + gas/SETUP.md).
// Replaces the old direct-to-public-Sheet fetching in sheetService.js.

// Shared Apps Script Web App — same deployment used by the up-dt-oem/cong-no-oem
// skills (D:\Operation\Claude\Scripts\up-dt-oem\Code.gs). See gas/SETUP.md.
export const API_URL = 'https://script.google.com/macros/s/AKfycbwLO-qCFQr-UWKYwSlhAvCiTOyG8rtMGw5orOfNiPemEJjnlNoU2TPnHOHif_BuoMI/exec';

const SESSION_KEY = 'oem_session_v1';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches the backend's cache TTL

async function callApi(fn, args = []) {
  if (!API_URL) {
    throw new Error('Backend chưa được cấu hình (API_URL trống trong src/services/api.js). Xem gas/SETUP.md.');
  }
  const response = await fetch(API_URL, {
    method: 'POST',
    // text/plain avoids the CORS preflight request Apps Script Web Apps can't answer
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn, args })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(json.error);
  return json.result;
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

export async function addPlan(token, plan) {
  return callApi('addPlan', [token, plan]);
}

export async function changePassword(token, oldPin, newPin) {
  return callApi('changePassword', [token, oldPin, newPin]);
}

export async function ping() {
  return callApi('ping');
}
