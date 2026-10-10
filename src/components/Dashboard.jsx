import React, { useMemo, useState } from 'react';
import { monthSortValue, yearsFromTransactions } from '../utils/period';
import { thangGiaoDich } from '../utils/salesPlan';
import { khopSale } from '../utils/roles';
import { vnYear } from '../utils/vnDate';
import { useEnsureYears } from '../hooks/useEnsureYears';
import TableState from './TableState';
import {
  TrendingUp, 
  PackageCheck, 
  Users, 
  FileText, 
  Calendar, 
  Award,
  Filter
} from 'lucide-react';

/**
 * Đơn vị tiền co theo độ lớn.
 *
 * Trước đây thẻ KPI đóng cứng "Tỷ ₫": doanh thu 3 triệu hiện ra "0.00 Tỷ ₫",
 * nhìn y hệt không có doanh thu. Ở mức toàn hệ thống thì hiếm gặp, nhưng lọc
 * theo MỘT Sale là gặp ngay — nên đổi cùng lúc với bộ lọc chứ không để sau.
 */
function dinhDangTien(v) {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)} Tỷ ₫`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)} Triệu ₫`;
  return `${Math.round(v).toLocaleString('vi-VN')} ₫`;
}

export default function Dashboard({ transactions = [], txYears, clients = [], materials = [], plans = [] }) {
  // Bộ lọc SALE. KHÔNG phải hàng rào phân quyền: từ 14/09/2026 mọi role đều xem
  // được số của mọi Sale (utils/roles.js), nên ô chọn này hiện cho tất cả mọi
  // người và mặc định là "Tất cả SALE" — nó chỉ để thu hẹp tầm nhìn cho dễ đọc.
  const [saleFilter, setSaleFilter] = useState('ALL');
  // Bộ lọc NĂM (30/09/2026): trước đây mọi thẻ cộng TOÀN BỘ bảng doanh thu (mọi năm). Mặc định năm hiện tại.
  const namHienTai = String(vnYear()); // theo giờ Việt Nam
  const [yearFilter, setYearFilter] = useState(namHienTai);
  // Năm cũ (Đợt 4: bootstrap chỉ gửi năm nay + năm trước) vẫn chọn được; chọn xong màn tải năm đó, và "Tất cả năm" tải MỌI năm cũ
  // — trong lúc chờ / khi lỗi KHÔNG hiện số cộng từ dữ liệu thiếu (xem `chuaDu` bên dưới).
  const olderYears = txYears && txYears.olderYears;
  const yearsList = useMemo(() => {
    const ys = yearsFromTransactions(transactions);
    (olderYears || []).forEach((y) => { if (!ys.includes(String(y))) ys.push(String(y)); });
    if (!ys.includes(namHienTai)) ys.unshift(namHienTai);
    return ys.sort((a, b) => Number(b) - Number(a));
  }, [transactions, namHienTai, olderYears]);
  const carga = useEnsureYears(txYears, [yearFilter]);
  const chuaDu = carga.dangTai || !!carga.loi;

  // Dựng từ chính giá trị Sale có thật trên tab Data, giống hệt cách
  // RevenueReports dựng danh sách của nó — hai màn luôn có cùng bộ lựa chọn.
  const salesList = useMemo(() => {
    const set = new Set(transactions.map(t => t.sale).filter(Boolean));
    return Array.from(set).sort();
  }, [transactions]);

  // Lọc MỘT LẦN rồi dùng chung cho cả 4 thẻ KPI, biểu đồ tháng và bảng top
  // khách — để không màn nào trong cùng một trang nói về một tập dòng khác.
  // Năm của dòng = năm trong Tháng_Năm, ô tháng trống thì lấy theo ngày (thangGiaoDich).
  const rows = useMemo(
    () => transactions.filter(t =>
      (yearFilter === 'ALL' || thangGiaoDich(t).endsWith('-' + yearFilter)) &&
      (saleFilter === 'ALL' || khopSale(t.sale, saleFilter))),
    [transactions, saleFilter, yearFilter]
  );

  // Perf (2026-08-27): tất cả các phép tổng hợp dưới đây đều quét TRỌN mảng
  // transactions (lịch sử đầy đủ, mọi năm). Trước đây chúng nằm thẳng trong
  // thân hàm nên chạy lại mỗi lần render — và vì KeepAliveTab giữ Dashboard
  // mounted cả khi người dùng đang ở tab khác, "mỗi lần render" nghĩa là mỗi
  // lần đổi tab và cả mỗi lần gập/mở sidebar. Gộp thành 1 lượt quét duy nhất
  // trong useMemo, chỉ tính lại khi transactions/clients thật sự đổi.
  const {
    totalRevenue,
    totalQty,
    totalTransactionsCount,
    monthlyList,
    topClients
  } = useMemo(() => {
    let revenue = 0;
    let qty = 0;

    // Monthly breakdown. Rows with no month used to be filed under a hardcoded
    // 'T08-2026', quietly inflating that one month with revenue that belongs
    // elsewhere; they now get their own visible bucket instead.
    const monthlyRevenueMap = new Map();
    const clientRevMap = new Map();

    rows.forEach(t => {
      // Doanh thu THUẦN, không rơi về `revenue` (cột R "Doanh thu VND" = doanh
      // thu GỘP, chưa trừ CK thương mại và giảm giá). Dòng khuyến mãi/chiết khấu
      // 100% có net = 0 mà gộp > 0, nên cách cũ đếm luôn phần gộp đó vào thẻ
      // "Tổng Doanh Thu Thuần" — thẻ này to hơn tổng của mọi báo cáo doanh thu
      // (DT ngày/tháng/sale đều cộng `netRevenue || 0`), và to hơn cả tổng biểu
      // đồ tháng ngay bên dưới nó. Một nguồn duy nhất: netRevenue.
      const net = t.netRevenue || 0;
      revenue += net;
      qty += t.qty || 0;

      const month = t.month || 'Chưa rõ tháng';
      monthlyRevenueMap.set(month, (monthlyRevenueMap.get(month) || 0) + net);

      // Gộp theo Search Code, hiện kèm Alias đại diện (30/09/2026).
      const name = String(t.clientCode || '').trim().toUpperCase() || t.clientName || 'N/A';
      const cur = clientRevMap.get(name) || { rev: 0, alias: t.clientAlias || t.clientName || '' };
      cur.rev += net;
      clientRevMap.set(name, cur);
    });

    return {
      totalRevenue: revenue,
      totalQty: qty,
      totalTransactionsCount: rows.length,
      // Chronological, not alphabetical: localeCompare puts 'T12-2025' after
      // 'T08-2026' because it compares '1' against '8' character by character.
      monthlyList: Array.from(monthlyRevenueMap.entries())
        .sort((a, b) => monthSortValue(a[0]) - monthSortValue(b[0])),
      topClients: Array.from(clientRevMap.entries())
        .map(([code, v]) => [code, v.rev, v.alias])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }, [rows]);

  // Tính 1 lần ngoài vòng lặp render — trước đây Math.max(...monthlyList.map())
  // nằm trong chính .map() vẽ từng tháng, nên mỗi tháng lại duyệt lại toàn bộ
  // monthlyList một lần nữa (O(N²) không cần thiết dù N hiện còn nhỏ).
  const maxRev = useMemo(() => Math.max(...monthlyList.map(m => m[1]), 0) || 1, [monthlyList]);

  // No `|| 4` / `|| 1891` fallbacks here: those made an empty dataset render as
  // "4 Đối tác" and "1.891 Bản ghi", i.e. plausible-looking numbers that were
  // simply invented. If nothing loaded, the honest answer is 0.
  //
  // Thẻ này đi theo bộ lọc SALE luôn: hiện số đối tác của CẢ hệ thống ngay cạnh
  // doanh thu của riêng một Sale thì cả hàng KPI đọc ra sai ý.
  const activeClientsCount = useMemo(
    () => clients.filter(c => String(c.status || '').trim() === 'Active' && khopSale(c.sale, saleFilter)).length,
    [clients, saleFilter]
  );
  const hasData = transactions.length > 0 || clients.length > 0;

  // Say so plainly rather than rendering a dashboard full of zeros that reads
  // like a real (catastrophic) business result.
  if (!hasData) {
    return (
      <div className="glass-card animate-fade-in" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-dim)' }}>
        <FileText size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
        <div style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Chưa có số liệu để hiển thị</div>
        <div style={{ fontSize: '0.85rem' }}>
          Dữ liệu chưa tải được. Bấm "Tải lại" trên thanh trên cùng để thử lại.
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Bộ lọc SALE */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', padding: '14px 20px' }}>
        <Filter size={15} color="var(--karofi-cyan)" />
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Năm:</span>
        <select
          className="input-field"
          style={{ width: '130px' }}
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          aria-label="Lọc theo năm"
        >
          {yearsList.map(y => <option key={y} value={y}>Năm {y}</option>)}
          <option value="ALL">Tất cả năm</option>
        </select>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginLeft: '8px' }}>Lọc Theo SALE:</span>
        <select
          className="input-field"
          style={{ width: '200px' }}
          value={saleFilter}
          onChange={(e) => setSaleFilter(e.target.value)}
          aria-label="Lọc theo Sale"
        >
          <option value="ALL">Tất cả SALE</option>
          {salesList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {saleFilter !== 'ALL' && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Mọi số bên dưới đang chỉ tính phần của <strong style={{ color: 'var(--cyan-text)' }}>{saleFilter}</strong>.
          </span>
        )}
      </div>

      {chuaDu ? (
        <TableState loading={carga.dangTai} error={carga.loi} onRetry={carga.retry} loadingLabel={carga.nhan}
          errorPrefix="Không tải được doanh thu năm cũ" compact={false}><span /></TableState>
      ) : (<>
      {/* Executive KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        
        {/* KPI 1 */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'rgba(0, 160, 233, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <TrendingUp size={24} color="var(--karofi-cyan)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Tổng Doanh Thu Thuần {yearFilter === 'ALL' ? '(mọi năm)' : yearFilter}</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--karofi-navy)' }}>
              {dinhDangTien(totalRevenue)}
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-emerald-text)', fontWeight: 600 }}>↑ Cập nhật từ SAP</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <PackageCheck size={24} color="var(--accent-emerald)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Sản Lượng Xuất Bán</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {totalQty.toLocaleString('vi-VN')} PC
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Vật tư & Linh kiện</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'rgba(139, 92, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Users size={24} color="var(--accent-purple)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Khách Hàng OEM Active</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {activeClientsCount} Đối tác
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Đã xác minh</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <FileText size={24} color="var(--accent-amber)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Số Lượt Giao Dịch</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {totalTransactionsCount.toLocaleString('vi-VN')} Bản ghi
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--warning-text)', fontWeight: 600 }}>Doanh thu từ SAP</span>
          </div>
        </div>

      </div>

      {/* Analytics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        
        {/* Monthly Revenue Visual Bars */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
            <Calendar size={18} color="var(--karofi-cyan)" /> Doanh Thu Xuất Bán Theo Tháng (VND)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
            {monthlyList.length === 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>Chưa có doanh thu nào trong phạm vi đang lọc.</div>
            )}
            {monthlyList.map(([month, rev]) => {
              const percentage = Math.round((rev / maxRev) * 100);
              return (
                <div key={month} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{month}</span>
                    <span style={{ fontWeight: 700, color: 'var(--cyan-text)' }}>{rev.toLocaleString('vi-VN')} ₫</span>
                  </div>
                  <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${percentage}%`,
                      background: 'linear-gradient(90deg, #00a0e9, #004e89)',
                      borderRadius: '4px',
                      transition: 'width 0.5s ease'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Clients Ranking */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
            <Award size={18} color="var(--accent-amber)" /> Top Khách Hàng Doanh Số Cao Nhất
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {topClients.length === 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>Chưa có khách hàng nào trong phạm vi đang lọc.</div>
            )}
            {topClients.map(([clientCode, rev, alias], idx) => (
              <div key={clientCode} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--bg-card-hover)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: idx === 0 ? 'var(--accent-amber)' : idx === 1 ? 'var(--text-dim)' : idx === 2 ? 'var(--warning-text)' : 'var(--border-color)',
                    color: '#fff', fontWeight: 800, fontSize: '0.75rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--cyan-text)' }} className="code-font">{clientCode}</div>
                    {alias && alias !== clientCode && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{alias}</div>}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--accent-emerald-text)', fontSize: '0.9rem' }}>
                  {dinhDangTien(rev)}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
      </>)}
    </div>
  );
}
