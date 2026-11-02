// Logic THUẦN của "Xuất Excel mẫu / Nhập từ Excel" cho màn Đề xuất kế hoạch kinh doanh tháng (02/11/2026) — tách khỏi React để test gọi
// thẳng. Việc đọc/ghi file .xlsx (SheetJS, tải lười) nằm ở SalesPlanProposePanel; ở đây chỉ làm việc trên mảng 2 chiều (aoa).
//
// Quy ước của file mẫu:
//   - Dòng 2 có ô "Tháng" + ô kế bên là khoá tháng (T11-2026): nhập file chỉ nhận đúng tháng đang lập.
//   - Bảng bắt đầu ở dòng có tiêu đề "Mã KH" + "Tuần 1"…"Tuần 5". Plan KPI, Plan update, Doanh thu done chỉ để tham khảo — KHÔNG đọc vào.
//   - Ô Tuần/Note để TRỐNG = giữ nguyên số đang có; nhập 0 = đặt về 0. (Mẫu xuất ra để trống ở ô 0 nên điều này nhất quán.)

import { parseMonthKey } from './period.js';

export const COT = ['Mã KH', 'Tên khách hàng', 'Sale', 'Plan KPI', 'Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4', 'Tuần 5', 'Plan update', 'Doanh thu done', 'Note'];
export const SO_TUAN = 5;
const CH_TUAN = ['w1', 'w2', 'w3', 'w4', 'w5'];

/** Bỏ dấu + hạ chữ thường để so tiêu đề cột/nhãn không phụ thuộc cách gõ. */
export function chuanNhan(v) {
  return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

const trong = (v) => v == null || (typeof v === 'string' && v.trim() === '');

/**
 * Đọc một ô số tiền từ Excel. Trả { trong: true } (ô trống), { so } (số nguyên VNĐ, ≥ 0) hoặc { loi } (không phải số / âm).
 * Nhận số thật, chuỗi "1.234.567", "1,234,567", "1234567 đ", "1 234 567"; thập phân ("1234,5") được làm tròn.
 */
export function docSoTien(v) {
  if (trong(v)) return { trong: true };
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { loi: 'không phải số' };
    if (v < 0) return { loi: 'số âm' };
    return { so: Math.round(v) };
  }
  let s = String(v).trim().replace(/ /g, ' ').replace(/(vnđ|vnd|đ|d)$/i, '').trim();
  if (/^-/.test(s)) return { loi: 'số âm' };
  s = s.replace(/\s+/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');          // dấu chấm/phẩy phân cách hàng nghìn
  else if (/^\d+([.,]\d+)?$/.test(s)) s = s.replace(',', '.');             // thập phân
  else return { loi: `"${String(v).trim()}" không phải số` };
  const n = Number(s);
  return Number.isFinite(n) ? { so: Math.round(n) } : { loi: 'không phải số' };
}

/**
 * Dựng mảng 2 chiều của file mẫu. `rows`: [{ code, name, sale, planKpi, w:[5 số], note, done }] đã sắp xếp. Ô tuần = 0 xuất để trống.
 * Trả { aoa, dongTieuDe (0-based), dongDau (0-based, dòng dữ liệu đầu), dongCuoi, tenSheet, cot: độ rộng }.
 */
export function dungBangMau({ month, rows, nguoiXuat, ngayXuat }) {
  const aoa = [];
  aoa.push([`KẾ HOẠCH KINH DOANH THÁNG ${month}`]);
  aoa.push(['Tháng', month, '', 'Xuất bởi', nguoiXuat || '', 'Ngày xuất', ngayXuat || '']);
  aoa.push(['Điền số vào các cột Tuần 1–5 và Note, rồi nhập lại file này vào app. Ô để TRỐNG = giữ nguyên số hiện tại; nhập 0 = đặt về 0. Các cột Sale, Plan KPI, Plan update, Doanh thu done chỉ để tham khảo, app không đọc.']);
  aoa.push([]);
  aoa.push(COT.slice());
  const dongTieuDe = aoa.length - 1;
  const dongDau = aoa.length;
  (rows || []).forEach((r, i) => {
    const xl = dongDau + i + 1; // số dòng Excel (1-based)
    const w = Array.from({ length: SO_TUAN }, (_, k) => {
      const x = Number(r.w && r.w[k]) || 0;
      return x ? x : '';
    });
    aoa.push([
      r.code, r.name || '', r.sale || '', Number(r.planKpi) || 0,
      ...w,
      { t: 'n', f: `SUM(E${xl}:I${xl})`, v: w.reduce((n, x) => n + (Number(x) || 0), 0) },
      Number(r.done) || 0,
      r.note || ''
    ]);
  });
  const dongCuoi = aoa.length - 1;
  if ((rows || []).length) {
    const a = dongDau + 1, b = dongCuoi + 1;
    const cot = (L) => ({ t: 'n', f: `SUM(${L}${a}:${L}${b})`, v: 0 });
    aoa.push(['TỔNG', `${rows.length} khách`, '', cot('D'), cot('E'), cot('F'), cot('G'), cot('H'), cot('I'), cot('J'), cot('K'), '']);
  }
  return { aoa, dongTieuDe, dongDau, dongCuoi, tenSheet: 'Kế hoạch', cot: [14, 34, 16, 16, 15, 15, 15, 15, 15, 16, 16, 28] };
}

// Ô công thức do chính mẫu dựng ({ f, v }) -> lấy giá trị; ô thường giữ nguyên.
const giaTri = (o) => (o && typeof o === 'object' && !(o instanceof Date) && 'v' in o ? o.v : o);

/** Tìm dòng tiêu đề (có "Mã KH" và "Tuần 1") trong aoa. Trả { dong, cot: { code, w:[5], note } } hoặc null. */
function timTieuDe(aoa) {
  for (let i = 0; i < Math.min((aoa || []).length, 40); i++) {
    const hang = (aoa[i] || []).map((c) => chuanNhan(giaTri(c)));
    const code = hang.findIndex((t) => t === 'ma kh' || t === 'ma khach hang' || t === 'search code');
    const tuan = [1, 2, 3, 4, 5].map((n) => hang.indexOf(`tuan ${n}`));
    if (code >= 0 && tuan[0] >= 0) {
      const note = hang.findIndex((t) => t === 'note' || t === 'ghi chu');
      return { dong: i, cot: { code, w: tuan, note } };
    }
  }
  return null;
}

/** Khoá tháng ghi trong file: ô "Tháng" + ô kế bên, hoặc "T11-2026" trong vài dòng đầu. Không có -> ''. */
export function docThangTrongFile(aoa, dongTieuDe) {
  const gioiHan = Math.min((aoa || []).length, dongTieuDe >= 0 ? dongTieuDe : 8);
  for (let i = 0; i < gioiHan; i++) {
    const hang = aoa[i] || [];
    for (let j = 0; j < hang.length; j++) {
      if (chuanNhan(giaTri(hang[j])) === 'thang') {
        const next = String(giaTri(hang[j + 1]) == null ? '' : giaTri(hang[j + 1])).trim().toUpperCase();
        if (parseMonthKey(next)) return next;
      }
    }
  }
  for (let i = 0; i < gioiHan; i++) {
    const m = /T\d{1,2}-\d{4}/i.exec((aoa[i] || []).map((c) => String(giaTri(c) == null ? '' : giaTri(c))).join(' '));
    if (m && parseMonthKey(m[0].toUpperCase())) return m[0].toUpperCase();
  }
  return '';
}

/**
 * Đọc file mẫu đã điền (aoa) -> { thang, dong:[{ code, w:[5 số|null], note:string|null, dongExcel }], loi:[{ dongExcel, code, lyDo }], trung:[code] }
 * hoặc { loiCauTruc } nếu không thấy bảng. Ô trống -> null (giữ nguyên số hiện tại). Dòng tổng/dòng không có mã bị bỏ qua.
 */
export function docBangKeHoach(aoa) {
  const th = timTieuDe(aoa);
  if (!th) return { loiCauTruc: 'Không thấy bảng kế hoạch: file cần có dòng tiêu đề với cột "Mã KH" và "Tuần 1"…"Tuần 5". Hãy dùng đúng file mẫu xuất từ app.' };
  const thang = docThangTrongFile(aoa, th.dong);
  const dong = [], loi = [];
  const viTri = new Map();
  const trung = [];
  for (let i = th.dong + 1; i < aoa.length; i++) {
    const hang = aoa[i] || [];
    const raw = giaTri(hang[th.cot.code]);
    const code = String(raw == null ? '' : raw).trim().toUpperCase();
    if (!code) continue;
    const nhan = chuanNhan(code);
    if (nhan === 'tong' || nhan === 'tong cong' || /^[Σ∑]/.test(code)) continue;
    const w = [];
    let hong = false;
    th.cot.w.forEach((c, k) => {
      const r = docSoTien(giaTri(hang[c]));
      if (r.loi) { loi.push({ dongExcel: i + 1, code, lyDo: `Tuần ${k + 1}: ${r.loi}` }); hong = true; w.push(null); } else w.push(r.trong ? null : r.so);
    });
    if (hong) continue;
    let note = null;
    if (th.cot.note >= 0) { const nv = giaTri(hang[th.cot.note]); note = trong(nv) ? null : String(nv).trim(); }
    const moi = { code, w, note, dongExcel: i + 1 };
    if (viTri.has(code)) { dong[viTri.get(code)] = moi; if (!trung.includes(code)) trung.push(code); } else { viTri.set(code, dong.length); dong.push(moi); } // mã lặp: dòng SAU thắng
  }
  return { thang, dong, loi, trung };
}

/** Chữ ký một dòng nháp — cùng công thức với `draftSignature` của màn (so "đã đổi so với số hiện có"). */
export const chuKyNhap = (d) => JSON.stringify([d.w1 || 0, d.w2 || 0, d.w3 || 0, d.w4 || 0, d.w5 || 0, String(d.note || '')]);

/**
 * Ghép các dòng đã đọc vào bản đang nhập.
 *   rowByCode: bảng đang có (codeSearch -> dòng); clientByCode: danh bạ (codeSearch -> khách);
 *   getDraft(code) -> { w1..w5, note } hiện tại; canEditRow(row)/canEditClient(client) -> có được sửa dòng/khách này không.
 * Trả { apply:[{ code, draft, truoc }], themKhach:[code], boQua:[{ code, dongExcel, lyDo }], khongDoi, tong }.
 *   - mã không có trong danh sách khách -> bỏ qua; khách của Sale khác (chỉ xem) -> bỏ qua;
 *   - dòng trống hết (không có số, không có note) hoặc số y hệt số hiện có -> "không đổi" (không đánh dấu CHƯA LƯU, không đẩy lại về chờ duyệt);
 *   - khách có trong danh bạ nhưng chưa có trên bảng -> thêm vào bảng (themKhach) như nút "Bổ sung khách hàng".
 */
export function ghepVaoNhap({ dong, rowByCode, clientByCode, getDraft, canEditRow, canEditClient }) {
  const tra = new Map();
  Object.keys(clientByCode || {}).forEach((c) => tra.set(String(c).toUpperCase(), c));
  Object.keys(rowByCode || {}).forEach((c) => tra.set(String(c).toUpperCase(), c));
  const apply = [], themKhach = [], boQua = [];
  let khongDoi = 0;
  (dong || []).forEach((d) => {
    const code = tra.get(String(d.code).toUpperCase());
    if (!code) { boQua.push({ code: d.code, dongExcel: d.dongExcel, lyDo: 'Mã KH không có trong danh sách khách hàng' }); return; }
    const row = rowByCode && rowByCode[code];
    const khach = clientByCode && clientByCode[code];
    if (row ? !canEditRow(row) : (khach && !canEditClient(khach))) {
      boQua.push({ code, dongExcel: d.dongExcel, lyDo: `Khách của ${(row && row.sale) || (khach && khach.sale) || 'Sale khác'} — bạn chỉ xem, không sửa được` });
      return;
    }
    const co = d.w.some((x) => x !== null) || d.note !== null;
    if (!co) { khongDoi++; return; }
    const truoc = getDraft(code);
    const draft = { ...truoc };
    CH_TUAN.forEach((k, i) => { if (d.w[i] !== null) draft[k] = d.w[i]; });
    if (d.note !== null) draft.note = d.note;
    if (chuKyNhap(draft) === chuKyNhap(truoc)) { khongDoi++; return; }
    apply.push({ code, draft, truoc });
    if (!row) themKhach.push(code);
  });
  return { apply, themKhach, boQua, khongDoi, tong: (dong || []).length };
}
