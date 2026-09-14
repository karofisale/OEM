/**
 * Doanh thu đã thực hiện ("Done") của từng khách trong MỘT tháng, tính thẳng từ
 * tab Data (prop `transactions`) chứ không đọc cột G của Plan_Thang.
 *
 * Đây là NGUỒN DỰ PHÒNG, dùng cho những dòng chưa có kế hoạch tháng này nên
 * không có cột G nào để đọc — xem doneCuaDong() để biết thứ tự ưu tiên.
 *
 * Cách tính giống hệt thẻ tổng quan trên cổng (oemAppBuildPortalStats_), nên
 * hai chỗ nói cùng một con số.
 *
 * Khớp theo `clientCode` của giao dịch: cùng một mã chữ với `searchCode` của
 * Plan_Thang và khoá của Plan2026 (oemAppLoadTransactions_ đặt
 * clientCode = codeSearch), nên không phải quy đổi gì.
 */
export function doneTheoKhach(transactions, month) {
  const map = new Map();
  if (!month || month === 'ALL') return map;
  (transactions || []).forEach((t) => {
    if (!t || t.month !== month) return;
    const code = t.clientCode;
    if (!code) return;
    // netRevenue là doanh thu thuần; rơi về `revenue` khi thiếu, giống mọi nơi
    // khác trong app.
    map.set(code, (map.get(code) || 0) + (t.netRevenue || t.revenue || 0));
  });
  return map;
}


/**
 * Done hiển thị cho MỘT dòng kế hoạch.
 *
 * Ưu tiên cột Done của chính dòng Plan_Thang, chỉ rơi về số tính từ tab Data
 * khi dòng đó chưa tồn tại (hoặc cột Done còn trống).
 *
 * VÌ SAO ƯU TIÊN CỘT DONE chứ không dùng thẳng tab Data cho gọn: màn "Xem Kế
 * Hoạch" đã hiện cột Done này từ trước và đang chạy tốt. Nếu hai màn trong cùng
 * một tab lấy hai nguồn khác nhau mà Sheet lệch, người dùng sẽ thấy hai con số
 * "Done" mâu thuẫn ngay cạnh nhau — tự tay tạo ra một lỗi. Ưu tiên cột Done thì
 * mọi dòng đã có kế hoạch đều khớp đúng con số màn "Xem Kế Hoạch" đang hiện.
 *
 * Phần rơi về tab Data chỉ áp cho dòng CHƯA có kế hoạch tháng này — đúng cảnh
 * hay gặp ở màn "Đề xuất" (bảng dựng từ Plan2026), nơi không có cột Done nào để
 * đọc mà Sale vẫn cần biết khách đã bán được bao nhiêu.
 *
 * `tuGiaoDich` nói con số đến từ đâu, để giao diện ghi chú lại cho người xem.
 */
export function doneCuaDong(plan, doneTuGiaoDich) {
  if (plan && plan.done) return { value: plan.done, tuGiaoDich: false };
  return { value: doneTuGiaoDich || 0, tuGiaoDich: true };
}
