// Dashboard Sale (30/10/2026) — phần tính toán thuần, tách khỏi giao diện để test không cần dựng React.
//
// Mọi bảng có hai phạm vi, người xem tự chọn:
//   'mine' = "Riêng": chỉ phần của chính mình (saleId trên khách/kế hoạch/giao dịch/công nợ; tên đăng nhập trên đơn);
//   'all'  = "Chung": toàn bộ, thu hẹp thêm được theo một Sale.
// Đây là bộ lọc XEM, không phải hàng rào phân quyền: từ 14/09/2026 mọi role đọc được số của mọi Sale (utils/roles.js).
//
// Quy ước số liệu giống các màn khác: doanh thu = DT THUẦN (netRevenue, chưa VAT); mã khách = Search Code viết hoa;
// Done của kế hoạch tính từ giao dịch (salesPlan.js), không đọc cột done đông cứng của plan_thang.

import { thangGiaoDich, doneTheoKhach, doneDong } from './salesPlan.js';
import { parseMonthKey, formatMonthKey } from './period.js';
import { laCuaToi, donCuaToi, khopSale } from './roles.js';
import { sapXepNgay } from './vnDate.js';

const chuanMa = (s) => String(s || '').trim().toUpperCase();

/** Số tháng tuyệt đối (năm*12 + tháng-1) của khoá 'Txx-yyyy'; không đọc được -> NaN. */
export function chiSoThang(key) {
  const p = parseMonthKey(key);
  return p ? p.year * 12 + (p.month - 1) : NaN;
}

/** Khoá tháng 'Txx-yyyy' từ 'yyyy-MM'. */
export function khoaThangTuYm(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  return m ? formatMonthKey(parseInt(m[2], 10), m[1]) : '';
}

/**
 * Hàm kiểm "dòng này có nằm trong phạm vi đang xem không". `layChu(x)` đưa ra giá trị Sale (hoặc PIC) của dòng.
 * scope: 'mine' | 'all'; saleFilter: 'ALL' hoặc tên Sale (chỉ có nghĩa ở 'all').
 */
export function dungPhamVi({ scope, saleFilter, user }) {
  if (scope === 'mine') return (rowSale) => laCuaToi(user, rowSale);
  return (rowSale) => khopSale(rowSale, saleFilter);
}

/** Tiền gọn: ≥1 tỷ "x,xx Tỷ", ≥1 triệu "x,x Tr", còn lại số đầy đủ. */
export function dinhDangTienGon(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2).replace('.', ',')} Tỷ`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} Tr`;
  return Math.round(n).toLocaleString('vi-VN');
}

/** % đạt = thực hiện / mục tiêu (làm tròn); mục tiêu ≤ 0 -> null (không bịa số). */
export function phanTramDat(thucHien, mucTieu) {
  const t = Number(mucTieu) || 0;
  if (t <= 0) return null;
  return Math.round(((Number(thucHien) || 0) / t) * 100);
}

/** Tổng doanh thu thuần / sản lượng / số dòng của MỘT tháng trong phạm vi (theo cột Sale của giao dịch). */
export function tongThang(transactions, monthKey, trongPhamVi) {
  let dt = 0; let sl = 0; let dong = 0;
  (transactions || []).forEach((t) => {
    if (!t || thangGiaoDich(t) !== monthKey || !trongPhamVi(t.sale)) return;
    dt += t.netRevenue || 0;
    sl += t.qty || 0;
    dong += 1;
  });
  return { dt, sl, dong };
}

/**
 * Bảng "Kế hoạch tháng theo khách": mỗi dòng Plan_Thang của tháng, trong phạm vi (theo cột Sale của kế hoạch).
 * Done tính từ giao dịch của KHÁCH ĐÓ trong tháng (cùng cách ở màn Xem kế hoạch), nên hai màn ra cùng một số.
 */
export function bangKeHoachThang(plans, transactions, monthKey, trongPhamVi) {
  const dt = doneTheoKhach(transactions, monthKey);
  const rows = [];
  (plans || []).forEach((p) => {
    if (!p) return;
    const pk = parseMonthKey(p.month);
    if (!pk || formatMonthKey(pk.month, pk.year) !== monthKey) return;
    if (!trongPhamVi(p.sale)) return;
    const done = doneDong(p, p.searchCode, dt).value;
    const planUpdate = p.planUpdate || 0;
    rows.push({
      code: chuanMa(p.searchCode), name: p.clientName || '', sale: p.sale || '',
      planKpi: p.planKpi || 0, planUpdate, done, chenh: done - planUpdate,
      pct: phanTramDat(done, planUpdate), status: p.status || ''
    });
  });
  rows.sort((a, b) => b.planUpdate - a.planUpdate || b.done - a.done || a.code.localeCompare(b.code));
  const tong = rows.reduce((a, r) => {
    a.planKpi += r.planKpi; a.planUpdate += r.planUpdate; a.done += r.done; return a;
  }, { planKpi: 0, planUpdate: 0, done: 0 });
  tong.chenh = tong.done - tong.planUpdate;
  tong.pct = phanTramDat(tong.done, tong.planUpdate);
  return { rows, tong };
}

/** KPI năm theo 12 tháng, cộng các khách trong phạm vi theo cột PIC của KPI năm. `plan2026` = { mã: { months[12], pic } }. */
export function kpiNamTheoThang(plan2026, trongPhamVi) {
  const out = new Array(12).fill(0);
  Object.keys(plan2026 || {}).forEach((code) => {
    const e = plan2026[code] || {};
    if (!trongPhamVi(e.pic)) return;
    for (let m = 0; m < 12; m++) out[m] += Number((e.months || [])[m]) || 0;
  });
  return out;
}

/**
 * Bảng 12 tháng của một năm: doanh thu thuần, cùng kỳ năm trước (+ % tăng), KPI năm, % đạt KPI.
 * `daCoNamTruoc` = năm trước có giao dịch nào không (không có thì KHÔNG hiện % tăng, tránh số bịa).
 */
export function bang12Thang(transactions, nam, plan2026, trongPhamVi) {
  const dtNam = new Array(12).fill(0);
  const dtTruoc = new Array(12).fill(0);
  let daCoNamTruoc = false;
  (transactions || []).forEach((t) => {
    const k = parseMonthKey(thangGiaoDich(t));
    if (!k) return;
    if (k.year === nam - 1) daCoNamTruoc = true;
    if (k.year !== nam && k.year !== nam - 1) return;
    if (!trongPhamVi(t && t.sale)) return;
    (k.year === nam ? dtNam : dtTruoc)[k.month - 1] += t.netRevenue || 0;
  });
  const kpi = kpiNamTheoThang(plan2026, trongPhamVi);
  const rows = dtNam.map((dt, i) => ({
    key: formatMonthKey(i + 1, nam), thang: i + 1, dt, dtTruoc: dtTruoc[i], kpi: kpi[i],
    pctKpi: phanTramDat(dt, kpi[i]),
    tangTruong: daCoNamTruoc && dtTruoc[i] > 0 ? Math.round(((dt - dtTruoc[i]) / dtTruoc[i]) * 100) : null
  }));
  const tong = rows.reduce((a, r) => { a.dt += r.dt; a.dtTruoc += r.dtTruoc; a.kpi += r.kpi; return a; }, { dt: 0, dtTruoc: 0, kpi: 0 });
  tong.pctKpi = phanTramDat(tong.dt, tong.kpi);
  tong.tangTruong = daCoNamTruoc && tong.dtTruoc > 0 ? Math.round(((tong.dt - tong.dtTruoc) / tong.dtTruoc) * 100) : null;
  return { rows, tong, daCoNamTruoc };
}

/** Top khách theo doanh thu thuần của một năm (gộp theo Search Code, kèm Alias và tháng mua gần nhất). */
export function topKhach(transactions, nam, trongPhamVi, n = 10) {
  const map = new Map();
  let tong = 0;
  (transactions || []).forEach((t) => {
    if (!t || !trongPhamVi(t.sale)) return;
    const k = parseMonthKey(thangGiaoDich(t));
    if (!k || k.year !== nam) return;
    const code = chuanMa(t.clientCode) || String(t.clientName || 'N/A');
    const cur = map.get(code) || { code, alias: t.clientAlias || t.clientName || '', rev: 0, last: -1 };
    const net = t.netRevenue || 0;
    cur.rev += net; tong += net;
    cur.last = Math.max(cur.last, k.year * 12 + k.month - 1);
    map.set(code, cur);
  });
  return {
    rows: Array.from(map.values()).sort((a, b) => b.rev - a.rev).slice(0, n)
      .map((r) => ({ ...r, share: tong > 0 ? Math.round((r.rev / tong) * 100) : null })),
    tong
  };
}

/**
 * Khách "lâu chưa mua": có doanh thu trong dữ liệu đã tải nhưng tháng mua gần nhất cách `hienTai` từ `soThang` tháng trở lên.
 * Chỉ nhìn được trong phạm vi dữ liệu đã tải (bootstrap: năm nay + năm trước) — màn ghi rõ điều đó.
 * Sắp theo doanh thu lịch sử giảm dần (khách lớn trước).
 */
export function khachLauChuaMua(transactions, trongPhamVi, hienTaiKey, soThang = 3, n = 10) {
  const cuoi = chiSoThang(hienTaiKey);
  if (isNaN(cuoi)) return [];
  const map = new Map();
  (transactions || []).forEach((t) => {
    if (!t || !trongPhamVi(t.sale)) return;
    const idx = chiSoThang(thangGiaoDich(t));
    if (isNaN(idx)) return;
    const code = chuanMa(t.clientCode) || String(t.clientName || 'N/A');
    const net = t.netRevenue || 0;
    const cur = map.get(code) || { code, alias: t.clientAlias || t.clientName || '', rev: 0, last: -1, sale: t.sale || '' };
    // Chỉ tính các tháng có doanh thu dương làm "lần mua": dòng hàng tặng/trả (DT ≤ 0) không phải lần mua.
    if (net > 0) { cur.rev += net; cur.last = Math.max(cur.last, idx); }
    map.set(code, cur);
  });
  return Array.from(map.values())
    .filter((r) => r.last >= 0 && cuoi - r.last >= soThang)
    .map((r) => ({ ...r, soThangChua: cuoi - r.last, thangCuoi: formatMonthKey((r.last % 12) + 1, Math.floor(r.last / 12)) }))
    .sort((a, b) => b.rev - a.rev)
    .slice(0, n);
}

/** Công nợ trong phạm vi (theo cột PIC): bỏ số dư 0, sắp số dư giảm dần. */
export function congNoTheoPhamVi(rows, trongPhamVi) {
  const ds = (rows || []).filter((r) => r && (Number(r.balance) || 0) !== 0 && trongPhamVi(r.pic));
  ds.sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0));
  const tong = ds.reduce((a, r) => {
    a.balance += Number(r.balance) || 0;
    if ((Number(r.overLimit) || 0) > 0) { a.vuot += 1; a.tienVuot += Number(r.overLimit) || 0; }
    return a;
  }, { balance: 0, vuot: 0, tienVuot: 0 });
  return { rows: ds, tong };
}

const LA_THANH_LY = /^TL-/i;

/**
 * Đơn chờ nhập SAP: gom các dòng đơn theo mã đơn. `trongPhamVi(pic)` — với "Riêng" là donCuaToi (PIC = tên đăng nhập),
 * với "Chung" là true (hoặc theo Sale đã chọn: đơn chỉ có PIC là tên đăng nhập nên KHÔNG lọc được theo tên Sale, xem component).
 * Thành tiền = qty × đơn giá (đúng cách màn "Đơn Hàng Chờ Duyệt" hiện).
 */
export function donChoNhapSap(lines, trongPhamVi) {
  const map = new Map();
  (lines || []).forEach((l) => {
    if (!l || (!l.sku && !l.name)) return;
    if (!trongPhamVi(l.pic)) return;
    const key = String(l.orderNo || '').trim() || '(chưa có mã đơn)';
    const cur = map.get(key) || {
      orderNo: key, khach: l.clientCodeSearch || l.clientCode || '', createdAt: l.createdAt || '', pic: l.pic || '',
      soDong: 0, tong: 0, thanhLy: LA_THANH_LY.test(key)
    };
    cur.soDong += 1;
    cur.tong += Math.round((Number(l.qty) || 0) * (Number(l.price) || 0));
    map.set(key, cur);
  });
  // Đơn mới nhất trước; ngày không đọc được (NaN) xuống cuối.
  const rows = Array.from(map.values()).sort((a, b) => {
    const x = sapXepNgay(a.createdAt); const y = sapXepNgay(b.createdAt);
    return (isNaN(y) ? -Infinity : y) - (isNaN(x) ? -Infinity : x);
  });
  return { rows, tong: rows.reduce((a, r) => a + r.tong, 0) };
}

export { donCuaToi };
