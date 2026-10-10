// Chuẩn hoá chữ để TÌM KIẾM: không phân biệt hoa/thường, không phân biệt dấu (gõ "khach" ra "Khách").
// NFD tách dấu rời rồi bỏ; 'đ' không tách được nên đổi tay. Chữ Việt lấy từ nhiều nguồn có thể ở NFC hoặc NFD —
// qua chuẩn hoá này cả hai đều ra cùng một chuỗi.

export function chuanTim(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim();
}

/** `q` (đã chuanTim) có nằm trong bất kỳ trường nào không. q rỗng = khớp mọi thứ. */
export function khopBatKy(q, ...truong) {
  if (!q) return true;
  return truong.some((t) => chuanTim(t).includes(q));
}
