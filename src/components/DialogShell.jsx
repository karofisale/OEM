import React, { useEffect, useRef } from 'react';

// Lớp thấp nhất của mọi hộp thoại: overlay + role/aria + focus + phím.
// ConfirmDialog và Modal đều dựng trên đây (xem Modal.jsx) — tách ra để
// ConfirmDialog không phải import Modal (Modal cần ConfirmDialog cho câu hỏi
// "Bỏ nội dung đã nhập?", sẽ thành vòng tròn import).
//
// Hành vi:
//   - role (dialog | alertdialog) + aria-modal + aria-labelledby/aria-label;
//   - Esc -> onEscape (nếu có); bấm nền -> onBackdrop (nếu có). `busy` chặn cả hai;
//   - Enter (khi con trỏ KHÔNG ở nút/ô nhiều dòng) -> onEnter (đồng ý);
//   - tự focus phần tử có data-autofocus, không thì ô nhập đầu, không thì nút đầu;
//     trả focus về chỗ cũ khi đóng; Tab quay vòng trong hộp;
//   - nhiều hộp chồng nhau: chỉ hộp trên cùng nhận phím.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIELD = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select:not([disabled]), textarea:not([disabled])';

// Ngăn xếp các hộp đang mở; chỉ phần tử cuối (trên cùng) xử lý phím.
const stack = [];

export default function DialogShell({
  role = 'dialog',
  titleId,
  ariaLabel,
  busy = false,
  zIndex = 1000,
  width = 480,
  className = '',
  style,
  onEscape,
  onBackdrop,
  onEnter,
  paused = false,
  children
}) {
  const dialogRef = useRef(null);
  const tokenRef = useRef({});

  // Đọc qua ref để listener (gắn một lần) luôn thấy giá trị mới nhất.
  const live = useRef({});
  live.current = { onEscape, onBackdrop, onEnter, busy, paused };

  useEffect(() => {
    const prev = document.activeElement;
    const token = tokenRef.current;
    stack.push(token);

    const root = dialogRef.current;
    if (root && !root.contains(document.activeElement)) {
      const target = root.querySelector('[data-autofocus]') || root.querySelector(FIELD) || root.querySelector(FOCUSABLE) || root;
      if (target && target.focus) target.focus();
    }

    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return;   // không phải hộp trên cùng
      if (live.current.paused) return;                 // đang có hộp con giữ phím
      if (e.key === 'Escape') {
        if (!live.current.onEscape) return;
        e.stopPropagation();
        if (!live.current.busy) live.current.onEscape();
        return;
      }
      if (e.key === 'Tab' && root) {
        const els = Array.from(root.querySelectorAll(FOCUSABLE));
        if (!els.length) { e.preventDefault(); root.focus(); return; }
        const first = els[0], last = els[els.length - 1];
        const act = document.activeElement;
        if (!root.contains(act)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && (act === first || act === root)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      if (prev && prev.focus && document.contains(prev)) prev.focus();
    };
  }, []);

  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || !onEnter || busy || paused) return;
    const tag = (e.target && e.target.tagName) || '';
    // Nút/liên kết tự xử lý Enter; ô nhiều dòng cần Enter để xuống dòng; form gửi theo cách của nó.
    if (tag === 'BUTTON' || tag === 'A' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'INPUT') return;
    e.preventDefault();
    onEnter();
  };

  return (
    <div
      className="modal-overlay"
      style={{ zIndex }}
      // mousedown (không phải click): bắt đầu kéo bôi đen chữ trong ô nhập rồi
      // thả chuột ra ngoài nền sẽ không đóng hộp nhầm.
      onMouseDown={(e) => { if (e.target === e.currentTarget && onBackdrop && !busy) onBackdrop(); }}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : ariaLabel}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={('glass-card modal-card animate-fade-in ' + className).trim()}
        style={{ width: width + 'px', ...style }}
      >
        {children}
      </div>
    </div>
  );
}
