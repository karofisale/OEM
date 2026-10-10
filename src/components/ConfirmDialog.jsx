import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

// Replaces window.confirm(), which is an unstyled OS prompt that blocks the
// browser and gives a permanently destructive action ("xóa TOÀN BỘ đơn hàng…
// Không thể hoàn tác") exactly the same weight as a trivial one.
//
// Closes on Escape and on backdrop click, moves focus to the confirm button on
// open, and restores it to whatever was focused before — none of which the eight
// hand-rolled overlays elsewhere in the app do.
//
// `busy` (09/10/2026): đang gửi lệnh thì khoá CẢ HAI nút và bỏ qua Esc / bấm nền.
// Trước đây hộp vẫn bấm được trong lúc chờ server -> bấm Xác nhận lần hai là gửi
// trùng lệnh ghi (đề xuất giá, duyệt kế hoạch, gửi SOP...). Bên gọi vẫn phải tự
// chặn `if (busy) return` trong handler — prop này chỉ là nửa giao diện.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  destructive = false,
  busy = false,
  busyLabel = 'Đang xử lý...',
  onConfirm,
  onCancel
}) {
  const confirmRef = useRef(null);
  const previouslyFocused = useRef(null);
  // Đọc qua ref để listener Esc (gắn một lần) luôn thấy giá trị busy mới nhất.
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    if (confirmRef.current) confirmRef.current.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (!busyRef.current) onCancel(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused.current && previouslyFocused.current.focus) {
        previouslyFocused.current.focus();
      }
    };
  }, [onCancel]);

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2500
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy || undefined}
        className="glass-card animate-fade-in"
        style={{ width: '420px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          {destructive && <AlertTriangle size={20} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />}
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>{title}</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
              {message}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={busy}>{cancelLabel}</button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => { if (!busy) onConfirm(); }}
            className="btn btn-primary"
            disabled={busy}
            style={destructive ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
