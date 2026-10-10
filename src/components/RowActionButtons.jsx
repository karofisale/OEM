import React from 'react';
import { ArrowUpToLine, ArrowDownToLine, Trash2 } from 'lucide-react';

// Per-row insert-above / insert-below / delete controls — shared by the AI Order
// Agent review table and the Orders Chờ Duyệt page, both of which need to let
// Sale/Admin add an accompanying product line (or drop a wrong one) around an
// AI-generated order.
export default function RowActionButtons({ onInsertAbove, onInsertBelow, onDelete }) {
  return (
    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
      <button
        type="button"
        onClick={onInsertAbove}
        className="btn btn-secondary btn-sm"
        title="Chèn dòng trên"
        aria-label="Chèn dòng trên"
        style={{ padding: '4px 6px' }}
      >
        <ArrowUpToLine size={13} />
      </button>
      <button
        type="button"
        onClick={onInsertBelow}
        className="btn btn-secondary btn-sm"
        title="Chèn dòng dưới"
        aria-label="Chèn dòng dưới"
        style={{ padding: '4px 6px' }}
      >
        <ArrowDownToLine size={13} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="btn btn-secondary btn-sm btn-danger-outline"
        title="Xoá dòng"
        aria-label="Xoá dòng"
        style={{ padding: '4px 6px' }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
