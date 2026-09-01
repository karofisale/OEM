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

// Public (no token needed) — used to populate the login picker. Never
// includes the PIN column.

// Public (no token needed) — used to populate the login picker. Never
// includes the PIN column.
function oemAppGetUserList_() {
  var rows = oemAppGetRows_(OEMAPP_GIDS.USERS);
  return rows.slice(1)
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        name: String(r[0]),
        role: String(r[2] || 'sale').toLowerCase(),
        saleId: String(r[4] || r[3] || '')
      };
    });
}


function oemAppLogin_(name, pin) {
  var row = oemAppFindUserRow_(name);
  if (!row || String(row[1]) !== String(pin)) {
    throw new Error('Sai tên đăng nhập hoặc mã PIN.');
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
  if (String(rows[rowIndex][1]) !== String(oldPin)) {
    throw new Error('Mã PIN hiện tại không đúng.');
  }
  sheet.getRange(rowIndex + 1, 2).setValue(String(newPin));
  return { ok: true };
}

// ---------- Data readers (all require a valid session) ----------
