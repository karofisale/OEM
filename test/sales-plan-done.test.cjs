/**
 * sales-plan-done.test.cjs — cột "Done" ở Kế hoạch Kinh doanh (doneCuaDong).
 *
 *   node test/sales-plan-done.test.cjs
 *
 * Chốt bug 28/09/2026: Done hiện thấp hơn doanh thu thực tế. Nguyên nhân: sau
 * khi cắt sang Postgres (26/09/2026), cột "done" ở oem.plan_thang chỉ còn là
 * ảnh chụp một lần từ đêm migrate (trước đó là công thức SUMIFS sống trong
 * Sheet) — không nơi nào còn ghi lại nó, kể cả lúc nhập doanh thu SAP mới. Bản
 * cũ vẫn ưu tiên cột đó nên Done ngày càng lùi xa doanh thu thật. Xem chú
 * thích đầu doneCuaDong() trong src/utils/salesPlan.js.
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

  console.log('doneTheoKhach — cộng netRevenue theo clientCode, đúng tháng');
  {
    const tx = [
      { clientCode: 'TECOM', month: 'T09-2026', netRevenue: 1000, revenue: 999999 },
      { clientCode: 'TECOM', month: 'T09-2026', netRevenue: 2000 },
      { clientCode: 'TECOM', month: 'T08-2026', netRevenue: 999999 }, // tháng khác -> loại
      { clientCode: 'KHAC', month: 'T09-2026', netRevenue: 500 }
    ];
    const map = m.doneTheoKhach(tx, 'T09-2026');
    check('cộng dồn đúng khách, đúng tháng', map.get('TECOM') === 3000, map.get('TECOM'));
    check('không cộng dòng tháng khác', map.get('TECOM') !== 999999 + 3000);
    check('dùng netRevenue, không rơi về revenue gộp', map.get('TECOM') === 3000);
    check('tháng ALL/rỗng -> map rỗng (không đoán bừa)',
      m.doneTheoKhach(tx, 'ALL').size === 0 && m.doneTheoKhach(tx, '').size === 0);
  }

  console.log('\ndoneCuaDong — BUG CHÍNH: ưu tiên giao dịch thật, không ưu tiên cột done đông cứng');
  {
    // Đây là ca lỗi thật: cột done cũ (đông cứng từ đêm migrate) NHỎ hơn
    // doanh thu thật đã tính được từ oem.transactions. Bản cũ trả về đúng số
    // đông cứng bé hơn — chính là bug user báo. Bản mới phải trả số LỚN hơn,
    // tính từ giao dịch.
    const plan = { done: 5000000 };
    const doneThat = 82000000; // doanh thu thật đổ vào sau đêm migrate
    const r = m.doneCuaDong(plan, doneThat);
    check('ưu tiên số tính từ giao dịch (82tr), KHÔNG phải cột done cũ (5tr)',
      r.value === doneThat, r);
    check('gắn cờ tuGiaoDich = true khi dùng số sống', r.tuGiaoDich === true);
  }
  {
    // Khách/tháng chưa có giao dịch nào trong oem.transactions -> rơi về cột
    // done cũ (còn hơn hiện thẳng 0).
    const plan = { done: 5000000 };
    const r = m.doneCuaDong(plan, 0);
    check('không có giao dịch -> rơi về cột done cũ', r.value === 5000000, r);
    check('gắn cờ tuGiaoDich = false khi rơi về cột cũ', r.tuGiaoDich === false);
  }
  {
    // Không có kế hoạch (dòng mới, plan = null/undefined) và cũng không có
    // giao dịch -> 0, không NaN/undefined.
    const r1 = m.doneCuaDong(null, 0);
    const r2 = m.doneCuaDong(undefined, undefined);
    check('không kế hoạch, không giao dịch -> 0', r1.value === 0 && r2.value === 0, [r1, r2]);
  }
  {
    // Dòng plan mới tạo (submitSalesPlan luôn INSERT done=0) NHƯNG khách đã có
    // doanh thu thật trong tháng -> phải thấy đúng doanh thu, không phải 0.
    const r = m.doneCuaDong({ done: 0 }, 15000000);
    check('dòng kế hoạch mới (done=0) vẫn hiện đúng doanh thu thật', r.value === 15000000, r);
  }

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})();
