/**
 * PinHash.gs — băm PIN cho tab Users, thay cho việc lưu PIN dạng thô.
 *
 * BẢN DÙNG CHUNG: file này giống hệt nhau ở app OEM (`gas/PinHash.gs`) và app
 * Xuất khẩu (`gas/PinHash.js`), cùng kiểu với KarofiToken. Sửa một bên thì
 * chép sang bên kia, đừng để hai bản trôi khác nhau.
 *
 * Vì sao cần: cả hai app đang so PIN bằng `record === pin`, nghĩa là PIN thật
 * nằm nguyên văn trong Sheet. Mà ID của chính Sheet đó đã nằm trong repo mã
 * nguồn công khai. Hiện không ai ngoài tổ chức mở được file (đã kiểm quyền
 * chia sẻ), nhưng "PIN chỉ được che bởi một thiết lập chia sẻ" là một lớp
 * phòng thủ duy nhất — ai được cấp quyền xem file, kể cả để xem việc khác,
 * là đọc được PIN của tất cả mọi người.
 *
 * Thuật toán: giống Karofi ID — sha256(pepper | salt | pin), salt ngẫu nhiên
 * mỗi lần đặt PIN nên hai người trùng PIN vẫn ra hai bản ghi khác nhau.
 *
 *   s1$<salt>$<hash>
 *
 * Có tiền tố thuật toán vì tab Users không có cột ghi thuật toán như Karofi
 * ID; nhìn giá trị là biết nó đã băm hay còn thô, và sau này đổi thuật toán
 * thì các bản ghi cũ vẫn tự nhận ra được.
 *
 * CẢNH BÁO VẬN HÀNH: pepper nằm trong Script Property `PIN_PEPPER` của CHÍNH
 * dự án này. Mất property đó là không xác thực lại được bản ghi nào nữa —
 * phải đặt lại PIN cho tất cả mọi người. Nó tự sinh lần đầu và không bao giờ
 * được ghi ra log.
 */

var PIN_PEPPER_PROP_ = 'PIN_PEPPER';
var PIN_ALGO_ = 's1';

function pinPepper_() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty(PIN_PEPPER_PROP_);
  if (!p) {
    p = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(PIN_PEPPER_PROP_, p);
  }
  return p;
}

function pinSha256Hex_(raw) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ((b < 0 ? b + 256 : b) + 0x100).toString(16).slice(1);
  }).join('');
}

/** Đã băm chưa? PIN thô toàn chữ số nên không bao giờ chứa tiền tố này. */
function pinIsHashed_(record) {
  return String(record || '').indexOf(PIN_ALGO_ + '$') === 0;
}

/** Bản ghi mới cho một PIN. */
function pinRecord_(pin) {
  var salt = Utilities.getUuid();
  return PIN_ALGO_ + '$' + salt + '$' +
         pinSha256Hex_(pinPepper_() + '|' + salt + '|' + String(pin).trim());
}

/**
 * Kiểm PIN với bản ghi đang lưu.
 *
 * Chấp nhận kép trong lúc chuyển đổi: bản ghi chưa băm thì so thẳng như cũ,
 * nên không ai bị khoá ngoài giữa chừng. Nơi gọi nên băm lại ngay sau khi
 * đăng nhập đúng (xem pinNeedsUpgrade_) để bản ghi thô tự biến mất dần.
 *
 * Không dùng so sánh chống đo thời gian: PIN đi qua Apps Script với độ trễ
 * hàng trăm mili-giây, chênh lệch vài micro-giây không đo được qua đó.
 */
function pinVerify_(pin, record) {
  var r = String(record == null ? '' : record).trim();
  var p = String(pin == null ? '' : pin).trim();
  if (!r || !p) return false;

  if (!pinIsHashed_(r)) return r === p;      // bản ghi đời cũ, còn dạng thô

  var parts = r.split('$');
  if (parts.length !== 3) return false;
  return pinSha256Hex_(pinPepper_() + '|' + parts[1] + '|' + p) === parts[2];
}

/** Bản ghi còn dạng thô -> nên băm lại sau khi người này đăng nhập đúng. */
function pinNeedsUpgrade_(record) {
  var r = String(record == null ? '' : record).trim();
  return !!r && !pinIsHashed_(r);
}
