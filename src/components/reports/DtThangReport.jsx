import React, { useMemo } from 'react';
import { Filter, TrendingUp, TrendingDown } from 'lucide-react';
import { priorMonthKey, shortMonthLabel, resolvePeriod, inPeriod, parseMonthKey } from '../../utils/period';
import { khopSale } from '../../utils/roles';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import { useTableSort } from '../../hooks/useTableSort';
import { usePersistentState } from '../../hooks/usePersistentState';

// Cột sắp xếp được (Đợt 2 / mục 3). `pct` = % biến động so với kỳ đối chiếu (rỗng nếu chưa có số liệu đối chiếu -> luôn nằm cuối).
const COLS = [
  { key: 'clientCode' }, { key: 'clientName' }, { key: 'sale' },
  { key: 'totalRevenue', type: 'number' }, { key: 'pct', type: 'number' }
];

// Replaces a hardcoded if-chain that only knew T04..T08-2026 and fell through to
// 'T07-2026' for anything else — so from September the report would silently have
// compared September against July, and January would never have reached December.

export default function DtThangReport({ transactions, salesList, canFilterAllSales, viewMode, baselines2025 }) {
  // Bộ lọc nhớ qua F5 (Đợt 2 / mục 9); giá trị đã nhớ mà không còn trong dữ liệu thì rơi về mặc định.
  const [saleSaved, setThangFilterSale] = usePersistentState('rpt.thang.sale', 'ALL');
  const thangFilterSale = saleSaved === 'ALL' || (salesList || []).includes(saleSaved) ? saleSaved : 'ALL';
  // null = người dùng CHƯA chọn gì: năm rơi về năm mới nhất có dữ liệu, tháng rơi về tháng mới nhất CỦA NĂM đó. Không đặt
  // cứng "tháng theo đồng hồ máy": mùng 1-3 hàng tháng đợt đổ dữ liệu SAP chưa về thì báo cáo sẽ rỗng — đúng cái bẫy mà ghi
  // chú đầu file này đã kể. "Tất cả các tháng" CHỈ cộng trong năm đang chọn (trước đây cộng gộp mọi tháng của mọi năm rồi
  // so với nền 2025) và so với CẢ NĂM TRƯỚC (02/10/2026).
  const [thangFilterYear, setThangFilterYear] = usePersistentState('rpt.thang.year', null);
  const [thangFilterMonth, setThangFilterMonth] = usePersistentState('rpt.thang.month', null);

  const { years: yearsList, year: effectiveYear, months: monthsList, month: effectiveMonth } =
    useMemo(() => resolvePeriod(transactions, thangFilterYear, thangFilterMonth), [transactions, thangFilterYear, thangFilterMonth]);
  const prevYear = effectiveYear ? String(Number(effectiveYear) - 1) : '';

  const dtThangData = useMemo(() => {
    const map = new Map();
    const targetMonth = effectiveMonth;
    const priorMonth = priorMonthKey(targetMonth);

    transactions.forEach(t => {
      if (canFilterAllSales && !khopSale(t.sale, thangFilterSale)) return;

      // Gộp theo Search Code (mã chữ, không phân biệt hoa/thường), tên hiện = Alias đại diện của mã chữ (30/09/2026).
      const clientCode = String(t.clientCode || '').trim().toUpperCase() || 'OEM-CLIENT';
      if (!map.has(clientCode)) {
        map.set(clientCode, {
          clientCode: clientCode,
          clientName: t.clientAlias || t.clientName,
          sale: t.sale,
          totalRevenue: 0,
          currentSelectedMonthRevenue: 0,
          priorMonthRevenue: 0,
          prevYearRevenue: 0
        });
      }
      const item = map.get(clientCode);

      if (effectiveMonth === 'ALL') {
        // Cả năm đang chọn; năm liền trước chỉ để làm mốc so sánh, không cộng vào tổng.
        if (inPeriod(t, effectiveYear, 'ALL')) item.totalRevenue += t.netRevenue || 0;
        else {
          const pm = parseMonthKey(t.month);
          if (pm && String(pm.year) === prevYear) item.prevYearRevenue += t.netRevenue || 0;
        }
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
  }, [transactions, thangFilterSale, effectiveYear, effectiveMonth, prevYear, canFilterAllSales]);

  const dtThangTotals = useMemo(() => {
    return dtThangData.reduce((acc, i) => {
      acc.totalRevenue += i.totalRevenue;
      return acc;
    }, { totalRevenue: 0 });
  }, [dtThangData]);

  // So sánh với kỳ đối chiếu, tính MỘT lần cho cả bảng để sắp xếp được theo cột "Biến động".
  //
  // `null` = không có cơ sở để so sánh. Trước đây thiếu nền 2025 thì app lấy `totalRevenue * 0.85`, tức tự
  // bịa ra con số rồi báo "Tăng +18% (vs 2025)" — số bịa trong báo cáo ban lãnh đạo đọc; thiếu tháng trước
  // thì hiện cứng "+100%".
  const dtThangRows = useMemo(() => dtThangData.map((row) => {
    let baseline = null;
    let compareLabel = '';
    if (effectiveMonth === 'ALL') {
      // Mốc = cả năm trước tính từ giao dịch; năm trước chưa có giao dịch nào trong app thì (chỉ với 2025)
      // dùng bảng nền 2025.
      const coNamTruoc = yearsList.includes(prevYear);
      const b = coNamTruoc ? row.prevYearRevenue : (prevYear === '2025' ? baselines2025.get(row.clientCode) : 0);
      baseline = b > 0 ? b : null;
      compareLabel = `vs ${prevYear}`;
    } else {
      baseline = row.priorMonthRevenue > 0 ? row.priorMonthRevenue : null;
      compareLabel = `vs ${priorMonthKey(effectiveMonth) || 'kỳ trước'}`;
    }
    const hasBaseline = baseline !== null;
    const pct = hasBaseline ? Math.round(((row.totalRevenue - baseline) / baseline) * 100) : null;
    return { ...row, compareLabel, hasBaseline, pct };
  }), [dtThangData, effectiveMonth, effectiveYear, yearsList, prevYear, baselines2025]);

  const { rows: sortedThang, sort, onSort } = useTableSort(dtThangRows, COLS);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Filters */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 20px' }}>
        {canFilterAllSales && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="var(--karofi-cyan)" />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Theo SALE:</span>
            <select className="input-field" style={{ width: '160px' }} value={thangFilterSale} onChange={(e) => setThangFilterSale(e.target.value)}>
              <option value="ALL">Tất cả SALE</option>
              {salesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Năm:</span>
          <select
            className="input-field"
            style={{ width: '110px' }}
            value={effectiveYear}
            onChange={(e) => { setThangFilterYear(e.target.value); setThangFilterMonth(null); }}
            aria-label="Lọc theo năm"
          >
            {yearsList.map(y => <option key={y} value={y}>Năm {y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>➔ Lọc Theo Tháng:</span>
          <select
            className="input-field"
            style={{ width: '250px' }}
            value={effectiveMonth}
            onChange={(e) => setThangFilterMonth(e.target.value)}
            aria-label="Lọc theo tháng"
          >
            <option value="ALL">Tất cả tháng năm {effectiveYear} (So với {prevYear})</option>
            {monthsList.map(m => (
              <option key={m} value={m}>{m} (So với {shortMonthLabel(priorMonthKey(m))})</option>
            ))}
          </select>
        </div>
      </div>

      <TableState isEmpty={dtThangRows.length === 0} emptyText="Không có doanh thu nào khớp với bộ lọc đang chọn.">
      {viewMode === 'table' ? (
        <div className="table-container animate-fade-in" style={{ maxHeight: '560px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <SortableTh col="clientCode" sort={sort} onSort={onSort}>Client</SortableTh>
                <SortableTh col="clientName" sort={sort} onSort={onSort}>Tên Khách Hàng OEM</SortableTh>
                <SortableTh col="sale" sort={sort} onSort={onSort}>SALE</SortableTh>
                <SortableTh col="totalRevenue" sort={sort} onSort={onSort} align="right">DT thuần (VND)</SortableTh>
                <SortableTh col="pct" sort={sort} onSort={onSort}>Biến động</SortableTh>
              </tr>
            </thead>
            <tbody>
              <tr className="top-summary-row">
                <td style={{ color: 'var(--karofi-navy)' }}>Σ</td>
                <td style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>TỔNG CỘNG HỆ THỐNG</td>
                <td style={{ color: 'var(--karofi-navy)' }}>Tất cả Sales</td>
                <td style={{ textAlign: 'right', color: 'var(--summary-navy)', fontSize: '0.95rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>
                  {dtThangTotals.totalRevenue.toLocaleString('vi-VN')} ₫
                </td>
                <td style={{ color: 'var(--karofi-navy)' }}>Doanh Thu Tháng</td>
              </tr>

              {sortedThang.map((row) => {
                const { hasBaseline, compareLabel } = row;
                const percentChange = row.pct;
                const isPositive = hasBaseline && percentChange >= 0;

                return (
                  <tr key={row.clientCode}>
                    <td className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)' }}>{row.clientCode}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>{row.clientName}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{row.sale}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {row.totalRevenue.toLocaleString('vi-VN')} ₫
                    </td>
                    <td>
                      {!hasBaseline ? (
                        <span
                          className="badge badge-neutral"
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
          {sortedThang.map((row) => (
            <div key={row.clientCode} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="code-font" style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--cyan-text)' }}>{row.clientCode}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{row.sale}</span>
              </div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{row.clientName}</h4>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-emerald-text)' }}>
                {row.totalRevenue.toLocaleString('vi-VN')} ₫
              </div>
            </div>
          ))}
        </div>
      )}
      </TableState>
    </div>
  );
}
