// Logic THUẦN của các thẻ KPI ở "Tổng quan Metric" (30/10/2026) — tách ra để test gọi thẳng.
//
//   Sản lượng      = Máy + Bơm (hai thẻ riêng), không còn một tổng chung lẫn linh kiện.
//   Khách active   = đếm theo SEARCH CODE (mã chữ, khoá nghiệp vụ), không đếm Code SAP: một khách có nhiều mã SAP chỉ tính một.
//   Số đơn         = số mã đơn (SO) khác nhau, không phải số dòng doanh thu (một đơn nhiều mã hàng là nhiều dòng).

/** Bỏ dấu + hạ chữ thường để so khớp tên sản phẩm ("Bơm" = "bom" = "BƠM"). */
export function chuanChu(v) {
  return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/**
 * Loại sản phẩm của một dòng doanh thu: 'may' | 'bom' | 'khac'.
 *  - Máy: mã SAP bắt đầu bằng "1" (cùng quy ước với Export và kế hoạch năm FC — annualPlanModel.laMayMacDinh). Xét TRƯỚC: tên máy
 *    có thể chứa chữ "bơm" (vd "Máy lọc RO bơm tăng áp") nhưng vẫn là máy.
 *  - Bơm: không phải máy, và tên vật tư hoặc Nhóm SP có từ "bơm".
 *  - Còn lại (linh kiện, lõi, màng...): 'khac' — không vào thẻ Máy/Bơm.
 */
export function loaiSanPham(t) {
  if (!t) return 'khac';
  if (/^1/.test(String(t.sku == null ? '' : t.sku).trim())) return 'may';
  const chu = chuanChu(String(t.skuName || '') + ' ' + String(t.group || ''));
  if (/(^|[^a-z0-9])bom([^a-z0-9]|$)/.test(chu)) return 'bom';
  return 'khac';
}

/** Sản lượng theo loại: { may, bom, khac } (cộng `qty`). */
export function sanLuongTheoLoai(rows) {
  const kq = { may: 0, bom: 0, khac: 0 };
  (rows || []).forEach((t) => { kq[loaiSanPham(t)] += Number(t && t.qty) || 0; });
  return kq;
}

/** Số đơn hàng: số mã đơn (orderNo) khác nhau, bỏ dòng không có mã đơn. So khớp không phân biệt hoa/thường và khoảng trắng đầu-cuối. */
export function demDon(rows) {
  const set = new Set();
  (rows || []).forEach((t) => {
    const no = String(t && t.orderNo != null ? t.orderNo : '').trim().toUpperCase();
    if (no) set.add(no);
  });
  return set.size;
}

/**
 * Số khách Active theo Search Code (khớp bộ lọc Sale). Khách chưa có Search Code (dữ liệu thiếu) tính riêng theo Code SAP để không bị
 * bỏ sót. `khopSale(rowSale, saleFilter)` truyền vào để file này không phụ thuộc roles.js.
 */
export function demKhachActive(clients, saleFilter, khopSale) {
  const set = new Set();
  (clients || []).forEach((c) => {
    if (String(c && c.status != null ? c.status : '').trim() !== 'Active') return;
    if (!khopSale(c.sale, saleFilter)) return;
    const ma = String(c.codeSearch || '').trim().toUpperCase();
    set.add(ma ? 'S:' + ma : 'C:' + String(c.code == null ? '' : c.code).trim());
  });
  return set.size;
}
