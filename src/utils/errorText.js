// Dịch lỗi thô (Postgres / máy chủ / mạng, tiếng Anh, lộ tên bảng) thành câu tiếng Việt dễ hiểu.
//
// Vì sao ở CLIENT: backend (Supabase Edge Function oem-api) ném thẳng message của Postgres, ví dụ
//   duplicate key value violates unique constraint "products_sku_key"
//   relation "oem.orders" does not exist
// Người dùng không đọc được, còn tên bảng/ràng buộc là thông tin nội bộ không nên hiện ra màn.
// Sửa gốc ở server thì khó lường hết mẫu lỗi, nên đặt một lớp dịch ở đây — thuần JS, test gọi thẳng.
//
// Quy tắc:
//  - Chỉ đụng tới đoạn lỗi THÔ. Câu đã là tiếng Việt (có dấu) giữ nguyên — server của app này viết
//    sẵn nhiều câu nghiệp vụ như "Mã KH 1000700 đã có trong danh bạ".
//  - Câu dạng "Không lưu được thay đổi: <lỗi thô>" chỉ thay phần sau dấu ": ", giữ phần mở đầu.
//  - Mỗi lỗi đã dịch kèm "Mã tham chiếu: E-XXXX" (băm của câu gốc) để người dùng báo admin. Câu gốc
//    ghi vào console + sessionStorage('oem_loi_gan_day', 20 lỗi gần nhất) để admin tra lại.
//  - Idempotent: câu đã có "Mã tham chiếu" hoặc đã là tiếng Việt thì chạy lại không đổi gì.
//  - Đợt 4 (10/10/2026): lỗi bất ngờ từ oem-api đến SẴN dạng "...(Mã tham chiếu: E-3F9A)" — mã do máy chủ sinh và ghi vào log của hàm
//    cùng lỗi gốc; client giữ nguyên câu, không băm lại.

const DAU_VIET = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

// Thứ tự QUAN TRỌNG: mẫu cụ thể đứng trước mẫu chung.
const MAU_LOI = [
  [/duplicate key|unique constraint|violates unique|already exists/i,
    'Dữ liệu này đã có trong hệ thống (trùng mã). Kiểm tra lại rồi thử lại.'],
  [/foreign key|is still referenced|still referenced from/i,
    'Dữ liệu này đang được dùng ở nơi khác nên chưa thay đổi hoặc xoá được.'],
  [/not-null|null value in column|violates not-null/i,
    'Thiếu thông tin bắt buộc. Kiểm tra lại các ô còn trống.'],
  [/check constraint|violates check/i,
    'Có giá trị nhập không hợp lệ. Kiểm tra lại số liệu.'],
  [/invalid input (syntax|value)|out of range|numeric field overflow|value too long|invalid (date|time|number)/i,
    'Có ô nhập sai định dạng hoặc vượt giới hạn (số, ngày, độ dài). Kiểm tra lại.'],
  [/permission denied|row-level security|not authorized|forbidden|\b403\b/i,
    'Bạn không có quyền thực hiện thao tác này.'],
  [/deadlock|could not serialize|lock timeout|too many connections|remaining connection slots|too many clients/i,
    'Hệ thống đang bận xử lý việc khác. Vui lòng thử lại sau ít giây.'],
  [/timeout|timed out|statement timeout|canceling statement|etimedout|deadline exceeded/i,
    'Máy chủ xử lý quá lâu. Vui lòng thử lại.'],
  [/failed to fetch|networkerror|network request failed|load failed|econnreset|econnrefused|enotfound|fetch failed|socket hang up/i,
    'Không kết nối được tới máy chủ — kiểm tra mạng rồi thử lại.'],
  [/unexpected token|is not valid json|json\.parse|unexpected end of json/i,
    'Máy chủ trả về dữ liệu không đọc được. Vui lòng thử lại sau.'],
  [/jwt|token (is )?(expired|invalid)|invalid token/i,
    'Phiên làm việc không còn hợp lệ. Hãy đăng nhập lại.'],
  [/internal server error|bad gateway|service unavailable|gateway time-?out|edge function|\b5\d\d\b/i,
    'Máy chủ đang gặp sự cố tạm thời. Vui lòng thử lại sau ít phút.'],
  [/relation .* does not exist|column .* does not exist|function .* does not exist|schema|syntax error at|sqlstate|postgres|pg_|\berror:\s|\b42[0-9a-z]{3}\b/i,
    'Lỗi hệ thống phía máy chủ. Hãy báo admin kèm mã tham chiếu bên dưới.']
];

// Câu tiếng Anh không khớp mẫu nào ở trên vẫn không nên hiện nguyên: nhận ra bằng vài từ thông dụng.
const TU_ANH = /\b(the|is|are|not|of|to|for|must|cannot|can't|failed|error|invalid|unexpected|undefined|null|exception|violates|constraint|column|table|relation|missing|required|denied|unable)\b/gi;
const KHUNG_CHUNG = 'Máy chủ báo lỗi không rõ nguyên nhân. Hãy thử lại; nếu vẫn lỗi, báo admin kèm mã tham chiếu bên dưới.';

/** Mã tham chiếu ngắn, ổn định cho cùng một câu gốc: 'E-3F9A'. */
export function maThamChieu(raw) {
  let h = 5381;
  const s = String(raw == null ? '' : raw);
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return 'E-' + (h % 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Câu có phải lỗi THÔ không. Trả câu tiếng Việt thay thế, hoặc null nếu không phải
 * (đã là tiếng Việt / câu nghiệp vụ / chưa nhận ra).
 */
export function mauLoiTho(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || DAU_VIET.test(s)) return null;
  for (const [re, text] of MAU_LOI) if (re.test(s)) return text;
  const anh = s.match(TU_ANH);
  if (anh && anh.length >= 2) return KHUNG_CHUNG;
  return null;
}

// lamSachLoi được gọi trong lúc render (TableState) nên cùng một lỗi sẽ bị hỏi lại nhiều lần — chỉ ghi lần đầu.
const daGhi = new Set();

function ghiNho(ma, raw) {
  if (daGhi.has(ma)) return;
  daGhi.add(ma);
  try { console.error('[oem-loi]', ma, raw); } catch (e) { /* console bị chặn */ }
  try {
    if (typeof sessionStorage === 'undefined') return;
    const ds = JSON.parse(sessionStorage.getItem('oem_loi_gan_day') || '[]');
    ds.push({ ma, luc: new Date().toISOString(), tho: String(raw).slice(0, 500) });
    sessionStorage.setItem('oem_loi_gan_day', JSON.stringify(ds.slice(-20)));
  } catch (e) { /* không có sessionStorage thì thôi */ }
}

const kemMa = (text, ma) => `${text} (Mã tham chiếu: ${ma})`;

/**
 * Làm sạch MỘT câu lỗi để hiện cho người dùng. Nhận Error hoặc chuỗi; luôn trả chuỗi.
 *   lamSachLoi(new Error('duplicate key value violates unique constraint "x"'))
 *     -> 'Dữ liệu này đã có trong hệ thống (trùng mã)... (Mã tham chiếu: E-1A2B)'
 *   lamSachLoi('Không lưu được thay đổi: relation "oem.orders" does not exist')
 *     -> 'Không lưu được thay đổi: Lỗi hệ thống phía máy chủ... (Mã tham chiếu: E-....)'
 */
export function lamSachLoi(input) {
  const goc = input && typeof input === 'object' && 'message' in input ? input.message : input;
  const s = String(goc == null ? '' : goc);
  if (!s) return s;
  // Máy chủ (oem-api, Đợt 4) đã che lỗi bất ngờ và gắn sẵn "Mã tham chiếu: E-XXXX" khớp với dòng log của hàm: dùng ĐÚNG mã đó,
  // không băm lại câu gốc (không có câu gốc ở đây — nó chỉ nằm trong log của máy chủ). Chỉ ghi nhớ mã để admin tra lại.
  const daCoMa = /Mã tham chiếu: (E-[0-9A-F]{4})/.exec(s);
  if (daCoMa) { ghiNho(daCoMa[1], s); return s; }
  if (/Mã tham chiếu: E-/.test(s)) return s;

  const caNau = mauLoiTho(s);
  if (caNau) {
    const ma = maThamChieu(s);
    ghiNho(ma, s);
    return kemMa(caNau, ma);
  }
  // Có phần mở đầu tiếng Việt: "Không lưu được thay đổi: <lỗi thô>".
  const i = s.indexOf(': ');
  if (i >= 0) {
    const dau = s.slice(0, i + 2);
    const duoi = s.slice(i + 2);
    const thay = mauLoiTho(duoi);
    if (thay) {
      const ma = maThamChieu(duoi);
      ghiNho(ma, duoi);
      return dau + kemMa(thay, ma);
    }
  }
  return s;
}
