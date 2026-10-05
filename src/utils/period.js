// Period (month / year / week) helpers shared by the transaction grid and the
// three revenue reports.
//
// Every one of those screens used to hardcode the current period — 'T08-2026'
// as a default, plus handwritten <option> lists that stopped at whatever month
// existed when the screen was written, and a getPriorMonth() if-chain covering
// exactly five months. That meant each new month silently broke a filter: the
// default would select a month with no rows and the tab would render an empty
// table. Everything here derives from the data instead.

// Month keys in this app are "T08-2026" (column "Tháng" on the Data tab).
const MONTH_RE = /^T(\d{1,2})-(\d{4})$/;

export function parseMonthKey(key) {
  const m = MONTH_RE.exec(String(key || '').trim());
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const year = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return { month, year };
}

export function formatMonthKey(month, year) {
  return `T${String(month).padStart(2, '0')}-${year}`;
}

// Chronological sort key. A plain string sort is wrong across a year boundary:
// 'T12-2025' < 'T08-2026' alphabetically only because '1' < '8', so December
// would sort after August of the following year.
export function monthSortValue(key) {
  const p = parseMonthKey(key);
  return p ? p.year * 100 + p.month : -1;
}

// The month before `key`, rolling the year over correctly (T01-2026 -> T12-2025).
export function priorMonthKey(key) {
  const p = parseMonthKey(key);
  if (!p) return null;
  return p.month === 1
    ? formatMonthKey(12, p.year - 1)
    : formatMonthKey(p.month - 1, p.year);
}

// Short label for a comparison badge: "T07-2026" -> "T07".
export function shortMonthLabel(key) {
  const p = parseMonthKey(key);
  return p ? `T${String(p.month).padStart(2, '0')}` : String(key || '');
}

// Distinct months present in the data, newest first — newest first because every
// one of these filters is used to look at recent activity.
export function monthsFromTransactions(transactions) {
  const set = new Set();
  (transactions || []).forEach(t => {
    if (t && t.month && parseMonthKey(t.month)) set.add(t.month);
  });
  return Array.from(set).sort((a, b) => monthSortValue(b) - monthSortValue(a));
}

export function yearsFromTransactions(transactions) {
  const set = new Set();
  (transactions || []).forEach(t => {
    const p = parseMonthKey(t && t.month);
    if (p) set.add(String(p.year));
  });
  return Array.from(set).sort((a, b) => Number(b) - Number(a));
}

// Most recent month that actually has data, or null when there is none.
export function latestMonthKey(transactions) {
  const months = monthsFromTransactions(transactions);
  return months.length ? months[0] : null;
}

// Distinct weeks present, ordered W1..W5.
export function weeksFromTransactions(transactions) {
  const set = new Set();
  (transactions || []).forEach(t => { if (t && t.week) set.add(t.week); });
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// Bộ lọc Năm -> Tháng dùng chung cho Báo cáo doanh thu (3 tab) và Lịch sử doanh thu.
//
// Trước đây ô tháng có mục "Tất cả tháng" cộng gộp MỌI tháng của MỌI năm vào 1 số
// (T08-2025 + T08-2026 cùng nằm trong "Tất cả"). Giờ luôn có 1 NĂM cụ thể: năm
// chưa chọn thì rơi về năm mới nhất có dữ liệu, và "Tất cả tháng" chỉ cộng các
// tháng CỦA NĂM ĐÓ — muốn xem năm khác thì đổi ô Năm, không bao giờ trộn năm.
// ---------------------------------------------------------------------------

/**
 * Giá trị hiệu lực của bộ lọc.
 *  year  — năm người dùng chọn (null = chưa chọn); không còn trong dữ liệu thì rơi về năm mới nhất.
 *  month — tháng người dùng chọn ('ALL' = cả năm; null = chưa chọn -> tháng mới nhất của năm đang xem);
 *          tháng không thuộc năm đang xem thì rơi về tháng mới nhất của năm đó.
 * Trả { years, year, months (tháng của năm đang xem, mới nhất trước), month }.
 */
export function resolvePeriod(transactions, year, month) {
  const years = yearsFromTransactions(transactions);
  const y = year && years.includes(String(year)) ? String(year) : (years[0] || '');
  const months = monthsFromTransactions(transactions).filter(m => {
    const p = parseMonthKey(m);
    return p && String(p.year) === y;
  });
  let m;
  if (month === 'ALL') m = 'ALL';
  else if (month && months.includes(month)) m = month;
  else m = months[0] || 'ALL';
  return { years, year: y, months, month: m };
}

/** Giao dịch `t` có nằm trong kỳ (năm cụ thể, tháng cụ thể hoặc 'ALL' = cả năm đó) không. */
export function inPeriod(t, year, month) {
  const p = parseMonthKey(t && t.month);
  if (!p) return false;
  if (year && String(p.year) !== String(year)) return false;
  return month === 'ALL' || !month || t.month === month;
}
