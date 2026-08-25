import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardEdit, CheckCircle2, Clock } from 'lucide-react';
import * as api from '../../services/api';

const fmt = (v) => (v || 0).toLocaleString('vi-VN');

function StatusBadge({ status }) {
  if (status === 'Đã duyệt') {
    return <span className="badge badge-emerald"><CheckCircle2 size={12} /> Đã duyệt</span>;
  }
  if (status === 'Chờ duyệt') {
    return <span className="badge badge-amber"><Clock size={12} /> Chờ duyệt</span>;
  }
  return <span className="badge" style={{ background: 'var(--bg-input)', color: 'var(--text-dim)' }}>{status || '—'}</span>;
}

// Shown inside "Xem SOP" for whoever can plan — what THIS Sale has themselves
// submitted, across every period, with status. The current-anchor group also
// gets a shortcut into "Lập Kế Hoạch", which already reopens pre-filled with
// exactly these rows and resubmits by overwriting them (see SopPlanPanel).
export default function SopMyPlanPanel({ token, refreshTick, onEditCurrentPeriod }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    api.getMySopPlan(token)
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setData({ anchor: '', rows: [] }); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [token, refreshTick]);

  const periods = useMemo(() => {
    if (!data || !data.rows.length) return [];
    const order = [];
    const groups = {};
    data.rows.forEach((r) => {
      if (!groups[r.period]) { groups[r.period] = { period: r.period, monthLabels: r.monthLabels, rows: [] }; order.push(r.period); }
      groups[r.period].rows.push(r);
    });
    return order.map((p) => groups[p]);
  }, [data]);

  // Quiet while loading/empty — this sits above the aggregate SOP table, so a
  // Sale with no submission history yet shouldn't see an empty card first.
  if (isLoading || !periods.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
        Kế hoạch của tôi đã gửi
      </h3>
      {periods.map((group) => {
        const isCurrent = group.period === data.anchor;
        return (
          <div key={group.period} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--karofi-navy)' }}>
                Kỳ {group.monthLabels[0]} → {group.monthLabels[group.monthLabels.length - 1]}
                {isCurrent && <span style={{ marginLeft: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--karofi-cyan)' }}>(kỳ đang mở)</span>}
              </span>
              {isCurrent && onEditCurrentPeriod && (
                <button onClick={onEditCurrentPeriod} className="btn btn-secondary btn-sm">
                  <ClipboardEdit size={14} /> Sửa & Gửi duyệt lại
                </button>
              )}
            </div>

            <div className="table-container" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Mã SKU</th>
                    <th>Tên SP</th>
                    {group.monthLabels.map((label, i) => <th key={label + i} style={{ textAlign: 'right' }}>{label}</th>)}
                    <th style={{ width: '110px' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((r) => (
                    <tr key={r.sku}>
                      <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{r.sku}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      {r.sl.map((v, i) => (
                        <td key={i} style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(v)}</td>
                      ))}
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
