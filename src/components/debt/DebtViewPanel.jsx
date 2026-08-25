import React, { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, Filter } from 'lucide-react';
import * as api from '../../services/api';
import Pagination, { usePagedSlice } from '../Pagination';
import LoadingScreen from '../LoadingScreen';

const PAGE_SIZE = 25;
const fmt = (v) => (v || 0).toLocaleString('vi-VN');

// Read-facing view of tab "Debt" — same per-Sale scoping as everywhere else
// (oemAppScopeOf_/oemAppMatchesSale_ on the PIC column), so a Sale only sees
// their own clients' debt while Admin/Creator/Leader see everyone.
export default function DebtViewPanel({ token, refreshTick }) {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const fetchView = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.getDebtView(token);
      setRows(data.rows || []);
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchView(); }, [token, refreshTick]);

  const normalize = (s) => String(s || '').normalize('NFC').toLowerCase();

  const filteredRows = useMemo(() => {
    const q = normalize(searchTerm.trim());
    if (!q) return rows;
    return rows.filter((r) => normalize(r.code).includes(q) || normalize(r.name).includes(q) || normalize(r.pic).includes(q));
  }, [rows, searchTerm]);

  const { safePage, pageItems: pagedRows } = usePagedSlice(filteredRows, page, PAGE_SIZE);

  const totals = useMemo(() => filteredRows.reduce((acc, r) => {
    acc.creditLimit += r.creditLimit || 0;
    acc.overLimit += r.overLimit || 0;
    acc.balance += r.balance || 0;
    return acc;
  }, { creditLimit: 0, overLimit: 0, balance: 0 }), [filteredRows]);

  if (isLoading) return <LoadingScreen label="Đang tải bảng công nợ..." />;

  if (loadError) {
    return (
      <div className="glass-card" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <span>Lỗi tải bảng công nợ: {loadError}</span>
        <button onClick={fetchView} className="btn btn-secondary btn-sm">Thử lại</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" className="input-field" style={{ paddingLeft: '36px' }}
            placeholder="Tìm mã KH, tên khách hàng, PIC..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={12} /> {filteredRows.length.toLocaleString('vi-VN')} khách hàng khớp
        </span>
        <button onClick={fetchView} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Tải lại</button>
      </div>

      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Mã KH</th>
              <th>Tên khách hàng</th>
              <th>PIC</th>
              <th style={{ textAlign: 'right', width: '160px' }}>Hạn mức</th>
              <th style={{ textAlign: 'right', width: '160px' }}>Vượt hạn mức</th>
              <th style={{ textAlign: 'right', width: '160px' }}>Số dư công nợ</th>
            </tr>
          </thead>
          <tbody>
            <tr className="top-summary-row">
              <td colSpan={3} style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>Σ TỔNG CỘNG</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.creditLimit)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900, color: totals.overLimit > 0 ? 'var(--danger)' : 'var(--accent-emerald-text)' }}>{fmt(totals.overLimit)}</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.balance)}</td>
            </tr>
            {pagedRows.map((r) => (
              <tr key={r.code}>
                <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{r.code}</td>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.pic}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(r.creditLimit)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 700, color: r.overLimit > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{fmt(r.overLimit)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 700 }}>{fmt(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredRows.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '28px 16px' }}>
          Không có khách hàng nào khớp bộ lọc.
        </div>
      ) : (
        <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={filteredRows.length} onPageChange={setPage} itemLabel="khách hàng" />
      )}
    </div>
  );
}
