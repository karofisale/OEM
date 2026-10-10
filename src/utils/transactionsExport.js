// Dựng dòng xuất Excel cho "Lịch sử doanh thu" — thuần JS để test gọi thẳng.
// Cột và thứ tự khớp bảng đang xem (cộng Tên khách + Nhóm SP + Tháng). Ngày hiện dd/mm/yyyy như trên màn.

import { hienNgay } from './vnDate.js';

export const COT_XUAT_DOANH_THU = [
  'Ngày chứng từ', 'Order SO', 'Client', 'Tên khách hàng', 'Mã vật tư', 'Tên vật tư',
  'Số lượng', 'Đơn giá', 'DT thuần (VND)', 'SALE', 'Nhóm SP', 'Tháng'
];

/** Mảng đối tượng cho XLSX.utils.json_to_sheet, giữ nguyên thứ tự `rows` (đang lọc + sắp xếp trên màn). */
export function dongXuatDoanhThu(rows) {
  return (rows || []).map((t) => ({
    'Ngày chứng từ': hienNgay(t.date, { gio: false }),
    'Order SO': t.orderNo || '',
    'Client': t.clientCode || '',
    'Tên khách hàng': t.clientName || '',
    'Mã vật tư': t.sku || '',
    'Tên vật tư': t.skuName || '',
    'Số lượng': Number(t.qty) || 0,
    'Đơn giá': Number(t.price) || 0,
    'DT thuần (VND)': Number(t.netRevenue) || 0,
    'SALE': t.sale || '',
    'Nhóm SP': t.group || '',
    'Tháng': t.month || ''
  }));
}

/** Tên file: Lich_su_doanh_thu_<phạm vi>_<dd-mm-yyyy>.xlsx. `thang` là 'ALL' hoặc khoá tháng. */
export function tenFileDoanhThu(thang, nam, ngaySlug) {
  const pv = !thang || thang === 'ALL' ? `Nam_${nam}` : String(thang).replace(/[^\w.-]+/g, '_');
  return `Lich_su_doanh_thu_${pv}_${ngaySlug}.xlsx`;
}
