import React from 'react';
import { BellRing, ChevronRight } from 'lucide-react';
import { cauThongBao, moTaMucThongBao } from '../../utils/checkGia';

/**
 * Khung thông báo Check giá bán ở đầu Dashboard: Admin/Creator "Hỏi giá cần kiểm tra (n)", Sale "Hỏi giá được trả lời (n)".
 * Bấm một dòng → mở thẳng yêu cầu đó; "Xem tất cả" → hộp thư. Không có gì để báo (hoặc chưa chạy SQL đợt 29) → không hiện.
 */
export default function ThongBaoGia({ tb, onOpen }) {
  const cau = cauThongBao(tb);
  if (!cau) return null;
  return (
    <div className="glass-card" role="status" aria-live="polite"
      style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '4px solid var(--warning-text, #d97706)' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 800 }}><BellRing size={18} /> {cau}</div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen({ view: 'hopthu' })}>Xem tất cả <ChevronRight size={14} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {(tb.items || []).map((it) => (
          <button key={it.id} type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => onOpen({ id: it.id })}>
            {moTaMucThongBao(it, tb.loai)}
          </button>
        ))}
        {tb.soLuong > (tb.items || []).length && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>… và {tb.soLuong - tb.items.length} yêu cầu khác.</div>}
      </div>
    </div>
  );
}
