import React, { useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import DialogShell from './DialogShell';

// Hộp xác nhận KÈM Ô LÝ DO (Đợt 3): "Từ chối" một đợt giá không còn là một cú bấm trơ trọi — người từ chối
// phải nói vì sao, để người đề xuất biết sửa gì. Dựng trên DialogShell như mọi hộp thoại khác nên có sẵn
// role/aria-modal, Esc huỷ, focus vào ô lý do, trả focus về chỗ cũ; `busy` chặn Esc/bấm nền/nút.
//
//   <ReasonDialog title="Từ chối đợt đề xuất này?" message="…" reasonLabel="Lý do từ chối"
//                 confirmLabel="Từ chối đợt" danger busy={saving} onConfirm={(lyDo) => …} onCancel={…} />
//
// Lý do bắt buộc (mặc định tối thiểu 3 ký tự sau khi cắt khoảng trắng); nút xác nhận mờ cho tới khi đủ.
export default function ReasonDialog({
  title,
  message,
  reasonLabel = 'Lý do',
  placeholder = 'Nhập lý do…',
  minLength = 3,
  confirmLabel,
  cancelLabel = 'Hủy',
  danger = false,
  busy = false,
  busyLabel = 'Đang xử lý...',
  zIndex = 2500,
  onConfirm,
  onCancel
}) {
  const reactId = useId();
  const titleId = 'reason-title-' + reactId.replace(/:/g, '');
  const [lyDo, setLyDo] = useState('');
  const sach = lyDo.trim();
  const duDai = sach.length >= minLength;

  const xacNhan = () => { if (!busy && duDai) onConfirm(sach); };

  return (
    <DialogShell
      role="alertdialog"
      titleId={titleId}
      busy={busy}
      zIndex={zIndex}
      width={460}
      onEscape={onCancel}
      onBackdrop={onCancel}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        {danger && <AlertTriangle size={20} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />}
        <div style={{ flex: 1 }}>
          <h3 id={titleId} style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>{title}</h3>
          {message && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>{message}</p>
          )}
        </div>
      </div>

      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" htmlFor={titleId + '-ly-do'}>{reasonLabel} *</label>
        <textarea
          id={titleId + '-ly-do'}
          data-autofocus
          className="input-field"
          rows={3}
          style={{ resize: 'vertical' }}
          value={lyDo}
          placeholder={placeholder}
          disabled={busy}
          maxLength={500}
          onChange={(e) => setLyDo(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); xacNhan(); } }}
          aria-required="true"
        />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
          {duDai ? 'Ctrl+Enter để xác nhận.' : `Bắt buộc, tối thiểu ${minLength} ký tự.`}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={busy}>{cancelLabel}</button>
        <button
          type="button"
          onClick={xacNhan}
          className={danger ? 'btn btn-danger' : 'btn btn-primary'}
          disabled={busy || !duDai}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}
