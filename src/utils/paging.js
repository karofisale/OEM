// Phân trang: logic thuần cho thanh Đầu / Trước / nhảy tới trang N / Sau / Cuối + chọn cỡ trang.

export const CO_TRANG = [25, 50, 100, 200];

/** Số trang tối thiểu 1. */
export function tongSoTrang(tongMuc, coTrang) {
  return Math.max(1, Math.ceil((Number(tongMuc) || 0) / Math.max(1, Number(coTrang) || 1)));
}

/**
 * Ô "tới trang N": chữ người dùng gõ -> số trang hợp lệ (kẹp vào 1..tongTrang), hoặc null nếu không phải số.
 * Gõ 9999 trên 160 trang thì về trang 160 thay vì báo lỗi; gõ 0 / số âm về trang 1.
 */
export function chuanTrang(raw, tongTrang) {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Math.min(Math.max(1, n), Math.max(1, tongTrang));
}

/** Cỡ trang hợp lệ (đã nhớ từ lần trước có thể là rác) -> mặc định. */
export function coTrangHopLe(v, mac = 25) {
  const n = Number(v);
  return CO_TRANG.includes(n) ? n : mac;
}
