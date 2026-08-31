import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, RefreshCw, Users, TrendingUp, Pencil } from 'lucide-react';
import * as api from '../../services/api';
import LoadingScreen from '../LoadingScreen';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';

const fmtNum = (v) => (v || 0).toLocaleString('vi-VN');
const fmtMoney = (v) => (v || 0).toLocaleString('vi-VN') + ' đ';

// Admin/Creator reviews every Sale's submitted-but-not-yet-approved rows for
// the current period, ALREADY summed by SKU, and approves the whole batch in
// one action (không duyệt từng dòng riêng) — this is exactly the preview of
// what tab "SOP" will contain right after. Quantities are editable before
// approving (overrideRows on api.approveSop) and a Sale filter shows each
// Sale's own contribution alongside the aggregate — both purely on top of the
// same one read, no second endpoint.
export default function SopApprovePanel({ token, refreshTick, onApproved }) {
  const toast = useToast();
  const [data, setData] = useState(null); // { rows, detail, monthLabels, pendingCount, anchor }
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [editedSl, setEditedSl] = useState({}); // sku -> [sl1..sl4]
  const [saleFilter, setSaleFilter] = useState('ALL');
  const [hideZeroRows, setHideZeroRows] = useState(false);

  const fetchPending = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await api.getSopPendingReview(token);
      setData(result);
      const init = {};
      (result.rows || []).forEach((r) => { init[r.sku] = r.sl.slice(); });
      setEditedSl(init);
      setSaleFilter('ALL');
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // refreshTick: panel không còn remount khi chuyển sub-tab (KeepAliveTab), nên
  // cần được báo khi Sale vừa gửi kế hoạch mới ở tab Lập Kế Hoạch.
  useEffect(() => { fetchPending(); }, [token, refreshTick]);

  const setCell = (sku, idx, value) => {
    setEditedSl((prev) => {
      const current = prev[sku] || [0, 0, 0, 0];
      const next = current.slice();
      next[idx] = value === '' ? 0 : (parseFloat(value) || 0);
      return { ...prev, [sku]: next };
    });
  };

  // SUMPRODUCT(SL x Giá bán) per month. Over the EDITED aggregate quantities
  // when no Sale filter is picked (so Admin/Creator sees the revenue impact
  // of what they're about to actually approve) — but once a Sale is picked
  // in "Xem đóng góp theo Sale", these cards switch to THAT Sale's own
  // detail lines instead, so the headline number always matches what's
  // currently selected rather than staying frozen on the full-batch total.
  const revenueByMonth = useMemo(() => {
    if (!data || !data.monthLabels) return [];
    if (saleFilter !== 'ALL' && data.detail) {
      const lines = data.detail.filter((d) => d.sale === saleFilter);
      return data.monthLabels.map((_, i) => lines.reduce((sum, d) => sum + (d.sl[i] || 0) * (d.price || 0), 0));
    }
    if (!data.rows || !data.rows.length) return [];
    return data.monthLabels.map((_, i) => data.rows.reduce((sum, r) => {
      const sl = editedSl[r.sku] || r.sl;
      return sum + (sl[i] || 0) * (r.price || 0);
    }, 0));
  }, [data, editedSl, saleFilter]);

  const salesList = useMemo(() => {
    if (!data || !data.detail) return [];
    return Array.from(new Set(data.detail.map((d) => d.sale).filter(Boolean))).sort();
  }, [data]);

  // Display-only — a SKU with all-zero quantity across every month still gets
  // approved and cleared from the pending queue (handleApprove uses data.rows,
  // not this), it's just noise Admin/Creator can hide while reviewing.
  const visibleRows = useMemo(() => {
    if (!data || !data.rows) return [];
    if (!hideZeroRows) return data.rows;
    return data.rows.filter((r) => (editedSl[r.sku] || r.sl).some((v) => v > 0));
  }, [data, editedSl, hideZeroRows]);

  // What actually gets published to tab "SOP" on approve — backend drops any
  // SKU whose quantity is 0 across all 4 months, independent of hideZeroRows
  // (that one is display-only).
  const publishCount = useMemo(() => {
    if (!data || !data.rows) return 0;
    return data.rows.filter((r) => (editedSl[r.sku] || r.sl).some((v) => v > 0)).length;
  }, [data, editedSl]);

  // Read-only — this Sale's own submitted lines, unaffected by any edit made
  // to the aggregate above (that edit only changes what gets PUBLISHED, not
  // who is credited with what). Revenue itself is now shown by the cards
  // above (revenueByMonth switches to this same `detail` slice once a Sale
  // is picked) — this just keeps the quantity breakdown + line list.
  const saleContribution = useMemo(() => {
    if (!data || !data.detail || saleFilter === 'ALL') return null;
    const lines = data.detail.filter((d) => d.sale === saleFilter);
    const totalSl = lines.reduce((acc, d) => {
      for (let i = 0; i < 4; i++) acc[i] += d.sl[i] || 0;
      return acc;
    }, [0, 0, 0, 0]);
    return { lines, totalSl };
  }, [data, saleFilter]);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const overrideRows = data.rows.map((r) => {
        const sl = editedSl[r.sku] || r.sl;
        return { sku: r.sku, sl1: sl[0], sl2: sl[1], sl3: sl[2], sl4: sl[3] };
      });
      const result = await api.approveSop(token, data.anchor, overrideRows);
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
      {/* Doanh thu dự kiến của bảng CHỜ DUYỆT — tính trước khi bấm Duyệt */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.monthLabels.length || 4}, 1fr)`, gap: '12px' }}>
        {data.monthLabels.map((label, i) => (
          <div key={label + i} className="glass-card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <TrendingUp size={13} color="var(--accent-emerald)" /> {label}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", marginTop: '4px' }}>
              {fmtMoney(revenueByMonth[i])}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              {saleFilter === 'ALL' ? 'Doanh thu dự kiến (chờ duyệt)' : `Doanh thu dự kiến của ${saleFilter}`}
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <strong>{visibleRows.length.toLocaleString('vi-VN')}</strong>
          {visibleRows.length !== data.rows.length && <> / {data.rows.length.toLocaleString('vi-VN')}</>}
          {' '}mã SKU, tổng hợp từ <strong>{data.pendingCount.toLocaleString('vi-VN')}</strong> dòng kế hoạch chờ duyệt — kỳ {data.monthLabels[0]} → {data.monthLabels[data.monthLabels.length - 1]}.
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={hideZeroRows} onChange={(e) => setHideZeroRows(e.target.checked)} style={{ width: '16px', height: '16px' }} />
            Ẩn mã không có số lượng
          </label>
          <Users size={14} color="var(--text-muted)" />
          <select className="input-field" style={{ width: '190px' }} value={saleFilter} onChange={(e) => setSaleFilter(e.target.value)}>
            <option value="ALL">Xem đóng góp theo Sale...</option>
            {salesList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={fetchPending} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Tải lại</button>
          <button onClick={() => setConfirming(true)} className="btn btn-emerald btn-sm">
            <CheckCircle2 size={14} /> Duyệt Toàn Bộ Kế Hoạch
          </button>
        </div>
      </div>

      {saleContribution && (
        <div className="glass-card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--karofi-navy)' }}>
            Tổng đóng góp của <strong>{saleFilter}</strong>: {saleContribution.lines.length.toLocaleString('vi-VN')} mã SKU
            {' '}({data.monthLabels.map((label, i) => `${label}: ${fmtNum(saleContribution.totalSl[i])}`).join(' · ')})
          </span>
          <div className="table-container" style={{ maxHeight: '260px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Tên SP</th>
                  {data.monthLabels.map((label, i) => <th key={label + i} style={{ textAlign: 'right' }}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {saleContribution.lines.map((d) => (
                  <tr key={d.sku}>
                    <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{d.sku}</td>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    {d.sl.map((v, i) => (
                      <td key={i} style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmtNum(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {visibleRows.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px 16px' }}>
          Mọi mã SKU chờ duyệt đều đang bị ẩn bởi bộ lọc "Ẩn mã không có số lượng" — bỏ tick để xem lại.
        </div>
      )}

      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto', display: visibleRows.length ? undefined : 'none' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên SP</th>
              <th style={{ textAlign: 'right' }}>Giá bán</th>
              {data.monthLabels.map((label, i) => <th key={label + i} style={{ width: '110px', textAlign: 'right' }}><Pencil size={11} style={{ marginRight: '3px', verticalAlign: '-1px' }} />{label}</th>)}
              <th>Sale đóng góp</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(r => {
              const sl = editedSl[r.sku] || r.sl;
              return (
              <tr key={r.sku}>
                <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{r.sku}</td>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmtNum(r.price)}</td>
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
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Users size={12} /> {r.contributors.join(', ')}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Duyệt toàn bộ kế hoạch SOP kỳ này?"
          message={`Sẽ ghi đè tab "SOP" bằng ${publishCount} mã SKU có số lượng > 0${publishCount !== data.rows.length ? ` (bỏ qua ${data.rows.length - publishCount} mã toàn số 0)` : ''}, và đánh dấu Đã duyệt cho toàn bộ ${data.pendingCount} dòng kế hoạch chờ duyệt của kỳ ${data.monthLabels[0]} → ${data.monthLabels[data.monthLabels.length - 1]}. Không thể duyệt lại từng dòng riêng sau khi xác nhận.`}
          confirmLabel={isApproving ? 'Đang duyệt...' : 'Duyệt'}
          onConfirm={handleApprove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
