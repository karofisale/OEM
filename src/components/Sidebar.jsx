import React from 'react';
import { 
  Bot, 
  BarChart3, 
  Table, 
  Package, 
  Users, 
  CalendarRange, 
  FileSpreadsheet, 
  Settings,
  Sparkles,
  PieChart,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, isCollapsed, onToggleCollapse, isMobileOpen, onCloseMobile }) {
  // The mobile drawer always shows full labels — icon-only collapse is a
  // desktop-only space-saving mode, not something worth doing in an overlay.
  const effectiveCollapsed = isMobileOpen ? false : isCollapsed;

  const handleSelect = (id) => {
    setActiveTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  const menuItems = [
    { id: 'ai-agent', label: 'AI Agent Đặt Hàng SAP', icon: Bot },
    { id: 'revenue-reports', label: 'Báo cáo doanh thu', icon: PieChart },
    { id: 'dashboard', label: 'Tổng quan Metric', icon: BarChart3 },
    { id: 'transactions', label: 'Lịch sử doanh thu', icon: Table, count: '1,890+' },
    { id: 'products', label: 'Sản phẩm & Bảng giá', icon: Package },
    { id: 'clients', label: 'Khách hàng OEM', icon: Users },
    { id: 'sales-plan', label: 'Kế hoạch kinh doanh', icon: CalendarRange },
    { id: 'debt-importer', label: 'Nhập công nợ Excel', icon: FileSpreadsheet },
    { id: 'settings', label: 'Cấu hình Google Sheet', icon: Settings }
  ];

  return (
    <>
    {isMobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}
    <aside className={`app-sidebar ${isMobileOpen ? 'mobile-open' : ''}`} style={{
      width: effectiveCollapsed ? '72px' : '250px',
      background: '#ffffff',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      padding: effectiveCollapsed ? '16px 8px' : '16px 12px',
      gap: '6px',
      transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      boxShadow: 'var(--shadow-sm)',
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
      zIndex: 90
    }}>
      {/* Sidebar Header & Collapse/Close Toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: effectiveCollapsed ? 'center' : 'space-between',
        padding: '0 8px 12px 8px',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '4px'
      }}>
        {!effectiveCollapsed && (
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#004e89', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Menu Chức Năng
          </span>
        )}

        <button
          onClick={isMobileOpen ? onCloseMobile : onToggleCollapse}
          className="btn btn-secondary btn-sm"
          style={{ padding: '6px', borderRadius: '50%', width: '30px', height: '30px' }}
          title={isMobileOpen ? 'Đóng Menu' : (isCollapsed ? 'Mở rộng Menu' : 'Thu gọn Menu')}
        >
          {effectiveCollapsed ? <ChevronRight size={16} color="#00a0e9" /> : <ChevronLeft size={16} color="#00a0e9" />}
        </button>
      </div>

      {/* Menu List */}
      {menuItems.map(item => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => handleSelect(item.id)}
            title={effectiveCollapsed ? item.label : ''}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: effectiveCollapsed ? 'center' : 'space-between',
              width: '100%',
              padding: effectiveCollapsed ? '12px' : '11px 14px',
              borderRadius: 'var(--radius-md)',
              border: isActive ? '1px solid var(--karofi-cyan-border)' : '1px solid transparent',
              background: isActive ? 'var(--karofi-cyan-light)' : 'transparent',
              color: isActive ? '#00a0e9' : 'var(--text-muted)',
              fontWeight: isActive ? 800 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Icon size={18} color={isActive ? '#00a0e9' : '#64748b'} />
              {!effectiveCollapsed && <span>{item.label}</span>}
            </div>

            {!effectiveCollapsed && item.count && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}

      {!effectiveCollapsed && (
        <div style={{ marginTop: 'auto', padding: '12px 10px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <Sparkles size={14} color="#00a0e9" />
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--karofi-navy)' }}>Karofi AI Engine</span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
            Tự động hóa đơn SAP & Phân quyền Creator, Admin, Leader, Sale.
          </p>
        </div>
      )}
    </aside>
    </>
  );
}
