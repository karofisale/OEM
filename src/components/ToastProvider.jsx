import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { themToast, boToast, hetHan, giaHan, canDongHo } from '../utils/toastQueue';
import { lamSachLoi } from '../utils/errorText';

// Thông báo trong app, thay 15 lệnh alert() gốc.
//
// alert() chặn luồng trình duyệt tới khi bấm đóng, không có kiểu dáng và khó đọc
// trên điện thoại — nhất là với việc thường ngày như "ghi Sheet lỗi, thử lại".
//
// Hàng đợi (Đợt 2 / mục 2, logic thuần ở utils/toastQueue.js):
//  - nhiều toast xếp chồng, cái sau không xoá cái trước;
//  - toast LỖI không tự tắt và có nút ×; toast thường tự tắt sau ~4 giây;
//  - rê chuột vào vùng toast thì tạm dừng đếm giờ;
//  - chữ ký cũ giữ nguyên: toast.error(msg) / success(msg) / info(msg). Thêm tuỳ
//    chọn thứ hai: toast.info(msg, { ms: 8000 }) hoặc { ms: 0 } để giữ lại.
const ToastContext = createContext(null);

const VARIANTS = {
  success: { Icon: CheckCircle2, bg: 'var(--success-bg)', border: 'rgba(16, 185, 129, 0.35)', color: 'var(--success-text)' },
  error:   { Icon: AlertCircle,  bg: 'var(--danger-bg)',  border: 'rgba(220, 38, 38, 0.35)',  color: 'var(--danger-strong)' },
  info:    { Icon: Info,         bg: 'var(--info-bg)',    border: 'rgba(59, 130, 246, 0.35)', color: 'var(--info-text)' }
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const hovering = useRef(false);

  const dismiss = useCallback((id) => {
    setToasts((prev) => boToast(prev, id));
  }, []);

  const push = useCallback((message, bien, opts) => {
    const id = nextId.current++;
    setToasts((prev) => themToast(prev, message, { id, bien, ms: opts && opts.ms }));
    return id;
  }, []);

  // Một đồng hồ chung (thay vì một setTimeout mỗi toast) để gộp/gia hạn không để
  // lại timer mồ côi. Chỉ chạy khi còn toast tự tắt.
  const canDong = canDongHo(toasts);
  useEffect(() => {
    if (!canDong) return undefined;
    const h = setInterval(() => {
      if (hovering.current) return;
      setToasts((prev) => hetHan(prev, Date.now()));
    }, 400);
    return () => clearInterval(h);
  }, [canDong]);

  const api = useRef({});
  // Toast lỗi đi qua lamSachLoi (Đợt 3): lỗi Postgres/server thô -> tiếng Việt + mã tham chiếu.
  api.current.error = (m, o) => push(lamSachLoi(m), 'error', o);
  api.current.success = (m, o) => push(m, 'success', o);
  api.current.info = (m, o) => push(m, 'info', o);
  api.current.dismiss = dismiss;
  api.current.clear = () => setToasts([]);

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div
        className="toast-stack"
        // Vùng tin nhắn chung để trình đọc màn hình đọc; lỗi có role=alert riêng.
        role="region"
        aria-label="Thông báo"
        onMouseEnter={() => { hovering.current = true; }}
        onMouseLeave={() => { hovering.current = false; setToasts((prev) => giaHan(prev, Date.now())); }}
      >
        {toasts.map((t) => {
          const v = VARIANTS[t.bien] || VARIANTS.info;
          const Icon = v.Icon;
          return (
            <div
              key={t.id}
              role={t.bien === 'error' ? 'alert' : 'status'}
              className="animate-fade-in toast-item"
              style={{ background: v.bg, border: `1px solid ${v.border}`, color: v.color }}
            >
              <Icon size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span style={{ flex: 1, lineHeight: 1.45, wordBreak: 'break-word' }}>
                {t.message}
                {t.count > 1 && <strong style={{ marginLeft: '6px' }}>×{t.count}</strong>}
              </span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Đóng thông báo"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.8, flexShrink: 0, lineHeight: 0 }}
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
        {toasts.length >= 3 && (
          <button type="button" className="btn btn-secondary btn-sm toast-clear" onClick={() => setToasts([])}>
            Đóng tất cả ({toasts.length})
          </button>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast phải nằm trong <ToastProvider>');
  return ctx;
}
