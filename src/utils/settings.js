// Cài đặt cá nhân (14/10/2026) — phần THUẦN: danh sách khoá, mặc định, kiểm giá trị, và luật gộp
// giữa máy chủ ↔ bản lưu cục bộ. Không React, không mạng, không localStorage -> test được (test/cai-dat.test.cjs).
// Phần có trạng thái + gọi mạng nằm ở services/prefsSync.js.
//
// Nơi lưu: MÁY CHỦ giữ theo tài khoản (getMyPrefs / setMyPrefs của oem-api) để đi theo người dùng qua máy khác;
// localStorage (utils/uiState.js, khoá `oem_ui_v1:<user>:<khoá>`) là bản đệm nhanh.
// Giới hạn phía máy chủ: khoá khớp KEY_RE, mỗi giá trị JSON <= 1000 ký tự, <= 40 khoá mỗi lệnh, <= 80 khoá mỗi người.

import { THEMES } from '../services/theme.js';
import { CO_TRANG } from './paging.js';
import { TAB_IDS } from './navMeta.js';

export const KEY_RE = /^[a-z][A-Za-z0-9_.:-]{0,47}$/;
export const MAX_KEYS_PER_CALL = 40;
export const MAX_VALUE_JSON = 1000;

/**
 * Mọi khoá đồng bộ. `local` = khoá trong uiState.js (đã tách theo người dùng).
 * Khoá cài đặt (`st.*`) dùng chung một tên ở cả máy chủ lẫn cục bộ; khoá giao diện (`ui.*`) chỉ là kiểu xem
 * "Bảng/Lưới" — thứ mang tính sở thích. Bộ lọc / tab con / trang đang mở KHÔNG đồng bộ (xem báo cáo cuối việc).
 */
export const DEFS = {
  'st.theme':            { local: 'st.theme',            def: 'system',      ok: (v) => THEMES.includes(v) },
  'st.density':          { local: 'st.density',          def: 'comfortable', ok: (v) => v === 'comfortable' || v === 'compact' },
  'st.sidebarCollapsed': { local: 'st.sidebarCollapsed', def: false,         ok: (v) => typeof v === 'boolean' },
  'st.landing':          { local: 'st.landing',          def: 'auto',        ok: (v) => v === 'auto' || TAB_IDS.includes(v) },
  'st.pageSize':         { local: 'st.pageSize',         def: 0,             ok: (v) => v === 0 || CO_TRANG.includes(v) },   // 0 = theo từng màn
  'st.reportYear':       { local: 'st.reportYear',       def: 'latest',      ok: (v) => v === 'latest' || v === 'current' },
  'st.reportSale':       { local: 'st.reportSale',       def: 'all',         ok: (v) => v === 'all' || v === 'mine' },
  'st.calcMargin':       { local: 'st.calcMargin',       def: 20,            ok: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 60 },
  'st.toastSec':         { local: 'st.toastSec',         def: 4,             ok: (v) => [3, 4, 6, 10].includes(v) },
  'ui.clients.view':     { local: 'clients.view',        def: 'table',       ok: (v) => v === 'table' || v === 'grid' },
  'ui.products.view':    { local: 'products.view',       def: 'table',       ok: (v) => v === 'table' || v === 'grid' },
  'ui.reports.view':     { local: 'reports.view',        def: 'table',       ok: (v) => v === 'table' || v === 'grid' }
};

export const SETTING_KEYS = Object.keys(DEFS).filter((k) => k.startsWith('st.'));
export const SYNC_KEYS = Object.keys(DEFS);
/** Khoá cục bộ -> khoá máy chủ (chỉ các khoá `ui.*`, được lắng nghe từ usePersistentState). */
export const UI_LOCAL_TO_SERVER = Object.fromEntries(
  Object.keys(DEFS).filter((k) => k.startsWith('ui.')).map((k) => [DEFS[k].local, k])
);

export const BIEN_TOAST_GIAY = [3, 4, 6, 10];
export const BIEN_LNG = { min: 1, max: 60 };

const co = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export const laKhoaBiet = (key) => co(DEFS, key);
export const hopLe = (key, v) => laKhoaBiet(key) && DEFS[key].ok(v);
/** Giá trị dùng được: hợp lệ thì giữ, không thì mặc định (khoá lạ -> undefined). */
export const giaTri = (key, v) => (!laKhoaBiet(key) ? undefined : (DEFS[key].ok(v) ? v : DEFS[key].def));

/** Chữ người dùng gõ vào ô LNG -> số nguyên 1..60 (kẹp vào khoảng, không báo lỗi), hoặc null nếu không phải số. */
export function chuanLng(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.min(BIEN_LNG.max, Math.max(BIEN_LNG.min, Math.round(Number(s))));
}

/** Khoá + giá trị gửi được lên máy chủ không (đúng KEY_RE, JSON <= 1000 ký tự). null luôn được (xoá khoá). */
export function guiDuoc(key, v) {
  if (!KEY_RE.test(key)) return false;
  if (v === null) return true;
  let j;
  try { j = JSON.stringify(v); } catch { return false; }
  return typeof j === 'string' && j.length <= MAX_VALUE_JSON;
}

/** Phản hồi getMyPrefs (có thể rác) -> chỉ các khoá biết + giá trị hợp lệ. */
export function lamSachTuMayChu(raw) {
  const src = raw && typeof raw === 'object' && raw.prefs && typeof raw.prefs === 'object' ? raw.prefs : {};
  const out = {};
  Object.keys(src).forEach((k) => { if (hopLe(k, src[k])) out[k] = src[k]; });
  return out;
}

const bang = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Luật gộp sau lần tải đầu (MÁY CHỦ THẮNG), cho từng khoá đồng bộ:
 *  - khoá còn nằm trong `pending` (sửa lúc mất mạng / lệnh gửi trước chưa tới) -> gửi lại bản đó, KHÔNG để máy chủ đè;
 *  - máy chủ có giá trị hợp lệ -> ghi đè bản cục bộ nếu khác;
 *  - máy chủ chưa có mà cục bộ có: lần đầu (`seeded` = false) -> tải bản cục bộ lên; đã từng đồng bộ -> máy chủ đã
 *    xoá (vd "Khôi phục mặc định" ở máy khác) nên XOÁ bản cục bộ cho khỏi sống lại.
 * `local`: chỉ các khoá cục bộ có giá trị HỢP LỆ do người dùng đã chọn (không có = chưa chọn).
 * Trả { setLocal: {khoá: giá trị}, clearLocal: [khoá], upload: {khoá: giá trị | null} }.
 */
export function gopMayChu({ server, local, pending, seeded }) {
  const sv = server || {}, lc = local || {}, pd = pending || {};
  const setLocal = {}, upload = {}, clearLocal = [];
  SYNC_KEYS.forEach((k) => {
    if (co(pd, k)) { upload[k] = pd[k]; return; }
    if (co(sv, k)) {
      if (!co(lc, k) || !bang(lc[k], sv[k])) setLocal[k] = sv[k];
      return;
    }
    if (co(lc, k)) {
      if (!seeded) upload[k] = lc[k];
      else clearLocal.push(k);
    }
  });
  return { setLocal, clearLocal, upload };
}

/** Cắt các thay đổi thành từng lệnh <= `max` khoá, bỏ khoá/giá trị máy chủ sẽ từ chối. */
export function chiaLenh(changes, max = MAX_KEYS_PER_CALL) {
  const keys = Object.keys(changes || {}).filter((k) => guiDuoc(k, changes[k]));
  const out = [];
  for (let i = 0; i < keys.length; i += max) {
    const lenh = {};
    keys.slice(i, i + max).forEach((k) => { lenh[k] = changes[k]; });
    out.push(lenh);
  }
  return out;
}

/** Sau khi gửi xong `sent`: bỏ khỏi `pending` những khoá chưa bị sửa lại trong lúc gửi. */
export function boDaGui(pending, sent) {
  const next = { ...(pending || {}) };
  Object.keys(sent || {}).forEach((k) => {
    if (co(next, k) && bang(next[k], sent[k])) delete next[k];
  });
  return next;
}

/** Lệnh "Khôi phục mặc định": null cho mọi khoá cài đặt (`st.*`). Kiểu xem `ui.*` không thuộc phần Cài đặt nên giữ. */
export function lenhKhoiPhuc() {
  const o = {};
  SETTING_KEYS.forEach((k) => { o[k] = null; });
  return o;
}

/**
 * Tab mở đầu: "Tự động" (landing = 'auto') giữ nguyên hành vi cũ — tab đã nhớ nếu còn hợp lệ, không thì mặc định theo vai;
 * chọn tab cụ thể thì luôn mở tab đó (vai trò không được vào thì rơi về mặc định theo vai).
 * `tabHopLe` truyền vào (navMeta.tabHopLe) để file này không phải biết luật phân quyền.
 */
export function tabMoDau({ landing, saved, role, tabHopLe }) {
  if (landing && landing !== 'auto' && TAB_IDS.includes(landing)) return tabHopLe(landing, role);
  return tabHopLe(saved, role);
}

/** Các tab vai trò được chọn làm "Trang đầu": [{id, label, nhom}]. */
export function tabChoPhep(role, nav, accountIds) {
  const r = String(role || '').toLowerCase();
  const ids = [];
  nav.forEach((m) => (m.children ? m.children : [m]).forEach((c) => ids.push({ id: c.id, label: c.label, nhom: m.children ? m.label : '' })));
  return r === 'account' ? ids.filter((x) => accountIds.includes(x.id)) : ids;
}

/**
 * Sale mặc định ở báo cáo khi cài đặt là "Của tôi": tên trong `salesList` thuộc về người đăng nhập
 * (`laCuaToi(activeUser, tenSale)` — roles.ownsSaleRow), không có thì 'ALL'.
 */
export function saleMacDinh(setting, salesList, activeUser, laCuaToi) {
  if (setting !== 'mine') return 'ALL';
  const hit = (salesList || []).find((s) => laCuaToi(activeUser, s));
  return hit || 'ALL';
}
