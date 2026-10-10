// Bảng thuật ngữ + nhãn trạng thái MỘT CHỖ cho cả app.
//
// Quy ước (Đợt 2 / mục 6):
//  - GIỮ tiếng Anh cho thuật ngữ nghiệp vụ mà người dùng đã quen: PI, SO, FOB,
//    Shipment, ETD/ETA, Booking, SKU, BOM.
//  - Mọi động từ và nhãn còn lại là tiếng Việt: "Xoá", "Hủy", "Thử lại"...
//  - Trạng thái luôn hiện qua badge có nhãn tiếng Việt, KHÔNG hiện mã thô
//    (`draft`, `drafted`, `Active`, `2026-10-01`).
//
// File này thuần JS (không JSX, không import React) để test chạy thẳng bằng node.

import { hienNgay, laNgayISOTho } from './vnDate.js';

/** Giữ nguyên tiếng Anh — test dùng danh sách này để chắc không ai "dịch" nhầm. */
export const THUAT_NGU_GIU_NGUYEN = ['PI', 'SO', 'FOB', 'Shipment', 'ETD', 'ETA', 'Booking', 'SKU', 'BOM'];

/** Nhãn nút dùng chung. Xoá luôn là "Xoá …", không dùng "OK" trơ trọi. */
export const NHAN = {
  luu: 'Lưu',
  huy: 'Hủy',
  dong: 'Đóng',
  xoa: 'Xoá',
  thuLai: 'Thử lại',
  taiLai: 'Tải lại',
  dangTai: 'Đang tải...',
  dangLuu: 'Đang lưu...',
  oLai: 'Ở lại',
  khac: 'Thêm'
};

/** Tông màu badge -> class trong index.css. */
export const TONE_CLASS = {
  emerald: 'badge-emerald',
  amber: 'badge-amber',
  rose: 'badge-rose',
  blue: 'badge-blue',
  purple: 'badge-purple',
  neutral: 'badge-neutral'
};

// Khoá là chuỗi đã hạ chữ thường, bỏ dấu cách thừa. Gộp cả mã thô tiếng Anh lẫn
// nhãn tiếng Việt đã có sẵn trên Sheet để cùng ra MỘT nhãn.
const TRANG_THAI = {
  // Khách hàng / SKU
  'active': { label: 'Đang hoạt động', tone: 'emerald' },
  'inactive': { label: 'Ngừng hoạt động', tone: 'rose' },
  'đang hoạt động': { label: 'Đang hoạt động', tone: 'emerald' },
  'ngừng hoạt động': { label: 'Ngừng hoạt động', tone: 'rose' },
  // Kế hoạch / đề xuất / SOP
  'draft': { label: 'Bản nháp', tone: 'neutral' },
  'drafted': { label: 'Bản nháp', tone: 'neutral' },
  'nháp': { label: 'Bản nháp', tone: 'neutral' },
  'bản nháp': { label: 'Bản nháp', tone: 'neutral' },
  'submitted': { label: 'Chờ duyệt', tone: 'amber' },
  'pending': { label: 'Chờ duyệt', tone: 'amber' },
  'pending_review': { label: 'Chờ duyệt', tone: 'amber' },
  'chờ duyệt': { label: 'Chờ duyệt', tone: 'amber' },
  'approved': { label: 'Đã duyệt', tone: 'emerald' },
  'đã duyệt': { label: 'Đã duyệt', tone: 'emerald' },
  'rejected': { label: 'Từ chối', tone: 'rose' },
  'từ chối': { label: 'Từ chối', tone: 'rose' },
  'đã từ chối': { label: 'Từ chối', tone: 'rose' },
  // Chung
  'done': { label: 'Hoàn tất', tone: 'emerald' },
  'completed': { label: 'Hoàn tất', tone: 'emerald' },
  'hoàn tất': { label: 'Hoàn tất', tone: 'emerald' },
  'cancelled': { label: 'Đã hủy', tone: 'rose' },
  'canceled': { label: 'Đã hủy', tone: 'rose' },
  'đã hủy': { label: 'Đã hủy', tone: 'rose' },
  'error': { label: 'Lỗi', tone: 'rose' },
  'failed': { label: 'Lỗi', tone: 'rose' }
};

const chuanHoa = (raw) => String(raw == null ? '' : raw).trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Mã/nhãn trạng thái bất kỳ -> { label, tone } để vẽ badge.
 *  - Mã đã biết -> nhãn tiếng Việt.
 *  - Rỗng -> '—' (tông trung tính).
 *  - ISO thô (2026-10-01...) -> đổi sang dd/mm/yyyy, không để lộ ra màn.
 *  - Chưa biết -> giữ nguyên chữ (còn hơn đoán bừa), tông trung tính.
 */
export function trangThai(raw) {
  const k = chuanHoa(raw);
  if (!k) return { label: '—', tone: 'neutral' };
  const hit = TRANG_THAI[k];
  if (hit) return hit;
  if (laNgayISOTho(raw)) return { label: hienNgay(raw), tone: 'neutral' };
  return { label: String(raw).trim(), tone: 'neutral' };
}

/** Trạng thái này có nghĩa là "đang hoạt động"/đã duyệt không (dùng khi lọc). */
export function laTrangThaiTot(raw) {
  const t = trangThai(raw);
  return t.tone === 'emerald';
}

/** Vai trò -> chữ hiện trên thanh trên. Có cả 'account' (Navbar cũ bỏ sót, rơi về "Sale"). */
export function nhanVaiTro(role, saleId) {
  switch (String(role || '').toLowerCase()) {
    case 'creator': return { text: 'Creator', tone: 'amber' };
    case 'admin': return { text: 'Admin', tone: 'purple' };
    case 'leader': return { text: 'Leader (chỉ xem)', tone: 'blue' };
    case 'account': return { text: 'Kế toán', tone: 'blue' };
    case 'sale':
    default: return { text: 'Sale: ' + (saleId || 'Chung'), tone: 'emerald' };
  }
}

/** Nhãn chế độ chỉ xem của Leader (thay cho "Leader View-Only Mode" tiếng Anh). */
export const NHAN_CHI_XEM = 'Leader — chỉ xem';

/** Tháng 'YYYY-MM' -> 'Tháng 10/2026'. Không đọc được thì trả nguyên. */
export function nhanThang(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  return m ? `Tháng ${m[2]}/${m[1]}` : String(ym || '');
}
