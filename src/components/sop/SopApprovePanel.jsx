import React, { useState, useEffect } from 'react';
import { CheckCircle2, RefreshCw, Users } from 'lucide-react';
import * as api from '../../services/api';
import LoadingScreen from '../LoadingScreen';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';

const fmtNum = (v) => (v || 0).toLocaleString('vi-VN');

// Admin/Creator reviews every Sale's submitted-but-not-yet-approved rows for
// the current period, ALREADY summed by SKU, and approves the whole batch in
// one action (không duyệt từng dòng riêng) — this is exactly the preview of
// what tab "SOP" will contain right after.
export default function SopApprovePanel({ token, onApproved }) {
  const toast = useToast();
  const [data, setData] = useState(null); // { rows, monthLabels, pendingCount }
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const fetchPending = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await api.getSopPendingReview(token);
      setData(result);
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchPending(); }, [token]);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const result = await api.approveSop(token);
      toast.success(`Đã duyệt kế hoạch: ${result.skuCount} mã SKU cho ${result.monthLabels.join(', ')}.`);
      setConfirming(false);
      if (onApproved) onApproved();
    } catch (err) {
      toast.error('Không duyệt được kế hoạch: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  if (isLoading) return <LoadingScreen label="Đang tải bảng tổng hợp chờ duyệt..." />;

  if (loadError) {
    return (
      <div className="glass-card" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <span>Lỗi tải bảng chờ duyệt: {loadError}</span>
        <button onClick={fetchPending} className="btn btn-secondary btn-sm">Thử lại</button>
      </div>
    );
  }

  if (!data.rows.length) {
    return (
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-muted)' }}>Chưa có Sale nào gửi kế hoạch cho kỳ này.</span>
        <button onClick={fetchPending} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Tải lại</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <strong>{data.rows.length.toLocaleString('vi-VN')}</strong> mã SKU, tổng hợp từ <strong>{data.pendingCount.toLocaleString('vi-VN')}</strong> dòng kế hoạch chờ duyệt — kỳ {data.monthLabels[0]} → {data.monthLabels[data.monthLabels.length - 1]}.
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchPending} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Tải lại</button>
          <button onClick={() => setConfirming(true)} className="btn btn-emerald btn-sm">
            <CheckCircle2 size={14} /> Duyệt Toàn Bộ Kế Hoạch
          </button>
        </div>
      </div>

      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên SP</th>
              <th style={{ textAlign: 'right' }}>Giá bán</th>
              {data.monthLabels.map((label, i) => <th key={label + i} style={{ textAlign: 'right' }}>{label}</th>)}
              <th>Sale đóng góp</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.sku}>
                <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{r.sku}</td>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmtNum(r.price)}</td>
                {r.sl.map((v, i) => (
                  <td key={i} style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 700 }}>{fmtNum(v)}</td>
                ))}
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Users size={12} /> {r.contributors.join(', ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Duyệt toàn bộ kế hoạch SOP kỳ này?"
          message={`Sẽ ghi đè tab "SOP" bằng ${data.rows.length} mã SKU tổng hợp ở trên, và đánh dấu Đã duyệt cho toàn bộ ${data.pendingCount} dòng kế hoạch chờ duyệt của kỳ ${data.monthLabels[0]} → ${data.monthLabels[data.monthLabels.length - 1]}. Không thể duyệt lại từng dòng riêng sau khi xác nhận.`}
          confirmLabel={isApproving ? 'Đang duyệt...' : 'Duyệt'}
          onConfirm={handleApprove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
