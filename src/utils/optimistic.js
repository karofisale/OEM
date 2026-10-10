/**
 * Ghi "lạc quan": cập nhật giao diện trước (`apply`), gọi backend sau (`call`),
 * hỏng thì trả giao diện về như cũ (`revert`) và báo lỗi qua `baoLoi`.
 *
 * Trả { ok: true } hoặc { ok: false, error } (09/10/2026). Bản cũ trong App.jsx
 * nuốt lỗi, nên modal Thêm/Sửa khách hàng + sản phẩm tưởng đã lưu xong, tự
 * đóng và mất hết chữ đã gõ. Giờ bên gọi đọc kết quả: lỗi thì giữ modal.
 */
import { lamSachLoi } from './errorText.js';

export async function chayLacQuan(apply, revert, call, failMessage, baoLoi) {
  apply();
  try {
    await call();
    return { ok: true };
  } catch (err) {
    revert();
    // lamSachLoi (Đợt 3): lỗi Postgres/server thô -> câu tiếng Việt + mã tham chiếu; câu tiếng Việt giữ nguyên.
    const error = `${failMessage}: ${lamSachLoi(err && err.message ? err.message : String(err))}`;
    if (baoLoi) baoLoi(error);
    return { ok: false, error };
  }
}
