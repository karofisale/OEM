import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, User, FileText, Layers } from 'lucide-react';
import { monthsFromTransactions, latestMonthKey } from '../utils/period';

export default function TransactionGrid({ transactions }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState('ALL');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  // null = "user hasn't chosen yet", so the effective value can fall back to the
  // newest month once data arrives. A useState initialiser can't do that: it runs
  // once, while `transactions` is still empty. The old code sidestepped this by
  // hardcoding 'T08-2026', which meant the tab opened on an empty table from
  // September onwards.
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const salesList = useMemo(() => {
    const set = new Set(transactions.map(t => t.sale).filter(Boolean));
    return Array.from(set);
  }, [transactions]);

  const groupsList = useMemo(() => {
    const set = new Set(transactions.map(t => t.group).filter(Boolean));
    return Array.from(set);
  }, [transactions]);

  const monthsList = useMemo(() => monthsFromTransactions(transactions), [transactions]);

  // Newest month with data, until the user picks something themselves.
  const effectiveMonth = selectedMonth ?? latestMonthKey(transactions) ?? 'ALL';

  const filteredData = useMemo(() => {
    return transactions.filter(t => {
      const matchSearch = 
        !searchTerm ||
        t.clientCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.skuName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.orderNo.toLowerCase().includes(searchTerm.toLowerCase());

      const matchSale = selectedSale === 'ALL' || t.sale === selectedSale;
      const matchGroup = selectedGroup === 'ALL' || t.group === selectedGroup;
      const matchMonth = effectiveMonth === 'ALL' || t.month === effectiveMonth;

      return matchSearch && matchSale && matchGroup && matchMonth;
    });
  }, [transactions, searchTerm, selectedSale, selectedGroup, effectiveMonth]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const pageData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage]);

  const totals = useMemo(() => {
    return filteredData.reduce((acc, t) => {
      acc.qty += t.qty || 0;
      acc.netRevenue += t.netRevenue || 0;
      return acc;
    }, { qty: 0, netRevenue: 0 });
  }, [filteredData]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Banner */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={24} color="#00a0e9" /> Lịch sử doanh thu
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Tra cứu nhật ký chi tiết các giao dịch xuất bán thực tế tích hợp từ hệ thống SAP.
          </p>
        </div>

        <span className="badge badge-blue" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
          Hiển thị {filteredData.length.toLocaleString('vi-VN')} bản ghi
        </span>
      </div>

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

        {/* Month Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={15} color="var(--text-muted)" />
          <select 
            className="input-field" 
            style={{ width: '140px' }}
            value={effectiveMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
            aria-label="Lọc theo tháng"
          >
            <option value="ALL">Tất cả Tháng</option>
            {monthsList.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Totals Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        <div className="glass-card" style={{ flex: '1', minWidth: '200px', padding: '12px 18px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tổng Số Lượng</span>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'JetBrains Mono', color: 'var(--karofi-navy)' }}>
            {totals.qty.toLocaleString('vi-VN')}
          </div>
        </div>
        <div className="glass-card" style={{ flex: '1', minWidth: '200px', padding: '12px 18px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tổng DT Thuần (VND)</span>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'JetBrains Mono', color: 'var(--accent-emerald)' }}>
            {totals.netRevenue.toLocaleString('vi-VN')}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="table-container" style={{ maxHeight: '580px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ width: '90px' }}>Ngày C.Từ</th>
              <th style={{ width: '120px' }}>Order</th>
              <th style={{ width: '130px' }}>Client</th>
              <th style={{ width: '110px' }}>Mã Vật Tư</th>
              <th style={{ minWidth: '340px' }}>Tên Vật Tư / Linh Kiện OEM</th>
              <th style={{ textAlign: 'right', width: '90px' }}>Số Lượng</th>
              <th style={{ textAlign: 'right', width: '110px' }}>Đơn Giá</th>
              <th style={{ textAlign: 'right', width: '140px' }}>DT thuần (VND)</th>
              <th style={{ width: '120px' }}>SALE</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, idx) => (
              <tr key={`${row.billingNo}_${row.sku}_${idx}`} style={{ height: '40px' }}>
                <td style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>{row.date}</td>
                <td className="code-font" style={{ fontWeight: 700, color: 'var(--accent-purple)', fontSize: '0.8rem' }}>
                  {row.orderNo}
                </td>
                <td className="code-font" style={{ fontWeight: 800, color: '#00a0e9', fontSize: '0.825rem' }}>
                  {row.clientCode}
                </td>
                <td className="code-font" style={{ color: '#64748b', fontWeight: 600, fontSize: '0.775rem' }}>
                  {row.sku}
                </td>
                <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {row.skuName}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.8rem', fontFamily: 'JetBrains Mono' }}>
                  {row.qty.toLocaleString('vi-VN')}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>
                  {row.price ? row.price.toLocaleString('vi-VN') : '0'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }}>
                  {row.netRevenue ? row.netRevenue.toLocaleString('vi-VN') : '0'}
                </td>
                <td style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
                  {row.sale}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Trang {currentPage} / {totalPages} (Tổng số {filteredData.length.toLocaleString('vi-VN')} bản ghi)
        </span>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="btn btn-secondary btn-sm"
          >
            Trang Trước
          </button>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="btn btn-secondary btn-sm"
          >
            Trang Sau
          </button>
        </div>
      </div>

    </div>
  );
}
