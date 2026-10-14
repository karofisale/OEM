// Cài đặt HỆ THỐNG (14/10/2026) — phần THUẦN: giá trị mặc định có sẵn, làm sạch phản hồi máy chủ, đổi %, kiểm giá trị / ngày hiệu lực,
// dựng câu xác nhận + nhãn trạng thái. Không React, không mạng -> test được (test/cai-dat-he-thong.test.cjs).
//
// Khác Cài đặt cá nhân (utils/settings.js): đây là giá trị DÙNG CHUNG cho mọi người, do vai trò `creator` (master) đặt và có
// NGÀY HIỆU LỰC. Mọi vai trò đọc được giá trị hiện hành qua getSystemValues (services/systemValues.js); chỉ master mở được trang
// "Cài đặt hệ thống" (getSystemSettings / setSystemSetting của oem-api). Máy chủ là nơi quyết định — kiểm ở client chỉ để báo lỗi sớm.
//
// Hai khoá đang dùng ở client:
//   oem.vatRate       thuế VAT (0.08 = 8%): hệ số tổng đơn hàng ở AI Nhận Đơn Hàng = 1 + vatRate. (Máy chủ đã dùng khoá này cho giá vốn + VAT.)
//   oem.defaultMargin % LNG điền sẵn ở máy tính giá, khi người dùng CHƯA chọn giá trị cá nhân (st.calcMargin vẫn thắng).

import { hienNgay, sapXepNgay } from './vnDate.js';

export const KHOA_VAT = 'oem.vatRate';
export const KHOA_LNG = 'oem.defaultMargin';

/** Mặc định có sẵn trong app — dùng khi máy chủ lỗi / chưa có bảng / chưa có hàm (fail-soft, không báo người dùng). */
export const SYS_DEFAULTS = { [KHOA_VAT]: 0.08, [KHOA_LNG]: 20 };

/** Khoảng chấp nhận ở client cho từng khoá đã biết (đề phòng máy chủ trả rác). Khoá lạ không đọc ở client nên bị bỏ. */
const SYS_OK = {
  [KHOA_VAT]: (v) => v >= 0 && v <= 1,
  [KHOA_LNG]: (v) => v > 0 && v < 100
};

const co = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const laSo = (v) => typeof v === 'number' && Number.isFinite(v);

/** Phản hồi getSystemValues (có thể rác) -> ĐỦ mọi khoá đã biết; khoá thiếu / giá trị hỏng -> mặc định. */
export function lamSachGiaTriHeThong(raw) {
  const src = raw && typeof raw === 'object' && raw.values && typeof raw.values === 'object' && !Array.isArray(raw.values) ? raw.values : {};
  const out = {};
  Object.keys(SYS_DEFAULTS).forEach((k) => {
    out[k] = co(src, k) && laSo(src[k]) && SYS_OK[k](src[k]) ? src[k] : SYS_DEFAULTS[k];
  });
  return out;
}

/** Hệ số nhân VAT từ thuế suất: 0.08 -> 1.08. Thuế suất hỏng -> mặc định. */
export function heSoVat(vatRate) {
  const v = laSo(vatRate) && SYS_OK[KHOA_VAT](vatRate) ? vatRate : SYS_DEFAULTS[KHOA_VAT];
  return 1 + v;
}

/** Thuế suất thành chữ cho nhãn: 0.08 -> "8", 0.075 -> "7,5". */
export function chuVatPhanTram(vatRate) {
  const v = laSo(vatRate) && SYS_OK[KHOA_VAT](vatRate) ? vatRate : SYS_DEFAULTS[KHOA_VAT];
  return String(lamTronPt(v * 100)).replace('.', ',');
}

// ---------------------------------------------------------------------------
// Phần trăm <-> số thực
// ---------------------------------------------------------------------------

/** Làm tròn bỏ sai số dấu phẩy động (0.07 * 100 = 7.000000000000001). */
export function lamTronPt(n) { return Math.round(n * 1e6) / 1e6; }

export const laPhanTram = (s) => !!s && s.fmt === 'percent';

/**
 * Khoảng min / max / bước của cài đặt, quy ra ĐƠN VỊ HIỂN THỊ (phần trăm nếu fmt = 'percent').
 * Máy chủ trả min/max theo giá trị LƯU (số thực, vd 0 … 0.2). Phòng khi một khoá nào đó ghi theo % (max > 1 với một giá trị
 * phần trăm — không thể là số thực hợp lệ) thì giữ nguyên, không nhân thêm 100.
 */
export function khoangHienThi(s) {
  const pc = laPhanTram(s);
  const doi = (x) => (x == null || x === '' || !laSo(Number(x)) ? null : Number(x));
  let min = doi(s && s.min), max = doi(s && s.max), buoc = doi(s && s.buoc);
  if (pc) {
    const dangPt = max != null && max > 1;
    if (!dangPt) {
      if (min != null) min = lamTronPt(min * 100);
      if (max != null) max = lamTronPt(max * 100);
      if (buoc != null) buoc = lamTronPt(buoc * 100);
    }
  }
  return { min, max, buoc };
}

/** Giá trị lưu (số thực | null) -> chuỗi đưa vào ô nhập. Phần trăm thì nhân 100. null/rác -> ''. */
export function giaTriVaoO(s, v) {
  if (!laSo(v)) return '';
  const x = laPhanTram(s) ? lamTronPt(v * 100) : v;
  return String(x);
}

/** Chữ người dùng gõ -> { ok, value (số lưu, đã /100 nếu phần trăm), error }. Chấp nhận dấu phẩy thập phân. */
export function docGiaTriTuO(s, text) {
  const t = String(text == null ? '' : text).trim().replace(',', '.');
  if (t === '') return { ok: false, value: null, error: 'Chưa nhập giá trị.' };
  if (!/^-?\d+(\.\d+)?$/.test(t)) return { ok: false, value: null, error: 'Giá trị phải là một con số.' };
  const hien = Number(t);
  const kh = khoangHienThi(s);
  const dv = s && s.donVi ? ' ' + s.donVi : (laPhanTram(s) ? '%' : '');
  if (s && s.kieu === 'integer' && !Number.isInteger(hien)) return { ok: false, value: null, error: 'Chỉ nhận số nguyên.' };
  if (kh.min != null && hien < kh.min) return { ok: false, value: null, error: 'Không được nhỏ hơn ' + String(kh.min).replace('.', ',') + (laPhanTram(s) ? '%' : dv) + '.' };
  if (kh.max != null && hien > kh.max) return { ok: false, value: null, error: 'Không được lớn hơn ' + String(kh.max).replace('.', ',') + (laPhanTram(s) ? '%' : dv) + '.' };
  const value = laPhanTram(s) ? lamTronPt(hien / 100) : hien;
  return { ok: true, value, error: '' };
}

/** Giá trị lưu -> chữ hiển thị có đơn vị: 0.08 (percent) -> "8%"; 20 (donVi '%') -> "20%". null -> "—". */
export function dinhDangGiaTri(s, v) {
  if (!laSo(v)) return '—';
  const so = String(laPhanTram(s) ? lamTronPt(v * 100) : v).replace('.', ',');
  if (laPhanTram(s)) return so + '%';
  if (s && s.donVi === '%') return so + '%';
  return s && s.donVi ? so + ' ' + s.donVi : so;
}

// ---------------------------------------------------------------------------
// Ngày hiệu lực
// ---------------------------------------------------------------------------

const RE_NGAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' hợp lệ (đúng lịch) không. */
export function laNgayChuan(s) {
  const m = RE_NGAY.exec(String(s || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Ngày muộn nhất được đặt hiệu lực: hôm nay + 1 năm (29/02 -> 28/02 năm sau). */
export function ngayToiDa(today) {
  if (!laNgayChuan(today)) return '';
  const [y, m, d] = today.split('-').map(Number);
  const t = new Date(Date.UTC(y + 1, m - 1, d));
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0);   // 29/02 sang năm không nhuận tràn sang 01/03 -> lùi về 28/02
  const hai = (n) => String(n).padStart(2, '0');
  return t.getUTCFullYear() + '-' + hai(t.getUTCMonth() + 1) + '-' + hai(t.getUTCDate());
}

/** Lỗi của ngày hiệu lực ('' = ổn). Trống = hôm nay (hợp lệ). Không được trước hôm nay, không quá +1 năm. */
export function kiemTraNgayHieuLuc(ngay, today) {
  if (ngay == null || ngay === '') return '';
  if (!laNgayChuan(ngay)) return 'Ngày hiệu lực không hợp lệ.';
  if (laNgayChuan(today)) {
    if (ngay < today) return 'Ngày hiệu lực không được trước hôm nay (' + hienNgay(today) + ').';
    const max = ngayToiDa(today);
    if (max && ngay > max) return 'Ngày hiệu lực không được quá ' + hienNgay(max) + ' (một năm kể từ hôm nay).';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Dựng nội dung hiển thị
// ---------------------------------------------------------------------------

const ngayDen = (e) => sapXepNgay(e && e.hieuLucTu);
const luc = (e) => { const t = sapXepNgay(e && e.lucSua); return Number.isNaN(t) ? 0 : t; };

/**
 * Bản ghi lịch sử đã làm nên giá trị ĐANG DÙNG: hiệu lực ≤ hôm nay, ngày hiệu lực lớn nhất, cùng ngày thì lần sửa muộn nhất.
 * Không có (hoặc là lần "về mặc định") -> null.
 */
export function banGhiHienTai(lichSu, today) {
  const t0 = sapXepNgay(today);
  const dsach = (Array.isArray(lichSu) ? lichSu : []).filter((e) => e && !Number.isNaN(ngayDen(e)) && (Number.isNaN(t0) || ngayDen(e) <= t0));
  if (!dsach.length) return null;
  dsach.sort((a, b) => (ngayDen(b) - ngayDen(a)) || (luc(b) - luc(a)));
  return dsach[0];
}

/** Dòng trạng thái dưới nhãn: "Đang dùng mặc định (8%)" hoặc "Đã đặt bởi hai, hiệu lực từ 14/10/2026". */
export function trangThaiCaiDat(s, today) {
  if (!s) return '';
  if (!s.daDat) return 'Đang dùng mặc định (' + dinhDangGiaTri(s, s.macDinh) + ')';
  const b = banGhiHienTai(s.lichSu, today);
  const ai = b && b.nguoiSua ? ' bởi ' + b.nguoiSua : '';
  const tu = s.hieuLucTu || (b && b.hieuLucTu);
  return 'Đã đặt' + ai + (tu ? ', hiệu lực từ ' + hienNgay(tu, { gio: false }) : '');
}

/** Nhãn một bản ghi lịch sử / chờ hiệu lực: giá trị (null = "về mặc định"). */
export function nhanGiaTriLichSu(s, v) {
  return v === null || v === undefined ? 'Về mặc định (' + dinhDangGiaTri(s, s && s.macDinh) + ')' : dinhDangGiaTri(s, v);
}

/** Câu hỏi xác nhận trước khi lưu: "Đổi <nhãn> từ X sang Y, hiệu lực từ <ngày>?". `giaTriMoi` null = về mặc định. */
export function cauXacNhan(s, giaTriMoi, ngay, today) {
  const tu = dinhDangGiaTri(s, s.giaTri);
  const sang = giaTriMoi === null ? 'mặc định (' + dinhDangGiaTri(s, s.macDinh) + ')' : dinhDangGiaTri(s, giaTriMoi);
  const d = ngay || today;
  return 'Đổi ' + s.nhan + ' từ ' + tu + ' sang ' + sang + ', hiệu lực từ ' + (d ? hienNgay(d, { gio: false }) : 'hôm nay') + '?';
}

/**
 * Gói `setSystemSetting`: { khoa, giaTri, hieuLucTu?, ghiChu? }. Ngày chỉ gửi khi người dùng chọn khác hôm nay (mặc định máy chủ = hôm nay);
 * ghi chú cắt 300 ký tự, trống thì bỏ.
 */
export function dungLenhLuu(s, giaTri, ngay, ghiChu, today) {
  const o = { khoa: s.khoa, giaTri };
  if (ngay && ngay !== today) o.hieuLucTu = ngay;
  const g = String(ghiChu == null ? '' : ghiChu).trim().slice(0, 300);
  if (g) o.ghiChu = g;
  return o;
}

/** Gom cài đặt theo `nhom` giữ thứ tự xuất hiện: [{ nhom, items }]. Nhóm trống -> "Khác". */
export function gomTheoNhom(settings) {
  const thuTu = [];
  const map = new Map();
  (Array.isArray(settings) ? settings : []).forEach((s) => {
    if (!s || !s.khoa) return;
    const n = String(s.nhom || '').trim() || 'Khác';
    if (!map.has(n)) { map.set(n, []); thuTu.push(n); }
    map.get(n).push(s);
  });
  return thuTu.map((n) => ({ nhom: n, items: map.get(n) }));
}

/** Chỉ vai trò `creator` (master) được thấy / mở trang Cài đặt hệ thống. */
export function laMaster(role) {
  return String(role || '').toLowerCase() === 'creator';
}
