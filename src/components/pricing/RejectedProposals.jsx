import React, { useState, useEffect, useCallback } from 'react';
import { XCircle, RefreshCw, ChevronDown, ChevronUp, Pencil, EyeOff } from 'lucide-react';
import * as api from '../../services/api';
import { lamSachLoi } from '../../utils/errorText';
import { usePersistentState } from '../../hooks/usePersistentState';

// "Đề xuất bị từ chối" (Đợt 4, 10/10/2026): lý do Admin gõ lúc từ chối đã lưu ở price_proposals.note từ lâu nhưng trước đây
// không có đường nào đưa tới người đề xuất — Sale chỉ biết đợt biến mất. Server (getMyRejectedPriceProposals) trả đợt CỦA MÌNH
// (Admin/Creator: tất cả), mới nhất trước, tối đa 20 đợt; mỗi đợt kèm đủ dòng để nạp lại làm bản nháp ("Sửa & gửi lại").
// Server cũ chưa có hàm này -> im lặng không hiện gì (không làm hỏng màn Đề xuất giá).
export default function RejectedProposals({ token, refreshTick, onResubmit }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = usePersistentState('price.rejectedOpen', true, (v) => typeof v === 'boolean');
  // Đợt đã "Ẩn" (nhớ qua F5): lý do đã đọc rồi thì không cần nằm mãi ở đây.
  const [hidden, setHidden] = usePersistentState('price.rejectedHidden', [], Array.isArray);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getMyRejectedPriceProposals(token);
      setBatches((res && res.batches) || []);
    } catch (err) {
      const msg = (err && err.message) || String(err);
      // Máy chủ chưa cập nhật (chưa có hàm này): không hiện gì.
      if (/Unknown function/i.test(msg)) setBatches([]);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load, refreshTick]);

  const shown = batches.filter((b) => !hidden.includes(b.batchId));
  if (!shown.length && !error) return null;

  return (
    <div className="glass-card" role="region" aria-label="Đề xuất giá bị từ chối" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '4px solid var(--danger)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          style={{ fontWeight: 800, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <XCircle size={16} /> Đề xuất bị từ chối ({shown.length})
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading} title="Tải lại danh sách">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Làm mới
        </button>
      </div>

      {error && <div className="state-card state-error" role="alert"><span>Không tải được danh sách: {lamSachLoi(error)}</span></div>}

      {open && shown.map((b) => {
        const rieng = (b.rows.find((r) => r.clientCode) || {}).clientCode || '';
        const tenMa = b.rows.slice(0, 3).map((r) => r.name || r.sku).join(', ') + (b.rows.length > 3 ? ` và ${b.rows.length - 3} mã nữa` : '');
        return (
          <div key={b.batchId} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(220, 38, 38, 0.06)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Đợt <span className="code-font">{b.batchId}</span> · gửi {b.submittedAt || '?'} · từ chối {b.rejectedAt || '?'}{b.rejectedBy ? ` bởi ${b.rejectedBy}` : ''}
            </div>
            <div style={{ fontSize: '0.88rem' }}>
              <strong>Lý do:</strong>{' '}
              {b.note ? <span style={{ whiteSpace: 'pre-wrap' }}>{b.note}</span> : <em style={{ color: 'var(--text-dim)' }}>Không ghi lý do</em>}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {b.rows.length} mã SKU{rieng ? ` · riêng khách ${rieng}` : ' · giá chung'}: {tenMa}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {onResubmit && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onResubmit(b)}>
                  <Pencil size={14} /> Sửa &amp; gửi lại
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHidden((h) => h.concat(b.batchId))} title="Ẩn đợt này khỏi danh sách (đã đọc lý do)">
                <EyeOff size={14} /> Ẩn
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
