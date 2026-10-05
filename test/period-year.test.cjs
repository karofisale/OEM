/**
 * period-year.test.cjs — bộ lọc Năm -> Tháng (src/utils/period.js): "Tất cả tháng" chỉ cộng trong MỘT năm, không trộn năm.
 *   node test/period-year.test.cjs
 */
const path = require('path');
const { pathToFileURL } = require('url');
let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); } else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}
(async () => {
  const m = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'period.js')).href);
  const tx = [
    { month: 'T12-2025', netRevenue: 100 }, { month: 'T08-2025', netRevenue: 10 },
    { month: 'T08-2026', netRevenue: 1000 }, { month: 'T09-2026', netRevenue: 2000 }, { month: 'T01-2026', netRevenue: 5 },
    { month: '', netRevenue: 7 },
  ];
  const sum = (y, mo) => tx.filter(t => m.inPeriod(t, y, mo)).reduce((a, t) => a + t.netRevenue, 0);

  console.log('--- mặc định ---');
  let r = m.resolvePeriod(tx, null, null);
  check('chưa chọn: năm mới nhất 2026, tháng mới nhất T09-2026', r.year === '2026' && r.month === 'T09-2026', r);
  check('danh sách năm mới nhất trước, tháng chỉ của năm đang xem', r.years.join() === '2026,2025' && r.months.join() === 'T09-2026,T08-2026,T01-2026', r);

  console.log('--- Tất cả tháng chỉ trong 1 năm ---');
  r = m.resolvePeriod(tx, '2026', 'ALL');
  check('năm 2026 + ALL = chỉ 2026 (không cộng 2025)', r.month === 'ALL' && sum('2026', 'ALL') === 3005, sum('2026', 'ALL'));
  r = m.resolvePeriod(tx, '2025', 'ALL');
  check('năm 2025 + ALL = chỉ 2025', sum('2025', 'ALL') === 110 && r.months.join() === 'T12-2025,T08-2025', r);
  check('một tháng cụ thể', sum('2026', 'T08-2026') === 1000);
  check('dòng không có tháng hợp lệ không lọt vào kỳ nào', sum('2026', 'ALL') + sum('2025', 'ALL') === 3115);

  console.log('--- đổi năm ---');
  r = m.resolvePeriod(tx, '2025', 'T09-2026');
  check('tháng của năm khác -> rơi về tháng mới nhất của năm đang xem', r.year === '2025' && r.month === 'T12-2025', r);
  r = m.resolvePeriod(tx, '2025', 'ALL');
  check('ALL giữ nguyên khi đổi năm', r.month === 'ALL');
  r = m.resolvePeriod(tx, '2030', null);
  check('năm không có trong dữ liệu -> năm mới nhất', r.year === '2026', r);
  r = m.resolvePeriod([], null, null);
  check('chưa có dữ liệu: năm rỗng, tháng ALL, không lỗi', r.year === '' && r.month === 'ALL' && r.months.length === 0, r);

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
})();
