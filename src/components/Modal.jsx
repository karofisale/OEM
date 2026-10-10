import React, { useState, useId } from 'react';
import { X } from 'lucide-react';
import DialogShell from './DialogShell';
import ConfirmDialog from './ConfirmDialog';

// Khung hộp thoại DÙNG CHUNG cho mọi modal nhập liệu trong app (Đợt 2 / mục 1).
//
// Trước đây có 6 overlay tự viết (Đăng nhập, Đổi PIN, Khách hàng, Sản phẩm x2, BOM):
// không role=dialog, Esc không đóng, không tự đặt con trỏ, không trả focus, Tab chạy
// ra ngoài hộp. Hành vi chung nằm ở DialogShell; ở đây thêm:
//
//   - tiêu đề + nút × (có aria-label), icon tuỳ chọn;
//   - `busy`  : đang gửi -> khoá ×, Esc, bấm nền (chặn đóng giữa lúc ghi);
//   - `dirty` : đã gõ chữ -> bấm nền KHÔNG đóng; Esc / × hỏi "Bỏ nội dung đã nhập?"
//               bằng hộp thoại chung thay vì đóng im lặng làm mất chữ.
//
// Không có `onClose` -> hộp không đóng được (màn đăng nhập bắt buộc).
export default function Modal({
  title,
  icon,
  ariaLabel,
  width = 480,
  onClose,
  busy = false,
  dirty = false,
  discardMessage = 'Nội dung đã nhập chưa được lưu. Đóng bây giờ sẽ mất nội dung này.',
  role = 'dialog',
  zIndex = 1000,
  className = '',
  style,
  children
}) {
  const reactId = useId();
  const titleId = title ? 'modal-title-' + reactId.replace(/:/g, '') : undefined;
  const [askDiscard, setAskDiscard] = useState(false);
  const dongDuoc = !!onClose;

  const requestClose = () => {
    if (!onClose || busy) return;
    if (dirty) setAskDiscard(true);
    else onClose();
  };

  return (
    <>
      <DialogShell
        role={role}
        titleId={titleId}
        ariaLabel={ariaLabel}
        busy={busy}
        zIndex={zIndex}
        width={width}
        className={className}
        style={style}
        paused={askDiscard}
        onEscape={dongDuoc ? requestClose : undefined}
        // Nền chỉ đóng khi chưa gõ gì.
        onBackdrop={dongDuoc && !dirty ? onClose : undefined}
      >
        {title && (
          <div className="modal-head">
            <h3 id={titleId} className="modal-title">{icon}{title}</h3>
            {dongDuoc && (
              <button type="button" className="btn btn-ghost btn-sm modal-x" onClick={requestClose} disabled={busy} aria-label="Đóng">
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {children}
      </DialogShell>

      {askDiscard && (
        <ConfirmDialog
          title="Bỏ nội dung đã nhập?"
          message={discardMessage}
          confirmLabel="Bỏ nội dung"
          cancelLabel="Tiếp tục nhập"
          danger
          zIndex={zIndex + 1500}
          onConfirm={() => { setAskDiscard(false); if (onClose) onClose(); }}
          onCancel={() => setAskDiscard(false)}
        />
      )}
    </>
  );
}
