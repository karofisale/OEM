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
