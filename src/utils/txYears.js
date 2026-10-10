// Giao dịch doanh thu theo NĂM — logic thuần (không React) cho Đợt 4 (10/10/2026).
//
// Bối cảnh: getBootstrap tải TOÀN BỘ giao dịch (~590KB và tăng mỗi tháng). Giờ client xin getBootstrap({recent:true}):
// server chỉ gửi giao dịch NĂM NAY + NĂM TRƯỚC kèm danh sách `olderYears` (các năm cũ hơn CÓ dữ liệu); năm cũ tải khi cần bằng
// getTransactionsByYear. Server cũ không biết tham số này -> vẫn trả đủ, không có olderYears -> mọi thứ chạy như trước.
//
// QUY TẮC AN TOÀN: màn nào cộng số theo năm phải TẢI ĐỦ các năm nó cộng TRƯỚC khi hiện số (có trạng thái "đang tải" / lỗi +
// Thử lại), không bao giờ hiện số cộng từ dữ liệu thiếu.

/** Chuẩn hoá danh sách năm (số / chuỗi) -> mảng chuỗi 4 số, bỏ phần tử không hợp lệ, không trùng. */
export function chuanNam(years) {
  const out = [];
  (years || []).forEach((y) => {
    const s = String(y == null ? '' : y).trim();
    if (/^\d{4}$/.test(s) && !out.includes(s)) out.push(s);
  });
  return out;
}

/**
 * Trong các năm màn hình CẦN (`wanted`; có thể chứa 'ALL' = mọi năm), năm nào là năm CŨ (nằm trong `olderYears` của server)?
 * Năm đã có trong bootstrap gần đây, hoặc không có dữ liệu ở đâu, thì không phải tải gì — nên không nằm trong kết quả.
 */
export function namCanTai(wanted, olderYears) {
  const cu = chuanNam(olderYears);
  const w = (wanted || []).includes('ALL') ? cu : chuanNam(wanted);
  return w.filter((y) => cu.includes(y));
}

/** Gộp phần cũ đã tải + phần gần đây: năm cũ trước (thứ tự tăng dần), rồi tới giao dịch gần đây — như thứ tự id ở server. */
export function gopGiaoDich(recent, olderByYear) {
  const ks = Object.keys(olderByYear || {}).sort();
  if (!ks.length) return recent || [];
  const out = [];
  ks.forEach((k) => { (olderByYear[k] || []).forEach((t) => out.push(t)); });
  (recent || []).forEach((t) => out.push(t));
  return out;
}

/**
 * Sau mỗi lần nhận bootstrap mới: bỏ khỏi bộ nhớ các năm cũ giờ đã nằm trong phần "gần đây" (vd qua năm mới khi tab mở lâu)
 * — nếu giữ thì cùng một giao dịch xuất hiện hai lần và mọi tổng bị nhân đôi.
 */
export function boNamDaTrongGanDay(olderByYear, recentFromYear) {
  if (recentFromYear == null || !isFinite(Number(recentFromYear))) return olderByYear;
  const out = {};
  Object.keys(olderByYear || {}).forEach((k) => { if (Number(k) < Number(recentFromYear)) out[k] = olderByYear[k]; });
  return out;
}

/**
 * Các năm một danh sách THÁNG ('T09-2026') chạm tới — dùng cho màn Kế hoạch kinh doanh (Done của tháng cũ tính từ giao dịch).
 */
export function namCuaCacThang(months) {
  const out = [];
  (months || []).forEach((m) => {
    const x = /^T\s*(\d{1,2})-(\d{4})$/.exec(String(m || '').trim());
    if (x && !out.includes(x[2])) out.push(x[2]);
  });
  return out;
}

/** Trạng thái tải của một tập năm cần: { dangTai, loi, namThieu }. `daTai`: mảng năm đã có; `dangTaiNam`: mảng; `loiTheoNam`: { năm: câu lỗi }. */
export function trangThaiNam(canTai, daTai, dangTaiNam, loiTheoNam) {
  const thieu = canTai.filter((y) => !(daTai || []).includes(y));
  if (!thieu.length) return { dangTai: false, loi: '', namThieu: [] };
  const loi = thieu.map((y) => (loiTheoNam || {})[y]).find(Boolean) || '';
  // Có lỗi thì không coi là "đang tải" (hiện lỗi + Thử lại); chưa lỗi mà chưa có thì đang chờ (kể cả lượt gọi sắp bắt đầu).
  return { dangTai: !loi, loi, namThieu: thieu };
}
