/**
 * Ghi "lạc quan": cập nhật giao diện trước (`apply`), gọi backend sau (`call`),
 * hỏng thì trả giao diện về như cũ (`revert`) và báo lỗi qua `baoLoi`.
 *
 * Trả { ok: true } hoặc { ok: false, error } (09/10/2026). Bản cũ trong App.jsx
 * nuốt lỗi, nên modal Thêm/Sửa khách hàng + sản phẩm tưởng đã lưu xong, tự
 * đóng và mất hết chữ đã gõ. Giờ bên gọi đọc kết quả: lỗi thì giữ modal.
 */
export async function chayLacQuan(apply, revert, call, failMessage, baoLoi) {
  apply();
  try {
    await call();
    return { ok: true };
  } catch (err) {
    revert();
    const error = `${failMessage}: ${err && err.message ? err.message : String(err)}`;
    if (baoLoi) baoLoi(error);
    return { ok: false, error };
  }
}
