/**
 * Doanh thu đã thực hiện ("Done") của từng khách trong MỘT tháng, tính thẳng từ
 * giao dịch thật (prop `transactions`, oem.transactions) chứ không đọc cột
 * "done" lưu sẵn ở oem.plan_thang — xem doneCuaDong() ngay dưới để biết vì sao
 * đây giờ là NGUỒN DUY NHẤT còn đáng tin, không phải nguồn dự phòng nữa.
 *
 * Cách tính giống hệt thẻ tổng quan trên cổng (portal.js), nên hai chỗ nói
 * cùng một con số.
 *
 * Khớp theo `clientCode` của giao dịch: cùng một mã chữ với `searchCode` của
 * Plan_Thang và khoá của KPI năm (loadTransactions ở catalog.js đặt
 * clientCode = codeSearch), nên không phải quy đổi gì.
 */
export function doneTheoKhach(transactions, month) {
  const map = new Map();
  if (!month || month === 'ALL') return map;
  (transactions || []).forEach((t) => {
    if (!t || t.month !== month) return;
    const code = t.clientCode;
    if (!code) return;
    // Doanh thu THUẦN, không rơi về `revenue` (doanh thu gộp, chưa trừ CK
    // thương mại/giảm giá): Done phải ra đúng con số mà báo cáo doanh thu hiện
    // cho cùng khách, cùng tháng — Sale mở hai màn cạnh nhau là so ngay.
    map.set(code, (map.get(code) || 0) + (t.netRevenue || 0));
  });
  return map;
}


/**
 * Done hiển thị cho MỘT dòng kế hoạch.
 *
 * Sửa 28/09/2026 — BUG: Done hiện thấp hơn doanh thu thực tế. Bản cũ ưu tiên
 * cột "done" lưu sẵn ở oem.plan_thang, đúng khi cột đó còn là công thức SUMIFS
 * SỐNG trong Google Sheet (tự tính lại mỗi khi tab Data đổi — lý do gốc của
 * việc ưu tiên nó, xem lịch sử hàm này). Từ khi cắt sang Postgres (26/09/2026,
 * xem migrate.js), cột đó chỉ còn là ẢNH CHỤP giá trị công thức tại ĐÚNG đêm
 * migrate — Postgres không có "công thức", và KHÔNG nơi nào (kể cả lúc nhập
 * doanh thu SAP mới qua revenue.js:replaceMonth) từng ghi lại nó sau đó. Ưu
 * tiên một cột đã đông cứng vĩnh viễn thì Done ngày càng lùi xa doanh thu thật
 * mỗi khi có tháng mới đổ vào — đúng triệu chứng user báo.
 *
 * Giờ ĐẢO ngược ưu tiên: dùng doneTuGiaoDich (tính thẳng từ oem.transactions,
 * xem doneTheoKhach ở trên) làm nguồn chính — đây là nguồn DUY NHẤT còn tự cập
 * nhật. Chỉ rơi về cột "done" cũ khi giao dịch tính ra 0/rỗng (ví dụ khách chưa
 * có doanh thu tháng này trong oem.transactions) — còn hơn hiện thẳng 0 nếu
 * cột cũ đang giữ một số khác 0 từ trước đêm cắt luồng.
 *
 * `tuGiaoDich` nói con số đến từ đâu, để giao diện ghi chú lại cho người xem.
 */
export function doneCuaDong(plan, doneTuGiaoDich) {
  if (doneTuGiaoDich) return { value: doneTuGiaoDich, tuGiaoDich: true };
  return { value: (plan && plan.done) || 0, tuGiaoDich: false };
}
