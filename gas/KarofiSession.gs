/**
 * KarofiSession.gs — chuyển token Karofi ID thành phiên đăng nhập của OEM App.
 *
 * Dịch khối quyền trong token về đúng hình dạng oemAppRequireSession_() vẫn
 * trả về ({name, role, saleId}) nên phần còn lại của backend không phải sửa.
 *
 * name lấy từ claim.n — tên đăng nhập OEM vốn đang dùng, KHÔNG phải mã chuẩn
 * của Karofi ID: OEM khoá gần như mọi thứ theo tên (lọc khách hàng theo sale,
 * ghi người tạo đơn), đổi tên là làm lệch dữ liệu đã có.
 *
 * Xem thêm gas/KarofiToken.gs (bản dùng chung, giống hệt ở cả 4 dự án).
 */

function karofiSessionForOEM_(token) {
  var payload = karofiParseToken_(token);
  if (!payload) return null;

  var claim = karofiAppClaim_(payload, 'OEM');
  if (!claim || !claim.n) {
    throw new Error('Tài khoản của bạn chưa được cấp quyền vào app OEM.');
  }

  return {
    name: String(claim.n),
    role: String(claim.r || 'sale').toLowerCase(),
    saleId: String(claim.sid || ''),
    _kid: true                      // phiên đến từ Karofi ID
  };
}
