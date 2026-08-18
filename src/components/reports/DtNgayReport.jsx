import React, { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';

export default function DtNgayReport({ transactions, salesList, canFilterAllSales, viewMode }) {
  const [ngayFilterSale, setNgayFilterSale] = useState('ALL');
  const [ngayFilterMonth, setNgayFilterMonth] = useState('T08-2026');
  const [ngayFilterWeek, setNgayFilterWeek] = useState('ALL');

  const dtNgayData = useMemo(() => {
    const map = new Map();

    transactions.forEach(t => {
      if (canFilterAllSales && ngayFilterSale !== 'ALL' && !(t.sale || '').toLowerCase().includes(ngayFilterSale.toLowerCase())) return;
      if (ngayFilterMonth !== 'ALL' && t.month !== ngayFilterMonth) return;
      if (ngayFilterWeek !== 'ALL' && t.week !== ngayFilterWeek) return;

      const dateStr = t.date || 'Chưa ngày';
      const key = `${dateStr}_${t.clientCode}`;

      if (!map.has(key)) {
        map.set(key, {
          date: dateStr,
          clientCode: t.clientCode,
          clientName: t.clientName,
          sale: t.sale,
          month: t.month,
          week: t.week,
          totalRevenue: 0
        });
      }
      const item = map.get(key);
      item.totalRevenue += t.netRevenue || 0;
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, ngayFilterSale, ngayFilterMonth, ngayFilterWeek, canFilterAllSales]);

  const dtNgayTotals = useMemo(() => {
    return dtNgayData.reduce((acc, i) => {
      acc.totalRevenue += i.totalRevenue;
      return acc;
    }, { totalRevenue: 0 });
  }, [dtNgayData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Filters Bar */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 20px' }}>
        {canFilterAllSales && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="#00a0e9" />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc SALE:</span>
            <select className="input-field" style={{ width: '150px' }} value={ngayFilterSale} onChange={(e) => setNgayFilterSale(e.target.value)}>
              <option value="ALL">Tất cả SALE</option>
              {salesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Tháng:</span>
          <select className="input-field" style={{ width: '140px' }} value={ngayFilterMonth} onChange={(e) => setNgayFilterMonth(e.target.value)}>
            <option value="ALL">Tất cả Tháng</option>
            <option value="T08-2026">Tháng hiện tại (T08)</option>
            <option value="T07-2026">Tháng T07</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Tuần:</span>
          <select className="input-field" style={{ width: '120px' }} value={ngayFilterWeek} onChange={(e) => setNgayFilterWeek(e.target.value)}>
            <option value="ALL">Tất cả Tuần</option>
            <option value="W1">Tuần 1 (W1)</option>
            <option value="W2">Tuần 2 (W2)</option>
            <option value="W3">Tuần 3 (W3)</option>
            <option value="W4">Tuần 4 (W4)</option>
            <option value="W5">Tuần 5 (W5)</option>
          </select>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="table-container animate-fade-in" style={{ maxHeight: '520px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Ngày Phát Sinh</th>
                <th>Client</th>
                <th>Tên Khách Hàng OEM</th>
                <th>SALE</th>
                <th style={{ textAlign: 'right' }}>DT thuần (VND)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="top-summary-row">
                <td style={{ color: '#004e89' }}>Σ</td>
                <td style={{ color: '#004e89', fontWeight: 900 }}>TỔNG CỘNG</td>
                <td style={{ color: '#004e89' }}>Tất cả phát sinh ngày</td>
                <td style={{ color: '#004e89' }}>All SALE</td>
                <td style={{ textAlign: 'right', color: '#005fa7', fontSize: '0.95rem', fontFamily: 'JetBrains Mono', fontWeight: 900 }}>
                  {dtNgayTotals.totalRevenue.toLocaleString('vi-VN')} ₫
                </td>
              </tr>

              {dtNgayData.slice(0, 50).map((row) => (
                <tr key={`${row.date}_${row.clientCode}`}>
                  <td style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.8rem' }}>{row.date}</td>
                  <td className="code-font" style={{ fontWeight: 800, color: '#00a0e9' }}>{row.clientCode}</td>
                  <td style={{ fontWeight: 700 }}>{row.clientName}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>{row.sale}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'JetBrains Mono' }}>
                    {row.totalRevenue.toLocaleString('vi-VN')} ₫
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }} className="animate-fade-in">
          {dtNgayData.slice(0, 30).map((row) => (
            <div key={`${row.date}_${row.clientCode}`} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{row.date}</span>
                <span className="code-font" style={{ fontSize: '0.8rem', fontWeight: 800, color: '#00a0e9' }}>{row.clientCode}</span>
              </div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>{row.clientName}</h4>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                {row.totalRevenue.toLocaleString('vi-VN')} ₫
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
