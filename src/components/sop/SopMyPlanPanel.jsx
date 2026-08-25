import React, { useState, useEffect, useMemo } from 'react';
import { Save, CheckCircle2, Clock } from 'lucide-react';
import * as api from '../../services/api';
import { useToast } from '../ToastProvider';

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
// submitted, across every period, with status. The CURRENT-anchor period is
// editable right here (same shape as Admin/Creator's approve screen: a Σ
// total row, a "hide all-zero rows" filter, quantities editable in place) and
// resubmits by calling submitSopDraft directly — no more detour through "Lập
// Kế Hoạch" to fix a number. Older periods stay plain read-only history
// (nothing to submit there — submitSopDraft only ever targets the current
// anchor).
export default function SopMyPlanPanel({ token, refreshTick, onSubmitted }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editedSl, setEditedSl] = useState({}); // sku -> [sl1..sl4], current period only
  const [hideZeroRows, setHideZeroRows] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    api.getMySopPlan(token)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        const init = {};
        (result.rows || []).forEach((r) => { if (r.period === result.anchor) init[r.sku] = r.sl.slice(); });
        setEditedSl(init);
      })
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

  const currentGroup = periods.find((g) => g.period === data?.anchor);
  const historyGroups = periods.filter((g) => g.period !== data?.anchor);

  const setCell = (sku, idx, value) => {
    setEditedSl((prev) => {
      const current = prev[sku] || [0, 0, 0, 0];
      const next = current.slice();
      next[idx] = value === '' ? 0 : (parseFloat(value) || 0);
      return { ...prev, [sku]: next };
    });
  };

  const visibleCurrentRows = useMemo(() => {
    if (!currentGroup) return [];
    if (!hideZeroRows) return currentGroup.rows;
    return currentGroup.rows.filter((r) => (editedSl[r.sku] || r.sl).some((v) => v > 0));
  }, [currentGroup, editedSl, hideZeroRows]);

  const totals = useMemo(() => {
    if (!currentGroup) return [0, 0, 0, 0];
    return currentGroup.rows.reduce((acc, r) => {
      const sl = editedSl[r.sku] || r.sl;
      sl.forEach((v, i) => { acc[i] += v || 0; });
      return acc;
    }, [0, 0, 0, 0]);
  }, [currentGroup, editedSl]);

  const handleResubmit = async () => {
    if (!currentGroup) return;
    setIsSubmitting(true);
    try {
      const rows = currentGroup.rows.map((r) => {
        const sl = editedSl[r.sku] || r.sl;
        return { sku: r.sku, sl1: sl[0], sl2: sl[1], sl3: sl[2], sl4: sl[3] };
      });
      const result = await api.submitSopDraft(token, data.anchor, rows);
      toast.success(`Đã gửi duyệt lại ${result.savedCount} mã SKU.`);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      toast.error('Không gửi được: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quiet while loading/empty — this sits above the aggregate SOP table, so a
  // Sale with no submission history yet shouldn't see an empty card first.
  if (isLoading || !periods.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
        Kế hoạch của tôi đã gửi
      </h3>

      {currentGroup && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--karofi-navy)' }}>
              Kỳ {currentGroup.monthLabels[0]} → {currentGroup.monthLabels[currentGroup.monthLabels.length - 1]}
              <span style={{ marginLeft: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--karofi-cyan)' }}>(kỳ đang mở)</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={hideZeroRows} onChange={(e) => setHideZeroRows(e.target.checked)} style={{ width: '15px', height: '15px' }} />
                Ẩn mã không có số lượng
              </label>
              <button onClick={handleResubmit} disabled={isSubmitting} className="btn btn-emerald btn-sm">
                <Save size={14} /> {isSubmitting ? 'Đang gửi...' : 'Gửi duyệt lại'}
              </button>
            </div>
          </div>

          <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Mã SKU</th>
                  <th>Tên SP</th>
                  {currentGroup.monthLabels.map((label, i) => <th key={label + i} style={{ width: '110px', textAlign: 'right' }}>{label}</th>)}
                  <th style={{ width: '110px' }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                <tr className="top-summary-row">
                  <td colSpan={2} style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>Σ TỔNG CỘNG</td>
                  {totals.map((v, i) => (
                    <td key={i} style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(v)}</td>
                  ))}
                  <td />
                </tr>
                {visibleCurrentRows.map((r) => {
                  const sl = editedSl[r.sku] || r.sl;
                  return (
                    <tr key={r.sku}>
                      <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{r.sku}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      {sl.map((v, i) => (
                        <td key={i}>
                          <input
                            type="number" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }}
                            value={v || ''}
                            placeholder="0"
                            onChange={(e) => setCell(r.sku, i, e.target.value)}
                          />
                        </td>
                      ))}
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {visibleCurrentRows.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem', padding: '8px' }}>
              Mọi mã đều đang bị ẩn bởi bộ lọc "Ẩn mã không có số lượng" — bỏ tick để xem lại.
            </div>
          )}
        </div>
      )}

      {historyGroups.map((group) => (
        <div key={group.period} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--karofi-navy)' }}>
            Kỳ {group.monthLabels[0]} → {group.monthLabels[group.monthLabels.length - 1]}
          </span>

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
      ))}
    </div>
  );
}
