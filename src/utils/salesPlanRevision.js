// Logic THUẦN của "Admin yêu cầu sửa lại kế hoạch tháng" (02/11/2026) — tách khỏi React để test gọi thẳng.
//
// Vòng đời một dòng kế hoạch tháng (oem.plan_thang.status):
//   Sale gửi -> 'Chờ duyệt' -> Admin duyệt -> 'Đã duyệt'
//   Admin "Yêu cầu sửa lại" (từ 'Chờ duyệt' hoặc 'Đã duyệt', kèm lý do) -> 'Cần sửa'
//   Sale sửa + gửi lại -> 'Chờ duyệt' (lý do bị xoá)
// Số liệu của dòng 'Cần sửa' KHÔNG bị đụng (vẫn là số đã gửi/đã duyệt) cho tới khi Sale gửi bản mới.

import { monthSortValue } from './period.js';

export const TT_CHO = 'Chờ duyệt';
export const TT_DUYET = 'Đã duyệt';
export const TT_SUA = 'Cần sửa';
/** Trạng thái của kế hoạch đang "sống" ở màn duyệt (mọi trạng thái khác — rỗng, nháp... — không hiện). */
export const TT_CO_KE_HOACH = [TT_CHO, TT_DUYET, TT_SUA];
/** Admin chỉ trả lại được dòng đang chờ duyệt hoặc đã duyệt (dòng đã 'Cần sửa' thì đang chờ Sale). */
export const TT_TRA_LAI_DUOC = [TT_CHO, TT_DUYET];

const trangThaiCua = (p) => String((p && p.status) || '').trim();

/** Đếm theo trạng thái: { cho, duyet, sua, tong } — tong = số dòng ở 3 trạng thái trên. */
export function demTheoTrangThai(rows) {
  const kq = { cho: 0, duyet: 0, sua: 0, tong: 0 };
  (rows || []).forEach((p) => {
    const t = trangThaiCua(p);
    if (t === TT_CHO) kq.cho++; else if (t === TT_DUYET) kq.duyet++; else if (t === TT_SUA) kq.sua++; else return;
    kq.tong++;
  });
  return kq;
}

/** Các tháng có kế hoạch ở màn duyệt, mới nhất trước. */
export function cacThangCoKeHoach(plans) {
  const set = new Set();
  (plans || []).forEach((p) => { if (p && p.month && TT_CO_KE_HOACH.includes(trangThaiCua(p))) set.add(p.month); });
  return Array.from(set).sort((a, b) => monthSortValue(b) - monthSortValue(a));
}

/** Tháng mở sẵn: tháng MỚI NHẤT đang có dòng chờ duyệt; không có thì tháng mới nhất có kế hoạch; không có gì -> ''. */
export function thangMacDinh(plans) {
  const cac = cacThangCoKeHoach(plans);
  const choDuyet = cac.find((m) => (plans || []).some((p) => p.month === m && trangThaiCua(p) === TT_CHO));
  return choDuyet || cac[0] || '';
}

/** Các dòng 'Cần sửa' của CHÍNH người dùng (laCuaToi(tenSale) -> bool), gom theo tháng: { 'T10-2026': [dòng...] }. */
export function dongCanSuaCuaToi(plans, laCuaToi) {
  const kq = {};
  (plans || []).forEach((p) => {
    if (!p || trangThaiCua(p) !== TT_SUA || !p.month) return;
    if (laCuaToi && !laCuaToi(p.sale)) return;
    (kq[p.month] || (kq[p.month] = [])).push(p);
  });
  return kq;
}

/** Các lý do khác nhau (bỏ trống/trùng) của các dòng, tối đa `toiDa`; dư thì thêm "…". */
export function lyDoRiengBiet(rows, toiDa = 3) {
  const ds = [];
  (rows || []).forEach((p) => {
    const l = String((p && p.revisionNote) || '').trim();
    if (l && !ds.includes(l)) ds.push(l);
  });
  return ds.length > toiDa ? ds.slice(0, toiDa).concat('…') : ds;
}

/**
 * Lọc dòng ở màn duyệt theo trạng thái ('ALL' hoặc một trong 3 trạng thái) — chỉ dòng ở 3 trạng thái của kế hoạch.
 */
export function locTheoTrangThai(rows, tt) {
  return (rows || []).filter((p) => {
    const t = trangThaiCua(p);
    if (!TT_CO_KE_HOACH.includes(t)) return false;
    return !tt || tt === 'ALL' || t === tt;
  });
}

/** Mã (searchCode) của các dòng Admin trả lại được trong tập `chon` (bỏ dòng đã 'Cần sửa', dòng không còn trong tháng). */
export function maTraLaiDuoc(rows, chon) {
  const co = new Set(chon || []);
  return (rows || []).filter((p) => co.has(p.searchCode) && TT_TRA_LAI_DUOC.includes(trangThaiCua(p))).map((p) => p.searchCode);
}
