/**
 * admin-tables.test.cjs — đọc bảng dán cho màn KPI năm và Bộ sản phẩm.
 *
 *   node test/admin-tables.test.cjs
 */

const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}

(async () => {
  const m = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'adminTables.js')).href);

  const t15 = [
    'Mã KH\tTên KH\tPIC\tT1\tT2\tT3\tT4\tT5\tT6\tT7\tT8\tT9\tT10\tT11\tT12',
    'TECOM\tCông ty TECOM\tKH Luyến\t1.000.000\t2,000,000\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12',
    '',
    'Tổng cộng\t\t\t999'
  ].join('\r\n');
  const a = m.parseKpiDan(t15);
  check('15 cột: đọc 1 dòng, bỏ tiêu đề + dòng tổng', a.rows.length === 1 && a.boQua === 2, a);
  check('15 cột: số kiểu vi và en đều đúng', a.rows[0].months[0] === 1000000 && a.rows[0].months[1] === 2000000, a.rows[0].months);
  check('15 cột: tên + PIC', a.rows[0].name === 'Công ty TECOM' && a.rows[0].pic === 'KH Luyến');

  const t16 = 'CTMAXIMVN\tMakxim\tKH Đình Hoan\t240\t10\t20\t30\t40\t50\t60\t70\t80\t90\t100\t110\t120';
  const b = m.parseKpiDan(t16);
  check('16 cột (bố cục Plan2026 cũ): bỏ cột Năm, T1 = cột thứ 5', b.rows[0].months[0] === 10 && b.rows[0].months[11] === 120, b.rows[0].months);

  const thieu = m.parseKpiDan('KH1\tTên');
  check('thiếu cột tháng -> 0 chứ không NaN', thieu.rows[0].months.every((x) => x === 0));

  let loi = '';
  try { m.parseKpiDan('Mã KH\tTên'); } catch (e) { loi = e.message; }
  check('không có dòng dữ liệu -> báo lỗi rõ', /Không đọc được dòng KPI/.test(loi));

  const k = m.parseKitsDan('Tên bộ\tMã SKU\tVai trò\tSL\tGhi chú\nBộ cốc\tSKU-A\tCốc trong\t1\t\nBộ cốc\tSKU-B\tCốc màu\t2,5\tmàu xanh\nBộ cốc\t\tthiếu mã');
  check('kits: bỏ tiêu đề + dòng thiếu SKU', k.rows.length === 2 && k.boQua === 2, k);
  check('kits: SL thập phân kiểu vi', k.rows[1].qtyPerKit === 2.5 && k.rows[1].note === 'màu xanh');

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})();
