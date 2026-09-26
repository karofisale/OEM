/**
 * adminTables.js — đọc bảng dán từ Excel cho hai màn Admin: KPI năm và Bộ sản
 * phẩm. Hai bảng này trước đây sửa tay thẳng trên Google Sheet (tab Plan2026,
 * tab Kits); từ khi OEM chuyển sang Postgres thì sửa trong app.
 *
 * Logic thuần, không React — test/admin-tables.test.cjs gọi thẳng.
 */

import { doSo } from './bom.js';

const o = (v) => String(v === null || v === undefined ? '' : v).trim();

function dong(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((d) => d.split('\t'))
    .filter((c) => c.some((x) => o(x)));
}

const boDau = (s) => o(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/**
 * KPI năm. Nhận hai kiểu dán:
 *   15 cột: Mã KH | Tên KH | PIC | T1 … T12
 *   16 cột: Mã KH | Tên KH | PIC | Năm (tổng, bỏ qua) | T1 … T12
 *           — đúng bố cục tab Plan2026 cũ, bôi thẳng từ Sheet dán sang được.
 * Dòng tiêu đề (ô đầu là "Mã KH") và dòng tổng tự bỏ.
 */
export function parseKpiDan(text) {
  const out = [];
  let boQua = 0;
  for (const c of dong(text)) {
    const ma = o(c[0]);
    const k = boDau(ma).replace(/[ ._-]/g, '');
    if (!ma || k === 'makh' || k.indexOf('tong') === 0 || k === 'total') { boQua++; continue; }
    const batDau = c.length >= 16 ? 4 : 3;
    const months = [];
    for (let m = 0; m < 12; m++) months.push(doSo(c[batDau + m]));
    out.push({ code: ma, name: o(c[1]), pic: o(c[2]), months });
  }
  if (!out.length) throw new Error('Không đọc được dòng KPI nào — cần ít nhất cột Mã KH, cách nhau bằng Tab (copy thẳng từ Excel).');
  return { rows: out, boQua };
}

/** Bộ sản phẩm: Tên bộ | Mã SKU | Vai trò | SL trong 1 bộ | Ghi chú. */
export function parseKitsDan(text) {
  const out = [];
  let boQua = 0;
  for (const c of dong(text)) {
    const ten = o(c[0]), sku = o(c[1]);
    const k = boDau(ten);
    if (!ten || !sku || (k.indexOf('ten') === 0 && k.indexOf('bo') >= 0)) { boQua++; continue; }
    out.push({ kitName: ten, sku, role: o(c[2]), qtyPerKit: doSo(c[3]), note: o(c[4]) });
  }
  if (!out.length) throw new Error('Không đọc được dòng nào — cần ít nhất Tên bộ và Mã SKU, cách nhau bằng Tab.');
  return { rows: out, boQua };
}
