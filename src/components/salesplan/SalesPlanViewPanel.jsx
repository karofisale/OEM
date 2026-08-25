import React, { useState, useMemo, useEffect } from 'react';
import { Filter, User, Clock, CheckCircle2 } from 'lucide-react';
import Pagination, { usePagedSlice } from '../Pagination';
import { monthSortValue } from '../../utils/period';

const PAGE_SIZE = 25;

const fmt = (v) => (v || 0).toLocaleString('vi-VN');

function StatusBadge({ status }) {
  if (status === 'Đã duyệt') {
    return <span className="badge badge-emerald"><CheckCircle2 size={12} /> Đã duyệt</span>;
  }
  if (status === 'Chờ duyệt') {
    return <span className="badge badge-amber"><Clock size={12} /> Chờ duyệt</span>;
  }
  return <span className="badge" style={{ background: 'var(--bg-input)', color: 'var(--text-dim)' }}>—</span>;
}

// Read-only table over whatever tab Plan_Thang currently holds — filterable by
// month (now a real per-row field) and, for Admin/Creator/Leader, by Sale.
export default function SalesPlanViewPanel({ plans, activeUser }) {
  const canFilterAllSales = ['creator', 'admin', 'leader'].includes(activeUser.role);
  const monthsList = useMemo(() => {
    const set = new Set(plans.map(p => p.month).filter(Boolean));
    return Array.from(set).sort((a, b) => monthSortValue(b) - monthSortValue(a));
  }, [plans]);

  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedSale, setSelectedSale] = useState('ALL');
  const [page, setPage] = useState(1);

  // Default to the newest month once the list is known, so the table doesn't
  // open showing every month's rows mixed together.
  useEffect(() => {
    if (selectedMonth === 'ALL' && monthsList.length) setSelectedMonth(monthsList[0]);
  }, [monthsList]); // eslint-disable-line react-hooks/exhaustive-deps

  const salesList = useMemo(() => {
    const set = new Set(plans.map(p => p.sale).filter(Boolean));
    return Array.from(set);
  }, [plans]);

  const filteredPlans = useMemo(() => {
    return plans.filter(p => {
      if (selectedMonth !== 'ALL' && p.month !== selectedMonth) return false;
      if (canFilterAllSales) {
        if (selectedSale !== 'ALL' && !p.sale.toLowerCase().includes(selectedSale.toLowerCase())) return false;
      } else if (!p.sale.toLowerCase().includes((activeUser.saleId || '').toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [plans, selectedMonth, selectedSale, canFilterAllSales, activeUser]);

  const { safePage, pageItems: pagedPlans } = usePagedSlice(filteredPlans, page, PAGE_SIZE);

  const totals = useMemo(() => filteredPlans.reduce((acc, p) => {
    acc.planKpi += p.planKpi || 0;
    acc.planUpdate += p.planUpdate || 0;
    acc.done += p.done || 0;
    acc.chenh += (p.done || 0) - (p.planUpdate || 0);
    return acc;
  }, { planKpi: 0, planUpdate: 0, done: 0, chenh: 0 }), [filteredPlans]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <select className="input-field" style={{ width: '160px' }} value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setPage(1); }}>
          <option value="ALL">Tất cả tháng</option>
          {monthsList.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {canFilterAllSales && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={15} color="var(--text-muted)" />
            <select className="input-field" style={{ width: '150px' }} value={selectedSale} onChange={(e) => { setSelectedSale(e.target.value); setPage(1); }}>
              <option value="ALL">Tất cả SALE</option>
              {salesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={12} /> {filteredPlans.length.toLocaleString('vi-VN')} kế hoạch khớp bộ lọc
        </span>
      </div>

      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ width: '110px' }}>Tháng</th>
              <th style={{ width: '130px' }}>Search Code</th>
              <th>Khách hàng</th>
              <th style={{ width: '130px' }}>SALE</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Plan KPI</th>
              <th style={{ textAlign: 'right', width: '130px' }}>Plan_Update</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Done</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Chênh</th>
              <th style={{ minWidth: '150px' }}>Note</th>
              <th style={{ width: '110px' }}>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            <tr className="top-summary-row">
              <td colSpan={4} style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>Σ TỔNG CỘNG</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.planKpi)}</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.planUpdate)}</td>
              <td style={{ textAlign: 'right', color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.done)}</td>
              <td style={{ textAlign: 'right', color: totals.chenh >= 0 ? 'var(--accent-emerald-text)' : 'var(--danger)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.chenh)}</td>
              <td />
              <td />
            </tr>
            {pagedPlans.map((plan, idx) => {
              const chenh = (plan.done || 0) - (plan.planUpdate || 0);
              return (
                <tr key={`${plan.month}_${plan.searchCode}_${idx}`} style={{ height: '42px' }}>
                  <td style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--karofi-cyan)' }}>{plan.month || '—'}</td>
                  <td className="code-font" style={{ fontWeight: 800, color: 'var(--karofi-cyan)', fontSize: '0.85rem' }}>{plan.searchCode}</td>
                  <td style={{ fontWeight: 600 }}>{plan.clientName}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{plan.sale}</td>
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', fontSize: '0.8rem' }}>{fmt(plan.planKpi)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{fmt(plan.planUpdate)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{fmt(plan.done)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: chenh >= 0 ? 'var(--accent-emerald-text)' : 'var(--accent-rose)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{fmt(chenh)}</td>
                  <td style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>{plan.note || '-'}</td>
                  <td><StatusBadge status={plan.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredPlans.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '28px 16px' }}>
          Không có kế hoạch nào khớp với bộ lọc đang chọn.
        </div>
      ) : (
        <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={filteredPlans.length} onPageChange={setPage} itemLabel="kế hoạch" />
      )}
    </div>
  );
}
