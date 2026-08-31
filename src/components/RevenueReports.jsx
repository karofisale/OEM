import React, { useState, useMemo } from 'react';
import { BarChart3, User, Calendar, CalendarDays, Table, LayoutGrid } from 'lucide-react';
import KeepAliveTab from './KeepAliveTab';
import DtSaleReport from './reports/DtSaleReport';
import DtThangReport from './reports/DtThangReport';
import DtNgayReport from './reports/DtNgayReport';

export default function RevenueReports({ transactions, clients, activeUser, baselines2025 }) {
  const [reportTab, setReportTab] = useState('dt-sale'); // 'dt-sale' | 'dt-thang' | 'kh-date'
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

  const canFilterAllSales = ['creator', 'admin', 'leader'].includes(activeUser.role);

  // Sale-role users only ever see revenue for their own portfolio, across every tab —
  // mirrors the scoping already applied in ClientManagement/SalesPlan.
  const scopedTransactions = useMemo(() => {
    if (canFilterAllSales) return transactions;
    const saleId = (activeUser.saleId || '').toLowerCase();
    return transactions.filter(t => (t.sale || '').toLowerCase().includes(saleId));
  }, [transactions, canFilterAllSales, activeUser.saleId]);

  const salesList = useMemo(() => {
    const set = new Set(transactions.map(t => t.sale).filter(Boolean));
    return Array.from(set).sort();
  }, [transactions]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header Banner */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3 size={24} color="var(--karofi-cyan)" /> Báo cáo doanh thu
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            {canFilterAllSales
              ? 'Theo dõi phân tích doanh số đa chiều theo Sale, theo Tháng và theo Ngày phát sinh.'
              : `Doanh số của riêng ${activeUser.saleId || 'bạn'} — theo Tháng và theo Ngày phát sinh.`}
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

      {/* Perf (2026-08-27): giữ nguyên 3 tab báo cáo (KeepAliveTab) thay vì
          unmount. Không panel nào gọi backend ở đây, nhưng mỗi tab tổng hợp lại
          TOÀN BỘ lịch sử giao dịch bằng useMemo — bấm qua lại giữa 3 tab trước
          đây là tính lại từ đầu mỗi lần, kèm mất bộ lọc năm/tháng/tuần/sale và
          trang đang xem. */}
      <KeepAliveTab isActive={reportTab === 'dt-sale'}>
        <DtSaleReport transactions={scopedTransactions} viewMode={viewMode} />
      </KeepAliveTab>

      <KeepAliveTab isActive={reportTab === 'dt-thang'}>
        <DtThangReport
          transactions={scopedTransactions}
          salesList={salesList}
          canFilterAllSales={canFilterAllSales}
          viewMode={viewMode}
          baselines2025={baselines2025}
        />
      </KeepAliveTab>

      <KeepAliveTab isActive={reportTab === 'kh-date'}>
        <DtNgayReport
          transactions={scopedTransactions}
          salesList={salesList}
          canFilterAllSales={canFilterAllSales}
          viewMode={viewMode}
        />
      </KeepAliveTab>
    </div>
  );
}
