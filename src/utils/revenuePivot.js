// Bảng doanh thu "Client (dòng) × cột" cho Báo cáo doanh thu — thuần JS để test gọi thẳng.
//  - DT Tháng: cột = từng THÁNG của năm đang chọn (khi chọn "Tất cả tháng" và bật chi tiết) hoặc từng TUẦN của tháng đang chọn.
//  - DT Ngày: cột = từng NGÀY có doanh thu của tháng (chỉ hiện ngày có doanh thu), có cột Sum lũy kế đứng trước.
// Tuần = tuần LỊCH thứ 2–Chủ nhật do server gán (W1 = từ ngày 1 đến Chủ nhật đầu tiên) — công thức khoangTuanThang khớp oemComputeWeekFromDate của oem-api.

import { docNgay } from './vnDate.js';
import { parseMonthKey, monthSortValue } from './period.js';

/** Thứ trong tuần theo getUTCDay(): 0 = Chủ nhật. */
export const NHAN_THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const hai = (n) => String(n).padStart(2, '0');

/** 'W3' -> 3; không đọc được -> 99 (xếp cuối). */
export function soTuan(w) {
  const m = /^W(\d+)$/.exec(String(w == null ? '' : w).trim());
  return m ? Number(m[1]) : 99;
}

/** Sắp các khoá tuần W1..W6 tăng dần. */
export function sapTuan(keys) {
  return Array.from(keys).sort((a, b) => soTuan(a) - soTuan(b));
}

/** Sắp các khoá tháng 'T08-2026' theo thời gian. */
export function sapThang(keys) {
  return Array.from(keys).sort((a, b) => monthSortValue(a) - monthSortValue(b));
}

/** Số ngày của tháng 'T10-2026'; không đọc được -> 0. */
export function soNgayThang(monthKey) {
  const p = parseMonthKey(monthKey);
  return p ? new Date(Date.UTC(p.year, p.month, 0)).getUTCDate() : 0;
}

/** Thứ của một ngày trong tháng (0 = Chủ nhật). */
export function thuCuaNgay(monthKey, ngay) {
  const p = parseMonthKey(monthKey);
  return p ? new Date(Date.UTC(p.year, p.month - 1, ngay)).getUTCDay() : 0;
}

/**
 * Các tuần LỊCH (thứ 2–CN) của một tháng: { W1: { tu: 1, den: 4 }, W2: { tu: 5, den: 11 }, ... }.
 * T10-2026: W1 = 1–4, W2 = 5–11, W3 = 12–18, W4 = 19–25, W5 = 26–31.
 */
export function khoangTuanThang(monthKey) {
  const p = parseMonthKey(monthKey);
  if (!p) return {};
  const tong = soNgayThang(monthKey);
  const lech = (new Date(Date.UTC(p.year, p.month - 1, 1)).getUTCDay() + 6) % 7;   // 0 = ngày 1 rơi thứ 2
  const out = {};
  for (let w = 1; ; w++) {
    const tu = Math.max(1, (w - 1) * 7 - lech + 1), den = Math.min(tong, w * 7 - lech);
    if (tu > tong) break;
    out['W' + w] = { tu, den };
  }
  return out;
}

/** Nhãn cột tuần: 'Tuần 2 (05–11)'; không biết khoảng ngày thì chỉ 'Tuần 2'. */
export function nhanTuan(w, khoang) {
  const n = soTuan(w);
  const k = khoang && khoang[w];
  const ten = n === 99 ? String(w) : 'Tuần ' + n;
  return k ? `${ten} (${hai(k.tu)}–${hai(k.den)})` : ten;
}

/** Nhãn cột tháng ngắn: 'T08-2026' -> 'T08'. */
export function nhanThangNgan(monthKey) {
  const p = parseMonthKey(monthKey);
  return p ? 'T' + hai(p.month) : String(monthKey || '');
}

/** Ngày trong tháng (1–31) của một giao dịch theo ô Ngày chứng từ; không đọc được -> 0 ("chưa rõ ngày"). */
export function ngayTrongThang(t) {
  const o = docNgay(t && t.date);
  return o ? o.d : 0;
}

const maKhach = (t) => String(t.clientCode || '').trim().toUpperCase() || 'OEM-CLIENT';

/**
 * Gom doanh thu thuần theo KHÁCH (mã chữ, không phân biệt hoa/thường; tên hiện = Alias đại diện) × CỘT.
 *   loc(t)  -> giao dịch có tính không (mặc định: tính hết);
 *   cot(t)  -> khoá cột của giao dịch (số hoặc chuỗi), null/undefined = chỉ cộng vào tổng, không có cột;
 *   sapCot(keys) -> sắp danh sách khoá cột (mặc định: số tăng dần, chuỗi theo bảng chữ cái).
 * Trả { rows: [{ clientCode, clientName, sale, tong, cot: { khoá: số } }] (tổng giảm dần), cotKeys, tongCot: { khoá: số }, tong }.
 */
export function gopTheoKhach(transactions, { loc, cot, sapCot } = {}) {
  const map = new Map();
  const tongCot = {};
  let tong = 0;
  (transactions || []).forEach((t) => {
    if (!t || (loc && !loc(t))) return;
    const so = Number(t.netRevenue) || 0;
    const code = maKhach(t);
    let r = map.get(code);
    if (!r) { r = { clientCode: code, clientName: t.clientAlias || t.clientName || '', sale: t.sale || '', tong: 0, cot: {} }; map.set(code, r); }
    r.tong += so;
    tong += so;
    const k = cot ? cot(t) : null;
    if (k !== null && k !== undefined) {
      r.cot[k] = (r.cot[k] || 0) + so;
      tongCot[k] = (tongCot[k] || 0) + so;
    }
  });
  const keys = Object.keys(tongCot);
  const macDinh = (ks) => ks.slice().sort((a, b) => (isFinite(a) && isFinite(b) ? Number(a) - Number(b) : String(a).localeCompare(String(b))));
  const cotKeys = (sapCot || macDinh)(keys);
  return { rows: Array.from(map.values()).sort((a, b) => b.tong - a.tong), cotKeys, tongCot, tong };
}

/**
 * Dòng xuất Excel cho bảng Client × cột (đúng các cột đang hiện trên màn). `cot` = [{ key, label }] các cột kỳ theo thứ tự hiện;
 * `cotDau` = [{ ten, get(row), tongRow, tongSale(s) }] các cột đứng NGAY SAU SALE, trước các cột kỳ (Tổng lũy kế, Biến động) — `tongRow` là giá trị ở dòng TỔNG,
 * `tongSale` lấy giá trị ở dòng tổng của một Sale; `cotCuoi` cùng dạng nhưng đứng SAU các cột kỳ.
 * Có dòng TỔNG ở cuối khi truyền `tongCot` (tổng từng cột kỳ); `tongSale` = [{ sale, tong, cot }] thêm dòng "Tổng <sale>" sau dòng TỔNG.
 */
export function dongXuatTheoCot(rows, cot, { cotDau = [], cotCuoi = [], tongCot, tenTong = 'TỔNG CỘNG', tongSale } = {}) {
  const dung = (o, giaTri, tongRow) => {
    cotDau.forEach((c) => { o[c.ten] = giaTri(c, 'dau'); });
    cot.forEach((c) => { o[c.label] = Number(tongRow.cot[c.key]) || 0; });
    cotCuoi.forEach((c) => { o[c.ten] = giaTri(c, 'cuoi'); });
    return o;
  };
  const out = (rows || []).map((r) => dung({ 'Mã Client': r.clientCode || '', 'Client': r.clientName || '', 'SALE': r.sale || '' }, (c) => c.get(r), { cot: r.cot || {} }));
  if (tongCot) out.push(dung({ 'Mã Client': 'Σ', 'Client': tenTong, 'SALE': '' }, (c) => (c.tongRow === undefined ? '' : c.tongRow), { cot: tongCot }));
  (tongSale || []).forEach((s) => out.push(dung({ 'Mã Client': 'Σ', 'Client': 'Tổng ' + s.sale, 'SALE': s.sale }, (c) => (c.tongSale ? c.tongSale(s) : ''), { cot: s.cot || {} })));
  return out;
}

/**
 * Tổng theo SALE từ các dòng khách đang hiện (mỗi khách thuộc sale ghi ở cột SALE của nó, cùng cách bảng đang hiện): [{ sale, tong, cot }] tổng giảm dần.
 * Dòng có `tong` (DT Ngày) hoặc `totalRevenue` (DT Tháng); sale trống -> 'Khác'.
 */
export function tongTheoSale(rows) {
  const m = new Map();
  (rows || []).forEach((r) => {
    const ten = String(r.sale || '').trim() || 'Khác';
    let x = m.get(ten);
    if (!x) { x = { sale: ten, tong: 0, cot: {} }; m.set(ten, x); }
    x.tong += Number(r.tong !== undefined ? r.tong : r.totalRevenue) || 0;
    Object.keys(r.cot || {}).forEach((k) => { x.cot[k] = (x.cot[k] || 0) + (Number(r.cot[k]) || 0); });
  });
  return Array.from(m.values()).sort((a, b) => b.tong - a.tong);
}

/** Tên file: DT_thang_<phạm vi>_<dd-mm-yyyy>.xlsx. `thang` là 'ALL' hoặc khoá tháng. */
export function tenFileDtThang(thang, nam, ngaySlug) {
  const pv = !thang || thang === 'ALL' ? `Nam_${nam}` : String(thang).replace(/[^\w.-]+/g, '_');
  return `DT_thang_${pv}_${ngaySlug}.xlsx`;
}

/**
 * Tuần LỊCH (W1..W6) của một giao dịch, tính ngay từ ngày chứng từ + khoá tháng (cùng công thức server) — không phụ thuộc giá trị `week`
 * có thể còn cũ trong bộ nhớ đệm của trình duyệt (đổi cách chia tuần ngày 19/10/2026). Không đọc được ngày thì dùng `week` của giao dịch (rỗng -> W1).
 */
export function tuanLichCuaGiaoDich(t) {
  const p = parseMonthKey(t && t.month);
  const o = docNgay(t && t.date);
  if (p && o && o.d >= 1 && o.m === p.month && o.y === p.year) {
    const lech = (new Date(Date.UTC(p.year, p.month - 1, 1)).getUTCDay() + 6) % 7;
    return 'W' + (Math.floor((o.d - 1 + lech) / 7) + 1);
  }
  return (t && t.week) || 'W1';
}
