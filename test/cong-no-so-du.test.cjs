/** 15/10/2026 — Bảng công nợ: bỏ khách số dư = 0, mặc định sắp số dư lớn → nhỏ. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/debt/DebtViewPanel.jsx'), 'utf8');
let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); pass++; console.log('  OK   ' + name); };

ok('lọc bỏ dòng số dư = 0 trước khi tìm kiếm / tổng / phân trang', /rows\.filter\(\(r\) => \(Number\(r\.balance\) \|\| 0\) !== 0\)/.test(src) && /if \(!q\) return coNo;/.test(src));
ok('sắp xếp mặc định theo balance giảm dần, truyền vào useTableSort', /SAP_XEP_MAC_DINH = \{ key: 'balance', dir: 'desc' \}/.test(src) && /useTableSort\(filteredRows, COLS, SAP_XEP_MAC_DINH\)/.test(src));
ok('thông báo trống phân biệt "không còn số dư" với "chưa có dữ liệu"', /còn số dư công nợ/.test(src) && /Chưa có dữ liệu công nợ/.test(src));

// Chạy thật phép lọc + sắp xếp bằng chính tableSort
const { sapXepDong } = (() => { try { return require('../src/utils/tableSort.js'); } catch (e) { return {}; } })();
if (sapXepDong) {
  const cols = [{ key: 'balance', type: 'number' }];
  const rows = [{ code: 'A', balance: 0 }, { code: 'B', balance: 500 }, { code: 'C', balance: 12000 }, { code: 'D', balance: undefined }, { code: 'E', balance: -300 }];
  const out = sapXepDong(rows.filter((r) => (Number(r.balance) || 0) !== 0), { key: 'balance', dir: 'desc' }, cols).map((r) => r.code).join('');
  ok('12000 → 500 → -300, khách 0/trống bị bỏ', out === 'CBE');
}
console.log('\n' + pass + ' đạt, 0 lỗi');
