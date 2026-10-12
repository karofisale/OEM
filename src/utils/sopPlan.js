// Logic THUẦN của màn Kế hoạch SOP → "Lập Kế Hoạch" (SopPlanPanel): danh sách SKU THUỘC kế hoạch, bỏ mã, thêm mã,
// chữ ký "còn gì chưa gửi", so bản gửi với bản gốc, chọn nhiều dòng. Tách ra khỏi React để test gọi thẳng.
//
// Mô hình: `inPlan` (mảng SKU) = các mã THUỘC kế hoạch; `draftMap` (sku -> [sl1..sl4]) = số đang nhập, CHỈ có khoá cho mã
// trong inPlan. Server (submitSopDraft) THAY THẾ HOÀN TOÀN theo (kỳ, sale): mã không có trong payload bị xoá khỏi kỳ đó —
// nên "bỏ mã" ở client chỉ cần không gửi mã đó; chỉ mã có SL > 0 ở ít nhất 1 tháng mới được gửi.

import { chuanTim, khopBatKy } from './searchText.js';
import { khoaMa } from './formClean.js';

export const SO_THANG = 4;
export const TOI_DA_LIET_KE = 5;
export const TOI_DA_KET_QUA = 50;

const soHoa = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const boBon = (v) => [0, 1, 2, 3].map((i) => soHoa(v && v[i]));

/** Dòng có ít nhất một tháng SL > 0 không. */
export const coSL = (v) => Array.isArray(v) && v.some((x) => soHoa(x) > 0);

/**
 * Khởi tạo kế hoạch lúc tải. Có BẢN NHÁP của kỳ này (đã gửi, chưa duyệt) thì CHÍNH nó là kế hoạch — vì gửi là thay thế toàn
 * bộ, mã đã bỏ lúc gửi không được sống lại từ carry-forward khi tải lại. Chưa có nháp thì lấy carry-forward (số mang sang từ
 * kỳ đã duyệt mới nhất). Chỉ mã có SL > 0 vào kế hoạch.
 * Trả { draftMap, inPlan, nguon: 'nhap' | 'carry' }.
 */
export function khoiTaoKeHoach(carry, nhap) {
  const map = {};
  let nguon = 'carry';
  if (nhap && nhap.length) {
    nguon = 'nhap';
    nhap.forEach((d) => { if (d && d.sku) map[d.sku] = boBon([d.sl1, d.sl2, d.sl3, d.sl4]); });
  } else {
    Object.entries(carry || {}).forEach(([sku, sl]) => { map[sku] = boBon(sl); });
  }
  const inPlan = Object.keys(map).filter((k) => coSL(map[k]));
  const draftMap = {};
  inPlan.forEach((k) => { draftMap[k] = map[k]; });
  return { draftMap, inPlan, nguon };
}

/** Các dòng SẼ GỬI: mã trong kế hoạch có SL > 0 (đúng quy tắc server). Thứ tự theo inPlan. */
export function dongGui(draftMap, inPlan) {
  const out = [];
  (inPlan || []).forEach((sku) => {
    const v = draftMap && draftMap[sku];
    if (!coSL(v)) return;
    out.push({ sku, sl1: soHoa(v[0]), sl2: soHoa(v[1]), sl3: soHoa(v[2]), sl4: soHoa(v[3]) });
  });
  return out;
}

/** Chữ ký nội dung sẽ gửi — so với lúc tải/đã gửi để biết còn thay đổi chưa lưu. Không phụ thuộc thứ tự. */
export function chuKy(draftMap, inPlan) {
  return JSON.stringify(dongGui(draftMap, inPlan)
    .map((r) => [r.sku, r.sl1, r.sl2, r.sl3, r.sl4])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
}

/**
 * Bỏ các mã khỏi kế hoạch: xoá khỏi inPlan VÀ draftMap. Trả { inPlan, draftMap, daBo } với daBo = { skus, values } để hoàn
 * tác (null nếu không có mã nào thật sự bị bỏ — khi đó trả lại đúng tham chiếu cũ).
 */
export function boKhoiKeHoach(inPlan, draftMap, skus) {
  const chon = new Set(skus || []);
  const bo = (inPlan || []).filter((s) => chon.has(s));
  if (!bo.length) return { inPlan, draftMap, daBo: null };
  const values = {};
  const nextMap = { ...draftMap };
  bo.forEach((s) => { values[s] = boBon(draftMap && draftMap[s]); delete nextMap[s]; });
  const boSet = new Set(bo);
  return { inPlan: inPlan.filter((s) => !boSet.has(s)), draftMap: nextMap, daBo: { skus: bo, values } };
}

/** Hoàn tác `boKhoiKeHoach`: đưa mã về kế hoạch cùng số lượng cũ (mã đã có lại thì giữ nguyên số hiện tại). */
export function hoanTacBo(inPlan, draftMap, daBo) {
  if (!daBo || !daBo.skus || !daBo.skus.length) return { inPlan, draftMap, khoiPhuc: [] };
  const co = new Set(inPlan);
  const khoiPhuc = daBo.skus.filter((s) => !co.has(s));
  const nextMap = { ...draftMap };
  khoiPhuc.forEach((s) => { nextMap[s] = boBon(daBo.values && daBo.values[s]); });
  return { inPlan: inPlan.concat(khoiPhuc), draftMap: nextMap, khoiPhuc };
}

/**
 * Thêm mã vào kế hoạch (SL = 0, chờ sale nhập). Mã đã có hoặc lặp trong `skus` bị bỏ qua.
 * Trả { inPlan, draftMap, themMoi } — themMoi là các mã thật sự mới.
 */
export function themVaoKeHoach(inPlan, draftMap, skus) {
  const co = new Set(inPlan);
  const themMoi = [];
  (skus || []).forEach((s) => { if (s && !co.has(s)) { co.add(s); themMoi.push(s); } });
  if (!themMoi.length) return { inPlan, draftMap, themMoi };
  const nextMap = { ...draftMap };
  themMoi.forEach((s) => { if (!nextMap[s]) nextMap[s] = [0, 0, 0, 0]; });
  return { inPlan: inPlan.concat(themMoi), draftMap: nextMap, themMoi };
}

/**
 * So bản sẽ gửi với bản gốc (đã tải / đã gửi lần cuối). Cả hai là mảng SKU CÓ SL > 0.
 * bo = có ở bản gốc mà giờ không gửi nữa (bị xoá khỏi kế hoạch kỳ này trên máy chủ); moi = mới thêm; giu = còn lại.
 */
export function diffGui(goc, hienTai) {
  const g = new Set(goc || []);
  const h = new Set(hienTai || []);
  return {
    bo: [...g].filter((s) => !h.has(s)),
    moi: [...h].filter((s) => !g.has(s)),
    giu: [...h].filter((s) => g.has(s))
  };
}

/** "A, B, C, D, E …và 3 mã khác" — liệt kê tối đa `toiDa` mã đầu. */
export function tomTatMa(skus, toiDa = TOI_DA_LIET_KE) {
  const ds = skus || [];
  if (ds.length <= toiDa) return ds.join(', ');
  return ds.slice(0, toiDa).join(', ') + ` …và ${ds.length - toiDa} mã khác`;
}

// ---------------------------------------------------------------------------
// Chọn nhiều dòng
// ---------------------------------------------------------------------------

/** Trạng thái ô "chọn tất cả (đang lọc)": { checked, indeterminate, count } với count = số mã đang lọc đã chọn. */
export function trangThaiChonTatCa(selected, hienThi) {
  const ds = hienThi || [];
  const count = ds.reduce((n, s) => n + (selected.has(s) ? 1 : 0), 0);
  return { checked: ds.length > 0 && count === ds.length, indeterminate: count > 0 && count < ds.length, count };
}

/** Bật/tắt toàn bộ mã đang lọc trong tập chọn (mã ngoài bộ lọc giữ nguyên). */
export function chonTatCa(selected, hienThi, bat) {
  const next = new Set(selected);
  (hienThi || []).forEach((s) => { if (bat) next.add(s); else next.delete(s); });
  return next;
}

/** Khi bộ lọc đổi: bỏ chọn các mã không còn hiển thị. Không có gì đổi thì trả đúng tập cũ (tránh render thừa). */
export function giuChonConHien(selected, hienThi) {
  if (!selected.size) return selected;
  const hien = new Set(hienThi || []);
  let doi = false;
  const next = new Set();
  selected.forEach((s) => { if (hien.has(s)) next.add(s); else doi = true; });
  return doi ? next : selected;
}

// ---------------------------------------------------------------------------
// Lọc / tìm
// ---------------------------------------------------------------------------

/** `loc` = { q, group, exclusive } — q là chữ gõ thô (so không phân biệt hoa/thường/dấu), group/exclusive 'ALL' = không lọc. */
export function khopLoc(m, loc) {
  const l = loc || {};
  if (l.group && l.group !== 'ALL' && m.group !== l.group) return false;
  if (l.exclusive && l.exclusive !== 'ALL' && (m.exclusiveTo || '') !== l.exclusive) return false;
  const q = chuanTim(l.q);
  if (q && !khopBatKy(q, m.sku, m.name, m.alias)) return false;
  return true;
}

/**
 * Các dòng của bảng kế hoạch: mã trong inPlan theo thứ tự danh mục; mã có trong kế hoạch mà KHÔNG còn trong danh mục
 * (kế hoạch cũ trỏ tới mã đã mất) vẫn hiện, để còn thấy và bỏ được.
 */
export function dongKeHoach(materials, inPlan) {
  const co = new Set(inPlan || []);
  const thay = new Set();
  const rows = [];
  (materials || []).forEach((m) => { if (co.has(m.sku) && !thay.has(m.sku)) { thay.add(m.sku); rows.push(m); } });
  (inPlan || []).forEach((s) => {
    if (!thay.has(s)) rows.push({ sku: s, name: '(không có trong danh mục)', alias: '', group: '', exclusiveTo: '', suggestedPrice: 0, thieuDanhMuc: true });
  });
  return rows;
}

/** Đưa các mã vừa thêm lên đầu (giữ thứ tự tương đối). Không có mã nào khớp thì trả đúng mảng cũ. */
export function datLenDau(rows, ghim) {
  if (!ghim || !ghim.size) return rows;
  const tren = [], duoi = [];
  rows.forEach((r) => (ghim.has(r.sku) ? tren : duoi).push(r));
  return tren.length ? tren.concat(duoi) : rows;
}

/** Doanh thu ước tính từng tháng = Σ SL × Giá bán trên các dòng cho trước. */
export function doanhThuTheoThang(rows, draftMap) {
  return [0, 1, 2, 3].map((i) => (rows || []).reduce((sum, m) => {
    const v = (draftMap && draftMap[m.sku]) || [0, 0, 0, 0];
    return sum + soHoa(v[i]) * soHoa(m.suggestedPrice);
  }, 0));
}

// ---------------------------------------------------------------------------
// Hộp "Thêm sản phẩm vào kế hoạch"
// ---------------------------------------------------------------------------

/**
 * Tìm trong danh mục các SP CHƯA nằm trong kế hoạch. Trả { items (tối đa `toiDa`), total (tổng khớp), daTrongKeHoach
 * (số SP khớp mà đã có trong kế hoạch nên không liệt kê) }. Mã khớp CHÍNH XÁC với ô tìm lên đầu.
 */
export function timSanPhamChuaCo(materials, inPlanSet, loc, toiDa = TOI_DA_KET_QUA) {
  const q = khoaMa(loc && loc.q);
  const khop = [];
  let daTrongKeHoach = 0;
  (materials || []).forEach((m) => {
    if (!khopLoc(m, loc)) return;
    if (inPlanSet.has(m.sku)) { daTrongKeHoach++; return; }
    khop.push(m);
  });
  if (q) {
    const chinhXac = khop.filter((m) => khoaMa(m.sku) === q);
    if (chinhXac.length) {
      const rest = khop.filter((m) => khoaMa(m.sku) !== q);
      khop.length = 0; khop.push(...chinhXac, ...rest);
    }
  }
  return { items: khop.slice(0, toiDa), total: khop.length, daTrongKeHoach };
}

/** Chữ gõ ở ô tìm có "trông giống mã SKU" không: một từ, không dấu cách, ≥ 3 ký tự, có chữ số. */
export function trongGiongMa(text) {
  const s = String(text == null ? '' : text).trim();
  return s.length >= 3 && /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(s) && /\d/.test(s);
}
