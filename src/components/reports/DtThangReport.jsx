import React, { useMemo, useState } from 'react';
import { Filter, TrendingUp, TrendingDown } from 'lucide-react';

function getPriorMonth(m) {
  if (m === 'T08-2026') return 'T07-2026';
  if (m === 'T07-2026') return 'T06-2026';
  if (m === 'T06-2026') return 'T05-2026';
  if (m === 'T05-2026') return 'T04-2026';
  if (m === 'T04-2026') return 'T03-2026';
  return 'T07-2026';
}

export default function DtThangReport({ transactions, salesList, canFilterAllSales, viewMode, baselines2025 }) {
  const [thangFilterSale, setThangFilterSale] = useState('ALL');
  const [thangFilterMonth, setThangFilterMonth] = useState('ALL');

  const dtThangData = useMemo(() => {
    const map = new Map();
    const targetMonth = thangFilterMonth;
    const priorMonth = getPriorMonth(targetMonth);

    transactions.forEach(t => {
      if (canFilterAllSales && thangFilterSale !== 'ALL' && !(t.sale || '').toLowerCase().includes(thangFilterSale.toLowerCase())) return;

      const clientCode = t.clientCode || 'OEM-CLIENT';
      if (!map.has(clientCode)) {
        map.set(clientCode, {
          clientCode: clientCode,
          clientName: t.clientName,
          sale: t.sale,
          totalRevenue: 0,
          currentSelectedMonthRevenue: 0,
          priorMonthRevenue: 0
        });
      }
      const item = map.get(clientCode);

      if (thangFilterMonth === 'ALL') {
        item.totalRevenue += t.netRevenue || 0;
      } else {
        if (t.month === targetMonth) {
          item.totalRevenue += t.netRevenue || 0;
          item.currentSelectedMonthRevenue += t.netRevenue || 0;
        }
        if (t.month === priorMonth) {
          item.priorMonthRevenue += t.netRevenue || 0;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [transactions, thangFilterSale, thangFilterMonth, canFilterAllSales]);

  const dtThangTotals = useMemo(() => {
    return dtThangData.reduce((acc, i) => {
      acc.totalRevenue += i.totalRevenue;
      return acc;
    }, { totalRevenue: 0 });
  }, [dtThangData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Filters */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 20px' }}>
        {canFilterAllSales && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="#00a0e9" />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Theo SALE:</span>
            <select className="input-field" style={{ width: '160px' }} value={thangFilterSale} onChange={(e) => setThangFilterSale(e.target.value)}>
              <option value="ALL">Tất cả SALE</option>
              {salesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Theo Tháng:</span>
          <select className="input-field" style={{ width: '150px' }} value={thangFilterMonth} onChange={(e) => setThangFilterMonth(e.target.value)}>
            <option value="ALL">Tất cả các Tháng (So với 2025)</option>
            <option value="T08-2026">T08-2026 (So với T07)</option>
            <option value="T07-2026">T07-2026 (So với T06)</option>
            <option value="T06-2026">T06-2026 (So với T05)</option>
            <option value="T05-2026">T05-2026 (So với T04)</option>
          </select>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="table-container animate-fade-in" style={{ maxHeight: '560px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Tên Khách Hàng OEM</th>
                <th>SALE</th>
                <th style={{ textAlign: 'right' }}>DT thuần (VND)</th>
                <th>Biến động</th>
              </tr>
            </thead>
            <tbody>
              <tr className="top-summary-row">
                <td style={{ color: '#004e89' }}>Σ</td>
                <td style={{ color: '#004e89', fontWeight: 900 }}>TỔNG CỘNG HỆ THỐNG</td>
                <td style={{ color: '#004e89' }}>Tất cả Sales</td>
                <td style={{ textAlign: 'right', color: '#005fa7', fontSize: '0.95rem', fontFamily: 'JetBrains Mono', fontWeight: 900 }}>
                  {dtThangTotals.totalRevenue.toLocaleString('vi-VN')} ₫
                </td>
                <td style={{ color: '#004e89' }}>Doanh Thu Tháng</td>
              </tr>

              {dtThangData.map((row) => {
                // `null` means "no real basis for a comparison". Previously a
                // missing 2025 baseline fell back to `row.totalRevenue * 0.85`,
                // i.e. the app invented the number it was comparing against and
                // then reported a confident "Tăng +18% (vs 2025)" derived from
                // it — a fabricated figure, in a report read by management.
                // A missing prior month likewise showed a flat "+100%".
                let baseline = null;
                let compareLabel = '';

                if (thangFilterMonth === 'ALL') {
                  const b2025 = baselines2025.get(row.clientCode);
                  baseline = b2025 > 0 ? b2025 : null;
                  compareLabel = 'vs 2025';
                } else {
                  baseline = row.priorMonthRevenue > 0 ? row.priorMonthRevenue : null;
                  compareLabel = `vs ${getPriorMonth(thangFilterMonth)}`;
                }

                const hasBaseline = baseline !== null;
                const percentChange = hasBaseline
                  ? Math.round(((row.totalRevenue - baseline) / baseline) * 100)
                  : null;
                const isPositive = hasBaseline && percentChange >= 0;

                return (
                  <tr key={row.clientCode}>
                    <td className="code-font" style={{ fontWeight: 800, color: '#00a0e9' }}>{row.clientCode}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>{row.clientName}</td>
                    <td style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>{row.sale}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'JetBrains Mono' }}>
                      {row.totalRevenue.toLocaleString('vi-VN')} ₫
                    </td>
                    <td>
                      {!hasBaseline ? (
                        <span
                          className="badge"
                          style={{ background: 'var(--bg-input)', color: 'var(--text-dim)' }}
                          title={`Không có số liệu ${compareLabel.replace('vs ', '')} để đối chiếu`}
                        >
                          — Chưa có số liệu {compareLabel.replace('vs ', '')}
                        </span>
                      ) : isPositive ? (
                        <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <TrendingUp size={12} /> Tăng +{percentChange}% ({compareLabel})
                        </span>
                      ) : (
                        <span className="badge badge-rose" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <TrendingDown size={12} /> Giảm {percentChange}% ({compareLabel})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }} className="animate-fade-in">
          {dtThangData.map((row) => (
            <div key={row.clientCode} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="code-font" style={{ fontSize: '0.8rem', fontWeight: 800, color: '#00a0e9' }}>{row.clientCode}</span>
                <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>{row.sale}</span>
              </div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{row.clientName}</h4>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                {row.totalRevenue.toLocaleString('vi-VN')} ₫
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
