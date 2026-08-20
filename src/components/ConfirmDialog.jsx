import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

// Replaces window.confirm(), which is an unstyled OS prompt that blocks the
// browser and gives a permanently destructive action ("xóa TOÀN BỘ đơn hàng…
// Không thể hoàn tác") exactly the same weight as a trivial one.
//
// Closes on Escape and on backdrop click, moves focus to the confirm button on
// open, and restores it to whatever was focused before — none of which the eight
// hand-rolled overlays elsewhere in the app do.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  destructive = false,
  onConfirm,
  onCancel
}) {
  const confirmRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    if (confirmRef.current) confirmRef.current.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
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
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
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
          <button type="button" onClick={onCancel} className="btn btn-secondary">{cancelLabel}</button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="btn btn-primary"
            style={destructive ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
