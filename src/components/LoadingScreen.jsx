import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// Google Apps Script Web Apps are genuinely slow to respond sometimes (cold
// start, or a flaky network hop in between) — nothing our code can fix. What
// we CAN fix is how boring/broken that wait feels: an indeterminate progress
// bar + rotating tips instead of a blank screen or a static spinner.
const DEFAULT_TIPS = [
  'Đang kết nối tới Google Sheet...',
  'Máy chủ Google Apps Script đôi khi cần vài giây để "khởi động" — vui lòng chờ chút.',
  'Mẹo: ở AI Order Agent, bạn có thể dán ảnh chụp đơn hàng thẳng vào ô nhập lệnh bằng Ctrl+V.',
  'Mẹo: gõ tự do vào ô Mã VT hoặc Mã KH để tìm theo bất kỳ từ khóa nào, không cần đúng thứ tự.',
  'Đang tổng hợp dữ liệu doanh thu, công nợ và danh mục sản phẩm...',
];

export default function LoadingScreen({ tips = DEFAULT_TIPS, compact = false, label }) {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTipIndex((i) => (i + 1) % tips.length), 2800);
    return () => clearInterval(id);
  }, [tips.length]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
      padding: compact ? '20px 8px' : '64px 16px', textAlign: 'center'
    }}>
      <Loader2 size={compact ? 22 : 32} className="animate-spin" color="var(--karofi-cyan)" />

      {label && (
        <span style={{ fontSize: compact ? '0.85rem' : '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
          {label}
        </span>
      )}

      <div className="progress-bar-track" style={{ width: '100%', maxWidth: '280px' }}>
        <div className="progress-bar-indeterminate" />
      </div>

      <p key={tipIndex} className="animate-fade-in" style={{
        fontSize: compact ? '0.775rem' : '0.85rem', color: 'var(--text-muted)',
        minHeight: '1.4em', maxWidth: '360px'
      }}>
        {tips[tipIndex]}
      </p>
    </div>
  );
}
