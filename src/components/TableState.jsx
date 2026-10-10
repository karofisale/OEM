import React, { useEffect, useState } from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import LoadingScreen from './LoadingScreen';

// Trạng thái dùng chung của mọi bảng: đang tải / lỗi + Thử lại / rỗng / có dữ liệu.
//
//   <TableState loading={isLoading} error={loadError} isEmpty={!rows.length}
//               onRetry={fetchRows} emptyText="Chưa có đơn nào.">
//     <div className="table-container">...</div>
//   </TableState>
//
// Không để bảng kẹt "Đang tải…": sau SLOW_MS vẫn chưa xong thì hiện kèm nút
// "Thử lại" (backend Apps Script có lúc im lặng cả phút); và lỗi LUÔN có nút
// Thử lại nếu bên gọi truyền onRetry.
const SLOW_MS = 45000;

export default function TableState({
  loading = false,
  error = '',
  isEmpty = false,
  emptyText = 'Chưa có dữ liệu.',
  emptyHint,
  emptyAction,
  errorPrefix = 'Không tải được dữ liệu',
  loadingLabel = 'Đang tải...',
  onRetry,
  compact = true,
  children
}) {
  const [cham, setCham] = useState(false);
  useEffect(() => {
    if (!loading) { setCham(false); return undefined; }
    const h = setTimeout(() => setCham(true), SLOW_MS);
    return () => clearTimeout(h);
  }, [loading]);

  if (loading) {
    return (
      <div>
        <LoadingScreen compact={compact} label={loadingLabel} />
        {cham && onRetry && (
          <div className="state-card" style={{ marginTop: '8px' }}>
            <span>Đang chờ hơi lâu — mạng có thể đang chập chờn.</span>
            <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Thử lại</button>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-card state-error" role="alert">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} /> {errorPrefix}: {error}
        </span>
        {onRetry && <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Thử lại</button>}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="state-card state-empty">
        <Inbox size={20} aria-hidden="true" />
        <div>
          <div>{emptyText}</div>
          {emptyHint && <div style={{ fontSize: '0.8rem', marginTop: '2px' }}>{emptyHint}</div>}
          {emptyAction && <div style={{ marginTop: '10px' }}>{emptyAction}</div>}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
