import React from 'react';
import { 
  TrendingUp, 
  PackageCheck, 
  Users, 
  FileText, 
  Calendar, 
  Award
} from 'lucide-react';

export default function Dashboard({ transactions = [], clients = [], materials = [], plans = [] }) {
  // Compute safe KPI metrics
  const totalRevenue = transactions.reduce((sum, t) => sum + (t.netRevenue || t.revenue || 0), 0);
  const totalQty = transactions.reduce((sum, t) => sum + (t.qty || 0), 0);
  // No `|| 4` / `|| 1891` fallbacks here: those made an empty dataset render as
  // "4 Đối tác" and "1.891 Bản ghi", i.e. plausible-looking numbers that were
  // simply invented. If nothing loaded, the honest answer is 0.
  const activeClientsCount = clients.filter(c => String(c.status || '').trim() === 'Active').length;
  const totalTransactionsCount = transactions.length;
  const hasData = transactions.length > 0 || clients.length > 0;

  // Monthly breakdown
  const monthlyRevenueMap = new Map();
  transactions.forEach(t => {
    const month = t.month || 'T08-2026';
    monthlyRevenueMap.set(month, (monthlyRevenueMap.get(month) || 0) + (t.netRevenue || 0));
  });

  const monthlyList = Array.from(monthlyRevenueMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Top 5 Clients
  const clientRevMap = new Map();
  transactions.forEach(t => {
    const name = t.clientCode || t.clientName || 'N/A';
    clientRevMap.set(name, (clientRevMap.get(name) || 0) + (t.netRevenue || 0));
  });

  const topClients = Array.from(clientRevMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Say so plainly rather than rendering a dashboard full of zeros that reads
  // like a real (catastrophic) business result.
  if (!hasData) {
    return (
      <div className="glass-card animate-fade-in" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-dim)' }}>
        <FileText size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
        <div style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Chưa có số liệu để hiển thị</div>
        <div style={{ fontSize: '0.85rem' }}>
          Dữ liệu chưa tải được từ Google Sheet. Bấm "Đồng bộ Sheet" trên thanh trên cùng để thử lại.
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Executive KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        
        {/* KPI 1 */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'rgba(0, 160, 233, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <TrendingUp size={24} color="#00a0e9" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Tổng Doanh Thu Thuần</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--karofi-navy)' }}>
              {(totalRevenue / 1e9).toFixed(2)} Tỷ ₫
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>↑ Cập nhật từ SAP</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <PackageCheck size={24} color="#10b981" />
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
            <Users size={24} color="#8b5cf6" />
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
            <FileText size={24} color="#f59e0b" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Số Lượt Giao Dịch</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {totalTransactionsCount.toLocaleString('vi-VN')} Bản ghi
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-amber)', fontWeight: 600 }}>Google Sheet Sync</span>
          </div>
        </div>

      </div>

      {/* Analytics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        
        {/* Monthly Revenue Visual Bars */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
            <Calendar size={18} color="#00a0e9" /> Doanh Thu Xuất Bán Theo Tháng (VND)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
            {monthlyList.map(([month, rev]) => {
              const maxRev = Math.max(...monthlyList.map(m => m[1])) || 1;
              const percentage = Math.round((rev / maxRev) * 100);
              return (
                <div key={month} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{month}</span>
                    <span style={{ fontWeight: 700, color: '#00a0e9' }}>{rev.toLocaleString('vi-VN')} ₫</span>
                  </div>
                  <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
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
            <Award size={18} color="#f59e0b" /> Top Khách Hàng Doanh Số Cao Nhất
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {topClients.map(([clientCode, rev], idx) => (
              <div key={clientCode} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: '#f8fafc',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : '#cbd5e1',
                    color: '#fff', fontWeight: 800, fontSize: '0.75rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#00a0e9' }} className="code-font">{clientCode}</div>
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--accent-emerald)', fontSize: '0.9rem' }}>
                  {(rev / 1e6).toFixed(1)} triệu ₫
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
