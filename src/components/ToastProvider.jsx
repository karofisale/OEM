import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

// In-app notifications, replacing 15 native alert() calls.
//
// alert() blocks the browser thread until dismissed, is unstyled and unbranded,
// is barely readable on a phone, and — the real problem — it stops the app dead
// for something as routine as "the Sheet write failed, try again". Toasts say
// the same thing without seizing the page.
//
// Errors stay until dismissed: a failed Sheet write is something the user has to
// act on, so it must not disappear while they are looking elsewhere.
const ToastContext = createContext(null);

const AUTO_DISMISS_MS = 5000;

const VARIANTS = {
  success: { Icon: CheckCircle2, bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', color: 'var(--success-text)' },
  error:   { Icon: AlertCircle,  bg: 'rgba(220, 38, 38, 0.12)',  border: 'rgba(220, 38, 38, 0.35)',  color: 'var(--danger-strong)' },
  info:    { Icon: Info,         bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.35)', color: 'var(--info-text)' }
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((message, variant = 'info') => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message: String(message), variant }]);
    // Errors are sticky — the user usually has to do something about them.
    if (variant !== 'error') {
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    }
    return id;
  }, [dismiss]);

  const api = useRef({
    error: (m) => push(m, 'error'),
    success: (m) => push(m, 'success'),
    info: (m) => push(m, 'info')
  });
  // Keep the stable object's methods pointing at the current push.
  api.current.error = (m) => push(m, 'error');
  api.current.success = (m) => push(m, 'success');
  api.current.info = (m) => push(m, 'info');

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div
        // aria-live so screen readers announce failures that used to arrive as a
        // blocking dialog.
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed', top: '16px', right: '16px', zIndex: 3000,
          display: 'flex', flexDirection: 'column', gap: '10px',
          maxWidth: 'min(420px, calc(100vw - 32px))'
        }}
      >
        {toasts.map(t => {
          const v = VARIANTS[t.variant] || VARIANTS.info;
          const Icon = v.Icon;
          return (
            <div
              key={t.id}
              className="animate-fade-in"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '12px 14px', borderRadius: 'var(--radius-md)',
                background: v.bg, border: `1px solid ${v.border}`, color: v.color,
                boxShadow: 'var(--shadow-md)', fontSize: '0.85rem', fontWeight: 600,
                backdropFilter: 'blur(8px)'
              }}
            >
              <Icon size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span style={{ flex: 1, lineHeight: 1.45, wordBreak: 'break-word' }}>{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Đóng thông báo"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'inherit', opacity: 0.7, flexShrink: 0, lineHeight: 0
                }}
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast phải nằm trong <ToastProvider>');
  return ctx;
}
