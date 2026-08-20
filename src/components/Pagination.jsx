import React from 'react';

// Shared list pager. Extracted from TransactionGrid, which was the only list in
// the app that paginated — ProductManagement (440 rows), ClientManagement and
// SalesPlan all rendered every row, and the daily report silently cut its list
// off at 50 with no indication that anything was missing.
//
// Always states the real total, so a truncated view can never be mistaken for
// the whole set.
export default function Pagination({ page, pageSize, totalItems, onPageChange, itemLabel = 'bản ghi' }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Hiển thị <strong>{first.toLocaleString('vi-VN')}–{last.toLocaleString('vi-VN')}</strong>
        {' '}trong tổng số <strong>{totalItems.toLocaleString('vi-VN')}</strong> {itemLabel}
        {totalPages > 1 && <> · Trang {page}/{totalPages}</>}
      </span>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            disabled={page === 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="btn btn-secondary btn-sm"
          >
            Trang Trước
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="btn btn-secondary btn-sm"
          >
            Trang Sau
          </button>
        </div>
      )}
    </div>
  );
}

// Clamps a page number when the filtered list shrinks under it — typing in a
// search box while on page 8 would otherwise leave the user staring at an empty
// table with no obvious way back.
export function usePagedSlice(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return { safePage, totalPages, pageItems: items.slice(start, start + pageSize) };
}
