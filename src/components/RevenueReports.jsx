import React, { useMemo } from 'react';
import { PieChart } from 'lucide-react';
import KeepAliveTab from './KeepAliveTab';
import SubTabs from './SubTabs';
import ViewModeToggle from './ViewModeToggle';
import { SUBTABS } from '../utils/navMeta';
import { usePersistentState } from '../hooks/usePersistentState';
import DtSaleReport from './reports/DtSaleReport';
import DtThangReport from './reports/DtThangReport';
import DtNgayReport from './reports/DtNgayReport';
import { canSeeAllSales } from '../utils/roles';

export default function RevenueReports({ transactions, txYears, clients, activeUser, baselines2025 }) {
  // Nhớ tab báo cáo + kiểu xem qua F5 (Đợt 2 / mục 9).
  const [reportTab, setReportTab] = usePersistentState('reports.tab', 'dt-sale', (v) => SUBTABS['revenue-reports'].some((t) => t.id === v)); // 'dt-sale' | 'dt-thang' | 'kh-date'
  const [viewMode, setViewMode] = usePersistentState('reports.view', 'table', (v) => v === 'table' || v === 'grid'); // 'table' | 'grid'

  const canFilterAllSales = canSeeAllSales(activeUser.role);

  // 14/09/2026: Sale xem được doanh thu của mọi Sale, chọn xem của ai bằng bộ
  // lọc SALE ngay bên dưới. Trước đây hàm này cắt cứng theo saleId nên dù
  // backend có gửi đủ thì màn này vẫn chỉ hiện của riêng mình.
  const scopedTransactions = transactions;

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
            <PieChart size={24} color="var(--karofi-cyan)" /> Báo cáo doanh thu
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Theo dõi phân tích doanh số đa chiều theo Sale, theo Tháng và theo Ngày phát sinh.
          </p>
        </div>

        {/* View Mode Toggle */}
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Main Tabs Navigation */}
      <SubTabs tabs={SUBTABS['revenue-reports']} active={reportTab} onChange={setReportTab} ariaLabel="Báo cáo doanh thu" />

      {/* Perf (2026-08-27): giữ nguyên 3 tab báo cáo (KeepAliveTab) thay vì
          unmount. Không panel nào gọi backend ở đây, nhưng mỗi tab tổng hợp lại
          TOÀN BỘ lịch sử giao dịch bằng useMemo — bấm qua lại giữa 3 tab trước
          đây là tính lại từ đầu mỗi lần, kèm mất bộ lọc năm/tháng/tuần/sale và
          trang đang xem. */}
      <KeepAliveTab isActive={reportTab === 'dt-sale'}>
        <DtSaleReport transactions={scopedTransactions} txYears={txYears} viewMode={viewMode} />
      </KeepAliveTab>

      <KeepAliveTab isActive={reportTab === 'dt-thang'}>
        <DtThangReport
          transactions={scopedTransactions}
          txYears={txYears}
          salesList={salesList}
          canFilterAllSales={canFilterAllSales}
          viewMode={viewMode}
          baselines2025={baselines2025}
        />
      </KeepAliveTab>

      <KeepAliveTab isActive={reportTab === 'kh-date'}>
        <DtNgayReport
          transactions={scopedTransactions}
          txYears={txYears}
          salesList={salesList}
          canFilterAllSales={canFilterAllSales}
          viewMode={viewMode}
        />
      </KeepAliveTab>
    </div>
  );
}
