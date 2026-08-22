import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import * as api from '../../services/api';
import Pagination, { usePagedSlice } from '../Pagination';
import LoadingScreen from '../LoadingScreen';
import { useToast } from '../ToastProvider';

const PAGE_SIZE = 25;
const fmtNum = (v) => (v || 0).toLocaleString('vi-VN');
const fmtMoney = (v) => (v || 0).toLocaleString('vi-VN') + ' đ';

// Read-facing forecast: tab "SOP" after the latest approval. Anyone logged in
// can see it (same tier as Orders/Products), only Admin/Creator can change it.
export default function SopViewPanel({ token, refreshTick }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [monthLabels, setMonthLabels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const fetchView = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.getSopView(token);
      setRows(data.rows || []);
      setMonthLabels(data.monthLabels || []);
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchView(); }, [refreshTick]);

  const { safePage, pageItems: pagedRows } = usePagedSlice(rows, page, PAGE_SIZE);

  // SUMPRODUCT(SL x Giá bán) per month, over the FULL set — not just the visible page.
  const revenueByMonth = useMemo(() => {
    return monthLabels.map((_, i) => rows.reduce((sum, r) => sum + (r.sl[i] || 0) * (r.price || 0), 0));
  }, [rows, monthLabels]);

  // Generic export while waiting on the real MRP/SAP upload template — same
  // columns as the on-screen table, one row per SKU.
  const handleExport = async () => {
    if (!rows.length) return;
    setIsExporting(true);
    try {
      const XLSX = await import('xlsx');
      const exportRows = rows.map(r => {
        const row = { 'Mã': r.sku, 'Tên SP': r.name, 'Giá bán': r.price };
        monthLabels.forEach((label, i) => { row[label || `SL T+${i + 1}`] = r.sl[i] || 0; });
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'SOP');
      const today = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
      XLSX.writeFile(wb, `SOP_${today}.xlsx`);
    } catch (err) {
      toast.error('Không xuất được file Excel: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) return <LoadingScreen label="Đang tải bảng SOP..." />;

  if (loadError) {
    return (
      <div className="glass-card" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <span>Lỗi tải bảng SOP: {loadError}</span>
        <button onClick={fetchView} className="btn btn-secondary btn-sm">Thử lại</button>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="glass-card" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: 'var(--warning-text)', background: 'var(--warning-bg)' }}>
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>Chưa có kế hoạch SOP nào được duyệt. Sau khi Admin/Creator duyệt một kỳ kế hoạch, bảng sẽ hiện ở đây.</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Doanh thu dự kiến mỗi tháng — SUMPRODUCT(SL x Giá bán) */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${monthLabels.length || 4}, 1fr)`, gap: '12px' }}>
        {monthLabels.map((label, i) => (
          <div key={label + i} className="glass-card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <TrendingUp size={13} color="var(--accent-emerald)" /> {label}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", marginTop: '4px' }}>
              {fmtMoney(revenueByMonth[i])}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Doanh thu dự kiến</div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rows.length.toLocaleString('vi-VN')} mã SKU trong kế hoạch hiện hành.</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchView} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Tải lại</button>
          <button onClick={handleExport} disabled={isExporting} className="btn btn-secondary btn-sm" title="Form xuất MRP/SAP chính thức sẽ được cập nhật sau">
            <Download size={14} /> Xuất Excel
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
              {monthLabels.map((label, i) => <th key={label + i} style={{ textAlign: 'right' }}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map(r => (
              <tr key={r.sku}>
                <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{r.sku}</td>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmtNum(r.price)}</td>
                {r.sl.map((v, i) => (
                  <td key={i} style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: v ? 700 : 400, color: v ? 'var(--karofi-navy)' : 'var(--text-dim)' }}>
                    {fmtNum(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={rows.length} onPageChange={setPage} itemLabel="SKU" />
    </div>
  );
}
