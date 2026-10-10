// Sổ đăng ký "màn nào đang có thay đổi chưa lưu".
//
// Thuần JS, không React: hook useUnsavedGuard đăng ký vào đây, còn trình xử lý
// `beforeunload` (F5 / đóng tab / bấm link Portal) và hộp thoại chuyển tab đọc ra.
//
// `version` tăng mỗi khi có mục MỚI chuyển sang "chưa lưu" — để hộp thoại chuyển
// tab chỉ hỏi một lần cho mỗi đợt thay đổi, không hỏi lại ở mọi lần bấm tab sau
// (xem NavGuard).

const dirty = new Map(); // id -> nhãn hiển thị
const listeners = new Set();
let version = 0;
let installed = false;

const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* người nghe hỏng không được chặn nhau */ } });

/** Đăng ký / gỡ trạng thái chưa lưu của một màn. */
export function setDirty(id, isDirty, label) {
  const had = dirty.has(id);
  if (isDirty) {
    const nhan = label || '';
    if (!had) version++;
    if (!had || dirty.get(id) !== nhan) { dirty.set(id, nhan); notify(); }
    installBeforeUnload();
  } else if (had) {
    dirty.delete(id);
    notify();
  }
}

export function hasDirty() {
  return dirty.size > 0;
}

/** Danh sách nhãn (bỏ trống, bỏ trùng) của các màn đang chưa lưu. */
export function dirtyLabels() {
  return Array.from(new Set(Array.from(dirty.values()).filter(Boolean)));
}

export function dirtyVersion() {
  return version;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Trình xử lý `beforeunload`: chỉ chặn khi thật sự còn thay đổi chưa lưu. */
export function beforeUnloadHandler(e) {
  if (!hasDirty()) return undefined;
  e.preventDefault();
  e.returnValue = ''; // Chrome cần dòng này mới hiện hộp thoại của trình duyệt
  return '';
}

/** Gắn một trình xử lý duy nhất vào window (idempotent). */
export function installBeforeUnload(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w || installed) return false;
  w.addEventListener('beforeunload', beforeUnloadHandler);
  installed = true;
  return true;
}

/** Chỉ cho test. */
export function _resetUnsavedGuard() {
  dirty.clear();
  listeners.clear();
  version = 0;
  installed = false;
}
