import { parseMonthKey, formatMonthKey } from './period';

/**
 * Khoá tháng chuẩn 'Txx-yyyy' của một giao dịch. Ưu tiên cột Tháng_Năm (t.month);
 * ô trống / sai dạng thì suy từ ngày phát sinh công nợ (t.date 'dd/MM/yyyy') —
 * đúng cột mà revenue.js:replaceMonth dùng để thay tháng, nên không dòng nào
 * của tháng bị rơi khỏi Done chỉ vì SAP để trống Tháng_Năm.
 */
export function thangGiaoDich(t) {
  const p = parseMonthKey(t && t.month);
  if (p) return formatMonthKey(p.month, p.year);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String((t && t.date) || '').trim());
  return m ? formatMonthKey(parseInt(m[2], 10), m[3]) : '';
}

/** Chuẩn hoá khoá tháng của dòng kế hoạch ('T9-2026' -> 'T09-2026'). */
function chuanThang(month) {
  const p = parseMonthKey(month);
  return p ? formatMonthKey(p.month, p.year) : '';
}

const chuanMa = (s) => String(s || '').trim().toUpperCase();

/**
 * Doanh thu đã thực hiện ("Done") của từng khách trong MỘT tháng, tính thẳng từ
 * giao dịch thật (prop `transactions` = oem.transactions, tab Data cũ) — cách
 * tính giống thẻ tổng quan trên cổng (portal.js), nên hai chỗ nói cùng một số.
 *
 * Khớp `clientCode` của giao dịch với `searchCode` của Plan_Thang (cùng mã chữ,
 * catalog.js đặt clientCode = codeSearch), so không phân biệt hoa/thường, khoảng
 * trắng.
 *
 * Trả { theoMa: Map(mã -> tiền), coGiaoDich } — `coGiaoDich` = tháng này ĐÃ có
 * doanh thu trong Data (dù của khách nào), xem doneDong().
 */
export function doneTheoKhach(transactions, month) {
  const theoMa = new Map();
  const k = chuanThang(month);
  let coGiaoDich = false;
  if (!k) return { theoMa, coGiaoDich };
  (transactions || []).forEach((t) => {
    if (!t || thangGiaoDich(t) !== k) return;
    coGiaoDich = true;
    const code = chuanMa(t.clientCode);
    if (!code) return;
    // Doanh thu THUẦN, không rơi về `revenue` (doanh thu gộp, chưa trừ CK
    // thương mại/giảm giá): Done phải ra đúng con số mà báo cáo doanh thu hiện
    // cho cùng khách, cùng tháng — Sale mở hai màn cạnh nhau là so ngay.
    theoMa.set(code, (theoMa.get(code) || 0) + (t.netRevenue || 0));
  });
  return { theoMa, coGiaoDich };
}

/**
 * Done hiển thị cho MỘT dòng kế hoạch. `dt` = kết quả doneTheoKhach() của đúng
 * tháng đó.
 *
 * Cột "done" lưu ở oem.plan_thang chỉ là ẢNH CHỤP công thức SUMIFS của Google
 * Sheet tại đêm cắt sang Postgres (26/09/2026) — không nơi nào ghi lại nó sau
 * đó, nên nó đứng yên trong khi Data đổi. Vì vậy:
 *   - Tháng ĐÃ có doanh thu trong Data: luôn lấy số tính từ Data, kể cả 0 (khách
 *     chưa phát sinh doanh thu thì Done = 0, không phải số cũ đông cứng).
 *     Sửa 30/09/2026: bản 28/09 vẫn rơi về cột cũ khi khách tính ra 0, và màn
 *     "Xem kế hoạch" còn đọc thẳng cột cũ.
 *   - Tháng chưa có dòng Data nào (tháng cũ trước khi có Data): dùng cột cũ.
 *
 * `tuGiaoDich` nói con số đến từ đâu, để giao diện ghi chú lại cho người xem.
 */
export function doneDong(plan, code, dt) {
  if (dt && dt.coGiaoDich) return { value: dt.theoMa.get(chuanMa(code)) || 0, tuGiaoDich: true };
  return { value: (plan && plan.done) || 0, tuGiaoDich: false };
}

/**
 * Done theo Data cho MỌI tháng có trong danh sách kế hoạch — màn "Xem kế hoạch"
 * lọc được "Tất cả tháng" nên cần từng tháng một. Trả Map(tháng chuẩn -> dt).
 */
export function doneMoiThang(transactions, months) {
  const out = new Map();
  (months || []).forEach((m) => {
    const k = chuanThang(m);
    if (k && !out.has(k)) out.set(k, { theoMa: new Map(), coGiaoDich: false });
  });
  // Một lượt qua Data cho mọi tháng (Data có hàng chục nghìn dòng).
  (transactions || []).forEach((t) => {
    const dt = t && out.get(thangGiaoDich(t));
    if (!dt) return;
    dt.coGiaoDich = true;
    const code = chuanMa(t.clientCode);
    if (code) dt.theoMa.set(code, (dt.theoMa.get(code) || 0) + (t.netRevenue || 0));
  });
  return out;
}

/** dt của tháng của một dòng kế hoạch trong kết quả doneMoiThang(). */
export function dtCuaThang(bang, month) {
  return bang.get(chuanThang(month)) || null;
}
