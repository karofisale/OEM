import React, { useState } from 'react';
import { chuanTrang, tongSoTrang, CO_TRANG } from '../utils/paging';

// Shared list pager. Extracted from TransactionGrid, which was the only list in
// the app that paginated — ProductManagement (440 rows), ClientManagement and
// SalesPlan all rendered every row, and the daily report silently cut its list
// off at 50 with no indication that anything was missing.
//
// Always states the real total, so a truncated view can never be mistaken for
// the whole set.
//
// Đợt 3: Đầu / Trước / ô "tới trang N" / Sau / Cuối thay vì chỉ Trước/Sau — Lịch sử doanh thu có
// ~160 trang, bấm Sau 100 lần là không dùng được. Truyền `onPageSizeChange` thì có thêm ô chọn
// cỡ trang (25/50/100/200); không truyền thì cỡ trang cố định như cũ.
export default function Pagination({ page, pageSize, totalItems, onPageChange, itemLabel = 'bản ghi', onPageSizeChange, pageSizeOptions = CO_TRANG }) {
  const totalPages = tongSoTrang(totalItems, pageSize);
  const [nhay, setNhay] = useState('');
  if (totalItems === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  const dens = (raw) => {
    const n = chuanTrang(raw, totalPages);
    setNhay('');
    if (n != null && n !== page) onPageChange(n);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Hiển thị <strong>{first.toLocaleString('vi-VN')}–{last.toLocaleString('vi-VN')}</strong>
        {' '}trong tổng số <strong>{totalItems.toLocaleString('vi-VN')}</strong> {itemLabel}
        {totalPages > 1 && <> · Trang {page}/{totalPages}</>}
      </span>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {onPageSizeChange && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Mỗi trang
            <select
              className="input-field"
              style={{ width: '78px', padding: '5px 8px' }}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Số dòng mỗi trang"
            >
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}

        {totalPages > 1 && (
          <>
            <button disabled={page <= 1} onClick={() => onPageChange(1)} className="btn btn-secondary btn-sm" aria-label="Về trang đầu">
              Đầu
            </button>
            <button disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))} className="btn btn-secondary btn-sm">
              Trước
            </button>
            <form
              onSubmit={(e) => { e.preventDefault(); dens(nhay); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <input
                type="text"
                inputMode="numeric"
                className="input-field"
                style={{ width: '64px', padding: '5px 8px', textAlign: 'center' }}
                value={nhay}
                placeholder={String(page)}
                onChange={(e) => setNhay(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={() => { if (nhay) dens(nhay); }}
                aria-label={`Tới trang (1–${totalPages})`}
                title={`Nhập số trang (1–${totalPages}) rồi Enter`}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ {totalPages}</span>
            </form>
            <button disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))} className="btn btn-secondary btn-sm">
              Sau
            </button>
            <button disabled={page >= totalPages} onClick={() => onPageChange(totalPages)} className="btn btn-secondary btn-sm" aria-label="Tới trang cuối">
              Cuối
            </button>
          </>
        )}
      </div>
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
