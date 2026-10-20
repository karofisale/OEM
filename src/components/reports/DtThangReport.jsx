import React, { useMemo, useState } from 'react';
import { Filter, TrendingUp, TrendingDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import { priorMonthKey, shortMonthLabel, resolvePeriod, inPeriod, parseMonthKey } from '../../utils/period';
import { khopSale } from '../../utils/roles';
import { sapThang, sapTuan, tuanLichCuaGiaoDich, khoangTuanThang, nhanTuan, nhanThangNgan, dongXuatTheoCot, tenFileDtThang, tongTheoSale } from '../../utils/revenuePivot';
import { vnDateSlug } from '../../utils/vnDate';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import { useToast } from '../ToastProvider';
import { useTableSort } from '../../hooks/useTableSort';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useOnSettingChange } from '../../hooks/useSetting';
import { useEnsureYears } from '../../hooks/useEnsureYears';

// Cột sắp xếp được (Đợt 2 / mục 3). `pct` = % biến động so với kỳ đối chiếu (rỗng nếu chưa có số liệu đối chiếu -> luôn nằm cuối).
// Các cột tháng / tuần (khoá 'c:<tháng|tuần>') được thêm động theo kiểu xem đang chọn.
const COLS = [
  { key: 'clientCode' }, { key: 'clientName' }, { key: 'sale' },
  { key: 'totalRevenue', type: 'number' }, { key: 'pct', type: 'number' }
];

const fmt = (v) => Number(v || 0).toLocaleString('vi-VN');
const sMono = { textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', whiteSpace: 'nowrap' };
// Cột Client (mã), Client (tên) và SALE đủ rộng để không xuống dòng
// Cột tổng lũy kế: đủ rộng cho số hàng chục tỷ kèm ₫ trên MỘT dòng
const W_TONG = { minWidth: '210px', whiteSpace: 'nowrap' };
const W_MA = { minWidth: '140px', whiteSpace: 'nowrap' }, W_TEN = { minWidth: '240px', whiteSpace: 'nowrap' }, W_SALE = { minWidth: '140px', whiteSpace: 'nowrap' };

// Replaces a hardcoded if-chain that only knew T04..T08-2026 and fell through to
// 'T07-2026' for anything else — so from September the report would silently have
// compared September against July, and January would never have reached December.

export default function DtThangReport({ transactions, txYears, salesList, canFilterAllSales, viewMode, baselines2025, macDinhNam, macDinhSale }) {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  // Bộ lọc nhớ qua F5 (Đợt 2 / mục 9); giá trị đã nhớ mà không còn trong dữ liệu thì rơi về mặc định.
  const [saleRaw, setThangFilterSale] = usePersistentState('rpt.thang.sale', null);   // null = chưa chọn -> theo Cài đặt cá nhân (st.reportSale)
  const saleSaved = saleRaw == null ? macDinhSale : saleRaw;
  const thangFilterSale = saleSaved === 'ALL' || (salesList || []).includes(saleSaved) ? saleSaved : 'ALL';
  // null = người dùng CHƯA chọn gì: năm rơi về năm mới nhất có dữ liệu, tháng rơi về tháng mới nhất CỦA NĂM đó. Không đặt
  // cứng "tháng theo đồng hồ máy": mùng 1-3 hàng tháng đợt đổ dữ liệu SAP chưa về thì báo cáo sẽ rỗng — đúng cái bẫy mà ghi
  // chú đầu file này đã kể. "Tất cả các tháng" CHỈ cộng trong năm đang chọn (trước đây cộng gộp mọi tháng của mọi năm rồi
  // so với nền 2025) và so với CẢ NĂM TRƯỚC (02/10/2026).
  const [thangYearSaved, setThangFilterYear] = usePersistentState('rpt.thang.year', null);
  const thangFilterYear = thangYearSaved || macDinhNam || null;   // chưa chọn -> Cài đặt cá nhân st.reportYear (null = năm mới nhất có dữ liệu)
  const [thangFilterMonth, setThangFilterMonth] = usePersistentState('rpt.thang.month', null);
  // 20/10/2026: "Tất cả tháng" có công tắc XEM CHI TIẾT CÁC THÁNG (mặc định TẮT) hiện thêm cột từng tháng của năm; chọn một tháng thì hiện thêm cột từng TUẦN của tháng đó.
  const [chiTietThang, setChiTietThang] = usePersistentState('rpt.thang.chiTiet', false, (v) => typeof v === 'boolean');
  // 20/10/2026: cột Biến động đứng cạnh Tổng lũy kế, có nút BẬT/TẮT (mặc định tắt cho bảng gọn); khi xem "Tất cả SALE" có nút hiện thêm các dòng tổng theo từng Sale.
  const [hienBienDong, setHienBienDong] = usePersistentState('rpt.thang.bienDong', false, (v) => typeof v === 'boolean');
  const [hienTongSale, setHienTongSale] = usePersistentState('rpt.thang.tongSale', false, (v) => typeof v === 'boolean');
  // Đổi mặc định trong Cài đặt cá nhân -> bỏ bộ lọc năm/tháng/Sale đã nhớ để mặc định mới có hiệu lực ngay.
  useOnSettingChange('st.reportYear', () => { setThangFilterYear(null); setThangFilterMonth(null); });
  useOnSettingChange('st.reportSale', () => setThangFilterSale(null));

  const { years: yearsList, year: effectiveYear, months: monthsList, month: effectiveMonth } =
    useMemo(() => resolvePeriod(transactions, thangFilterYear, thangFilterMonth, txYears && txYears.olderYears), [transactions, thangFilterYear, thangFilterMonth, txYears && txYears.olderYears]);
  const prevYear = effectiveYear ? String(Number(effectiveYear) - 1) : '';
  // Năm cũ (Đợt 4): báo cáo này so với CẢ NĂM TRƯỚC / tháng trước (có thể rơi sang năm trước) nên cần tải cả hai năm; đang tải
  // / lỗi thì KHÔNG hiện số (số thiếu năm trước sẽ ra "Chưa có số liệu" hoặc % sai).
  const carga = useEnsureYears(txYears, [effectiveYear, prevYear]);

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
          prevYearRevenue: 0,
          cot: {}           // doanh thu theo cột kỳ: khoá tháng ('T08-2026') khi xem cả năm, khoá tuần ('W2') khi xem một tháng
        });
      }
      const item = map.get(clientCode);
      const so = t.netRevenue || 0;

      if (effectiveMonth === 'ALL') {
        // Cả năm đang chọn; năm liền trước chỉ để làm mốc so sánh, không cộng vào tổng.
        if (inPeriod(t, effectiveYear, 'ALL')) {
          item.totalRevenue += so;
          item.cot[t.month] = (item.cot[t.month] || 0) + so;
        } else {
          const pm = parseMonthKey(t.month);
          if (pm && String(pm.year) === prevYear) item.prevYearRevenue += so;
        }
      } else {
        if (t.month === targetMonth) {
          item.totalRevenue += so;
          item.currentSelectedMonthRevenue += so;
          const wk = tuanLichCuaGiaoDich(t);
          item.cot[wk] = (item.cot[wk] || 0) + so;
        }
        if (t.month === priorMonth) {
          item.priorMonthRevenue += so;
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

  // Cột kỳ đang hiện: các THÁNG của năm (Tất cả tháng + bật chi tiết) hoặc các TUẦN của tháng đang chọn — chỉ những kỳ có doanh thu.
  const xemTheoThang = effectiveMonth === 'ALL' && chiTietThang;
  const xemTheoTuan = effectiveMonth !== 'ALL';
  const khoangTuan = useMemo(() => (xemTheoTuan ? khoangTuanThang(effectiveMonth) : {}), [xemTheoTuan, effectiveMonth]);
  const cotHien = useMemo(() => {
    if (!xemTheoThang && !xemTheoTuan) return [];
    const keys = new Set();
    dtThangData.forEach((r) => Object.keys(r.cot).forEach((k) => { if (r.cot[k]) keys.add(k); }));
    return xemTheoThang ? sapThang(keys) : sapTuan(keys);
  }, [dtThangData, xemTheoThang, xemTheoTuan]);
  const nhanCot = (k) => (xemTheoThang ? nhanThangNgan(k) : nhanTuan(k, khoangTuan));
  const tongCot = useMemo(() => {
    const t = {};
    cotHien.forEach((k) => { t[k] = dtThangData.reduce((a, r) => a + (r.cot[k] || 0), 0); });
    return t;
  }, [dtThangData, cotHien]);

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

  const cols = useMemo(() => [...COLS, ...cotHien.map((k) => ({ key: 'c:' + k, type: 'number', get: (r) => r.cot[k] || 0 }))], [cotHien]);
  const { rows: sortedThang, sort, onSort } = useTableSort(dtThangRows, cols);

  // Dòng tổng theo từng SALE (chỉ khi đang xem "Tất cả SALE" và người dùng bật)
  const coTheTongSale = canFilterAllSales && thangFilterSale === 'ALL';
  const tongSaleRows = useMemo(() => (coTheTongSale && hienTongSale ? tongTheoSale(dtThangRows) : []), [coTheTongSale, hienTongSale, dtThangRows]);
  const nhanTong = effectiveMonth === 'ALL' ? `Tổng lũy kế năm ${effectiveYear} (VND)` : 'Tổng lũy kế tháng (VND)';

  // Xuất ĐÚNG các cột đang hiện (kể cả cột tháng / tuần) theo thứ tự đang sắp. xlsx tải lười: chỉ đáng tải khi có người bấm.
  const handleExport = async () => {
    if (exporting || !sortedThang.length) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const dong = dongXuatTheoCot(sortedThang, cotHien.map((k) => ({ key: k, label: nhanCot(k) })), {
        tongCot,
        tongSale: tongSaleRows,
        // Tổng lũy kế đứng ngay sau SALE rồi tới các cột kỳ (như trên màn); Biến động chỉ xuất khi đang bật
        cotDau: [
          { ten: nhanTong, get: (r) => r.totalRevenue, tongRow: dtThangTotals.totalRevenue, tongSale: (s) => s.tong },
          ...(hienBienDong ? [{ ten: 'Biến động', get: (r) => (r.hasBaseline ? `${r.pct >= 0 ? '+' : ''}${r.pct}% (${r.compareLabel})` : `Chưa có số liệu ${r.compareLabel.replace('vs ', '')}`) }] : [])
        ]
      });
      const ws = XLSX.utils.json_to_sheet(dong);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'DT tháng');
      XLSX.writeFile(wb, tenFileDtThang(effectiveMonth, effectiveYear, vnDateSlug()));
      toast.success(`Đã xuất ${sortedThang.length.toLocaleString('vi-VN')} khách ra file Excel.`);
    } catch (err) {
      toast.error('Không xuất được file Excel: ' + (err.message || err));
    } finally {
      setExporting(false);
    }
  };

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

        {effectiveMonth === 'ALL' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={chiTietThang} onChange={(e) => setChiTietThang(e.target.checked)} />
            Xem chi tiết các tháng
          </label>
        )}

        {viewMode === 'table' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={hienBienDong} onChange={(e) => setHienBienDong(e.target.checked)} />
            Hiện biến động
          </label>
        )}

        {viewMode === 'table' && coTheTongSale && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={hienTongSale} onChange={(e) => setHienTongSale(e.target.checked)} />
            Hiện tổng theo Sale
          </label>
        )}

        {viewMode === 'table' && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginLeft: 'auto' }}
            onClick={handleExport}
            disabled={exporting || carga.dangTai || dtThangRows.length === 0}
            title="Xuất đúng các cột đang hiện (kể cả cột tháng / tuần) và thứ tự đang sắp ra file Excel"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
        )}
      </div>

      <TableState loading={carga.dangTai} error={carga.loi} onRetry={carga.retry} loadingLabel={carga.nhan} errorPrefix="Không tải được doanh thu năm cũ" isEmpty={dtThangRows.length === 0} emptyText="Không có doanh thu nào khớp với bộ lọc đang chọn.">
      {viewMode === 'table' ? (
        <div className="table-container animate-fade-in" style={{ maxHeight: '560px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <SortableTh col="clientCode" sort={sort} onSort={onSort} style={W_MA}>Mã Client</SortableTh>
                <SortableTh col="clientName" sort={sort} onSort={onSort} style={W_TEN}>Client</SortableTh>
                <SortableTh col="sale" sort={sort} onSort={onSort} style={W_SALE}>SALE</SortableTh>
                <SortableTh col="totalRevenue" sort={sort} onSort={onSort} align="right" style={W_TONG}>{nhanTong}</SortableTh>
                {hienBienDong && <SortableTh col="pct" sort={sort} onSort={onSort}>Biến động</SortableTh>}
                {cotHien.map((k) => (
                  <SortableTh key={k} col={'c:' + k} sort={sort} onSort={onSort} align="right">{nhanCot(k)}</SortableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="top-summary-row">
                <td style={{ color: 'var(--karofi-navy)' }}>Σ</td>
                <td style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>TỔNG CỘNG</td>
                <td />
                <td style={{ textAlign: 'right', color: 'var(--summary-navy)', fontSize: '0.9rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900, whiteSpace: 'nowrap' }}>
                  {dtThangTotals.totalRevenue.toLocaleString('vi-VN')} ₫
                </td>
                {hienBienDong && <td />}
                {cotHien.map((k) => (
                  <td key={k} style={{ ...sMono, color: 'var(--summary-navy)', fontWeight: 900 }}>{fmt(tongCot[k])}</td>
                ))}
              </tr>

              {tongSaleRows.map((s) => (
                <tr key={'tong-' + s.sale} className="sale-subtotal-row">
                  <td style={{ color: 'var(--karofi-navy)' }}>Σ</td>
                  <td style={{ color: 'var(--karofi-navy)', fontWeight: 800, whiteSpace: 'nowrap' }}>Tổng {s.sale}</td>
                  <td style={{ color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.sale}</td>
                  <td style={{ textAlign: 'right', color: 'var(--summary-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, whiteSpace: 'nowrap' }}>{fmt(s.tong)} ₫</td>
                  {hienBienDong && <td />}
                  {cotHien.map((k) => (
                    <td key={k} style={{ ...sMono, color: 'var(--summary-navy)', fontWeight: 800 }}>{s.cot[k] ? fmt(s.cot[k]) : '·'}</td>
                  ))}
                </tr>
              ))}

              {sortedThang.map((row) => {
                const { hasBaseline, compareLabel } = row;
                const percentChange = row.pct;
                const isPositive = hasBaseline && percentChange >= 0;

                return (
                  <tr key={row.clientCode}>
                    <td className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)', ...W_MA }}>{row.clientCode}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text-main)', ...W_TEN }}>{row.clientName}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, ...W_SALE }}>{row.sale}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                      {row.totalRevenue.toLocaleString('vi-VN')} ₫
                    </td>
                    {hienBienDong && (
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
                    )}
                    {cotHien.map((k) => (
                      <td key={k} style={{ ...sMono, color: row.cot[k] ? 'var(--text-main)' : 'var(--text-dim)' }}>{row.cot[k] ? fmt(row.cot[k]) : '·'}</td>
                    ))}
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
