/**
 * Luật phân quyền dùng chung cho giao diện.
 *
 * Từ 14/09/2026 MỌI role đều XEM được dữ liệu của mọi Sale — yêu cầu: "các sale
 * xem được thông tin của nhau". Backend đã mở ở oemAppScopeOf_ (gas/SalesData.gs);
 * chỗ này là nửa giao diện của cùng một luật.
 *
 * Vì sao vẫn là một hàm chứ không rải `true` khắp nơi: trước đây mảng
 * `['creator','admin','leader']` bị chép lại ở 4 màn, lệch nhau lúc nào không
 * biết. Một hàm thì lần sau muốn thu hẹp lại chỉ sửa một chỗ, và luôn đối chiếu
 * được với backend.
 *
 * XEM khác SỬA. Mọi thứ dưới đây chỉ nói về việc NHÌN THẤY. Quyền sửa vẫn gắn
 * với chủ sở hữu từng dòng — xem ownsSaleRow/ownsOrder ở dưới, và hai chốt thật
 * bên backend: oemAppRequirePlanOwnership_, oemAppRequireOrderOwnership_.
 */
export function canSeeAllSales(_role) {
  return true;
}

// Chuẩn hoá để so tên Sale: bỏ phân biệt hoa/thường, và ép về NFC vì chữ Việt
// lấy từ Google Sheets có thể ở dạng NFD (dấu tách rời) trong khi chuỗi gõ tay
// là NFC — nhìn giống hệt nhau nhưng so bằng === thì không bao giờ khớp.
const chuanHoa = (s) => String(s || '').normalize('NFC').trim().toLowerCase();

/**
 * Dòng dữ liệu (khách hàng / kế hoạch) này có thuộc về người đang đăng nhập không.
 *
 * So theo kiểu "chứa" chứ không phải bằng đúng, vì cột Sale trên Sheet hay ghi
 * dài hơn saleId (ví dụ saleId "Đình Hoan" nằm trong "KH Đình Hoan").
 *
 * Fail CLOSED khi saleId trống: `includes('')` đúng với MỌI dòng, tức một Sale
 * thiếu saleId sẽ sửa được của tất cả mọi người. Giống hệt lý do backend fail
 * closed ở oemAppScopeCaNhan_.
 */
export function ownsSaleRow(activeUser, rowSale) {
  const role = String(activeUser?.role || '').toLowerCase();
  if (role !== 'sale') return role === 'admin' || role === 'creator';
  const saleId = chuanHoa(activeUser?.saleId);
  if (!saleId) return false;
  return chuanHoa(rowSale).includes(saleId);
}

/**
 * Đơn hàng này có do người đang đăng nhập tạo không (cột PIC của tab Orders).
 *
 * PIC lưu TÊN ĐĂNG NHẬP chứ không phải saleId (xem oemAppSaveOrder_), nên so
 * bằng đúng `name` — khác hẳn ownsSaleRow ở trên, đừng gộp hai hàm lại.
 */
export function ownsOrder(activeUser, pic) {
  const role = String(activeUser?.role || '').toLowerCase();
  if (role !== 'sale') return role === 'admin' || role === 'creator';
  return String(pic || '').trim() === String(activeUser?.name || '').trim();
}
