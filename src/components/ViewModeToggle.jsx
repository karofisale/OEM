import React from 'react';
import { Table, LayoutGrid } from 'lucide-react';

// Công tắc "Dạng Bảng / Dạng Lưới" dùng chung (Khách hàng, Sản phẩm, Báo cáo).
// Dùng kiểu tab (`.tab-btn`) chứ không phải btn-primary/btn-secondary như trước —
// công tắc xem không được tranh màu với nút hành động chính của màn (Đợt 2 / mục 4).
export default function ViewModeToggle({ mode, onChange }) {
  return (
    <div className="tab-bar" role="group" aria-label="Kiểu hiển thị" style={{ padding: '3px', borderRadius: 'var(--radius-md)' }}>
      <button type="button" aria-pressed={mode === 'table'} className={'tab-btn' + (mode === 'table' ? ' is-active' : '')} style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => onChange('table')}>
        <Table size={14} aria-hidden="true" /> Dạng Bảng
      </button>
      <button type="button" aria-pressed={mode === 'grid'} className={'tab-btn' + (mode === 'grid' ? ' is-active' : '')} style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => onChange('grid')}>
        <LayoutGrid size={14} aria-hidden="true" /> Dạng Lưới
      </button>
    </div>
  );
}
