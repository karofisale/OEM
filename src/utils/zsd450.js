/**
 * zsd450.js — đọc file ZSD450 (xuất từ SAP) thành payload cho tab Data.
 *
 * Logic THUẦN, không React, không mạng: nhận một lưới ô, trả về mảng dòng.
 * Tách ra khỏi RevenueImportPanel.jsx vì đây là phần dễ sai nhất và sai thì
 * KHÔNG ném lỗi — chỉ ra số sai. Tách ra thì `test/revenue-import.test.cjs`
 * gọi thẳng được, không phải dựng DOM.
 *
 * Đây là bản trong trình duyệt của việc mà `Scripts/up-dt-oem/push_to_sheet.py`
 * làm ở dòng lệnh: cùng một hợp đồng, cùng một đích — gửi mảng 65 ô mỗi dòng
 * sang `replaceMonth_`, ô công thức để null.
 *
 * HAI BẢN CÙNG MỘT BẢN ĐỒ CỘT, và đó là rủi ro thật: SAP đổi tên một cột mà
 * chỉ sửa bên Python thì bên này im lặng gửi sai. Nên ba hằng số dưới đây được
 * `test/revenue-import.test.cjs` **đọc thẳng từ mã nguồn Python** và so từng
 * phần tử. Sửa một bên mà quên bên kia là test đỏ.
 */

// Đúng thứ tự 65 cột (A..BM) của tab "Data". Phải khớp CHÍNH XÁC danh sách
// DATA_HEADERS trong push_to_sheet.py.
export const DATA_HEADERS = [
  'Ngày phát sinh công nợ',
  'Ngày c.từ',
  'Mã Billing',
  'Mã loại chứng từ',
  'Tên loại chứng từ',
  'Mã khách',
  'Tên khách',
  'Mã lệnh xuất',
  'Mã vật tư',
  'Tên vật tư',
  'Số lượng trên đơn hàng',
  'Số lượng xuất bán',
  'ĐVT',
  'Mã kho xuất',
  'Đơn giá',
  'Đơn vị tiền tệ',
  'Tỷ giá',
  'Doanh thu VND',
  'Doanh thu ngoại tệ',
  'Tiền thuế',
  'CK Thương mại',
  'Giảm giá',
  'Doanh thu thuần VND',
  'Doanh thu thuần ngoại tệ',
  'Mã đơn hàng',
  'Hình thức thanh toán',
  'Thời hạn thanh toán',
  'Nhóm Sản phẩm',
  'Nhóm SP- cấp 2',
  'Nhóm SP- cấp 3',
  'Nhóm SP- cấp 4',
  'Nhóm SP- cấp 5',
  'Nhóm SP- cấp 6',
  'Nhóm SP- cấp 7',
  'Nhóm SP- cấp 8',
  'Nhóm KH',
  'Nhân Sự (sales man)',
  'Người tạo',
  'Tỉnh',
  'Đặc tính KH (khai báo)',
  'Tháng_Năm',
  'KH mới (1 năm) phát sinh công nợ',
  'Tuần',
  'OEM (khai báo)',
  'Chi phí bán hàng',
  'Khách hàng thanh toán',
  'Diễn giải chung',
  'Diễn giải chi tiết',
  'Khu vực (Sales office)',
  'Kênh bán hàng (Distribution channel)',
  'Valuation type',
  'Internal Order',
  'Internal Order Desc',
  'Plant',
  'Reference',
  'Mã tra cứu',
  'Mã yêu cầu',
  'Thông tin lên hóa đơn',
  'Thuế suất',
  'Doanh thu thuần sau VAT',
  'Mã KH chữ',
  'Sale',
  'Nhóm hàng hóa',
  'Quý',
  'PK'
];

// 6 cột công thức mảng + 1 cột điền tay. Gửi null để `replaceMonth_` chừa ra —
// ghi giá trị vào đó là giết ARRAYFORMULA của cả cột.
export const FORMULA_OR_MANUAL = new Set([
  'Tuần',
  'Doanh thu thuần sau VAT',
  'Mã KH chữ',
  'Sale',
  'Nhóm hàng hóa',
  'Quý',
  'PK'
]);

// Khách nội bộ, không tính vào doanh thu.
export const SKIP_CUSTOMER_CODES = new Set(['1004554']);

export const laNgay = (v) => v instanceof Date && !isNaN(v.getTime());

/** Date -> 'yyyy-MM-dd'. `replaceMonth_` chỉ nhận đúng dạng này (normalizeCell_). */
export function ngayChuoi(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * ZSD450 xuất cột "Thuế suất" dạng chữ "08 %". Cột "Doanh thu thuần sau VAT"
 * của tab Data tính bằng (1+Thuế suất)×DT thuần, và công thức cần SỐ THẬP PHÂN
 * (0.08) — để nguyên chuỗi là ra #VALUE! cả cột (đã gặp thật tháng 8/2026).
 */
export function docPhanTram(v) {
  if (typeof v !== 'string') return v;
  const s = v.replace('%', '').replace(',', '.').trim();
  if (s === '') return v;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n / 100 : v;
}

/**
 * Đọc lưới ô (header ở dòng 0) thành payload gửi đi.
 *
 * @param {Array<Array>} luoi
 * @returns {{rows, thang, boQuaKhongPhaiNgay, boQuaKhachNoiBo, thieuCot, nhieuThang, xemTruoc}}
 */
export function docLuoi(luoi) {
  const kq = {
    rows: [], thang: '', boQuaKhongPhaiNgay: 0, boQuaKhachNoiBo: 0,
    thieuCot: [], nhieuThang: [], xemTruoc: []
  };
  if (!luoi || !luoi.length) {
    kq.thieuCot = DATA_HEADERS.filter((h) => !FORMULA_OR_MANUAL.has(h));
    return kq;
  }

  const idx = {};
  (luoi[0] || []).forEach((h, i) => {
    const ten = String(h === null || h === undefined ? '' : h).trim();
    if (ten && idx[ten] === undefined) idx[ten] = i;
  });

  kq.thieuCot = DATA_HEADERS.filter((h) => !FORMULA_OR_MANUAL.has(h) && idx[h] === undefined);
  if (kq.thieuCot.length) return kq;

  const cNgay = idx['Ngày phát sinh công nợ'];
  const cKhach = idx['Mã khách'];
  const demThang = {};

  for (let i = 1; i < luoi.length; i++) {
    const r = luoi[i] || [];
    const v = r[cNgay];
    if (v === null || v === undefined || v === '') continue;

    // ZSD450 hay chèn một dòng "nhãn số cột" (1, 2, 3, …) ngay dưới tiêu đề.
    // Lọc theo KIỂU dữ liệu chứ không theo rỗng: dòng đó có giá trị, chỉ là
    // không phải ngày. (Vì vậy file PHẢI đọc với cellDates:true — không thì
    // mọi ô ngày về dạng số và cả bảng bị bỏ qua.)
    if (!laNgay(v)) { kq.boQuaKhongPhaiNgay++; continue; }

    const maKhach = String(r[cKhach] === null || r[cKhach] === undefined ? '' : r[cKhach]).trim();
    if (SKIP_CUSTOMER_CODES.has(maKhach.split('.')[0])) { kq.boQuaKhachNoiBo++; continue; }

    const ck = ngayChuoi(v).slice(0, 7);
    demThang[ck] = (demThang[ck] || 0) + 1;

    kq.rows.push(DATA_HEADERS.map((h) => {
      if (FORMULA_OR_MANUAL.has(h)) return null;
      const o = r[idx[h]];
      if (o === undefined) return null;
      if (laNgay(o)) return ngayChuoi(o);
      if (h === 'Thuế suất') return docPhanTram(o);
      return o;
    }));

    if (kq.xemTruoc.length < 50) {
      kq.xemTruoc.push({
        ngay: ngayChuoi(v),
        maKhach,
        tenKhach: String(r[idx['Tên khách']] || ''),
        maVatTu: String(r[idx['Mã vật tư']] || ''),
        tenVatTu: String(r[idx['Tên vật tư']] || ''),
        sl: Number(r[idx['Số lượng xuất bán']]) || 0,
        dtThuan: Number(r[idx['Doanh thu thuần VND']]) || 0
      });
    }
  }

  const cacThang = Object.keys(demThang).sort();
  kq.thang = cacThang[0] || '';
  // File chứa hai tháng là ca NGUY HIỂM, không phải ca bất tiện: replaceMonth_
  // xoá đúng MỘT tháng rồi chèn TẤT CẢ dòng gửi lên — nên dòng của tháng còn
  // lại được thêm vào bên cạnh dòng cũ của chính nó, thành nhân đôi. Chặn ở
  // đây thay vì để người dùng phát hiện qua một con số phình lên.
  if (cacThang.length > 1) kq.nhieuThang = cacThang;

  return kq;
}
