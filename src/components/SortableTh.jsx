import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { ariaSort } from '../utils/tableSort';

/**
 * Ô tiêu đề bấm được để sắp xếp (dùng cùng useTableSort).
 * Mũi tên chỉ hướng: ↑ tăng dần, ↓ giảm dần, ↕ mờ = chưa sắp theo cột này.
 * `align="right"` cho cột số (căn lề phải, mũi tên ở bên trái chữ).
 */
export default function SortableTh({ col, sort, onSort, align, children, style, ...rest }) {
  const dang = !!(sort && sort.key === col);
  const Icon = !dang ? ArrowUpDown : (sort.dir === 'desc' ? ArrowDown : ArrowUp);
  return (
    <th
      {...rest}
      aria-sort={ariaSort(sort, col)}
      style={{ textAlign: align === 'right' ? 'right' : undefined, ...style }}
    >
      <button
        type="button"
        className={'th-sort' + (dang ? ' is-active' : '')}
        onClick={() => onSort(col)}
        title="Bấm để sắp xếp"
        style={align === 'right' ? { flexDirection: 'row-reverse', marginLeft: 'auto' } : undefined}
      >
        <span>{children}</span>
        <Icon size={12} aria-hidden="true" className="th-sort-icon" />
      </button>
    </th>
  );
}
