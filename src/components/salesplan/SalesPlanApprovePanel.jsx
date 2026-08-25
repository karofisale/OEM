import React, { useState, useMemo } from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { monthSortValue } from '../../utils/period';

const fmt = (v) => (v || 0).toLocaleString('vi-VN');

// Admin/Creator reviews every pending ('Chờ duyệt') row for one month and
// approves the whole month in one action — mirrors SopApprovePanel, but no
// aggregation step is needed here: each Plan_Thang row is already unique per
// (month, client), so "pending for this month" IS the approve batch.
export default function SalesPlanApprovePanel({ token, plans, onApproved }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const monthsWithPending = useMemo(() => {
    const set = new Set(plans.filter(p => p.status === 'Chờ duyệt').map(p => p.month).filter(Boolean));
    return Array.from(set).sort((a, b) => monthSortValue(b) - monthSortValue(a));
  }, [plans]);

  const [month, setMonth] = useState(() => monthsWithPending[0] || '');

  const pendingRows = useMemo(() => plans.filter(p => p.month === month && p.status === 'Chờ duyệt'), [plans, month]);

  const totals = useMemo(() => pendingRows.reduce((acc, p) => {
    acc.planKpi += p.planKpi || 0;
    acc.planUpdate += p.planUpdate || 0;
    acc.w1 += p.w1 || 0; acc.w2 += p.w2 || 0; acc.w3 += p.w3 || 0; acc.w4 += p.w4 || 0; acc.w5 += p.w5 || 0;
    return acc;
  }, { planKpi: 0, planUpdate: 0, w1: 0, w2: 0, w3: 0, w4: 0, w5: 0 }), [pendingRows]);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const result = await api.approveSalesPlan(token, month);
      toast.success(`Đã duyệt ${result.approvedCount} kế hoạch cho tháng ${result.thang}.`);
      setConfirming(false);
      if (onApproved) onApproved();
    } catch (err) {
      toast.error('Không duyệt được kế hoạch: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  if (!monthsWithPending.length) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '28px 16px' }}>
        Không có tháng nào đang chờ duyệt.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <select className="input-field" style={{ width: '160px' }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {monthsWithPending.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setConfirming(true)} disabled={!pendingRows.length} className="btn btn-emerald btn-sm">
            <CheckCircle2 size={14} /> Duyệt Toàn Bộ Tháng {month}
          </button>
        </div>
      </div>

      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Mã KH</th>
              <th>Khách hàng</th>
              <th><Users size={12} /> SALE</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Plan KPI</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Tuần 1</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Tuần 2</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Tuần 3</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Tuần 4</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Tuần 5</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Plan_Update</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            <tr className="top-summary-row">
              <td colSpan={3} style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>Σ TỔNG CỘNG (chờ duyệt)</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.planKpi)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w1)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w2)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w3)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w4)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w5)}</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.planUpdate)}</td>
              <td />
            </tr>
            {pendingRows.map((p, idx) => (
              <tr key={`${p.searchCode}_${idx}`}>
                <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{p.searchCode}</td>
                <td style={{ fontWeight: 600 }}>{p.clientName}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.sale}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.planKpi)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.w1)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.w2)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.w3)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.w4)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.w5)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{fmt(p.planUpdate)}</td>
                <td style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>{p.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Duyệt toàn bộ kế hoạch tháng ${month}?`}
          message={`Sẽ đánh dấu Đã duyệt cho toàn bộ ${pendingRows.length} khách hàng đang chờ duyệt của tháng ${month}. Không thể duyệt lại từng dòng riêng sau khi xác nhận.`}
          confirmLabel={isApproving ? 'Đang duyệt...' : 'Duyệt'}
          onConfirm={handleApprove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
