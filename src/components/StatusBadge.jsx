import React from 'react';
import { CheckCircle2, Clock, XCircle, FileEdit } from 'lucide-react';
import { trangThai, TONE_CLASS } from '../utils/glossary';

// Badge trạng thái dùng chung: nhận MÃ hay nhãn thô bất kỳ ('Active', 'draft',
// 'Chờ duyệt', '2026-10-01'...) và luôn hiện nhãn tiếng Việt, không lộ mã thô
// (Đợt 2 / mục 6). Bảng đổi nhãn nằm ở utils/glossary.js.
const ICON_THEO_TONE = { emerald: CheckCircle2, amber: Clock, rose: XCircle };

export default function StatusBadge({ status, icon = true, style }) {
  const { label, tone } = trangThai(status);
  const Icon = icon && label !== '—' ? (label === 'Bản nháp' ? FileEdit : ICON_THEO_TONE[tone]) : null;
  return (
    <span className={'badge ' + (TONE_CLASS[tone] || 'badge-neutral')} style={style}>
      {Icon && <Icon size={12} aria-hidden="true" />} {label}
    </span>
  );
}
