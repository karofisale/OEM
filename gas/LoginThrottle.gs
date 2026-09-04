/**
 * LoginThrottle.gs — đếm lần nhập sai PIN và tạm khoá tài khoản.
 *
 * BẢN DÙNG CHUNG: file này giống hệt nhau ở app OEM (`gas/LoginThrottle.gs`)
 * và app Xuất khẩu (`gas/LoginThrottle.js`), cùng kiểu với PinHash và
 * KarofiToken. Sửa một bên thì chép sang bên kia — bộ test của Karofi ID có
 * một mục so hai file từng byte để phát hiện nếu chúng trôi lệch.
 *
 * Vì sao cần: Karofi ID và FC khoá tài khoản 15 phút sau 5 lần sai. Hai app
 * này thì không đếm gì cả — chỉ ném lỗi rồi thôi. Mà cả hai backend deploy ở
 * chế độ "Anyone", nghĩa là gọi được từ internet, và danh sách tên đăng nhập
 * lấy được không cần token. Ghép lại: liệt kê người dùng rồi dò PIN không giới
 * hạn. PIN ở đây ngắn nhất là 4 ký tự — 10.000 khả năng, máy dò xong trong
 * vài phút.
 *
 * ĐÂY LÀ GỜ GIẢM TỐC, KHÔNG PHẢI KHOÁ CHẮC. Bộ đếm nằm trong CacheService,
 * mà cache có thể bị dọn bất cứ lúc nào (hết chỗ, script deploy lại) — mất bộ
 * đếm thì người dò được thêm 5 lượt. Cố ý chọn như vậy: Karofi ID/FC ghi số
 * lần sai xuống Sheet nên bền, nhưng chúng đếm cho ĐƯỜNG ĐĂNG NHẬP CHÍNH, còn
 * hai đường này giờ chỉ là lối dự phòng ?direct=1 — ghi Sheet mỗi lần gõ sai
 * là trả giá quá đắt cho một đường ít dùng, và còn mở thêm một đường ghi
 * không cần khoá. Muốn chắc hơn thì đóng hẳn đăng nhập riêng, không phải làm
 * bộ đếm bền hơn.
 *
 * Chỉ chặn theo TỪNG TÊN, không chặn theo nguồn gọi: Apps Script không cho
 * đọc IP người gọi. Nên nó cản được kiểu "dò một tài khoản", không cản được
 * kiểu "thử một PIN phổ biến trên tất cả mọi tên". Cản được kiểu thứ hai phải
 * đổi sang PIN dài hơn hoặc đăng nhập Workspace — xem giai đoạn 3.
 *
 * Phụ thuộc pinSha256Hex_ trong PinHash (cùng phạm vi toàn cục, Apps Script
 * gộp mọi file của dự án làm một) — băm tên để khoá cache không dính ký tự lạ
 * và không lộ tên người dùng cho ai đọc được cache.
 */

var LOGIN_MAX_FAILS_ = 5;
var LOGIN_LOCK_SEC_ = 15 * 60;

/** Khoá cache của một tên đăng nhập. Không phân biệt hoa thường, bỏ khoảng trắng thừa. */
function loginThrottleKey_(name) {
  return 'lf_' + pinSha256Hex_(String(name == null ? '' : name).trim().toLowerCase()).slice(0, 32);
}

function loginThrottleCache_() {
  return CacheService.getScriptCache();
}

/**
 * Gọi TRƯỚC khi đối chiếu PIN. Đang bị khoá thì ném lỗi.
 *
 * Ném cùng một câu cho mọi tài khoản đang khoá, kể cả tên không có thật, để
 * không ai dùng nó mà dò xem tên nào tồn tại.
 */
function loginThrottleAssert_(name) {
  var raw;
  try {
    raw = loginThrottleCache_().get(loginThrottleKey_(name));
  } catch (e) {
    return; // cache hỏng thì không chặn ai — thà cho vào còn hơn khoá cả phòng
  }
  var n = parseInt(raw, 10) || 0;
  if (n >= LOGIN_MAX_FAILS_) {
    throw new Error(
      'Sai PIN quá ' + LOGIN_MAX_FAILS_ + ' lần. Tài khoản tạm khoá ' +
      (LOGIN_LOCK_SEC_ / 60) + ' phút — thử lại sau, hoặc đăng nhập ở cổng VHKD.'
    );
  }
}

/**
 * Gọi khi PIN SAI. Trả về số lượt còn lại (0 = vừa bị khoá).
 *
 * Mỗi lần sai đều đặt lại TTL về đủ 15 phút, nên gõ sai liên tục là kéo dài
 * thời gian khoá chứ không rút ngắn.
 */
function loginThrottleFail_(name) {
  var key = loginThrottleKey_(name);
  var cache;
  try {
    cache = loginThrottleCache_();
    var n = (parseInt(cache.get(key), 10) || 0) + 1;
    cache.put(key, String(n), LOGIN_LOCK_SEC_);
    return Math.max(0, LOGIN_MAX_FAILS_ - n);
  } catch (e) {
    return LOGIN_MAX_FAILS_; // không đếm được thì đừng doạ nhầm người dùng
  }
}

/** Gọi khi đăng nhập ĐÚNG — xoá sạch lịch sử gõ sai của tên đó. */
function loginThrottleReset_(name) {
  try {
    loginThrottleCache_().remove(loginThrottleKey_(name));
  } catch (e) { /* không xoá được thì bộ đếm tự hết hạn sau 15 phút */ }
}
