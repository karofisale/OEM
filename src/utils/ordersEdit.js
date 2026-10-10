// Logic thuần của màn "Đơn hàng chờ duyệt" — tách ra để test gọi thẳng (Đợt 3).
//
//   - giaTriDong / dungTsvDon : số ĐANG SỬA (không phải số cũ chưa lưu) cho nút "Copy dán SAP";
//   - luuTuanTu / cauKetQuaLuu: "Lưu cả đơn" — gom các dòng đã sửa, lưu lần lượt, báo từng dòng;
//   - khoiPhucSuaDo           : thêm/xoá dòng rồi tải lại danh sách mà KHÔNG mất sửa đổi của dòng khác;
//   - locNhomDon              : tìm (SO / khách / mã) + lọc ngày từ–đến theo GIỜ VIỆT NAM.

import { docNgay } from './vnDate.js';
import { chuanTim } from './searchText.js';
import { lamSachLoi } from './errorText.js';

const so = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/**
 * Giá trị hiệu lực của một dòng = số gốc trên server phủ lên bằng phần đã sửa (`edited`, có thể rỗng).
 * Dòng có sửa -> Thành tiền = SL x Giá (đúng cách lúc lưu); dòng không sửa giữ Thành tiền server trả về.
 */
export function giaTriDong(row, edited) {
  const e = edited || null;
  const lay = (k) => (e && e[k] !== undefined ? e[k] : row[k]);
  const qty = so(lay('qty'));
  const price = so(lay('price'));
  return {
    sku: String(lay('sku') || '').trim(),
    name: String(lay('name') || '').trim(),
    qty,
    price,
    total: e ? qty * price : (Number(row.total) || qty * price),
    clientCode: String(lay('clientCode') || '').trim(),
    clientCodeSearch: String(lay('clientCodeSearch') || '').trim()
  };
}

const oTsv = (v) => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');

/** Chuỗi TSV để dán vào SAP, dựng từ SỐ ĐANG SỬA của từng dòng. */
export function dungTsvDon(rows, editedRows) {
  let tsv = 'Mã vật tư\tTên vật tư\tSố lượng\tĐơn giá VND\tThành tiền VND\tMã KH\tMã KH Chữ\n';
  (rows || []).forEach((r) => {
    const g = giaTriDong(r, editedRows && editedRows[r.rowIndex]);
    tsv += [g.sku, g.name, g.qty, g.price, g.total, g.clientCode, g.clientCodeSearch].map(oTsv).join('\t') + '\n';
  });
  return tsv;
}

/** Các dòng của đơn đang có sửa chưa lưu. */
export function dongDaSua(rows, editedRows) {
  return (rows || []).filter((r) => !!(editedRows && editedRows[r.rowIndex]));
}

/**
 * Lưu lần lượt (không song song: mỗi dòng là một lệnh ghi riêng, tuần tự thì thứ tự báo lỗi rõ ràng và
 * không đẩy nhiều lệnh ghi cùng lúc lên máy chủ). Một dòng hỏng KHÔNG chặn các dòng sau.
 * `luuMot(item)` trả/ném; kết quả [{ item, ok, error? }] theo đúng thứ tự đầu vào.
 */
export async function luuTuanTu(items, luuMot, khiXong) {
  const kq = [];
  for (const item of items || []) {
    let r;
    try {
      const data = await luuMot(item);
      r = { item, ok: true, data };
    } catch (err) {
      r = { item, ok: false, error: err && err.message ? err.message : String(err) };
    }
    kq.push(r);
    if (khiXong) khiXong(r, kq.length);
  }
  return kq;
}

/** { daLuu, loi } + câu báo cho toast. `moTa(item)` = nhãn của dòng ("MAT1000"). */
export function cauKetQuaLuu(ketQua, moTa) {
  const ok = ketQua.filter((r) => r.ok).length;
  const hong = ketQua.filter((r) => !r.ok);
  if (!hong.length) return { daLuu: ok, loi: 0, text: `Đã lưu ${ok} dòng.` };
  // Dịch từng lỗi TRƯỚC khi ghép: dịch cả câu sau này sẽ nuốt luôn nhãn dòng nằm cùng chỗ với lỗi thô.
  const chiTiet = hong.map((r) => `${moTa ? moTa(r.item) : '?'} (${lamSachLoi(r.error)})`).join('; ');
  return {
    daLuu: ok,
    loi: hong.length,
    text: `Đã lưu ${ok}/${ketQua.length} dòng. Chưa lưu được ${hong.length} dòng — vẫn giữ nguyên số đã sửa để bạn thử lại: ${chiTiet}`
  };
}

const chuKy = (r) => [r.orderNo, r.sku, r.name, Number(r.qty), Number(r.price), r.clientCode].join('\u0001');

/**
 * Sau khi chèn/xoá dòng và tải lại danh sách: khớp lại các sửa đổi chưa lưu vào đúng dòng.
 *
 * Hiện nay `rowIndex` là id của dòng trong Postgres (ổn định) nên thường giữ nguyên. Nhưng bản Apps Script
 * cũ dùng số thứ tự dòng trên Sheet — chèn/xoá làm dịch chỉ số — nên KHÔNG tin chỉ số một cách mù quáng:
 * dòng ở chỉ số cũ phải còn đúng NỘI DUNG GỐC (so với bản trước khi tải) thì mới giữ; không thì tìm dòng có
 * cùng nội dung gốc; không thấy mới bỏ và báo (`mat`).
 *
 *   edited: { [rowIndex]: { field: value } }   cũ/mới: mảng dòng { rowIndex, orderNo, sku, name, qty, price, clientCode }
 * Trả { edited, mat: [{ rowIndex, sku }] }.
 */
export function khoiPhucSuaDo(edited, dongCu, dongMoi) {
  const cuTheoId = new Map((dongCu || []).map((r) => [Number(r.rowIndex), r]));
  const moiTheoId = new Map((dongMoi || []).map((r) => [Number(r.rowIndex), r]));
  const out = {};
  const mat = [];
  const daNhan = new Set();
  const cho = [];

  Object.keys(edited || {}).forEach((k) => {
    const id = Number(k);
    const cu = cuTheoId.get(id);
    const moi = moiTheoId.get(id);
    if (!cu) { if (moi) { out[id] = edited[k]; daNhan.add(id); } else mat.push({ rowIndex: id, sku: '' }); return; }
    if (moi && chuKy(moi) === chuKy(cu)) { out[id] = edited[k]; daNhan.add(id); return; }
    cho.push({ id, cu, sua: edited[k] });
  });

  cho.forEach(({ id, cu, sua }) => {
    const ung = (dongMoi || []).find((r) => !daNhan.has(Number(r.rowIndex)) && !(Number(r.rowIndex) in out) && chuKy(r) === chuKy(cu));
    if (ung) { out[Number(ung.rowIndex)] = sua; daNhan.add(Number(ung.rowIndex)); }
    else mat.push({ rowIndex: id, sku: cu.sku });
  });
  return { edited: out, mat };
}

/** Bỏ khỏi `edited` các sửa đổi của những dòng có chỉ số trong `ids`. Trả bản mới. */
export function boSuaDo(edited, ids) {
  const bo = new Set((ids || []).map(Number));
  const out = {};
  Object.keys(edited || {}).forEach((k) => { if (!bo.has(Number(k))) out[k] = edited[k]; });
  return out;
}

/** Ngày của đơn theo giờ VN dạng 'YYYY-MM-DD' (so chuỗi được), hoặc null nếu không đọc được. */
export function ngayDon(createdAt) {
  const o = docNgay(createdAt);
  if (!o) return null;
  const h = (n) => String(n).padStart(2, '0');
  return `${o.y}-${h(o.m)}-${h(o.d)}`;
}

export function coLocDon({ q, tu, den } = {}) {
  return !!(String(q || '').trim() || tu || den);
}

/**
 * Lọc danh sách đơn [[orderNo, rows]]:
 *  - `q`: tìm không phân biệt hoa/thường/dấu trong Mã SO, Mã KH, Mã KH chữ, tên + alias khách, mã VT, tên VT;
 *  - `tu` / `den`: 'YYYY-MM-DD' (gồm cả hai đầu) theo NGÀY TẠO đơn tính giờ VN. Đơn không đọc được ngày bị loại
 *    khi đang lọc ngày (không đoán bừa).
 * `khachTheoMa`: Map(mã KH -> khách) để tìm theo tên đầy đủ.
 */
export function locNhomDon(groups, { q, tu, den, khachTheoMa } = {}) {
  const k = chuanTim(q);
  const coNgay = !!(tu || den);
  if (!k && !coNgay) return groups;
  return (groups || []).filter(([orderNo, rows]) => {
    if (coNgay) {
      const d = ngayDon(rows[0] && rows[0].createdAt);
      if (!d) return false;
      if (tu && d < tu) return false;
      if (den && d > den) return false;
    }
    if (!k) return true;
    if (chuanTim(orderNo).includes(k)) return true;
    return rows.some((r) => {
      const c = khachTheoMa && khachTheoMa.get(String(r.clientCode));
      return [r.clientCode, r.clientCodeSearch, r.sku, r.name, c && c.name, c && c.alias].some((t) => chuanTim(t).includes(k));
    });
  });
}
