import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, User, FileText, Layers, Upload, ChevronUp, FileSpreadsheet, Loader2 } from 'lucide-react';
import { resolvePeriod, inPeriod } from '../utils/period';
import CaoSapPanel from './transactions/CaoSapPanel';
import RevenueImportPanel from './transactions/RevenueImportPanel';
import NhipDoanhThu from './transactions/NhipDoanhThu';
import SanPhamChuaCoPanel from './transactions/SanPhamChuaCoPanel';
import Pagination, { usePagedSlice } from './Pagination';
import SortableTh from './SortableTh';
import TableState from './TableState';
import { hienNgay, vnDateSlug } from '../utils/vnDate';
import { useTableSort } from '../hooks/useTableSort';
import { usePersistentState } from '../hooks/usePersistentState';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useEnsureYears } from '../hooks/useEnsureYears';
import { useToast } from './ToastProvider';
import { coTrangHopLe } from '../utils/paging';
import { dongXuatDoanhThu, tenFileDoanhThu } from '../utils/transactionsExport';

// Cột sắp xếp được (Đợt 2 / mục 3). Ngày so theo thời điểm, không so chữ 'dd/MM/yyyy'.
const COLS = [
  { key: 'date', type: 'date' }, { key: 'orderNo' }, { key: 'clientCode' }, { key: 'sku' }, { key: 'skuName' },
  { key: 'qty', type: 'number' }, { key: 'price', type: 'number' }, { key: 'netRevenue', type: 'number' }, { key: 'sale' }
];

export default function TransactionGrid({ transactions, txYears, materials, token, activeUser, onImported }) {
  const toast = useToast();
  // Panel nhập ZSD450 mặc định ĐÓNG: màn này chủ yếu để tra cứu, còn nhập là
  // việc mỗi tháng vài lần. Mở sẵn thì phần lớn lượt vào tab phải cuộn qua nó.
  const [moNhap, setMoNhap] = useState(false);
  const coQuyenNhap = ['admin', 'creator'].includes(activeUser?.role);
  const [searchTerm, setSearchTerm] = useState('');
  // Bộ lọc nhớ qua F5 (Đợt 2 / mục 9); giá trị đã nhớ mà không còn trong dữ liệu thì rơi về mặc định.
  const [saleSaved, setSelectedSale] = usePersistentState('tx.sale', 'ALL');
  const [groupSaved, setSelectedGroup] = usePersistentState('tx.group', 'ALL');
  // null = "user hasn't chosen yet", so the effective value can fall back to the
  // newest month once data arrives. A useState initialiser can't do that: it runs
  // once, while `transactions` is still empty. The old code sidestepped this by
  // hardcoding 'T08-2026', which meant the tab opened on an empty table from
  // September onwards.
  const [selectedYear, setSelectedYear] = usePersistentState('tx.year', null);
  const [selectedMonth, setSelectedMonth] = usePersistentState('tx.month', null);
  const [currentPage, setCurrentPage] = useState(1);
  // Cỡ trang chọn được + nhớ qua F5 (Đợt 3): ~160 trang x 25 dòng là quá nhiều để bấm Sau từng trang.
  const [pageSizeSaved, setPageSize] = usePersistentState('tx.pageSize', 25, (v) => coTrangHopLe(v, 0) !== 0);
  const pageSize = coTrangHopLe(pageSizeSaved);
  const [exporting, setExporting] = useState(false);
  // Bơm để NhipDoanhThu đọc lại mốc sau mỗi lượt nhập/cào — nếu không thì dòng
  // "cập nhật lần cuối" vẫn là mốc cũ ngay sau khi người dùng vừa cập nhật xong.
  const [nhipTick, setNhipTick] = useState(0);
  const daCapNhat = () => {
    setNhipTick((v) => v + 1);
    if (onImported) onImported();
  };

  const salesList = useMemo(() => {
    const set = new Set(transactions.map(t => t.sale).filter(Boolean));
    return Array.from(set);
  }, [transactions]);

  const groupsList = useMemo(() => {
    const set = new Set(transactions.map(t => t.group).filter(Boolean));
    return Array.from(set);
  }, [transactions]);

  const selectedSale = saleSaved === 'ALL' || salesList.includes(saleSaved) ? saleSaved : 'ALL';
  const selectedGroup = groupSaved === 'ALL' || groupsList.includes(groupSaved) ? groupSaved : 'ALL';

  // Năm -> Tháng: chưa chọn thì năm/tháng mới nhất có dữ liệu; "Tất cả tháng" chỉ cộng trong năm đang chọn, không trộn
  // các năm vào một số (02/10/2026).
  const { years: yearsList, year: effectiveYear, months: monthsList, month: effectiveMonth } =
    useMemo(() => resolvePeriod(transactions, selectedYear, selectedMonth, txYears && txYears.olderYears), [transactions, selectedYear, selectedMonth, txYears && txYears.olderYears]);
  // Năm cũ (Đợt 4) tải khi chọn; đang tải / lỗi thì KHÔNG hiện tổng / số bản ghi tính từ dữ liệu thiếu.
  const carga = useEnsureYears(txYears, [effectiveYear]);
  const chuaDu = carga.dangTai || !!carga.loi;

  // Ô tìm debounce (Đợt 3): ~4.000+ dòng x 5 trường, gõ nhanh không nên lọc lại ở mỗi ký tự.
  const debouncedSearch = useDebouncedValue(searchTerm);

  const filteredData = useMemo(() => {
    // Hạ chuỗi tìm kiếm 1 lần, không phải 5 lần mỗi dòng mỗi phím gõ — giống
    // mẫu đã sửa ở ClientManagement/ProductManagement, bảng này bị bỏ sót.
    const q = debouncedSearch.trim().toLowerCase();
    return transactions.filter(t => {
      const matchSearch =
        !q ||
        t.clientCode.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.skuName.toLowerCase().includes(q) ||
        t.sku.toLowerCase().includes(q) ||
        t.orderNo.toLowerCase().includes(q);

      const matchSale = selectedSale === 'ALL' || t.sale === selectedSale;
      const matchGroup = selectedGroup === 'ALL' || t.group === selectedGroup;
      const matchMonth = inPeriod(t, effectiveYear, effectiveMonth);

      return matchSearch && matchSale && matchGroup && matchMonth;
    });
  }, [transactions, debouncedSearch, selectedSale, selectedGroup, effectiveYear, effectiveMonth]);

  // usePagedSlice tự lùi trang khi bộ lọc làm filteredData ngắn lại, không chỉ
  // dựa vào setCurrentPage(1) gắn thủ công ở từng ô lọc — trước đây bảng này tự
  // tính totalPages/pageData riêng, không dùng lại usePagedSlice như các bảng
  // khác nên đứng khựng ở trang trống khi số trang giảm.
  // Sắp xếp TRƯỚC khi cắt trang: bấm tiêu đề là sắp cả bộ lọc, không chỉ 25 dòng đang xem. Tổng bên dưới vẫn trên toàn bộ.
  const { rows: sortedData, sort, onSort } = useTableSort(filteredData, COLS);
  const { safePage: currentPageSafe, totalPages, pageItems: pageData } = usePagedSlice(sortedData, currentPage, pageSize);

  const totals = useMemo(() => {
    return filteredData.reduce((acc, t) => {
      acc.qty += t.qty || 0;
      acc.netRevenue += t.netRevenue || 0;
      return acc;
    }, { qty: 0, netRevenue: 0 });
  }, [filteredData]);

  // Xuất ĐÚNG kết quả đang lọc + sắp xếp (không chỉ trang đang xem). xlsx tải lười: thư viện lớn, chỉ đáng tải khi có người bấm.
  const handleExport = async () => {
    if (exporting || !sortedData.length) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(dongXuatDoanhThu(sortedData));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Doanh thu');
      XLSX.writeFile(wb, tenFileDoanhThu(effectiveMonth, effectiveYear, vnDateSlug()));
      toast.success(`Đã xuất ${sortedData.length.toLocaleString('vi-VN')} dòng ra file Excel.`);
    } catch (err) {
      toast.error('Không xuất được file Excel: ' + (err.message || err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Banner */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={24} color="var(--karofi-cyan)" /> Lịch sử doanh thu
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Tra cứu nhật ký chi tiết các giao dịch xuất bán thực tế tích hợp từ hệ thống SAP.
          </p>
          <NhipDoanhThu token={token} refreshTick={nhipTick} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {coQuyenNhap && (
            <button
              className={moNhap ? 'btn btn-ghost' : 'btn btn-primary'}
              onClick={() => setMoNhap((v) => !v)}
            >
              {moNhap ? <ChevronUp size={16} /> : <Upload size={16} />}
              {moNhap ? 'Đóng' : 'Cập nhật doanh thu'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={exporting || chuaDu || filteredData.length === 0}
            title="Xuất đúng các dòng đang lọc (và thứ tự đang sắp) ra file Excel"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
          <span className="badge badge-blue" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            {chuaDu ? 'Đang chờ dữ liệu năm ' + effectiveYear : 'Hiển thị ' + filteredData.length.toLocaleString('vi-VN') + ' bản ghi'}
          </span>
        </div>
      </div>

      <SanPhamChuaCoPanel
        token={token}
        materials={materials}
        activeUser={activeUser}
        onSaved={onImported}
      />

      {moNhap && coQuyenNhap && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Hai đường vào cùng một chỗ, cố ý để cạnh nhau: cào thẳng chỉ chạy
              được trên máy có SAP, còn kéo file thì chạy ở đâu cũng được — nên
              khi đường trên không dùng được, đường lui nằm ngay dưới mắt. */}
          <CaoSapPanel
            token={token}
            activeUser={activeUser}
            onImported={daCapNhat}
          />
          <RevenueImportPanel
            token={token}
            activeUser={activeUser}
            onImported={() => {
              setMoNhap(false);
              daCapNhat();
            }}
          />
        </div>
      )}

      {/* Filter Bar */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
        
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
          <Search size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text"
            className="input-field"
            style={{ paddingLeft: '38px' }}
            placeholder="Tìm theo Client (TECOM, MAKXIM), Order SO, SKU..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>

        {/* SALE Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <User size={15} color="var(--text-muted)" />
          <select 
            className="input-field" 
            style={{ width: '150px' }}
            value={selectedSale}
            onChange={(e) => { setSelectedSale(e.target.value); setCurrentPage(1); }}
          >
            <option value="ALL">Tất cả SALE</option>
            {salesList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Nhóm SP Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={15} color="var(--text-muted)" />
          <select 
            className="input-field" 
            style={{ width: '160px' }}
            value={selectedGroup}
            onChange={(e) => { setSelectedGroup(e.target.value); setCurrentPage(1); }}
          >
            <option value="ALL">Tất cả Nhóm SP</option>
            {groupsList.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Year -> Month Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={15} color="var(--text-muted)" />
          <select
            className="input-field"
            style={{ width: '110px' }}
            value={effectiveYear}
            onChange={(e) => { setSelectedYear(e.target.value); setSelectedMonth(null); setCurrentPage(1); }}
            aria-label="Lọc theo năm"
          >
            {yearsList.map(y => <option key={y} value={y}>Năm {y}</option>)}
          </select>
          <select
            className="input-field"
            style={{ width: '190px' }}
            value={effectiveMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
            aria-label="Lọc theo tháng"
          >
            <option value="ALL">Tất cả tháng năm {effectiveYear}</option>
            {monthsList.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Totals Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        <div className="glass-card" style={{ flex: '1', minWidth: '200px', padding: '12px 18px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tổng Số Lượng</span>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: 'var(--karofi-navy)' }}>
            {chuaDu ? '…' : totals.qty.toLocaleString('vi-VN')}
          </div>
        </div>
        <div className="glass-card" style={{ flex: '1', minWidth: '200px', padding: '12px 18px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tổng DT Thuần (VND)</span>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent-emerald-text)' }}>
            {chuaDu ? '…' : totals.netRevenue.toLocaleString('vi-VN')}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <TableState
        loading={carga.dangTai} error={carga.loi} onRetry={carga.retry} loadingLabel={carga.nhan} errorPrefix="Không tải được doanh thu năm cũ"
        isEmpty={filteredData.length === 0}
        emptyText="Không tìm thấy giao dịch nào khớp với bộ lọc hiện tại."
        emptyHint={searchTerm ? `Từ khóa: "${searchTerm}"` : undefined}
      >
      <div className="table-container" style={{ maxHeight: '580px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <SortableTh col="date" sort={sort} onSort={onSort} style={{ width: '90px' }}>Ngày C.Từ</SortableTh>
              <SortableTh col="orderNo" sort={sort} onSort={onSort} style={{ width: '120px' }}>Order</SortableTh>
              <SortableTh col="clientCode" sort={sort} onSort={onSort} style={{ width: '130px' }}>Client</SortableTh>
              <SortableTh col="sku" sort={sort} onSort={onSort} style={{ width: '110px' }}>Mã Vật Tư</SortableTh>
              <SortableTh col="skuName" sort={sort} onSort={onSort} style={{ minWidth: '340px' }}>Tên Vật Tư / Linh Kiện OEM</SortableTh>
              <SortableTh col="qty" sort={sort} onSort={onSort} align="right" style={{ width: '90px' }}>Số Lượng</SortableTh>
              <SortableTh col="price" sort={sort} onSort={onSort} align="right" style={{ width: '110px' }}>Đơn Giá</SortableTh>
              <SortableTh col="netRevenue" sort={sort} onSort={onSort} align="right" style={{ width: '140px' }}>DT thuần (VND)</SortableTh>
              <SortableTh col="sale" sort={sort} onSort={onSort} style={{ width: '120px' }}>SALE</SortableTh>
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, idx) => (
              <tr key={`${row.billingNo}_${row.sku}_${idx}`} style={{ height: '40px' }}>
                <td style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>{hienNgay(row.date, { gio: false })}</td>
                <td className="code-font" style={{ fontWeight: 700, color: 'var(--purple-text)', fontSize: '0.8rem' }}>
                  {row.orderNo}
                </td>
                <td className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)', fontSize: '0.825rem' }}>
                  {row.clientCode}
                </td>
                <td className="code-font" style={{ color: 'var(--text-dim)', fontWeight: 600, fontSize: '0.775rem' }}>
                  {row.sku}
                </td>
                <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {row.skuName}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace" }}>
                  {row.qty.toLocaleString('vi-VN')}
                </td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.775rem' }}>
                  {row.price ? row.price.toLocaleString('vi-VN') : '0'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>
                  {row.netRevenue ? row.netRevenue.toLocaleString('vi-VN') : '0'}
                </td>
                <td style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {row.sale}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </TableState>

      {!chuaDu && (
        <Pagination
          page={currentPageSafe}
          pageSize={pageSize}
          totalItems={filteredData.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(n) => { setPageSize(n); setCurrentPage(1); }}
          itemLabel="bản ghi"
        />
      )}

    </div>
  );
}
