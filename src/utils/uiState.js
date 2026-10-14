// Nhớ tab đang mở + bộ lọc (tháng, khách, trạng thái...) qua F5, bằng localStorage.
//
// Mọi truy cập đều bọc try/catch: chế độ riêng tư, bị chặn cookie/site data hoặc
// hết dung lượng đều ném lỗi — app phải chạy bình thường, chỉ là không nhớ được.
//
// Khoá có tiền tố phạm vi (tên người đăng nhập): máy dùng chung mà người khác vào
// thì không thừa hưởng bộ lọc của người trước (đặc biệt là lọc theo Sale).

const PREFIX = 'oem_ui_v1:';
let scope = '';

/** Đặt người đang dùng (gọi một lần khi có phiên). */
export function setUiScope(name) {
  scope = String(name || '').trim().toLowerCase();
}

export function getUiScope() {
  return scope;
}

const fullKey = (key) => PREFIX + scope + ':' + key;

function store() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // truy cập localStorage cũng có thể ném (bị chặn)
  }
}

/** Đọc giá trị đã lưu; không có / hỏng / không qua `validate` thì trả `fallback`. */
export function readUi(key, fallback, validate) {
  try {
    const s = store();
    if (!s) return fallback;
    const raw = s.getItem(fullKey(key));
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    if (validate && !validate(v)) return fallback;
    return v;
  } catch {
    return fallback;
  }
}

// Bộ lắng nghe ghi (services/prefsSync.js): được báo mỗi khi nơi KHÁC (không phải chính bộ đồng bộ) ghi một khoá,
// để đẩy các khoá sở thích lên máy chủ. Lỗi trong bộ lắng nghe không bao giờ làm hỏng việc ghi.
let writeListener = null;
export function setUiWriteListener(fn) { writeListener = typeof fn === 'function' ? fn : null; }

/** Ghi giá trị; trả true nếu ghi được. Không bao giờ ném lỗi. `silent` = đừng báo bộ lắng nghe (bộ đồng bộ tự ghi). */
export function writeUi(key, value, silent) {
  if (!silent && writeListener) { try { writeListener(key, value); } catch { /* không ảnh hưởng việc ghi */ } }
  try {
    const s = store();
    if (!s) return false;
    if (value === undefined) s.removeItem(fullKey(key));
    else s.setItem(fullKey(key), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearUi(key, silent) {
  return writeUi(key, undefined, silent);
}
