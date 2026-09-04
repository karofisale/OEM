/** Login (PIN + tab Users), session tokens (CacheService), change-PIN. */

// ---------- Auth ----------

function oemAppFindUserRow_(name) {
  var rows = oemAppGetRows_(OEMAPP_GIDS.USERS);
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(name).trim().toLowerCase()) {
      return rows[i];
    }
  }
  return null;
}

/**
 * Danh sách tên cho ô chọn ở màn hình đăng nhập DỰ PHÒNG (?direct=1).
 *
 * Bắt buộc mở, không kiểm token: chưa đăng nhập thì lấy đâu ra token. Mà
 * backend này deploy ở chế độ "Anyone", nên bất cứ ai trên internet cũng gọi
 * được — coi kết quả của hàm này là công khai.
 *
 * Vì vậy chỉ trả về TÊN. Bản cũ trả kèm role và saleId, tức công bố luôn ai là
 * admin, ai là creator — đúng thứ người muốn dò PIN cần để chọn mục tiêu. Cái
 * giá phải trả là màn hình dự phòng mất cái huy hiệu vai trò, không đáng kể.
 *
 * Không bao giờ chạm cột PIN.
 */
function oemAppGetUserList_() {
  var rows = oemAppGetRows_(OEMAPP_GIDS.USERS);
  return rows.slice(1)
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { name: String(r[0]) }; });
}


function oemAppLogin_(name, pin) {
  // Chặn dò PIN: đếm lần sai và tạm khoá — xem LoginThrottle.gs. Kiểm TRƯỚC
  // khi đọc tab Users, để lượt gọi của người đang bị khoá không tốn một lượt
  // đọc Sheet nào.
  loginThrottleAssert_(name);

  var row = oemAppFindUserRow_(name);
  if (!row || !pinVerify_(pin, row[1])) {
    // Đếm cả trường hợp tên không tồn tại: nếu chỉ đếm khi tên có thật thì
    // "gõ mãi không bị khoá" trở thành cách dò xem tên nào không tồn tại.
    var conLai = loginThrottleFail_(name);
    throw new Error('Sai tên đăng nhập hoặc mã PIN.' +
      (conLai > 0 ? ' Còn ' + conLai + ' lần thử.' : ''));
  }
  loginThrottleReset_(name);
  // Băm lại ngay khi ai đó đăng nhập bằng PIN còn dạng thô. Không chờ đợt
  // chuyển đổi hàng loạt, và cũng không thay thế nó: người nào không bao giờ
  // đăng nhập thẳng vào OEM nữa (giờ luồng chính là cổng VHKD) thì bản ghi
  // thô của họ chỉ biến mất khi chạy setup_hashAllPins().
  if (pinNeedsUpgrade_(row[1])) {
    try {
      oemAppWritePinRecord_(String(row[0]), pinRecord_(pin));
    } catch (e) {
      // Ghi hỏng thì vẫn cho đăng nhập — PIN vừa nhập là đúng. Lần sau thử lại.
    }
  }
  var user = {
    name: String(row[0]),
    role: String(row[2] || 'sale').toLowerCase(),
    saleId: String(row[4] || row[3] || '')
  };
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(token, JSON.stringify(user), OEMAPP_SESSION_TTL_SECONDS);
  return { token: token, user: user };
}


function oemAppRequireSession_(token) {
  // Chấp nhận kép (Karofi ID, 2026-08): token dùng chung của cổng VHKD được
  // kiểm chữ ký tại chỗ, không gọi mạng. Không phải token Karofi ID thì rơi
  // xuống phiên cũ trong CacheService, nên không ai bị đăng xuất lúc deploy.
  var shared = karofiSessionForOEM_(token);
  if (shared) return shared;

  var raw = token ? CacheService.getScriptCache().get(token) : null;
  if (!raw) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
  return JSON.parse(raw);
}


function oemAppChangePassword_(token, oldPin, newPin) {
  var user = oemAppRequireSession_(token);
  // Phiên từ Karofi ID: PIN không còn ở tab Users của Sheet OEM nữa, ghi vào
  // đây là đổi một giá trị không ai dùng để xác thực.
  if (user && user._kid) {
    throw new Error('Đổi PIN tại cổng VHKD — một PIN dùng chung cho cả ba app.');
  }
  if (!newPin || String(newPin).length < 4) {
    throw new Error('Mã PIN mới phải có ít nhất 4 ký tự.');
  }
  var sheet = oemAppGetSheetByGid_(OEMAPP_GIDS.USERS);
  var rows = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(user.name).trim().toLowerCase()) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex === -1) throw new Error('Không tìm thấy tài khoản.');
  if (!pinVerify_(oldPin, rows[rowIndex][1])) {
    throw new Error('Mã PIN hiện tại không đúng.');
  }
  sheet.getRange(rowIndex + 1, 2).setValue(pinRecord_(newPin));
  return { ok: true };
}

/** Ghi bản ghi PIN cho một người, tìm theo tên ở cột A. */
function oemAppWritePinRecord_(name, record) {
  var sheet = oemAppGetSheetByGid_(OEMAPP_GIDS.USERS);
  var rows = sheet.getDataRange().getValues();
  var muc = String(name).trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === muc) {
      sheet.getRange(i + 1, 2).setValue(record);
      return true;
    }
  }
  return false;
}

/**
 * Băm toàn bộ PIN còn dạng thô trong tab Users. Chạy tay MỘT LẦN trong Apps
 * Script editor. Mặc định chạy thử; truyền true mới ghi thật:
 *
 *   setup_hashAllPins()        xem sẽ đổi những dòng nào
 *   setup_hashAllPins(true)    ghi thật
 *
 * Không in PIN ra log — mục đích của việc này là để PIN thôi nằm ở chỗ đọc được.
 * Chạy lại lần nữa vô hại: bản ghi đã băm thì bỏ qua.
 */
function setup_hashAllPins(apply) {
  var sheet = oemAppGetSheetByGid_(OEMAPP_GIDS.USERS);
  var rows = sheet.getDataRange().getValues();
  var doi = [], daBam = 0, trong = 0;

  for (var i = 1; i < rows.length; i++) {
    var ten = String(rows[i][0] || '').trim();
    if (!ten) continue;
    var rec = String(rows[i][1] == null ? '' : rows[i][1]).trim();
    if (!rec) { trong++; continue; }
    if (pinIsHashed_(rec)) { daBam++; continue; }
    doi.push({ dong: i + 1, ten: ten, pin: rec });
  }

  var out = ['=== BĂM PIN TAB USERS ===',
             'Đã băm sẵn: ' + daBam + ' · ô PIN trống: ' + trong +
             ' · còn dạng thô: ' + doi.length];

  if (!doi.length) {
    out.push('Không còn gì để làm.');
  } else if (!apply) {
    out.push('CHẠY THỬ — chưa ghi gì. Sẽ băm PIN của: ' +
             doi.map(function (d) { return d.ten; }).join(', '));
    out.push('Ghi thật: setup_hashAllPins(true)');
  } else {
    doi.forEach(function (d) {
      sheet.getRange(d.dong, 2).setValue(pinRecord_(d.pin));
    });
    SpreadsheetApp.flush();
    out.push('ĐÃ BĂM ' + doi.length + ' dòng. PIN của mọi người KHÔNG đổi —');
    out.push('họ vẫn đăng nhập bằng đúng PIN cũ, chỉ khác là Sheet không còn lưu nó.');
  }

  Logger.log(out.join(String.fromCharCode(10)));
  return out.join(String.fromCharCode(10));
}

/**
 * Bấm Run cho hàm này để BĂM THẬT.
 *
 * Cần một hàm riêng vì nút Run của trình soạn thảo Apps Script không truyền
 * tham số nào: chọn setup_hashAllPins rồi bấm Run thì apply là undefined, và
 * nó chỉ chạy thử. Đúng lý do đã phải thêm run_setPins bên Karofi ID.
 *
 * Trình tự nên theo:
 *   1. Chạy setup_hashAllPins  -> xem danh sách sẽ đổi, chưa ghi gì
 *   2. Chạy run_bamPin         -> ghi thật
 *
 * PIN của mọi người KHÔNG đổi. Chạy lại lần nữa vô hại.
 */
function run_bamPin() {
  return setup_hashAllPins(true);
}

// ---------- Data readers (all require a valid session) ----------
