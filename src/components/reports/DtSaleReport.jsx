import React, { useMemo, useState } from 'react';
import { Filter, Table, LayoutGrid } from 'lucide-react';
import { weeksFromTransactions, resolvePeriod, inPeriod } from '../../utils/period';

export default function DtSaleReport({ transactions, viewMode }) {
  // null = chưa chọn: năm rơi về năm mới nhất có dữ liệu, tháng rơi về tháng mới nhất CỦA NĂM đó (không phải tháng theo
  // đồng hồ máy: mùng 1-3 đợt đổ dữ liệu SAP chưa về thì màn sẽ rỗng). "Tất cả tháng" chỉ cộng trong năm đang chọn —
  // không còn mục "Tất cả năm" trộn các năm vào một số (02/10/2026).
  const [saleFilterYear, setSaleFilterYear] = useState(null);
  const [saleFilterMonth, setSaleFilterMonth] = useState(null);
  const [saleFilterWeek, setSaleFilterWeek] = useState('ALL');

  const weeksList = useMemo(() => weeksFromTransactions(transactions), [transactions]);
  const { years: yearsList, year: effectiveYear, months: monthsList, month: effectiveMonth } =
    useMemo(() => resolvePeriod(transactions, saleFilterYear, saleFilterMonth), [transactions, saleFilterYear, saleFilterMonth]);

  const dtSaleData = useMemo(() => {
    const map = new Map();

    transactions.forEach(t => {
      if (!inPeriod(t, effectiveYear, effectiveMonth)) return;
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
          <Filter size={15} color="var(--karofi-cyan)" />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Năm:</span>
          <select className="input-field" style={{ width: '110px' }} value={effectiveYear} onChange={(e) => { setSaleFilterYear(e.target.value); setSaleFilterMonth(null); }} aria-label="Lọc theo năm">
            {yearsList.map(y => <option key={y} value={y}>Năm {y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>➔ Lọc Tháng:</span>
          <select className="input-field" style={{ width: '190px' }} value={effectiveMonth} onChange={(e) => setSaleFilterMonth(e.target.value)} aria-label="Lọc theo tháng">
            <option value="ALL">Tất cả tháng năm {effectiveYear}</option>
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
                <td style={{ color: 'var(--karofi-navy)' }}>Σ</td>
                <td style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>TỔNG CỘNG HỆ THỐNG</td>
                <td style={{ color: 'var(--karofi-navy)' }}>{dtSaleTotals.orderCount} đơn</td>
                <td style={{ textAlign: 'right', color: 'var(--karofi-navy)' }}>{dtSaleTotals.totalQty.toLocaleString('vi-VN')} PC</td>
                <td style={{ textAlign: 'right', color: 'var(--summary-navy)', fontSize: '0.95rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>
                  {dtSaleTotals.totalRevenue.toLocaleString('vi-VN')} ₫
                </td>
                <td style={{ color: 'var(--karofi-navy)' }}>100%</td>
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
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {item.totalRevenue.toLocaleString('vi-VN')} ₫
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--karofi-cyan)', borderRadius: '4px' }} />
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
