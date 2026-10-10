import React, { useId } from 'react';
import { AlertTriangle } from 'lucide-react';
import DialogShell from './DialogShell';

// Hộp xác nhận thay window.confirm() — một khung với mọi modal khác (DialogShell):
// role=alertdialog + aria-modal, Esc huỷ, Enter đồng ý, tự focus nút xác nhận,
// trả focus về chỗ cũ, bấm nền huỷ.
//
// Nhãn nút PHẢI nói đúng hành động ("Xoá dòng", "Gửi duyệt", "Duyệt & áp dụng"),
// không dùng "OK" trơ trọi. Hành động phá dữ liệu: truyền `danger` -> nút đỏ.
// (`destructive` là tên cũ, vẫn nhận.)
//
// `busy` (09/10/2026): đang gửi lệnh thì khoá CẢ HAI nút và bỏ qua Esc / Enter /
// bấm nền. Trước đây hộp vẫn bấm được trong lúc chờ server -> bấm Xác nhận lần hai
// là gửi trùng lệnh ghi (đề xuất giá, duyệt kế hoạch, gửi SOP...). Bên gọi vẫn phải
// tự chặn `if (busy) return` trong handler — prop này chỉ là nửa giao diện.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Đồng ý',
  cancelLabel = 'Hủy',
  danger = false,
  destructive = false,
  busy = false,
  busyLabel = 'Đang xử lý...',
  zIndex = 2500,
  onConfirm,
  onCancel
}) {
  const isDanger = danger || destructive;
  const reactId = useId();
  const titleId = 'confirm-title-' + reactId.replace(/:/g, '');

  return (
    <DialogShell
      role="alertdialog"
      titleId={titleId}
      busy={busy}
      zIndex={zIndex}
      width={420}
      onEscape={onCancel}
      onBackdrop={onCancel}
      onEnter={onConfirm}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        {isDanger && <AlertTriangle size={20} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />}
        <div>
          <h3 id={titleId} style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>{title}</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
            {message}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={busy}>{cancelLabel}</button>
        <button
          data-autofocus
          type="button"
          onClick={() => { if (!busy) onConfirm(); }}
          className={isDanger ? 'btn btn-danger' : 'btn btn-primary'}
          disabled={busy}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}
