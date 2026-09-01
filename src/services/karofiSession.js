/**
 * karofiSession.js — đọc phiên đăng nhập dùng chung của cổng VHKD.
 *
 * Bản sao của D:\Operation\Claude\Projects\Karofi-ID\web\karofi-session.js
 * (bản gốc, dạng ES5). Sửa bản gốc trước rồi cập nhật file này.
 *
 * Cổng VHKD và cả ba app nằm trên cùng origin karofisale.github.io nên dùng
 * chung một kho localStorage: đăng nhập ở cổng là app này đọc được ngay.
 *
 * Ở đây chỉ GIẢI MÃ payload để biết hiển thị gì. Quyền thật do backend kiểm
 * lại bằng chữ ký HMAC ở mọi request; khoá ký không bao giờ xuống trình duyệt.
 */

const SHARED_KEY = 'karofi.session';

export function readSharedSession() {
  try {
    const raw = localStorage.getItem(SHARED_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.token) return null;
    if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(SHARED_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearSharedSession() {
  try {
    localStorage.removeItem(SHARED_KEY);
  } catch {
    // localStorage bị chặn — không có gì phải xoá
  }
}

/** Giải mã payload token. Không kiểm chữ ký (xem ghi chú đầu file). */
export function decodeToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Phiên OEM dựng từ phiên dùng chung, hoặc null nếu chưa đăng nhập chung /
 * người này không được cấp quyền vào OEM.
 *
 * Trả đúng hình dạng phiên OEM vẫn dùng — {token, user:{name, role, saleId},
 * expiresAt} với expiresAt là mốc thời gian dạng số (Date.now()) — nên
 * App.jsx và các màn hình không phân biệt được nó đến từ đâu.
 */
export function sharedSessionForOEM() {
  const s = readSharedSession();
  if (!s) return null;
  const payload = decodeToken(s.token);
  const claim = payload?.ap?.OEM;
  if (!claim?.n) return null;

  const expiresAt = s.expiresAt
    ? new Date(s.expiresAt).getTime()
    : (payload.exp ? payload.exp * 1000 : Date.now() + 6 * 60 * 60 * 1000);

  return {
    token: s.token,
    user: {
      name: claim.n,
      role: (claim.r || 'sale').toLowerCase(),
      saleId: claim.sid || ''
    },
    expiresAt,
    fromPortal: true
  };
}

/** Đưa người dùng về cổng VHKD để đăng nhập, ghi nhớ trang đang mở. */
export function goToPortal() {
  const next = encodeURIComponent(location.pathname + location.search);
  location.href = `/VHKD/?next=${next}`;
}
