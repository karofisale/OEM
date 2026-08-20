import React, { useMemo, useState } from 'react';
import { Filter, Table, LayoutGrid } from 'lucide-react';
import { monthsFromTransactions, yearsFromTransactions, weeksFromTransactions } from '../../utils/period';

export default function DtSaleReport({ transactions, viewMode }) {
  // null = not chosen yet; resolves to the newest year present once data loads.
  // Was hardcoded '2026' with a single <option>Năm 2026</option>.
  const [saleFilterYear, setSaleFilterYear] = useState(null);
  const [saleFilterMonth, setSaleFilterMonth] = useState('ALL');
  const [saleFilterWeek, setSaleFilterWeek] = useState('ALL');

  const yearsList = useMemo(() => yearsFromTransactions(transactions), [transactions]);
  const weeksList = useMemo(() => weeksFromTransactions(transactions), [transactions]);
  const effectiveYear = saleFilterYear ?? yearsList[0] ?? 'ALL';

  // Months are scoped to the chosen year, so the cascade can't offer a month
  // that yields nothing.
  const monthsList = useMemo(() => {
    const all = monthsFromTransactions(transactions);
    return effectiveYear === 'ALL' ? all : all.filter(m => m.endsWith(`-${effectiveYear}`));
  }, [transactions, effectiveYear]);

  // If the year changes out from under the selected month, drop back to "all".
  const effectiveMonth = monthsList.includes(saleFilterMonth) ? saleFilterMonth : 'ALL';

  const dtSaleData = useMemo(() => {
    const map = new Map();

    transactions.forEach(t => {
      if (effectiveYear !== 'ALL' && !String(t.month || '').endsWith(`-${effectiveYear}`)) return;
      if (effectiveMonth !== 'ALL' && t.month !== effectiveMonth) return;
      if (saleFilterWeek !== 'ALL' && t.week !== saleFilterWeek) return;

      const saleName = t.sale || 'Khác';
      if (!map.has(saleName)) {
        map.set(saleName, { sale: saleName, totalRevenue: 0, totalQty: 0, orderCount: 0 });
      }
      const item = map.get(saleName);
      item.totalRevenue += t.netRevenue || 0;
      item.totalQty += t.qty || 0;
      item.orderCount += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [transactions, effectiveYear, effectiveMonth, saleFilterWeek]);

  const dtSaleTotals = useMemo(() => {
    return dtSaleData.reduce((acc, i) => {
      acc.totalRevenue += i.totalRevenue;
      acc.totalQty += i.totalQty;
      acc.orderCount += i.orderCount;
      return acc;
    }, { totalRevenue: 0, totalQty: 0, orderCount: 0 });
  }, [dtSaleData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Cascading Filters Bar */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={15} color="#00a0e9" />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Năm:</span>
          <select className="input-field" style={{ width: '110px' }} value={effectiveYear} onChange={(e) => setSaleFilterYear(e.target.value)} aria-label="Lọc theo năm">
            <option value="ALL">Tất cả Năm</option>
            {yearsList.map(y => <option key={y} value={y}>Năm {y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>➔ Lọc Tháng:</span>
          <select className="input-field" style={{ width: '130px' }} value={effectiveMonth} onChange={(e) => setSaleFilterMonth(e.target.value)} aria-label="Lọc theo tháng">
            <option value="ALL">Tất cả Tháng</option>
            {monthsList.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>➔ Lọc Tuần:</span>
          <select className="input-field" style={{ width: '110px' }} value={saleFilterWeek} onChange={(e) => setSaleFilterWeek(e.target.value)} aria-label="Lọc theo tuần">
            <option value="ALL">Tất cả Tuần</option>
            {weeksList.map(w => <option key={w} value={w}>Tuần {w.replace('W', '')} ({w})</option>)}
          </select>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="table-container animate-fade-in" style={{ maxHeight: '560px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>SALE</th>
                <th>Số Đơn Hàng</th>
                <th style={{ textAlign: 'right' }}>Sản Lượng (PC)</th>
                <th style={{ textAlign: 'right' }}>DT thuần (VND)</th>
                <th>Tỷ Lệ Đóng Góp</th>
              </tr>
            </thead>
            <tbody>
              <tr className="top-summary-row">
                <td style={{ color: '#004e89' }}>Σ</td>
                <td style={{ color: '#004e89', fontWeight: 900 }}>TỔNG CỘNG HỆ THỐNG</td>
                <td style={{ color: '#004e89' }}>{dtSaleTotals.orderCount} đơn</td>
                <td style={{ textAlign: 'right', color: '#004e89' }}>{dtSaleTotals.totalQty.toLocaleString('vi-VN')} PC</td>
                <td style={{ textAlign: 'right', color: '#005fa7', fontSize: '0.95rem', fontFamily: 'JetBrains Mono', fontWeight: 900 }}>
                  {dtSaleTotals.totalRevenue.toLocaleString('vi-VN')} ₫
                </td>
                <td style={{ color: '#004e89' }}>100%</td>
              </tr>

              {dtSaleData.map((item, idx) => {
                const grandTotal = dtSaleTotals.totalRevenue || 1;
                const pct = Math.round((item.totalRevenue / grandTotal) * 100);
                return (
                  <tr key={item.sale}>
                    <td style={{ fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ fontWeight: 700, color: 'var(--karofi-navy)' }}>{item.sale}</td>
                    <td style={{ fontWeight: 600 }}>{item.orderCount} đơn</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.totalQty.toLocaleString('vi-VN')} PC</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'JetBrains Mono' }}>
                      {item.totalRevenue.toLocaleString('vi-VN')} ₫
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#00a0e9', borderRadius: '4px' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }} className="animate-fade-in">
          {dtSaleData.map((item, idx) => (
            <div key={item.sale} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--karofi-navy)' }}>{item.sale}</h4>
                <span className="badge badge-blue">Hạng {idx + 1}</span>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                {(item.totalRevenue / 1e6).toFixed(1)} Triệu ₫
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
