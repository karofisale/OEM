import React from 'react';
import { iconOf } from '../utils/navMeta';
import { useNavGuard } from './NavGuard';

// Thanh tab con dùng chung (Sản phẩm & Bảng giá, Kế hoạch KD, SOP, Báo cáo, Công nợ).
//
// Trước đây mỗi tab là một nút `btn-primary` / `btn-secondary` — nên tab đang mở
// tranh nhau màu chính với nút hành động thật của màn ("Lưu", "Duyệt"). Giờ tab
// có kiểu riêng (`.tab-btn`), còn `btn-primary` chỉ dành cho MỘT nút chính của màn.
//
//   <SubTabs tabs={SUBTABS.sop.filter(...)} active={subView} onChange={setSubView} ariaLabel="..." />
//
// Chuyển tab đi qua hộp thoại chung "còn thay đổi chưa lưu" (NavGuard) nếu có màn
// đang dở dang.
export default function SubTabs({ tabs, active, onChange, ariaLabel = 'Chuyển chức năng' }) {
  const guard = useNavGuard();
  return (
    <div className="tab-bar" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => {
        const Icon = iconOf(t.icon);
        const dang = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={dang}
            className={'tab-btn' + (dang ? ' is-active' : '')}
            onClick={() => { if (!dang) guard(() => onChange(t.id)); }}
          >
            {Icon && <Icon size={16} aria-hidden="true" />} {t.label}
          </button>
        );
      })}
    </div>
  );
}
