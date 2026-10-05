/**
 * kpiNam.js — co giãn KPI năm theo khách (màn KPI Năm của OEM). 05/10/2026.
 *
 * KPI năm được ĐIỀN NGƯỢC từ Kế hoạch năm của FC (fc-api/annual-kpi.js) nhưng đơn vị dùng nó làm KPI nên có thể hơi khác kế hoạch:
 * cho sửa TAY (a) tổng năm, (b) tỷ trọng các tháng. Khi sửa, doanh thu từng tháng và từng khách co giãn theo:
 *  - tổng năm đổi: mọi ô nhân cùng một hệ số (giữ tỷ trọng tháng, giữ tỷ lệ giữa các khách);
 *  - tỷ trọng tháng đổi: tổng tháng = Tổng năm × tỷ trọng mới (tổng 12 tháng luôn 100%, mỗi tháng 1–30%); trong từng tháng các khách co giãn
 *    theo tỷ lệ cũ giữa họ.
 * Mọi ô là số NGUYÊN VNĐ; tổng từng tháng và tổng năm khớp tuyệt đối (phần dư lớn nhất). Bộ máy tỷ trọng dùng chung với FC (annualPlanEngine.js).
 *
 * rows = [{ code, name, pic, months[12] }] — đúng hình dạng màn KPI Năm.
 */

import { suaTyTrong, mucTieuTheoThang, TY_TRONG_TONG } from './annualPlanEngine.js';

const so = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const tong = (a) => a.reduce((s, v) => s + so(v), 0);

export const tongThang = (rows) => Array.from({ length: 12 }, (_, m) => rows.reduce((s, r) => s + so(r.months[m]), 0));
export const tongNam = (rows) => tong(tongThang(rows));

/** Chia số thực raw[] thành SỐ NGUYÊN không âm có tổng đúng = total (phần dư lớn nhất). */
export function phanBoNguyen(raw, total) {
  const T = Math.round(total);
  const out = raw.map((v) => Math.floor(Math.max(0, so(v))));
  let thieu = T - tong(out);
  const thuTu = raw.map((v, i) => ({ i, f: Math.max(0, so(v)) - Math.floor(Math.max(0, so(v))) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; thieu > 0 && thuTu.length; k++) { out[thuTu[k % thuTu.length].i]++; thieu--; }
  // (không xảy ra khi raw cộng đúng bằng total; phòng số thực lệch) bớt từ ô lớn nhất
  while (thieu < 0) {
    let imax = 0;
    out.forEach((v, i) => { if (v > out[imax]) imax = i; });
    if (out[imax] <= 0) break;
    out[imax]--; thieu++;
  }
  return out;
}

/** Tỷ trọng tháng hiện tại (1/100 %, số nguyên, tổng 10000) suy từ tổng từng tháng. Không có KPI -> chia đều. */
export function tyTrongHienTai(rows) {
  const tt = tongThang(rows), T = tong(tt);
  if (T <= 0) return phanBoNguyen(new Array(12).fill(TY_TRONG_TONG / 12), TY_TRONG_TONG);
  return phanBoNguyen(tt.map((v) => v / T * TY_TRONG_TONG), TY_TRONG_TONG);
}

/**
 * Co giãn bảng KPI để tổng năm = T và tổng từng tháng = T × tỷ trọng. Trong tháng, các khách co giãn theo tỷ lệ hiện có;
 * tháng hiện không có doanh thu mà cần có thì chia theo tỷ lệ doanh thu cả năm của các khách (không có nữa thì chia đều).
 */
export function phanBoLai(rows, T, shares) {
  if (!rows.length) throw new Error('Chưa có khách nào trong bảng KPI.');
  const muc = mucTieuTheoThang(T, shares);
  const nam = rows.map((r) => tong(r.months));
  const tNam = tong(nam);
  const moi = rows.map((r) => ({ ...r, months: r.months.slice() }));
  for (let m = 0; m < 12; m++) {
    const cot = rows.map((r) => Math.max(0, so(r.months[m])));
    const sc = tong(cot);
    let raw;
    if (sc > 0) raw = cot.map((v) => v * muc[m] / sc);
    else if (tNam > 0) raw = nam.map((v) => v * muc[m] / tNam);
    else raw = rows.map(() => muc[m] / rows.length);
    phanBoNguyen(raw, muc[m]).forEach((v, i) => { moi[i].months[m] = v; });
  }
  return moi;
}

/** Sửa TỔNG NĂM (VNĐ): giữ tỷ trọng tháng hiện tại, mọi khách co giãn theo. */
export function datTongNam(rows, tongMoi) {
  const T = Math.round(so(tongMoi));
  if (!(T > 0)) throw new Error('Tổng năm phải lớn hơn 0.');
  if (!(tongNam(rows) > 0)) throw new Error('KPI hiện chưa có doanh thu nào để co giãn — nhập số cho từng khách trước.');
  return phanBoLai(rows, T, tyTrongHienTai(rows));
}

/**
 * Sửa TỶ TRỌNG một tháng (pct = %, vd 9,5). Tổng năm giữ nguyên. cheDo 'deu' = phần chênh chia đều cho các tháng còn lại;
 * 'chiDinh' = dồn vào các tháng trong `thang` (chỉ số 0–11). Ném lỗi nếu ngoài [1%, 30%] hoặc không đủ chỗ.
 */
export function datTyTrongThang(rows, m, pct, cheDo = 'deu', thang = []) {
  const T = tongNam(rows);
  if (!(T > 0)) throw new Error('KPI hiện chưa có doanh thu nào để chia theo tỷ trọng.');
  const moi = suaTyTrong(tyTrongHienTai(rows), { [m]: Math.round(so(pct) * 100) }, cheDo, thang);
  return phanBoLai(rows, T, moi);
}
