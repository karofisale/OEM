// Giá trị cài đặt HỆ THỐNG đang hiệu lực (14/10/2026): kho nhỏ trong bộ nhớ, mọi vai trò đọc được.
//
// Tải MỘT lần sau khi có phiên (App, cùng chỗ với cài đặt cá nhân) bằng oem-api getSystemValues. FAIL-SOFT: lỗi mạng / chưa có bảng /
// chưa có hàm thì im lặng dùng mặc định có sẵn (VAT 8%, LNG 20) — không toast, không chặn việc. Nhờ vậy mọi nơi đọc `getSystemValue`
// luôn nhận được một số hợp lệ, kể cả trước khi lượt tải xong (và trong test, nơi không có phiên nào).
//
// Không import api.js: App truyền `api` vào attach() — file này (và test) không kéo theo import.meta.env của Vite (giống prefsSync.js).

import { SYS_DEFAULTS, lamSachGiaTriHeThong, heSoVat, KHOA_VAT } from '../utils/systemSettings.js';

const listeners = new Set();
let values = { ...SYS_DEFAULTS };
let ctx = null;   // { token, api } khi đã gắn phiên

function bao() { listeners.forEach((fn) => { try { fn(); } catch { /* một người nghe hỏng không được chặn người khác */ } }); }

export function subscribe(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Giá trị hiệu lực của một khoá hệ thống (số). Khoá lạ -> undefined. Luôn có số cho khoá đã biết. */
export function getSystemValue(key) {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}

/** Hệ số nhân VAT hiện hành (1 + oem.vatRate) — cho các hàm tính tổng đơn hàng. */
export function getVatFactor() {
  return heSoVat(values[KHOA_VAT]);
}

function dat(next) {
  const cu = JSON.stringify(values), moi = JSON.stringify(next);
  values = next;
  if (cu !== moi) bao();
}

/** Tải (lại) từ máy chủ cho phiên đang gắn. Không bao giờ ném: lỗi -> giữ giá trị đang có (mặc định nếu chưa tải được lần nào). */
export async function refresh() {
  const my = ctx;
  if (!my || !my.api || typeof my.api.getSystemValues !== 'function') return false;
  try {
    const raw = await my.api.getSystemValues(my.token);
    if (ctx !== my) return false;   // đã đăng xuất / đổi người trong lúc chờ
    dat(lamSachGiaTriHeThong(raw));
    return true;
  } catch {
    return false;
  }
}

/** Gọi khi có phiên. `api` cần { getSystemValues(token) }. Không bao giờ reject. Trả Promise<boolean> (đã nạp được từ máy chủ chưa). */
export async function attach({ token, api }) {
  detach();
  if (!token || !api) return false;
  ctx = { token, api };
  return refresh();
}

/** Hết phiên: về mặc định (không để giá trị của người trước rơi sang người sau). */
export function detach() {
  ctx = null;
  dat({ ...SYS_DEFAULTS });
}

/** Chỉ cho test. */
export const _debug = { attached: () => !!ctx, values: () => ({ ...values }) };
