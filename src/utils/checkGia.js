// Check giá bán (07/11/2026) — hàm thuần cho giao diện: nhãn trạng thái, định dạng, lời nhắc thông báo, kiểm LNG.
// Công thức giá nằm ở máy chủ (oem-api checkgia-pure.js); đây chỉ trình bày + vài kiểm tra tức thời để người dùng khỏi chờ máy chủ.

export const CONT_LOAI = [
  { id: '20', label: "Cont 20'" },
  { id: '40', label: "Cont 40'" },
  { id: 'LCL', label: 'LCL (hàng lẻ)' }
];
export const NOI_GIAO = [
  { id: 'tcm', label: 'Giao về kho TCM' },
  { id: 'khach', label: 'Giao thẳng khách hàng' }
];
export const LNG_TOI_THIEU = { tcm: 8, khach: 5 };

const so = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));

/** 1.234.567 (VNĐ) — rỗng khi không có số. */
export function dinhDangTien(v) {
  const n = so(v);
  return n === null ? '' : Math.round(n).toLocaleString('vi-VN');
}

/** 1.234,56 (USD) — tối đa 2 số lẻ. */
export function dinhDangUsd(v) {
  const n = so(v);
  return n === null ? '' : n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export const nhanLoai = (kind) => (kind === 'nhap_khau' ? 'Hàng nhập khẩu' : 'Giá bán từ kho');

/** Nhãn + màu badge của một YÊU CẦU. */
export function nhanTrangThai(status, kind) {
  if (status === 'cho_vhkd') return { text: 'Chờ VHKD kiểm tra', tone: 'amber' };
  if (status === 'cho_review') return { text: kind === 'nhap_khau' ? 'Chờ tính giá' : 'Chờ kiểm tra', tone: 'amber' };
  if (status === 'da_tra_loi') return { text: 'Đã trả lời', tone: 'emerald' };
  return { text: status || '—', tone: 'blue' };
}

/** Nhãn + màu badge của một DÒNG hàng kho. */
export function nhanDong(lstatus) {
  if (lstatus === 'co_gia' || lstatus === 'da_co') return { text: 'Có giá', tone: 'emerald' };
  if (lstatus === 'kiem_tra_lai') return { text: 'Kiểm tra lại thông tin', tone: 'rose' };
  return { text: 'Chưa có thông tin', tone: 'amber' };
}

/** Vì sao một mã "Chưa có thông tin" (chỉ Admin/Creator và màn tra giá của Sale thấy lý do). */
export function nhanLyDo(reason) {
  if (reason === 'chua_co_csdl') return 'Chưa có trong CSDL';
  if (reason === 'chua_co_gv') return 'Chưa có giá vốn';
  return '';
}

/** Tên trạng thái cào SAP trên yêu cầu. */
export function nhanCaoSap(scrape) {
  const st = scrape && scrape.status;
  if (st === 'pending') return 'Đang chờ máy có SAP nhận việc…';
  if (st === 'running') return 'Đang cào SAP' + (scrape.total ? ' (' + (scrape.done || 0) + '/' + scrape.total + ')' : '') + '…';
  if (st === 'done') return scrape.message || 'Đã cào xong.';
  if (st === 'error') return 'Lỗi cào SAP: ' + (scrape.message || 'không rõ');
  return '';
}
export const dangCaoSap = (scrape) => !!scrape && (scrape.status === 'pending' || scrape.status === 'running');

/** Giao thức mở máy có SAP (karofi-oem://gia-von?req=<id>). */
export const duongDanSap = (id) => 'karofi-oem://gia-von?req=' + encodeURIComponent(String(id));

/** Câu thông báo ở đầu Dashboard từ kết quả cgThongBao. null = không có gì để báo. */
export function cauThongBao(tb) {
  if (!tb || !tb.bat || !(tb.soLuong > 0)) return null;
  if (tb.loai === 'quan-tri') return 'Hỏi giá cần kiểm tra (' + tb.soLuong + ')';
  return 'Hỏi giá được trả lời (' + tb.soLuong + ')';
}

/** Dòng mô tả một mục trong thông báo. */
export function moTaMucThongBao(it, loai) {
  const k = nhanLoai(it && it.kind);
  if (loai === 'quan-tri') return '#' + it.id + ' · ' + k + ' · ' + (it.by || '') + ' · ' + (it.at || '') + ' · ' + (it.soDong || 0) + ' mã';
  return '#' + it.id + ' · ' + k + ' · trả lời ' + (it.at || '') + ' · ' + (it.soDong || 0) + ' mã';
}

/** LNG nhập tay thấp hơn mức tối thiểu của nơi giao? (cần Admin tick xác nhận) */
export function lngDuoiToiThieu(lng, delivery) {
  const v = so(lng);
  if (v === null) return false;
  const min = delivery === 'khach' ? LNG_TOI_THIEU.khach : LNG_TOI_THIEU.tcm;
  return v < min - 1e-9;
}
export const lngToiThieu = (delivery) => (delivery === 'khach' ? LNG_TOI_THIEU.khach : LNG_TOI_THIEU.tcm);

/** Số dòng chưa có thông tin / cần kiểm tra lại của một bảng kho. */
export function demThieu(lines) {
  return (lines || []).filter((l) => l.status === 'chua_co' || l.status === 'kiem_tra_lai').length;
}

/** Bảng giá -> văn bản dán Excel (Mã, Tên, Giá bán có VAT, Ghi chú). Dòng chưa có giá để trống giá. */
export function bangGiaThanhTsv(lines) {
  const rows = (lines || []).map((l) => [l.code, l.name || '', l.price ? String(Math.round(l.price)) : '', l.note || (l.status === 'chua_co' ? 'Chưa có thông tin' : '')]);
  return [['Mã', 'Tên', 'Giá bán có VAT', 'Ghi chú']].concat(rows).map((r) => r.join('\t')).join('\n');
}

/** Gói tham số gửi cgNhapKhauTinh/Luu từ trạng thái form (chuỗi nhập) — chuỗi rỗng = null để máy chủ dùng giá trị cũ/báo thiếu. */
export function thamSoTuForm(f) {
  const v = (x) => (x === '' || x === null || x === undefined ? null : Number(x));
  return {
    freightUsd: v(f.freightUsd), customsVnd: v(f.customsVnd), truckingVnd: v(f.truckingVnd),
    fx: v(f.fx), fxSource: f.fxSource === 'vcb' ? 'vcb' : 'tay', lngPct: v(f.lngPct), lngConfirmed: !!f.lngConfirmed
  };
}

/** Các dòng của form admin -> mảng gửi lên. */
export function dongTuForm(rows) {
  const v = (x) => (x === '' || x === null || x === undefined ? null : Number(x));
  return (rows || []).map((r) => ({ id: r.id, name: r.name, taxImportPct: v(r.taxImportPct), vatPct: v(r.vatPct), note: r.note || '' }));
}
