/**
 * sales-plan-done.test.cjs — cột "Done" ở Kế hoạch Kinh doanh (src/utils/salesPlan.js).
 *
 *   node test/sales-plan-done.test.cjs
 *
 * Sau khi cắt sang Postgres (26/09/2026), cột "done" của oem.plan_thang chỉ là ảnh chụp đông cứng từ đêm migrate
 * (trước đó là SUMIFS sống trong Sheet). Done phải tính từ oem.transactions:
 *  - 28/09/2026: ưu tiên số từ giao dịch thay vì cột đông cứng.
 *  - 30/09/2026: tháng ĐÃ có dòng Data thì luôn lấy số từ Data (khách chưa mua = 0, không rơi về số đông cứng); chỉ
 *    tháng chưa có dòng Data nào mới dùng cột cũ. Khớp mã không phân biệt hoa/thường, khoảng trắng; ô tháng trống
 *    thì lấy tháng theo ngày.
 */

const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}

(async () => {
  const m = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'salesPlan.js')).href);

  const tx = [
    { clientCode: 'TECOM', month: 'T09-2026', netRevenue: 1000, revenue: 999999 },
    { clientCode: ' tecom ', month: 'T9-2026', netRevenue: 2000 },
    { clientCode: 'TECOM', month: '', date: '15/09/2026', netRevenue: 400 },       // ô tháng trống -> theo ngày
    { clientCode: 'TECOM', month: 'T08-2026', netRevenue: 999999 },                 // tháng khác -> loại
    { clientCode: 'KHAC', month: 'T09-2026', netRevenue: 500 }
  ];

  console.log('doneTheoKhach — cộng netRevenue theo mã chữ, đúng tháng');
  {
    const dt = m.doneTheoKhach(tx, 'T09-2026');
    check('cộng dồn đúng khách/tháng, không phân biệt hoa-thường/khoảng trắng, ô tháng trống theo ngày',
      dt.theoMa.get('TECOM') === 3400, dt.theoMa.get('TECOM'));
    check('dùng netRevenue, không rơi về revenue gộp', dt.theoMa.get('TECOM') !== 999999 + 3400);
    check('tháng có dòng Data -> coGiaoDich', dt.coGiaoDich === true);
    const rong = m.doneTheoKhach(tx, 'T10-2026');
    check('tháng chưa có Data -> coGiaoDich = false', rong.coGiaoDich === false && rong.theoMa.size === 0);
  }

  console.log('\ndoneDong — chọn số hiển thị');
  {
    const dt = m.doneTheoKhach(tx, 'T09-2026');
    const r = m.doneDong({ done: 5000000 }, 'tecom', dt);
    check('tháng có Data: lấy số từ Data (3.400), KHÔNG lấy cột done đông cứng (5tr)', r.value === 3400 && r.tuGiaoDich === true, r);
    const r0 = m.doneDong({ done: 5000000 }, 'CHUAMUA', dt);
    check('tháng có Data mà khách chưa mua -> 0, không rơi về số đông cứng', r0.value === 0 && r0.tuGiaoDich === true, r0);
    const rc = m.doneDong({ done: 5000000 }, 'TECOM', m.doneTheoKhach(tx, 'T10-2026'));
    check('tháng chưa có Data -> dùng cột done cũ', rc.value === 5000000 && rc.tuGiaoDich === false, rc);
    check('không kế hoạch, không Data -> 0', m.doneDong(null, 'X', null).value === 0 && m.doneDong(undefined, 'X', undefined).value === 0);
  }

  console.log('\ndoneMoiThang / dtCuaThang — một lượt quét cho nhiều tháng');
  {
    const bang = m.doneMoiThang(tx, ['T09-2026', 'T08-2026', 'T10-2026']);
    check('tháng 9 = 3.400, tháng 8 = 999.999', m.dtCuaThang(bang, 'T9-2026').theoMa.get('TECOM') === 3400 &&
      m.dtCuaThang(bang, 'T08-2026').theoMa.get('TECOM') === 999999);
    const t10 = m.dtCuaThang(bang, 'T10-2026');
    check('tháng không có Data -> không coGiaoDich', !t10 || !t10.coGiaoDich, t10);
  }

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})();
