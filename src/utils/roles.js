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

// Bỏ tiền tố "KH " + gộp khoảng trắng: cột Sale ghi "KH Đình Hoan" còn saleId là "Đình Hoan".
const chuanHoaChu = (s) => chuanHoa(s).replace(/\s+/g, ' ').replace(/^kh /, '');

/**
 * Dòng dữ liệu (khách hàng / kế hoạch) này có thuộc về người đang đăng nhập không.
 *
 * So BẰNG ĐÚNG sau khi bỏ tiền tố "KH " (09/10/2026) — y hệt laSaleCuaMinh ở
 * oem-api/util.js, chốt thật bên server. Trước đây so kiểu "chứa", nên saleId
 * "Hoan" sửa được dòng của "KH Đình Hoan"; server đã siết lại thì giao diện
 * cũng phải siết theo, không thì mở ô cho sửa rồi server từ chối lúc lưu.
 *
 * Fail CLOSED khi saleId trống: `includes('')` đúng với MỌI dòng, tức một Sale
 * thiếu saleId sẽ sửa được của tất cả mọi người. Giống hệt lý do backend fail
 * closed ở oemAppScopeCaNhan_.
 */
export function ownsSaleRow(activeUser, rowSale) {
  const role = String(activeUser?.role || '').toLowerCase();
  if (role !== 'sale') return role === 'admin' || role === 'creator';
  const saleId = chuanHoaChu(activeUser?.saleId);
  if (!saleId) return false;
  const row = chuanHoaChu(rowSale);
  // Cùng phép so với server (oem-api util.js laSaleCuaMinh): bằng đúng hoặc saleId là trọn các chữ cuối của tên.
  return row === saleId || row.endsWith(' ' + saleId);
}

/**
 * Dòng này có thuộc về SALE đang được chọn trong bộ lọc không.
 *
 * Đây là bộ lọc XEM, không phải hàng rào phân quyền — mọi role vẫn đọc được số
 * của mọi Sale (xem canSeeAllSales). Nó chỉ thu hẹp tầm nhìn cho dễ đọc.
 *
 * So BẰNG ĐÚNG sau chuẩn hoá, không dùng "chứa": danh sách chọn dựng từ chính
 * các giá trị Sale có thật trên tab Data, nên bằng đúng mới là nghĩa người dùng
 * mong đợi. Cách cũ mỗi màn tự viết `(t.sale||'').toLowerCase().includes(...)`
 * — chọn một Sale tên ngắn sẽ kéo theo cả Sale khác có tên chứa nó ("Hoan" kéo
 * theo "KH Đình Hoan"), và vì chép lại ở nhiều màn nên sửa chỗ này vẫn sót chỗ kia.
 */
export function khopSale(rowSale, saleFilter) {
  if (!saleFilter || saleFilter === 'ALL') return true;
  return chuanHoa(rowSale) === chuanHoa(saleFilter);
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
