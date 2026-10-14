// Luật PIN CHUNG của cả ba app (14/10/2026) — nửa giao diện. Máy chủ (oem-api) kiểm đúng luật này
// và là bên quyết định; ở đây chỉ để báo lỗi sớm, không phải gọi mạng rồi mới biết PIN yếu.
//
//   - ít nhất 6 chữ số, CHỈ chữ số;
//   - không phải toàn chữ số giống nhau (000000, 111111...);
//   - không phải một đoạn liên tiếp của '01234567890' (123456, 234567, 345678...).

export const PIN_TOI_THIEU = 6;
const DAY_SO = '01234567890';

/** Trả '' nếu PIN hợp lệ, không thì câu báo lỗi tiếng Việt (cùng ý với thông báo của máy chủ). */
export function kiemTraPin(pin) {
  const s = String(pin == null ? '' : pin);
  if (s.length < PIN_TOI_THIEU) return 'PIN phải có ít nhất ' + PIN_TOI_THIEU + ' ký tự.';
  if (!/^[0-9]+$/.test(s)) return 'PIN chỉ gồm chữ số (0-9).';
  if (/^(\d)\1*$/.test(s)) return 'PIN không được gồm toàn chữ số giống nhau.';
  if (DAY_SO.includes(s)) return 'PIN không được là dãy số liên tiếp (ví dụ 123456).';
  return '';
}

export const GHI_CHU_PIN = 'Ít nhất 6 chữ số; không toàn số giống nhau (111111) và không phải dãy liên tiếp (123456).';
export const HUONG_DAN_PIN_SSO = 'Tài khoản đăng nhập qua cổng VHKD — đổi PIN tại cổng VHKD.';
