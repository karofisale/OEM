// Cài đặt cá nhân: kho có trạng thái + đồng bộ với máy chủ (14/10/2026).
//
// Mô hình:
//  - localStorage (utils/uiState.js, tách theo người dùng) là BẢN ĐỆM NHANH: mọi đọc đều từ đây, nên giao diện không bao giờ
//    phải chờ mạng và app vẫn chạy y nguyên khi máy chủ lỗi / chưa có bảng.
//  - MÁY CHỦ (oem-api getMyPrefs / setMyPrefs) giữ bản theo tài khoản để cài đặt đi theo người dùng qua máy khác.
//  - Ghi: lưu cục bộ ngay, rồi gom vào `pending` và gửi sau ~600ms (chỉ các khoá đã đổi). `pending` được GHI XUỐNG localStorage
//    nên sửa lúc mất mạng không bị mất, và lệnh "Khôi phục mặc định" lỡ gửi hỏng vẫn được gửi lại lần sau.
//  - Đọc: sau khi có phiên, tải một lần rồi gộp theo luật utils/settings.js#gopMayChu (máy chủ thắng; lần đầu tải bản cục bộ lên).
//  - MỌI lệnh gọi mạng đều nuốt lỗi: không bao giờ toast, không chặn việc.
//
// Không import api.js: App truyền `api` vào attach(), nhờ vậy file này (và test) không kéo theo import.meta.env của Vite.

import { readUi, writeUi, clearUi, getUiScope, setUiWriteListener } from '../utils/uiState.js';
import { loadTheme, applyTheme } from './theme.js';
import {
  DEFS, SYNC_KEYS, SETTING_KEYS, UI_LOCAL_TO_SERVER, hopLe, guiDuoc, lamSachTuMayChu, gopMayChu, chiaLenh, boDaGui, lenhKhoiPhuc
} from '../utils/settings.js';

export const DEBOUNCE_MS = 600;
const RETRY_MS = 30000;
const MAX_RETRY = 3;

const K_PENDING = 'st.pending';   // KHÔNG nằm trong DEFS -> không bao giờ đồng bộ
const K_SEEDED = 'st.seeded';

const listeners = new Set();
let ctx = null;            // { token, api } khi đã gắn với một phiên
let pending = {};          // khoá máy chủ -> giá trị | null, chưa gửi xong
let timer = null;
let flushing = false;
let retries = 0;
let mem = null;            // bản đệm trong bộ nhớ của các khoá `st.*`
let memScope = null;
let trangThai = 'chua';    // 'chua' (chưa gắn phiên) | 'dang' (đang tải) | 'ok' | 'loi' — chỉ để trang Cài đặt hiện một dòng thông tin

const co = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const laDoiTuong = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ----------------------------------------------------------------------------
// Đọc
// ----------------------------------------------------------------------------

/** Giá trị người dùng đã CHỌN (cục bộ) của một khoá; undefined = chưa chọn. Theme còn đọc khoá cũ oem_theme_v1. */
function docRieng(key) {
  const d = DEFS[key];
  const v = readUi(d.local, undefined, d.ok);
  if (v !== undefined) return v;
  if (key === 'st.theme') { const t = loadTheme(); return t === 'system' ? undefined : t; }
  return undefined;
}

function napBoNho() {
  const scope = getUiScope();
  if (mem && memScope === scope) return mem;
  mem = {};
  SETTING_KEYS.forEach((k) => { const v = docRieng(k); mem[k] = v === undefined ? DEFS[k].def : v; });
  memScope = scope;
  return mem;
}

/** Giá trị hiệu lực của một cài đặt (đã chọn, hoặc mặc định). Khoá lạ -> undefined. */
export function getSetting(key) {
  if (!co(DEFS, key) || !key.startsWith('st.')) return undefined;
  return napBoNho()[key];
}

/** true nếu người dùng đã chọn khoá này (khác với "đang là giá trị mặc định"). */
export function daChon(key) {
  return co(DEFS, key) && docRieng(key) !== undefined;
}

/** Trạng thái đồng bộ gần nhất, cho dòng thông tin ở trang Cài đặt (không bao giờ chặn việc). */
export function getTrangThai() { return trangThai; }
function datTrangThai(t) { if (trangThai !== t) { trangThai = t; bao(); } }

export function subscribe(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function bao() { listeners.forEach((fn) => { try { fn(); } catch { /* một người nghe hỏng không được chặn người khác */ } }); }

// ----------------------------------------------------------------------------
// Ghi
// ----------------------------------------------------------------------------

function luuCho() { if (Object.keys(pending).length) writeUi(K_PENDING, pending, true); else clearUi(K_PENDING, true); }

function xepHang(key, value) {
  pending = { ...pending, [key]: value };
  luuCho();
  hen(DEBOUNCE_MS);
}

function hen(ms) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; flush(); }, ms);
}

function apDungPhuThuoc(key, value) {
  if (key === 'st.theme') applyTheme(value);
}

/** Đổi một cài đặt: lưu cục bộ ngay, báo giao diện, gửi máy chủ sau ~600ms. Trả false nếu giá trị không hợp lệ. */
export function setSetting(key, value) {
  if (!co(DEFS, key) || !key.startsWith('st.') || !hopLe(key, value) || !guiDuoc(key, value)) return false;
  writeUi(DEFS[key].local, value, true);
  napBoNho()[key] = value;
  apDungPhuThuoc(key, value);
  bao();
  xepHang(key, value);
  return true;
}

/** "Khôi phục mặc định": xoá mọi cài đặt đã chọn (cục bộ ngay + null lên máy chủ), kiểu xem Bảng/Lưới giữ nguyên. */
export function resetSettings() {
  SETTING_KEYS.forEach((k) => { clearUi(DEFS[k].local, true); });
  mem = null;
  applyTheme('system');
  const lenh = lenhKhoiPhuc();
  pending = { ...pending, ...lenh };
  luuCho();
  bao();
  hen(0);
}

/** Bộ lắng nghe của uiState.writeUi: chỉ các khoá kiểu xem (`ui.*`) mới đi lên máy chủ. */
function khiGhiUi(localKey, value) {
  const sk = UI_LOCAL_TO_SERVER[localKey];
  if (!sk) return;
  if (value === undefined) xepHang(sk, null);
  else if (hopLe(sk, value)) xepHang(sk, value);
}

async function flush() {
  const my = ctx;
  if (!my || flushing || !Object.keys(pending).length) return;
  flushing = true;
  let hong = false;
  try {
    const lenhs = chiaLenh(pending);
    for (const lenh of lenhs) {
      if (ctx !== my) return;   // đã đăng xuất / đổi người: bỏ, `pending` của người này đã nằm trong localStorage của họ
      try {
        await my.api.setMyPrefs(my.token, lenh);
      } catch {
        hong = true;            // bảng chưa có, mất mạng...: giữ pending, thử lại sau — KHÔNG báo người dùng
        break;
      }
      if (ctx !== my) return;
      pending = boDaGui(pending, lenh);
      luuCho();
    }
  } finally {
    flushing = false;
  }
  if (ctx !== my) return;
  if (hong) {
    datTrangThai('loi');
    if (retries < MAX_RETRY) { retries++; hen(RETRY_MS); }
  } else {
    datTrangThai('ok');
    retries = 0;
    if (Object.keys(pending).length) hen(DEBOUNCE_MS);   // có khoá mới đổi trong lúc đang gửi
  }
}

/** Gửi ngay những gì còn chờ (không đợi 600ms) — dùng khi đóng tab/đăng xuất. */
export function flushNow() {
  if (timer) { clearTimeout(timer); timer = null; }
  return flush();
}

// ----------------------------------------------------------------------------
// Gắn với phiên
// ----------------------------------------------------------------------------

/** Cục bộ -> { khoá máy chủ: giá trị hợp lệ do người dùng đã chọn }. */
function docMoiKhoaRieng() {
  const out = {};
  SYNC_KEYS.forEach((k) => {
    const d = DEFS[k];
    const v = k.startsWith('st.') ? docRieng(k) : readUi(d.local, undefined, d.ok);
    if (v !== undefined) out[k] = v;
  });
  return out;
}

/**
 * Gọi khi có phiên (App, sau khi setUiScope). Áp tức thì cài đặt cục bộ đã chọn (vd theme của người này), rồi tải
 * từ máy chủ MỘT lần và gộp. Trả Promise<{ ok, changed: [khoá] }> — không bao giờ reject.
 * `api` cần { getMyPrefs(token), setMyPrefs(token, changes) }.
 */
export async function attach({ token, api }) {
  detach();
  if (!token || !api) return { ok: false, changed: [] };
  const my = { token, api };
  ctx = my;
  retries = 0;
  setUiWriteListener(khiGhiUi);
  mem = null;
  const t = docRieng('st.theme');
  if (t) applyTheme(t);
  const cho = readUi(K_PENDING, {}, laDoiTuong);
  pending = {};
  Object.keys(cho).forEach((k) => { if (co(DEFS, k) && (cho[k] === null || hopLe(k, cho[k]))) pending[k] = cho[k]; });
  trangThai = 'dang';
  bao();

  let raw;
  try {
    raw = await api.getMyPrefs(token);
  } catch {
    if (ctx === my) datTrangThai('loi');
    // Chưa có bảng / hàm / mất mạng: dùng bản cục bộ, phần còn chờ vẫn thử gửi ở lần đổi sau.
    if (ctx === my && Object.keys(pending).length) hen(RETRY_MS);
    return { ok: false, changed: [] };
  }
  if (ctx !== my) return { ok: false, changed: [] };

  const server = lamSachTuMayChu(raw);
  const plan = gopMayChu({ server, local: docMoiKhoaRieng(), pending, seeded: readUi(K_SEEDED, false) === true });
  const changed = [];
  Object.keys(plan.setLocal).forEach((k) => { writeUi(DEFS[k].local, plan.setLocal[k], true); changed.push(k); });
  plan.clearLocal.forEach((k) => { clearUi(DEFS[k].local, true); changed.push(k); });
  mem = null;
  if (plan.clearLocal.includes('st.theme')) applyTheme('system');
  else if (co(plan.setLocal, 'st.theme')) applyTheme(plan.setLocal['st.theme']);
  Object.keys(plan.upload).forEach((k) => { pending[k] = plan.upload[k]; });
  luuCho();
  writeUi(K_SEEDED, true, true);
  trangThai = 'ok';
  bao();
  if (Object.keys(pending).length) flushNow();
  return { ok: true, changed };
}

export function detach() {
  if (timer) { clearTimeout(timer); timer = null; }
  ctx = null;
  flushing = false;
  pending = {};
  mem = null;
  trangThai = 'chua';
  setUiWriteListener(null);
}

/** Chỉ cho test: trạng thái nội bộ. */
export const _debug = { pending: () => ({ ...pending }), attached: () => !!ctx };
