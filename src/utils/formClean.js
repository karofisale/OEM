// Làm sạch + kiểm tra ô nhập của form Khách hàng / Sản phẩm — thuần JS, test gọi thẳng.
//
// Vì sao: mã dán từ Excel/SAP hay dính khoảng trắng đầu-cuối (kể cả khoảng trắng không ngắt NBSP và
// ký tự rộng-bằng-không). "MAT1000 " và "MAT1000" nhìn giống hệt nhưng so bằng === không bao giờ khớp,
// nên kiểm trùng bị lọt rồi server (so chính xác) lại nhận thêm một mã trùng. Cắt trước khi so và trước khi lưu.

/** Cắt khoảng trắng đầu-cuối, kể cả NBSP / zero-width / BOM. Không đụng khoảng trắng ở giữa. */
export function catKhoangTrang(v) {
  return String(v == null ? '' : v).replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ').trim();
}

/** Khoá để SO TRÙNG mã: cắt khoảng trắng + không phân biệt hoa/thường. */
export function khoaMa(v) {
  return catKhoangTrang(v).toLowerCase();
}

/**
 * Tìm phần tử đã có cùng mã (sau khi cắt khoảng trắng). `layMa(item)` lấy mã của một phần tử;
 * `boQua(item)` loại chính bản ghi đang sửa. Trả phần tử trùng đầu tiên hoặc null. Mã rỗng thì không bao giờ trùng.
 */
export function timMaTrung(danhSach, layMa, ma, boQua) {
  const k = khoaMa(ma);
  if (!k) return null;
  for (const it of danhSach || []) {
    if (boQua && boQua(it)) continue;
    if (khoaMa(layMa(it)) === k) return it;
  }
  return null;
}

/**
 * Kiểm một ô giá/số tiền: '' / null = chưa nhập (hợp lệ, hiểu là 0). Trả '' nếu ổn, hoặc câu báo lỗi.
 * Chặn số âm và giá trị không phải số.
 */
export function kiemGia(v, nhan = 'Giá') {
  if (v === '' || v == null) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return `${nhan} phải là một số.`;
  if (n < 0) return `${nhan} không được âm.`;
  return '';
}
