import React, { useEffect, useRef, useState, useId } from 'react';
import { MoreHorizontal } from 'lucide-react';

// Menu "⋯ Thêm": gom các nút ít dùng để mỗi màn chỉ còn MỘT nút chính + vài nút
// phụ (Đợt 2 / mục 4). Mục xoá / ghi đè truyền `danger: true` -> chữ đỏ.
//
//   <MoreMenu items={[
//     { label: 'Xuất Excel', icon: <FileSpreadsheet size={14} />, onClick: ..., disabled: false },
//     { label: 'Xoá cả đơn', icon: <Trash2 size={14} />, onClick: ..., danger: true }
//   ]} />
//
// Đóng bằng Esc, bấm ra ngoài, hoặc chọn một mục. Phím mũi tên chuyển mục.
export default function MoreMenu({ items, label = 'Thêm', title, size = 'sm', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const id = 'more-' + useId().replace(/:/g, '');

  const hien = (items || []).filter((i) => i && !i.hidden);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        const b = wrapRef.current && wrapRef.current.querySelector('button[aria-haspopup]');
        if (b) b.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    const first = menuRef.current && menuRef.current.querySelector('button:not([disabled])');
    if (first) first.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (!hien.length) return null;

  const onMenuKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const els = Array.from(menuRef.current.querySelectorAll('button:not([disabled])'));
    const i = els.indexOf(document.activeElement);
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
    els[next].focus();
  };

  return (
    <div ref={wrapRef} className="more-menu">
      <button
        type="button"
        className={'btn btn-secondary' + (size === 'sm' ? ' btn-sm' : '')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={title || 'Thêm thao tác'}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={14} aria-hidden="true" /> {label}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          className="more-menu-list"
          style={align === 'left' ? { left: 0 } : { right: 0 }}
          onKeyDown={onMenuKey}
        >
          {hien.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              className={'more-menu-item' + (it.danger ? ' is-danger' : '')}
              onClick={() => { setOpen(false); if (it.onClick) it.onClick(); }}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
