import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  User,
  Calendar,
  CalendarDays,
  Table,
  LayoutGrid,
  Filter,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

export default function RevenueReports({ transactions, clients, activeUser, baselines2025 }) {
  const [reportTab, setReportTab] = useState('dt-sale'); // 'dt-sale' | 'dt-thang' | 'kh-date'
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

  // --- DT SALE FILTERS ---
  const [saleFilterYear, setSaleFilterYear] = useState('2026');
  const [saleFilterMonth, setSaleFilterMonth] = useState('ALL');
  const [saleFilterWeek, setSaleFilterWeek] = useState('ALL');

  // --- DT THÁNG FILTERS ---
  const [thangFilterSale, setThangFilterSale] = useState('ALL');
  const [thangFilterMonth, setThangFilterMonth] = useState('ALL');

  // --- DT NGÀY FILTERS ---
  const [ngayFilterSale, setNgayFilterSale] = useState('ALL');
  const [ngayFilterMonth, setNgayFilterMonth] = useState('T08-2026'); // Default current month
  const [ngayFilterWeek, setNgayFilterWeek] = useState('ALL');
  const [ngayFilterDate, setNgayFilterDate] = useState('ALL');

  const canFilterAllSales = ['creator', 'admin', 'leader'].includes(activeUser.role);

  // --- REPORT 1 DATA: DT SALE ---
  const dtSaleData = useMemo(() => {
    const map = new Map();

    transactions.forEach(t => {
      if (saleFilterYear !== 'ALL' && !t.month.includes(saleFilterYear)) return;
      if (saleFilterMonth !== 'ALL' && t.month !== saleFilterMonth) return;
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
  }, [transactions, saleFilterYear, saleFilterMonth, saleFilterWeek]);

  // DT Sale Totals
  const dtSaleTotals = useMemo(() => {
    return dtSaleData.reduce((acc, i) => {
      acc.totalRevenue += i.totalRevenue;
      acc.totalQty += i.totalQty;
      acc.orderCount += i.orderCount;
      return acc;
    }, { totalRevenue: 0, totalQty: 0, orderCount: 0 });
  }, [dtSaleData]);

  // Helper to get prior month string
  const getPriorMonth = (m) => {
    if (m === 'T08-2026') return 'T07-2026';
    if (m === 'T07-2026') return 'T06-2026';
    if (m === 'T06-2026') return 'T05-2026';
    if (m === 'T05-2026') return 'T04-2026';
    if (m === 'T04-2026') return 'T03-2026';
    return 'T07-2026';
  };

  // --- REPORT 2 DATA: DT THÁNG ---
  const dtThangData = useMemo(() => {
    const map = new Map();
    const targetMonth = thangFilterMonth;
    const priorMonth = getPriorMonth(targetMonth);

    transactions.forEach(t => {
      if (thangFilterSale !== 'ALL' && !t.sale.toLowerCase().includes(thangFilterSale.toLowerCase())) return;

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
  }, [transactions, thangFilterSale, thangFilterMonth]);

  // DT Tháng Totals
  const dtThangTotals = useMemo(() => {
    return dtThangData.reduce((acc, i) => {
      acc.totalRevenue += i.totalRevenue;
      return acc;
    }, { totalRevenue: 0 });
  }, [dtThangData]);

  // --- REPORT 3 DATA: DT NGÀY ---
  const dtNgayData = useMemo(() => {
    const map = new Map();

    transactions.forEach(t => {
      if (ngayFilterSale !== 'ALL' && !t.sale.toLowerCase().includes(ngayFilterSale.toLowerCase())) return;
      if (ngayFilterMonth !== 'ALL' && t.month !== ngayFilterMonth) return;
      if (ngayFilterWeek !== 'ALL' && t.week !== ngayFilterWeek) return;
      if (ngayFilterDate !== 'ALL' && t.date !== ngayFilterDate) return;

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
  }, [transactions, ngayFilterSale, ngayFilterMonth, ngayFilterWeek, ngayFilterDate]);

  // DT Ngày Totals
  const dtNgayTotals = useMemo(() => {
    return dtNgayData.reduce((acc, i) => {
      acc.totalRevenue += i.totalRevenue;
      return acc;
    }, { totalRevenue: 0 });
  }, [dtNgayData]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Banner */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3 size={24} color="#00a0e9" /> Báo cáo doanh thu
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Theo dõi phân tích doanh số đa chiều theo Sale, theo Tháng và theo Ngày phát sinh.
          </p>
        </div>

        {/* View Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-main)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <button 
            onClick={() => setViewMode('table')}
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Table size={14} /> Dạng Bảng
          </button>
          <button 
            onClick={() => setViewMode('grid')}
            className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <LayoutGrid size={14} /> Dạng Lưới
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="glass-card" style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setReportTab('dt-sale')}
            className={`btn ${reportTab === 'dt-sale' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <User size={16} /> DT Sale
          </button>
          <button
            onClick={() => setReportTab('dt-thang')}
            className={`btn ${reportTab === 'dt-thang' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Calendar size={16} /> DT Tháng
          </button>
          <button
            onClick={() => setReportTab('kh-date')}
            className={`btn ${reportTab === 'kh-date' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <CalendarDays size={16} /> DT Ngày
          </button>
        </div>
      </div>

      {/* --- TAB 1: DT SALE --- */}
      {reportTab === 'dt-sale' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Cascading Filters Bar */}
          <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={15} color="#00a0e9" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Năm:</span>
              <select className="input-field" style={{ width: '110px' }} value={saleFilterYear} onChange={(e) => setSaleFilterYear(e.target.value)}>
                <option value="ALL">Tất cả Năm</option>
                <option value="2026">Năm 2026</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>➔ Lọc Tháng:</span>
              <select className="input-field" style={{ width: '130px' }} value={saleFilterMonth} onChange={(e) => setSaleFilterMonth(e.target.value)}>
                <option value="ALL">Tất cả Tháng</option>
                <option value="T08-2026">T08-2026</option>
                <option value="T07-2026">T07-2026</option>
                <option value="T06-2026">T06-2026</option>
                <option value="T05-2026">T05-2026</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>➔ Lọc Tuần:</span>
              <select className="input-field" style={{ width: '110px' }} value={saleFilterWeek} onChange={(e) => setSaleFilterWeek(e.target.value)}>
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
                  {/* STICKY TOP SUMMARY ROW AT THE FIRST ROW */}
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
      )}

      {/* --- TAB 2: DT THÁNG (STANDARDIZED COLUMNS + DYNAMIC COMPARISON MO/2025) --- */}
      {reportTab === 'dt-thang' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filters */}
          <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={15} color="#00a0e9" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Theo SALE:</span>
              <select className="input-field" style={{ width: '160px' }} value={thangFilterSale} onChange={(e) => setThangFilterSale(e.target.value)}>
                <option value="ALL">Tất cả SALE</option>
                <option value="KH Đình Hoan">KH Đình Hoan</option>
                <option value="KH Linh">KH Linh</option>
              </select>
            </div>

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
                  {/* STICKY TOP SUMMARY ROW AT THE FIRST ROW */}
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
                    let baseline = 0;
                    let compareLabel = '';

                    if (thangFilterMonth === 'ALL') {
                      // Compare vs 2025 baseline from Plan2026 tab!
                      baseline = baselines2025.get(row.clientCode) || (row.totalRevenue * 0.85);
                      compareLabel = 'vs 2025';
                    } else {
                      // Compare vs immediately preceding month
                      baseline = row.priorMonthRevenue || 1;
                      compareLabel = `vs ${getPriorMonth(thangFilterMonth)}`;
                    }

                    const diff = row.totalRevenue - baseline;
                    const percentChange = baseline > 0 ? Math.round((diff / baseline) * 100) : 10;
                    const isPositive = percentChange >= 0;

                    return (
                      <tr key={row.clientCode}>
                        <td className="code-font" style={{ fontWeight: 800, color: '#00a0e9' }}>{row.clientCode}</td>
                        <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>{row.clientName}</td>
                        <td style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>{row.sale}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'JetBrains Mono' }}>
                          {row.totalRevenue.toLocaleString('vi-VN')} ₫
                        </td>
                        <td>
                          {isPositive ? (
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
      )}

      {/* --- TAB 3: DT NGÀY --- */}
      {reportTab === 'kh-date' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filters Bar */}
          <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={15} color="#00a0e9" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc SALE:</span>
              <select className="input-field" style={{ width: '150px' }} value={ngayFilterSale} onChange={(e) => setNgayFilterSale(e.target.value)}>
                <option value="ALL">Tất cả SALE</option>
                <option value="KH Đình Hoan">KH Đình Hoan</option>
                <option value="KH Linh">KH Linh</option>
              </select>
            </div>

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
                  {/* STICKY TOP SUMMARY ROW AT THE FIRST ROW */}
                  <tr className="top-summary-row">
                    <td style={{ color: '#004e89' }}>Σ</td>
                    <td style={{ color: '#004e89', fontWeight: 900 }}>TỔNG CỘNG</td>
                    <td style={{ color: '#004e89' }}>Tất cả phát sinh ngày</td>
                    <td style={{ color: '#004e89' }}>All SALE</td>
                    <td style={{ textAlign: 'right', color: '#005fa7', fontSize: '0.95rem', fontFamily: 'JetBrains Mono', fontWeight: 900 }}>
                      {dtNgayTotals.totalRevenue.toLocaleString('vi-VN')} ₫
                    </td>
                  </tr>

                  {dtNgayData.slice(0, 50).map((row, idx) => (
                    <tr key={idx}>
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
              {dtNgayData.slice(0, 30).map((row, idx) => (
                <div key={idx} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
      )}

    </div>
  );
}
