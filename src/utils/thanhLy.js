// Bán hàng thanh lý (21/10/2026) — phần LOGIC THUẦN của màn (không đụng React) để test được.
// Dữ liệu từ api.getThanhLy: items = [{ sku, name, group, qty, pending, avail, price, priceSource, priceDate, priceBy, priceAt }].
//   qty = tồn SAP (kho 1402), pending = SL đang nằm trong "Đơn Hàng Chờ Duyệt" (mã đơn TL-...), avail = qty − pending,
//   price = giá thanh lý ĐÃ GỒM VAT (0 = chưa có giá).

import { chuanTim } from './searchText.js';

export const NHOM_TRONG = 'Chưa phân nhóm';
export const nhomCua = (it) => (it && String(it.group || '').trim()) || NHOM_TRONG;

/** Nguồn giá (cột Nguồn ở Bảng giá). */
export const NGUON_GIA = {
  kho1402: 'Doanh thu xuất kho 1402',
  lichsu: 'Doanh thu gần nhất',
  admin: 'Admin nhập'
};

/** Chữ giá tiền: 1250000 -> "1.250.000". */
export const dinhDangTien = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');

/** Chữ gõ vào ô giá -> số nguyên VND. "1.250.000" / "1,250,000" / "1250000" / "12.5" đều đọc được; rỗng hoặc rác -> null. */
export function giaTuChuoi(v) {
  if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.round(v) : null;
  const t = String(v == null ? '' : v).trim().replace(/\s/g, '').replace(/đ$/i, '');
  if (!t) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''));   // dấu chấm/phẩy là hàng nghìn
  if (/^\d+([.,]\d+)?$/.test(t)) return Math.round(Number(t.replace(',', '.')));
  return null;
}

/** Danh sách nhóm kèm số mã, xếp theo tên (nhóm "Chưa phân nhóm" xuống cuối). */
export function danhSachNhom(items) {
  const m = new Map();
  (items || []).forEach((it) => { const g = nhomCua(it); m.set(g, (m.get(g) || 0) + 1); });
  return [...m.entries()].map(([nhom, soMa]) => ({ nhom, soMa }))
    .sort((a, b) => (a.nhom === NHOM_TRONG) - (b.nhom === NHOM_TRONG) || a.nhom.localeCompare(b.nhom, 'vi'));
}

/**
 * Lọc danh sách: q tìm theo MÃ hoặc TÊN (không phân biệt hoa-thường/dấu; nhiều từ = phải có đủ mọi từ, thứ tự tuỳ ý);
 * nhom = '' (tất cả) hoặc tên nhóm; chiCoGia = chỉ mã đã có giá; chiConHang = chỉ mã còn hàng khả dụng;
 * nguon = '' | 'chua' (chưa có giá) | 'kho1402' | 'lichsu' | 'admin'.
 */
export function locTon(items, opts) {
  const o = opts || {};
  const tu = chuanTim(o.q || '').split(/\s+/).filter(Boolean);
  return (items || []).filter((it) => {
    if (o.nhom && nhomCua(it) !== o.nhom) return false;
    if (o.chiCoGia && !(it.price > 0)) return false;
    if (o.chiConHang && !(it.avail > 0)) return false;
    if (o.nguon) {
      if (o.nguon === 'chua') { if (it.price > 0) return false; }
      else if (it.priceSource !== o.nguon || !(it.price > 0)) return false;
    }
    if (tu.length) {
      const hay = chuanTim(it.sku + ' ' + it.name);
      if (!tu.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

/** Mã này chọn bán được không; trả '' nếu được, không thì lý do (hiện ở tooltip ô chọn). */
export function lyDoKhongChon(it) {
  if (!(it.price > 0)) return 'Chưa có giá thanh lý — nhờ Admin cập nhật ở tab Bảng giá';
  if (!(it.avail > 0)) return it.pending > 0 ? 'Hết hàng khả dụng — toàn bộ đang nằm trong đơn chờ duyệt' : 'Hết hàng';
  return '';
}

/** sel = { sku: qty (số hoặc chữ) } -> các dòng hợp lệ [{ sku, name, qty, price, total }] (bỏ mã đã biến mất / SL ≤ 0). */
export function dongDon(sel, items) {
  const by = new Map((items || []).map((i) => [i.sku, i]));
  const out = [];
  Object.keys(sel || {}).forEach((sku) => {
    const it = by.get(sku);
    const qty = Math.floor(Number(sel[sku]));
    if (!it || !(qty > 0)) return;
    out.push({ sku, name: it.name, qty, price: it.price, total: qty * it.price, avail: it.avail });
  });
  return out;
}

export function tongDon(sel, items) {
  const d = dongDon(sel, items);
  return { soMa: d.length, tongSl: d.reduce((a, r) => a + r.qty, 0), tongTien: d.reduce((a, r) => a + r.total, 0) };
}

/** Lỗi cần sửa trước khi xuất đơn (rỗng = gửi được). Server kiểm lại lần nữa. */
export function loiDon(sel, items, client) {
  const loi = [];
  if (!client || !String(client.code || '').trim()) loi.push('Chưa chọn khách hàng.');
  const d = dongDon(sel, items);
  if (!d.length) loi.push('Chưa chọn mã nào (hoặc số lượng bằng 0).');
  d.forEach((r) => {
    if (r.qty > r.avail) loi.push(`Mã ${r.sku}: chọn ${r.qty} nhưng chỉ còn ${r.avail}.`);
    if (!(r.price > 0)) loi.push(`Mã ${r.sku}: chưa có giá thanh lý.`);
  });
  return loi;
}

/**
 * Giá mới cho một nhóm mã (nút "Áp dụng" ở Bảng giá). kieu 'dat' = đặt một giá chung; 'phanTram' = tăng (+) / giảm (−) so với giá
 * hiện tại (giá 0 / chưa có thì KHÔNG đổi — không có gốc để tính %). `lam` = làm tròn tới bội số này (1 / 100 / 1000).
 * Trả { sku: giáMới } chỉ cho các mã đổi giá thật.
 */
export function tinhGiaNhom(items, giaHienTai, cfg) {
  const lam = [1, 100, 1000].includes(Number(cfg.lam)) ? Number(cfg.lam) : 1;
  const tron = (x) => Math.max(0, Math.round(x / lam) * lam);
  const out = {};
  (items || []).forEach((it) => {
    const cu = giaHienTai(it);
    let moi = null;
    if (cfg.kieu === 'dat') {
      const g = giaTuChuoi(cfg.gia);
      if (g !== null) moi = tron(g);
    } else if (cfg.kieu === 'phanTram') {
      const p = Number(String(cfg.phanTram).replace(',', '.'));
      if (isFinite(p) && cu > 0) moi = tron(cu * (1 + p / 100));
    }
    if (moi !== null && moi !== cu) out[it.sku] = moi;
  });
  return out;
}

/** Nhãn "Nguồn giá" ở Bảng giá. */
export function nhanNguonGia(it) {
  if (!(it.price > 0) && !it.priceSource) return 'Chưa có giá';
  const ngay = it.priceDate ? ' · ' + it.priceDate.split('-').reverse().join('/') : '';
  if (it.priceSource === 'admin') return 'Admin nhập' + (it.priceBy ? ' · ' + it.priceBy : '');
  return (NGUON_GIA[it.priceSource] || 'Lịch sử doanh thu') + ngay;
}

/** Số mã đang có thay đổi giá chưa lưu: draft = { sku: chữ gõ }. Chỉ tính ô khác giá hiện tại và hợp lệ. */
export function thayDoiGia(draft, items) {
  const by = new Map((items || []).map((i) => [i.sku, i]));
  const out = [];
  Object.keys(draft || {}).forEach((sku) => {
    const it = by.get(sku);
    if (!it) return;
    const g = giaTuChuoi(draft[sku]);
    if (g === null || g === Math.round(it.price || 0)) return;
    out.push({ sku, price: g });
  });
  return out;
}
