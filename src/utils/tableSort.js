// Sắp xếp theo cột cho mọi bảng — thuần hàm, không React.
//
// Cột mô tả bằng { key, type, get? }:
//   type: 'text' (mặc định) | 'number' | 'date' | 'month'
//   get : (row) => giá trị cần so (mặc định row[key])
//
// Quy tắc:
//  - số so như số, chữ so theo bảng chữ cái tiếng Việt (có dấu, không phân biệt
//    hoa thường, "A2" < "A10"), ngày so theo thời điểm (đọc được cả dd/MM/yyyy lẫn
//    ISO), tháng kiểu 'T08-2026' so theo năm rồi tháng;
//  - ô TRỐNG luôn nằm cuối, dù sắp tăng hay giảm (không để dòng rỗng che mất số);
//  - ổn định: hai dòng bằng nhau giữ thứ tự gốc;
//  - bấm tiêu đề: tăng -> giảm -> bỏ sắp xếp (về thứ tự gốc). Cột số/ngày bấm lần
//    đầu thì GIẢM (số lớn / mới nhất lên trước — thứ người ta hay cần xem nhất).

import { sapXepNgay } from './vnDate.js';

const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

const laRong = (v) => v == null || v === '' || (typeof v === 'number' && !isFinite(v));

function monthValue(key) {
  const m = /^T(\d{1,2})-(\d{4})$/.exec(String(key || '').trim());
  return m ? (+m[2]) * 100 + (+m[1]) : NaN;
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  return Number(String(v).replace(/[^\d.,-]/g, '').replace(/,/g, '.'));
}

/** Quy giá trị ô về dạng so được theo `type`; null nếu coi như trống. */
export function giaTriSapXep(v, type) {
  if (laRong(v)) return null;
  switch (type) {
    case 'number': {
      const n = toNumber(v);
      return isFinite(n) ? n : null;
    }
    case 'date': {
      const n = sapXepNgay(v);
      return isNaN(n) ? null : n;
    }
    case 'month': {
      const n = monthValue(v);
      return isNaN(n) ? null : n;
    }
    default: {
      const s = String(v).trim();
      return s === '' ? null : s;
    }
  }
}

const dauTienGiam = (type) => type === 'number' || type === 'date' || type === 'month';

/** Bấm tiêu đề cột -> trạng thái sắp xếp mới (hoặc null = bỏ sắp xếp). `col` là khoá hoặc đối tượng cột. */
export function doiSapXep(sort, col) {
  const key = typeof col === 'string' ? col : col.key;
  const type = typeof col === 'string' ? 'text' : (col.type || 'text');
  const giam = dauTienGiam(type);
  if (!sort || sort.key !== key) return { key, dir: giam ? 'desc' : 'asc' };
  if (sort.dir === (giam ? 'desc' : 'asc')) return { key, dir: giam ? 'asc' : 'desc' };
  return null;
}

/** Sắp `rows` theo `sort` ({key, dir}) với danh sách cột `cols`. Không sửa mảng gốc. */
export function sapXepDong(rows, sort, cols) {
  if (!sort || !sort.key) return rows;
  const col = (cols || []).find((c) => c.key === sort.key);
  if (!col) return rows;
  const type = col.type || 'text';
  const get = col.get || ((r) => r[col.key]);
  const dir = sort.dir === 'desc' ? -1 : 1;
  const dec = rows.map((r, i) => ({ r, i, v: giaTriSapXep(get(r), type) }));
  dec.sort((a, b) => {
    if (a.v === null && b.v === null) return a.i - b.i;
    if (a.v === null) return 1;              // trống luôn cuối
    if (b.v === null) return -1;
    const c = type === 'text' ? collator.compare(a.v, b.v) : (a.v < b.v ? -1 : a.v > b.v ? 1 : 0);
    return c !== 0 ? c * dir : a.i - b.i;
  });
  return dec.map((x) => x.r);
}

/** Tổng các cột số trên `rows`. cols: [{ key, get? }] -> { [key]: tổng }. Ô không phải số tính 0. */
export function tongCot(rows, cols) {
  const out = {};
  cols.forEach((c) => { out[c.key] = 0; });
  (rows || []).forEach((r) => {
    cols.forEach((c) => {
      const v = c.get ? c.get(r) : r[c.key];
      const n = typeof v === 'number' ? v : toNumber(v);
      if (isFinite(n)) out[c.key] += n;
    });
  });
  return out;
}

/** Giá trị aria-sort cho một cột. */
export function ariaSort(sort, key) {
  if (!sort || sort.key !== key) return 'none';
  return sort.dir === 'desc' ? 'descending' : 'ascending';
}
