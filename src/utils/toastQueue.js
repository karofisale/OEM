// Hàng đợi toast — thuần hàm, không React/DOM, để test được.
//
// Quy tắc (Đợt 2 / mục 2):
//  - nhiều toast xếp chồng, cái mới nằm dưới cùng, KHÔNG toast nào xoá toast khác;
//  - toast lỗi KHÔNG tự tắt, phải có nút × (người dùng cần đọc và xử lý);
//  - toast thường tự tắt sau ~4 giây;
//  - cùng một nội dung bắn liên tiếp (vd bấm nút 3 lần) -> gộp thành một dòng "×3"
//    thay vì chồng 3 cái giống hệt;
//  - tối đa MAX_HIENTHI toast cùng lúc: dư thì bỏ cái thường cũ nhất trước, lỗi
//    chỉ bị bỏ khi KHÔNG còn toast thường nào để bỏ.

export const TU_TAT_MS = 4000;
export const MAX_HIENTHI = 5;

/** Thêm một toast. `opts`: { id, now, bien ('error'|'success'|'info'), ms (0 = không tự tắt) }. */
export function themToast(list, message, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const bien = opts.bien || 'info';
  const text = String(message);
  const laLoi = bien === 'error';
  const ms = opts.ms != null ? opts.ms : (laLoi ? 0 : TU_TAT_MS);
  const han = ms > 0 ? now + ms : null;

  // Gộp với toast cuối nếu y hệt (cùng loại, cùng chữ).
  const last = list[list.length - 1];
  if (last && last.bien === bien && last.message === text) {
    const gop = { ...last, count: (last.count || 1) + 1, expiresAt: han, ms };
    return [...list.slice(0, -1), gop];
  }

  const t = { id: opts.id, message: text, bien, count: 1, expiresAt: han, ms };
  let next = [...list, t];
  while (next.length > MAX_HIENTHI) {
    let i = next.findIndex((x) => x.bien !== 'error');
    if (i < 0) i = 0;
    next.splice(i, 1);
  }
  return next;
}

/** Đóng một toast theo id. */
export function boToast(list, id) {
  return list.filter((t) => t.id !== id);
}

/** Bỏ các toast đã hết hạn tại `now`. Toast lỗi (expiresAt = null) không bao giờ hết hạn. */
export function hetHan(list, now) {
  const next = list.filter((t) => t.expiresAt == null || t.expiresAt > now);
  return next.length === list.length ? list : next;
}

/** Gia hạn mọi toast thường (khi rê chuột ra khỏi vùng toast). */
export function giaHan(list, now) {
  return list.map((t) => (t.expiresAt == null ? t : { ...t, expiresAt: now + (t.ms || TU_TAT_MS) }));
}

/** Còn toast nào cần đồng hồ đếm giờ không. */
export function canDongHo(list) {
  return list.some((t) => t.expiresAt != null);
}
