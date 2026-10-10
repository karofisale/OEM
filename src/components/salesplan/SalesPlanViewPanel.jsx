import React, { useState, useMemo, useEffect } from 'react';
import { Filter, User } from 'lucide-react';
import Pagination, { usePagedSlice } from '../Pagination';
import SortableTh from '../SortableTh';
import StatusBadge from '../StatusBadge';
import TableState from '../TableState';
import { useTableSort } from '../../hooks/useTableSort';
import { usePersistentState } from '../../hooks/usePersistentState';
import { monthSortValue } from '../../utils/period';
import { canSeeAllSales } from '../../utils/roles';
import { doneMoiThang, dtCuaThang, doneDong } from '../../utils/salesPlan';

const PAGE_SIZE = 25;

const fmt = (v) => (v || 0).toLocaleString('vi-VN');

// Các cột Tuần 1-5 = số Sale đã GỬI (w1..w5, như màn Chờ duyệt / Đề xuất); đặt SAU cột Chênh (theo yêu cầu 05/10/2026).
const TUAN = ['w1', 'w2', 'w3', 'w4', 'w5'];

// Read-only table over whatever tab Plan_Thang currently holds — filterable by
// month (now a real per-row field) and, for Admin/Creator/Leader, by Sale.
export default function SalesPlanViewPanel({ plans, transactions, activeUser }) {
  const canFilterAllSales = canSeeAllSales(activeUser.role);
  const monthsList = useMemo(() => {
    const set = new Set(plans.map(p => p.month).filter(Boolean));
    return Array.from(set).sort((a, b) => monthSortValue(b) - monthSortValue(a));
  }, [plans]);

  // Done tính từ tab Data (oem.transactions) theo từng tháng — KHÔNG đọc cột "done" của Plan_Thang (ảnh chụp
  // đông cứng từ đêm cắt sang Postgres 26/09/2026). Xem doneDong(). Sửa 30/09/2026.
  const doneBang = useMemo(() => doneMoiThang(transactions, monthsList), [transactions, monthsList]);
  const doneCua = (p) => doneDong(p, p.searchCode, dtCuaThang(doneBang, p.month)).value;

  // Bộ lọc tháng + Sale nhớ qua F5 (Đợt 2 / mục 9). `null` = chưa chọn -> tháng mới nhất;
  // 'ALL' = người dùng CHỦ ĐỘNG chọn "Tất cả tháng" (bản cũ ép về tháng mới nhất mỗi lần dữ liệu
  // nạp lại nên lựa chọn này không bao giờ giữ được).
  const [monthSaved, setSelectedMonth] = usePersistentState('plan.view.month', null);
  const [saleSaved, setSelectedSale] = usePersistentState('plan.view.sale', 'ALL');
  const [page, setPage] = useState(1);

  const salesList = useMemo(() => {
    const set = new Set(plans.map(p => p.sale).filter(Boolean));
    return Array.from(set);
  }, [plans]);

  // Giá trị hiệu lực: tháng/Sale đã nhớ mà không còn trong dữ liệu -> quay về mặc định (tháng mới
  // nhất / tất cả Sale) thay vì ra bảng trống vì bộ lọc cũ.
  const selectedMonth = monthSaved === 'ALL' ? 'ALL' : (monthSaved && monthsList.includes(monthSaved) ? monthSaved : (monthsList[0] || 'ALL'));
  const selectedSale = saleSaved === 'ALL' || salesList.includes(saleSaved) ? saleSaved : 'ALL';

  const filteredPlans = useMemo(() => {
    return plans.filter(p => {
      if (selectedMonth !== 'ALL' && p.month !== selectedMonth) return false;
      if (selectedSale !== 'ALL' && !p.sale.toLowerCase().includes(selectedSale.toLowerCase())) return false;
      return true;
    });
  }, [plans, selectedMonth, selectedSale, canFilterAllSales, activeUser]);

  // Sắp xếp theo cột TRƯỚC khi cắt trang (Đợt 2 / mục 3). Cột Done/Chênh tính từ Data nên cần `get`.
  const cols = useMemo(() => [
    { key: 'month', type: 'month' }, { key: 'searchCode' }, { key: 'clientName' }, { key: 'sale' },
    { key: 'planKpi', type: 'number' }, { key: 'planUpdate', type: 'number' },
    { key: 'done', type: 'number', get: (p) => doneCua(p) },
    { key: 'chenh', type: 'number', get: (p) => doneCua(p) - (p.planUpdate || 0) },
    ...TUAN.map((k) => ({ key: k, type: 'number' })),
    { key: 'note' }, { key: 'status' }
  ], [doneBang]); // eslint-disable-line react-hooks/exhaustive-deps
  const { rows: sortedPlans, sort, onSort } = useTableSort(filteredPlans, cols);
  const { safePage, pageItems: pagedPlans } = usePagedSlice(sortedPlans, page, PAGE_SIZE);

  const totals = useMemo(() => filteredPlans.reduce((acc, p) => {
    const done = doneCua(p);
    acc.planKpi += p.planKpi || 0;
    acc.w1 += p.w1 || 0; acc.w2 += p.w2 || 0; acc.w3 += p.w3 || 0; acc.w4 += p.w4 || 0; acc.w5 += p.w5 || 0;
    acc.planUpdate += p.planUpdate || 0;
    acc.done += done;
    acc.chenh += done - (p.planUpdate || 0);
    return acc;
  }, { planKpi: 0, w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, planUpdate: 0, done: 0, chenh: 0 }), [filteredPlans, doneBang]); // eslint-disable-line react-hooks/exhaustive-deps

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

      <TableState isEmpty={filteredPlans.length === 0} emptyText="Không có kế hoạch nào khớp với bộ lọc đang chọn.">
      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <SortableTh col="month" sort={sort} onSort={onSort} style={{ width: '110px' }}>Tháng</SortableTh>
              <SortableTh col="searchCode" sort={sort} onSort={onSort} style={{ width: '130px' }}>Search Code</SortableTh>
              <SortableTh col="clientName" sort={sort} onSort={onSort}>Khách hàng</SortableTh>
              <SortableTh col="sale" sort={sort} onSort={onSort} style={{ width: '130px' }}>SALE</SortableTh>
              <SortableTh col="planKpi" sort={sort} onSort={onSort} align="right" style={{ width: '120px' }}>Plan KPI</SortableTh>
              <SortableTh col="planUpdate" sort={sort} onSort={onSort} align="right" style={{ width: '130px' }}>Plan_Update</SortableTh>
              <SortableTh col="done" sort={sort} onSort={onSort} align="right" style={{ width: '120px' }}>Done</SortableTh>
              <SortableTh col="chenh" sort={sort} onSort={onSort} align="right" style={{ width: '120px' }}>Chênh</SortableTh>
              {TUAN.map((k, i) => <SortableTh key={k} col={k} sort={sort} onSort={onSort} align="right" style={{ width: '110px' }}>Tuần {i + 1}</SortableTh>)}
              <SortableTh col="note" sort={sort} onSort={onSort} style={{ minWidth: '150px' }}>Note</SortableTh>
              <SortableTh col="status" sort={sort} onSort={onSort} style={{ width: '110px' }}>Trạng thái</SortableTh>
            </tr>
          </thead>
          <tbody>
            <tr className="top-summary-row">
              <td colSpan={4} style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>Σ TỔNG CỘNG</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.planKpi)}</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.planUpdate)}</td>
              <td style={{ textAlign: 'right', color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.done)}</td>
              <td style={{ textAlign: 'right', color: totals.chenh >= 0 ? 'var(--accent-emerald-text)' : 'var(--danger)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.chenh)}</td>
              {TUAN.map((k) => <td key={k} style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals[k])}</td>)}
              <td />
              <td />
            </tr>
            {pagedPlans.map((plan, idx) => {
              const done = doneCua(plan);
              const chenh = done - (plan.planUpdate || 0);
              return (
                <tr key={`${plan.month}_${plan.searchCode}_${idx}`} style={{ height: '42px' }}>
                  <td style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--cyan-text)' }}>{plan.month || '—'}</td>
                  <td className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)', fontSize: '0.85rem' }}>{plan.searchCode}</td>
                  <td style={{ fontWeight: 600 }}>{plan.clientName}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{plan.sale}</td>
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', fontSize: '0.8rem' }}>{fmt(plan.planKpi)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{fmt(plan.planUpdate)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{fmt(done)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: chenh >= 0 ? 'var(--accent-emerald-text)' : 'var(--danger-strong)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{fmt(chenh)}</td>
                  {TUAN.map((k) => <td key={k} style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', fontSize: '0.8rem' }}>{fmt(plan[k])}</td>)}
                  <td style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>{plan.note || '-'}</td>
                  <td><StatusBadge status={plan.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={filteredPlans.length} onPageChange={setPage} itemLabel="kế hoạch" />
      </TableState>
    </div>
  );
}
