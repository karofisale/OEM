/**
 * karofiSession.js — phần RIÊNG của OEM trong lớp phiên dùng chung.
 *
 * Lõi (đọc localStorage, giải mã token, đá về cổng, danh sách app) nằm ở
 * `karofiSessionCore.js` cạnh file này — bản SINH TỰ ĐỘNG từ
 * Karofi-ID/web/, dùng chung từng byte với FC và Export. Đừng sửa file đó.
 *
 * Ở lại đây đúng một việc: chuyển khối quyền trong token sang hình dạng phiên
 * mà OEM vẫn dùng. Ba app có ba hình dạng khác nhau thật — OEM cần
 * `{name, role, saleId}` với `expiresAt` là SỐ, FC cần
 * `{id, full_name, email, role, business_unit_code}` với `expiresAt` là chuỗi
 * ISO — nên phần này không gom được, và cũng không nên gom.
 *
 * Re-export lại những gì phần còn lại của OEM đang gọi, để các chỗ
 * `import ... from './karofiSession'` không phải đổi.
 */

import { claimFor } from './karofiSessionCore';

export {
  readSharedSession,
  clearSharedSession,
  decodeToken,
  bounceToPortal,
  clearBounceFlag,
  appKhacDungDuoc
} from './karofiSessionCore';

/**
 * Phiên OEM dựng từ phiên dùng chung, hoặc null nếu chưa đăng nhập chung /
 * người này không được cấp quyền vào OEM.
 *
 * Trả đúng hình dạng phiên OEM vẫn dùng — {token, user:{name, role, saleId},
 * expiresAt} với expiresAt là mốc thời gian dạng số (Date.now()) — nên
 * App.jsx và các màn hình không phân biệt được nó đến từ đâu.
 */
export function sharedSessionForOEM() {
  const c = claimFor('OEM');
  if (!c) return null;

  // Token không mang hạn dùng thì cho 6 giờ. Không phải phỏng đoán vô căn cứ:
  // backend OEM giữ token trong CacheService đúng 6 giờ, nên phiên phía client
  // hết hạn cùng lúc thay vì sống lâu hơn quyền thật của nó.
  const expiresAt = c.expiresAt
    ? new Date(c.expiresAt).getTime()
    : Date.now() + 6 * 60 * 60 * 1000;

  return {
    token: c.token,
    user: {
      name: c.claim.n,
      role: (c.claim.r || 'sale').toLowerCase(),
      saleId: c.claim.sid || ''
    },
    expiresAt,
    fromPortal: true
  };
}
