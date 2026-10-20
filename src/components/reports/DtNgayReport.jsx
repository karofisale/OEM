import React, { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { resolvePeriod } from '../../utils/period';
import { khopSale } from '../../utils/roles';
import { gopTheoKhach, ngayTrongThang, tuanLichCuaGiaoDich, sapTuan, khoangTuanThang, nhanTuan, thuCuaNgay, NHAN_THU } from '../../utils/revenuePivot';
import Pagination, { usePagedSlice } from '../Pagination';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import { useTableSort } from '../../hooks/useTableSort';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useEnsureYears } from '../../hooks/useEnsureYears';
import { useDefaultPageSize, useOnSettingChange } from '../../hooks/useSetting';

// Cỡ trang mặc định của màn này; Cài đặt cá nhân (st.pageSize) nếu đã chọn thì thắng.
const PAGE_SIZE_MAC_DINH = 50;
// Cột sắp xếp được (Đợt 2 / mục 3). Các cột NGÀY (khoá 'd:<ngày>') được thêm động theo tháng đang xem.
const COLS = [
  { key: 'clientCode' }, { key: 'clientName' }, { key: 'sale' },
  { key: 'totalRevenue', type: 'number' }
];
const SAP_MAC_DINH = { key: 'totalRevenue', dir: 'desc' }; // khách doanh thu lớn nhất lên trước

const hai = (n) => String(n).padStart(2, '0');
const fmt = (v) => Number(v || 0).toLocaleString('vi-VN');
const sMono = { textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', whiteSpace: 'nowrap' };

/**
 * DT Ngày (20/10/2026): Client (mã chữ) là DÒNG, mỗi NGÀY có doanh thu là một CỘT (xếp 1–31, ngày không phát sinh thì không hiện), cột "Sum lũy kế" đứng
 * trước các cột ngày. Chỉ xem được TỪNG THÁNG (không còn mục gộp mọi tháng cho đỡ nhiễu). Chọn một tuần (tuần lịch thứ 2–CN) thì chỉ hiện các ngày của
 * tuần đó và Sum lũy kế là của tuần đó.
 */
export default function DtNgayReport({ transactions, txYears, salesList, canFilterAllSales, viewMode, macDinhNam, macDinhSale }) {
  const PAGE_SIZE = useDefaultPageSize(PAGE_SIZE_MAC_DINH);
  // Bộ lọc nhớ qua F5 (Đợt 2 / mục 9); giá trị đã nhớ mà không còn trong dữ liệu thì rơi về mặc định.
  const [saleRaw, setNgayFilterSale] = usePersistentState('rpt.ngay.sale', null);   // null = chưa chọn -> theo Cài đặt cá nhân (st.reportSale)
  const saleSaved = saleRaw == null ? macDinhSale : saleRaw;
  const ngayFilterSale = saleSaved === 'ALL' || (salesList || []).includes(saleSaved) ? saleSaved : 'ALL';
  // null = chưa chọn -> năm / tháng mới nhất có dữ liệu. Giá trị 'ALL' đã nhớ từ bản cũ (từng có mục gộp mọi tháng) cũng rơi về tháng mới nhất của năm.
  const [ngayYearSaved, setNgayFilterYear] = usePersistentState('rpt.ngay.year', null);
  const ngayFilterYear = ngayYearSaved || macDinhNam || null;   // chưa chọn -> Cài đặt cá nhân st.reportYear (null = năm mới nhất có dữ liệu)
  const [ngayFilterMonth, setNgayFilterMonth] = usePersistentState('rpt.ngay.month', null);
  const [weekSaved, setNgayFilterWeek] = usePersistentState('rpt.ngay.week', 'ALL');
  const [page, setPage] = useState(1);
  // Đổi mặc định trong Cài đặt cá nhân -> bỏ bộ lọc năm/tháng/Sale đã nhớ để mặc định mới có hiệu lực ngay.
  useOnSettingChange('st.reportYear', () => { setNgayFilterYear(null); setNgayFilterMonth(null); });
  useOnSettingChange('st.reportSale', () => setNgayFilterSale(null));

  const { years: yearsList, year: effectiveYear, months: monthsList, month: monthChon } =
    useMemo(() => resolvePeriod(transactions, ngayFilterYear, ngayFilterMonth, txYears && txYears.olderYears), [transactions, ngayFilterYear, ngayFilterMonth, txYears && txYears.olderYears]);
  const effectiveMonth = monthChon !== 'ALL' ? monthChon : (monthsList[0] || '');   // luôn một tháng cụ thể
  // Năm cũ (Đợt 4) tải khi chọn; đang tải / lỗi thì KHÔNG hiện số cộng từ dữ liệu thiếu.
  const carga = useEnsureYears(txYears, [effectiveYear]);

  // Các tuần của THÁNG đang chọn (có phát sinh), nhãn kèm khoảng ngày: "Tuần 2 (05–11)"
  const khoangTuan = useMemo(() => khoangTuanThang(effectiveMonth), [effectiveMonth]);
  const weeksList = useMemo(() => {
    const s = new Set();
    transactions.forEach((t) => { if (t && t.month === effectiveMonth) s.add(tuanLichCuaGiaoDich(t)); });
    return sapTuan(s);
  }, [transactions, effectiveMonth]);
  const ngayFilterWeek = weekSaved === 'ALL' || weeksList.includes(weekSaved) ? weekSaved : 'ALL';

  const pv = useMemo(() => gopTheoKhach(transactions, {
    loc: (t) => (!canFilterAllSales || khopSale(t.sale, ngayFilterSale)) && t.month === effectiveMonth && (ngayFilterWeek === 'ALL' || tuanLichCuaGiaoDich(t) === ngayFilterWeek),
    cot: ngayTrongThang      // 0 = ô ngày không đọc được ("chưa rõ ngày"), xếp cuối
  }), [transactions, ngayFilterSale, effectiveMonth, ngayFilterWeek, canFilterAllSales]);
  // Cột ngày có doanh thu: 1 -> 31 tăng dần, "chưa rõ ngày" (0) cuối cùng
  const ngayCot = useMemo(() => pv.cotKeys.map(Number).filter((d) => pv.tongCot[d]).sort((a, b) => (a || 99) - (b || 99)), [pv]);
  const dtNgayRows = useMemo(() => pv.rows.map((r) => ({ ...r, totalRevenue: r.tong })), [pv]);
  const cols = useMemo(() => [...COLS, ...ngayCot.map((d) => ({ key: 'd:' + d, type: 'number', get: (r) => r.cot[d] || 0 }))], [ngayCot]);

  // Sắp xếp TRƯỚC khi cắt trang; mặc định khách doanh thu lớn nhất trước. Tổng ở dòng trên cùng tính trên TOÀN BỘ bộ lọc, không phải trang đang xem.
  const { rows: sortedNgay, sort, onSort } = useTableSort(dtNgayRows, cols, SAP_MAC_DINH);
  const { safePage, pageItems: pagedRows } = usePagedSlice(sortedNgay, page, PAGE_SIZE);

  const nhanTong = ngayFilterWeek === 'ALL' ? 'Sum lũy kế tháng' : 'Sum lũy kế ' + nhanTuan(ngayFilterWeek, khoangTuan).split(' (')[0].toLowerCase();
  const thuNgay = (d) => (d ? NHAN_THU[thuCuaNgay(effectiveMonth, d)] : '');
  const mm = /^T(\d{1,2})-/.exec(effectiveMonth);
  const nhanNgay = (d) => (d ? `${hai(d)}/${mm ? hai(mm[1]) : '--'}` : 'Chưa rõ ngày');

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
          <select className="input-field" style={{ width: '130px' }} value={effectiveMonth} onChange={(e) => { setNgayFilterMonth(e.target.value); setPage(1); }} aria-label="Lọc theo tháng" disabled={!monthsList.length}>
            {monthsList.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Lọc Tuần:</span>
          <select className="input-field" style={{ width: '190px' }} value={ngayFilterWeek} onChange={(e) => { setNgayFilterWeek(e.target.value); setPage(1); }} aria-label="Lọc theo tuần">
            <option value="ALL">Cả tháng</option>
            {weeksList.map(w => <option key={w} value={w}>{nhanTuan(w, khoangTuan)}</option>)}
          </select>
        </div>
      </div>

      <TableState loading={carga.dangTai} error={carga.loi} onRetry={carga.retry} loadingLabel={carga.nhan} errorPrefix="Không tải được doanh thu năm cũ" isEmpty={dtNgayRows.length === 0} emptyText="Không có phát sinh doanh thu nào khớp với bộ lọc đang chọn.">
      {viewMode === 'table' ? (
        <div className="table-container animate-fade-in" style={{ maxHeight: '560px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <SortableTh col="clientCode" sort={sort} onSort={onSort}>Client</SortableTh>
                <SortableTh col="clientName" sort={sort} onSort={onSort}>Tên Khách Hàng OEM</SortableTh>
                <SortableTh col="sale" sort={sort} onSort={onSort}>SALE</SortableTh>
                <SortableTh col="totalRevenue" sort={sort} onSort={onSort} align="right">{nhanTong} (VND)</SortableTh>
                {ngayCot.map((d) => (
                  <SortableTh key={d} col={'d:' + d} sort={sort} onSort={onSort} align="right">
                    {nhanNgay(d)}{d ? <small style={{ display: 'block', fontWeight: 600, opacity: 0.85 }}>{thuNgay(d)}</small> : null}
                  </SortableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="top-summary-row">
                <td style={{ color: 'var(--karofi-navy)' }}>Σ</td>
                <td style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>TỔNG CỘNG</td>
                <td style={{ color: 'var(--karofi-navy)' }}>All SALE</td>
                <td style={{ textAlign: 'right', color: 'var(--summary-navy)', fontSize: '0.95rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>
                  {fmt(pv.tong)} ₫
                </td>
                {ngayCot.map((d) => (
                  <td key={d} style={{ ...sMono, color: 'var(--summary-navy)', fontWeight: 900 }}>{fmt(pv.tongCot[d])}</td>
                ))}
              </tr>

              {pagedRows.map((row) => (
                <tr key={row.clientCode}>
                  <td className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)' }}>{row.clientCode}</td>
                  <td style={{ fontWeight: 700 }}>{row.clientName}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{row.sale}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmt(row.totalRevenue)} ₫
                  </td>
                  {ngayCot.map((d) => (
                    <td key={d} style={{ ...sMono, color: row.cot[d] ? 'var(--text-main)' : 'var(--text-dim)' }}>{row.cot[d] ? fmt(row.cot[d]) : '·'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }} className="animate-fade-in">
          {pagedRows.map((row) => (
            <div key={row.clientCode} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="code-font" style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--cyan-text)' }}>{row.clientCode}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{Object.keys(row.cot).filter((d) => row.cot[d]).length} ngày phát sinh</span>
              </div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>{row.clientName}</h4>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-emerald-text)' }}>
                {fmt(row.totalRevenue)} ₫
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination
        page={safePage}
        pageSize={PAGE_SIZE}
        totalItems={dtNgayRows.length}
        onPageChange={setPage}
        itemLabel="khách"
      />
      </TableState>
    </div>
  );
}
