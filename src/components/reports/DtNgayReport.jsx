import React, { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { weeksFromTransactions, resolvePeriod, inPeriod } from '../../utils/period';
import { khopSale } from '../../utils/roles';
import Pagination, { usePagedSlice } from '../Pagination';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import { useTableSort } from '../../hooks/useTableSort';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useEnsureYears } from '../../hooks/useEnsureYears';
import { hienNgay } from '../../utils/vnDate';

const PAGE_SIZE = 50;
// Cột sắp xếp được (Đợt 2 / mục 3). Ngày so theo THỜI ĐIỂM (đọc được cả dd/MM/yyyy lẫn ISO): so chữ
// 'dd/MM/yyyy' sẽ xếp 31/08 sau 01/10.
const COLS = [
  { key: 'date', type: 'date' }, { key: 'clientCode' }, { key: 'clientName' }, { key: 'sale' },
  { key: 'totalRevenue', type: 'number' }
];
const SAP_MAC_DINH = { key: 'date', dir: 'desc' }; // mới nhất trước, như bản cũ

export default function DtNgayReport({ transactions, txYears, salesList, canFilterAllSales, viewMode }) {
  // Bộ lọc nhớ qua F5 (Đợt 2 / mục 9); giá trị đã nhớ mà không còn trong dữ liệu thì rơi về mặc định.
  const [saleSaved, setNgayFilterSale] = usePersistentState('rpt.ngay.sale', 'ALL');
  const ngayFilterSale = saleSaved === 'ALL' || (salesList || []).includes(saleSaved) ? saleSaved : 'ALL';
  // null = chưa chọn -> năm / tháng mới nhất có dữ liệu. "Tất cả tháng" chỉ cộng trong năm đang chọn (02/10/2026).
  const [ngayFilterYear, setNgayFilterYear] = usePersistentState('rpt.ngay.year', null);
  const [ngayFilterMonth, setNgayFilterMonth] = usePersistentState('rpt.ngay.month', null);
  const [weekSaved, setNgayFilterWeek] = usePersistentState('rpt.ngay.week', 'ALL');
  const [page, setPage] = useState(1);

  const weeksList = useMemo(() => weeksFromTransactions(transactions), [transactions]);
  const ngayFilterWeek = weekSaved === 'ALL' || weeksList.includes(weekSaved) ? weekSaved : 'ALL';
  const { years: yearsList, year: effectiveYear, months: monthsList, month: effectiveMonth } =
    useMemo(() => resolvePeriod(transactions, ngayFilterYear, ngayFilterMonth, txYears && txYears.olderYears), [transactions, ngayFilterYear, ngayFilterMonth, txYears && txYears.olderYears]);
  // Năm cũ (Đợt 4) tải khi chọn; đang tải / lỗi thì KHÔNG hiện số cộng từ dữ liệu thiếu.
  const carga = useEnsureYears(txYears, [effectiveYear]);

  const dtNgayData = useMemo(() => {
    const map = new Map();

    transactions.forEach(t => {
      if (canFilterAllSales && !khopSale(t.sale, ngayFilterSale)) return;
      if (!inPeriod(t, effectiveYear, effectiveMonth)) return;
      if (ngayFilterWeek !== 'ALL' && t.week !== ngayFilterWeek) return;

      const dateStr = t.date || 'Chưa ngày';
      // Gộp theo Search Code (mã chữ, không phân biệt hoa/thường), tên hiện = Alias đại diện của mã chữ (30/09/2026).
      const code = String(t.clientCode || '').trim().toUpperCase();
      const key = `${dateStr}_${code}`;

      if (!map.has(key)) {
        map.set(key, {
          date: dateStr,
          clientCode: code,
          clientName: t.clientAlias || t.clientName,
          sale: t.sale,
          month: t.month,
          week: t.week,
          totalRevenue: 0
        });
      }
      const item = map.get(key);
      item.totalRevenue += t.netRevenue || 0;
    });

    return Array.from(map.values());
  }, [transactions, ngayFilterSale, effectiveYear, effectiveMonth, ngayFilterWeek, canFilterAllSales]);

  // The table used to render dtNgayData.slice(0, 50) and the grid .slice(0, 30),
  // with no count and no pager — a sale checking yesterday's revenue could simply
  // not see their order and have no way to know rows had been dropped. Totals
  // below are still computed over the FULL filtered set, not the visible page.
  // Sắp xếp TRƯỚC khi cắt trang; mặc định ngày mới nhất trước.
  const { rows: sortedNgay, sort, onSort } = useTableSort(dtNgayData, COLS, SAP_MAC_DINH);
  const { safePage, pageItems: pagedRows } = usePagedSlice(sortedNgay, page, PAGE_SIZE);

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
            <Filter size={15} color="var(--karofi-cyan)" />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc SALE:</span>
            <select className="input-field" style={{ width: '150px' }} value={ngayFilterSale} onChange={(e) => setNgayFilterSale(e.target.value)}>
              <option value="ALL">Tất cả SALE</option>
              {salesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Năm:</span>
          <select className="input-field" style={{ width: '110px' }} value={effectiveYear} onChange={(e) => { setNgayFilterYear(e.target.value); setNgayFilterMonth(null); setPage(1); }} aria-label="Lọc theo năm">
            {yearsList.map(y => <option key={y} value={y}>Năm {y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>➔ Lọc Tháng:</span>
          <select className="input-field" style={{ width: '190px' }} value={effectiveMonth} onChange={(e) => setNgayFilterMonth(e.target.value)} aria-label="Lọc theo tháng">
            <option value="ALL">Tất cả tháng năm {effectiveYear}</option>
            {monthsList.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Tuần:</span>
          <select className="input-field" style={{ width: '120px' }} value={ngayFilterWeek} onChange={(e) => setNgayFilterWeek(e.target.value)} aria-label="Lọc theo tuần">
            <option value="ALL">Tất cả Tuần</option>
            {weeksList.map(w => <option key={w} value={w}>Tuần {w.replace('W', '')} ({w})</option>)}
          </select>
        </div>
      </div>

      <TableState loading={carga.dangTai} error={carga.loi} onRetry={carga.retry} loadingLabel={carga.nhan} errorPrefix="Không tải được doanh thu năm cũ" isEmpty={dtNgayData.length === 0} emptyText="Không có phát sinh doanh thu nào khớp với bộ lọc đang chọn.">
      {viewMode === 'table' ? (
        <div className="table-container animate-fade-in" style={{ maxHeight: '520px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <SortableTh col="date" sort={sort} onSort={onSort}>Ngày Phát Sinh</SortableTh>
                <SortableTh col="clientCode" sort={sort} onSort={onSort}>Client</SortableTh>
                <SortableTh col="clientName" sort={sort} onSort={onSort}>Tên Khách Hàng OEM</SortableTh>
                <SortableTh col="sale" sort={sort} onSort={onSort}>SALE</SortableTh>
                <SortableTh col="totalRevenue" sort={sort} onSort={onSort} align="right">DT thuần (VND)</SortableTh>
              </tr>
            </thead>
            <tbody>
              <tr className="top-summary-row">
                <td style={{ color: 'var(--karofi-navy)' }}>Σ</td>
                <td style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>TỔNG CỘNG</td>
                <td style={{ color: 'var(--karofi-navy)' }}>Tất cả phát sinh ngày</td>
                <td style={{ color: 'var(--karofi-navy)' }}>All SALE</td>
                <td style={{ textAlign: 'right', color: 'var(--summary-navy)', fontSize: '0.95rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>
                  {dtNgayTotals.totalRevenue.toLocaleString('vi-VN')} ₫
                </td>
              </tr>

              {pagedRows.map((row) => (
                <tr key={`${row.date}_${row.clientCode}`}>
                  <td style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.8rem' }}>{hienNgay(row.date, { gio: false })}</td>
                  <td className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)' }}>{row.clientCode}</td>
                  <td style={{ fontWeight: 700 }}>{row.clientName}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{row.sale}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {row.totalRevenue.toLocaleString('vi-VN')} ₫
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }} className="animate-fade-in">
          {pagedRows.map((row) => (
            <div key={`${row.date}_${row.clientCode}`} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{hienNgay(row.date, { gio: false })}</span>
                <span className="code-font" style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--cyan-text)' }}>{row.clientCode}</span>
              </div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>{row.clientName}</h4>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-emerald-text)' }}>
                {row.totalRevenue.toLocaleString('vi-VN')} ₫
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination
        page={safePage}
        pageSize={PAGE_SIZE}
        totalItems={dtNgayData.length}
        onPageChange={setPage}
        itemLabel="dòng phát sinh"
      />
      </TableState>
    </div>
  );
}
