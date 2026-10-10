// Ngày / tháng theo GIỜ VIỆT NAM (UTC+7), không phụ thuộc múi giờ của máy.
//
// Vì sao phải có: `new Date().toISOString().slice(0, 7)` trả tháng theo UTC. Từ
// 0h tới 7h sáng ngày mùng 1 (giờ VN) thì UTC vẫn còn là ngày cuối tháng trước,
// nên app mở ra tháng cũ. Ngược lại `new Date().getMonth()` lại theo múi giờ của
// MÁY — máy đặt sai múi giờ (hoặc người dùng đang ở nước ngoài) là lệch tiếp.
// Việt Nam không có giờ mùa hè nên cộng cứng 7 tiếng là đúng quanh năm.
//
// Mọi hàm nhận `now` (Date | số ms) để test mô phỏng được "00:30 mùng 1 giờ VN".

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const hai = (n) => String(n).padStart(2, '0');
const ms = (now) => (now instanceof Date ? now.getTime() : (now == null ? Date.now() : Number(now)));

/** Các thành phần ngày giờ theo giờ VN. */
export function vnParts(now) {
  const t = new Date(ms(now) + VN_OFFSET_MS);
  return {
    y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
    hh: t.getUTCHours(), mi: t.getUTCMinutes(), ss: t.getUTCSeconds()
  };
}

/** 'YYYY-MM-DD' — giá trị cho <input type="date">. */
export function vnToday(now) {
  const p = vnParts(now);
  return `${p.y}-${hai(p.m)}-${hai(p.d)}`;
}

/** 'YYYY-MM' — giá trị cho <input type="month"> và tháng của API cào SAP. */
export function vnMonth(now) {
  const p = vnParts(now);
  return `${p.y}-${hai(p.m)}`;
}

/** Năm hiện tại (số). */
export function vnYear(now) {
  return vnParts(now).y;
}

/** Khoá tháng kiểu của app: 'T10-2026'. */
export function vnMonthKey(now) {
  const p = vnParts(now);
  return `T${hai(p.m)}-${p.y}`;
}

/**
 * Tháng lập kế hoạch kinh doanh mặc định (khoá 'T10-2026'): tháng hiện tại nếu hôm nay là ngày
 * 1-24, tháng kế tiếp nếu là ngày 25-31 — cùng luật với backend, dùng khi backend chưa trả
 * `planDefaultMonth`. Tính theo giờ VN.
 */
export function vnPlanMonthKey(now) {
  const p = vnParts(now);
  let y = p.y, m = p.m;
  if (p.d >= 25) { m += 1; if (m === 13) { m = 1; y += 1; } }
  return `T${hai(m)}-${y}`;
}

/** n tháng gần nhất ('YYYY-MM'), mới nhất trước, tính theo giờ VN. */
export function vnRecentMonths(n = 12, now) {
  const p = vnParts(now);
  const out = [];
  let y = p.y, m = p.m;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${hai(m)}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

/** 'dd-mm-yyyy' dùng trong tên file xuất (không có dấu '/'). */
export function vnDateSlug(now) {
  const p = vnParts(now);
  return `${hai(p.d)}-${hai(p.m)}-${p.y}`;
}

/** 'dd/mm/yyyy hh:mm' — dấu thời gian hiện trên màn (đơn AI, nhật ký). */
export function vnTimestamp(now) {
  const p = vnParts(now);
  return `${hai(p.d)}/${hai(p.m)}/${p.y} ${hai(p.hh)}:${hai(p.mi)}`;
}

// ---------------------------------------------------------------------------
// Đọc ngày "lỏng": backend trả đủ kiểu — 'dd/MM/yyyy HH:mm' (Apps Script cũ, đã
// là giờ VN), ISO 'yyyy-MM-dd' (chỉ có ngày), ISO có giờ + múi giờ ('...Z',
// '+00:00') từ Postgres, hoặc dạng 'D:yyyy-MM-dd HH:mm:ss' (bản đổ GMT+7).
// ---------------------------------------------------------------------------

const RE_VN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const RE_ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_ISO_LOCAL = /^(?:D:)?(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const RE_ISO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Chuỗi ngày bất kỳ -> { y, m, d, hh, mi, coGio } theo giờ VN, hoặc null.
 * Chuỗi chỉ có ngày thì coGio=false (không đổi múi giờ cho một ngày lịch).
 */
export function docNgay(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date || typeof v === 'number') {
    if (isNaN(ms(v))) return null;
    const p = vnParts(v);
    return { y: p.y, m: p.m, d: p.d, hh: p.hh, mi: p.mi, coGio: true };
  }
  const s = String(v).trim();
  let x;
  if ((x = RE_VN.exec(s))) {
    return { y: +x[3], m: +x[2], d: +x[1], hh: x[4] != null ? +x[4] : 0, mi: x[5] != null ? +x[5] : 0, coGio: x[4] != null };
  }
  if ((x = RE_ISO_DATE.exec(s))) return { y: +x[1], m: +x[2], d: +x[3], hh: 0, mi: 0, coGio: false };
  if ((x = RE_ISO_LOCAL.exec(s))) return { y: +x[1], m: +x[2], d: +x[3], hh: +x[4], mi: +x[5], coGio: true };
  if (RE_ISO_TZ.test(s)) {
    const t = Date.parse(s);
    if (isNaN(t)) return null;
    const p = vnParts(t);
    return { y: p.y, m: p.m, d: p.d, hh: p.hh, mi: p.mi, coGio: true };
  }
  return null;
}

/** Số để sắp xếp theo thời gian (ngày giờ VN gộp thành số); không đọc được -> NaN. */
export function sapXepNgay(v) {
  const o = docNgay(v);
  if (!o) return NaN;
  return Date.UTC(o.y, o.m - 1, o.d, o.hh, o.mi);
}

/**
 * Hiện ngày cho người đọc: 'dd/mm/yyyy' (kèm 'hh:mm' khi có giờ và không tắt).
 * Không đọc được thì trả nguyên chuỗi — không bao giờ ném lỗi hay hiện 'NaN'.
 */
export function hienNgay(v, { gio = true } = {}) {
  const o = docNgay(v);
  if (!o) return v == null ? '' : String(v);
  const ngay = `${hai(o.d)}/${hai(o.m)}/${o.y}`;
  return gio && o.coGio ? `${ngay} ${hai(o.hh)}:${hai(o.mi)}` : ngay;
}

/** Chuỗi có phải ISO thô (yyyy-MM-dd...) không — để badge/nhãn không hiện nó ra. */
export function laNgayISOTho(v) {
  const s = String(v == null ? '' : v).trim();
  return RE_ISO_DATE.test(s) || RE_ISO_LOCAL.test(s) || RE_ISO_TZ.test(s);
}
