import React, { useState, useEffect } from 'react';
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
  ChevronRight,
  ChevronDown,
  ClipboardList,
  CalendarClock
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, isCollapsed, onToggleCollapse, isMobileOpen, onCloseMobile, transactionCount = 0 }) {
  // The mobile drawer always shows full labels — icon-only collapse is a
  // desktop-only space-saving mode, not something worth doing in an overlay.
  const effectiveCollapsed = isMobileOpen ? false : isCollapsed;

  const handleSelect = (id) => {
    setActiveTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  // "Doanh thu" groups 3 previously-separate top-level items into one
  // accordion entry (2026-08-25) — they stay real flat activeTab ids
  // underneath (App.jsx/KeepAliveTab never changed), this is purely a
  // sidebar-presentation grouping.
  const revenueChildren = [
    { id: 'revenue-reports', label: 'Báo cáo doanh thu', icon: PieChart },
    { id: 'dashboard', label: 'Tổng quan Metric', icon: BarChart3 },
    // Real loaded row count. This used to be the literal string '1,890+', which
    // never changed no matter what was actually in the Sheet.
    { id: 'transactions', label: 'Lịch sử doanh thu', icon: Table, count: transactionCount ? transactionCount.toLocaleString('vi-VN') : '' }
  ];

  const menuItems = [
    { id: 'ai-agent', label: 'AI Agent Đặt Hàng SAP', icon: Bot },
    { id: 'pending-orders', label: 'Đơn Hàng Chờ Duyệt', icon: ClipboardList },
    { id: 'doanh-thu', label: 'Doanh thu', icon: PieChart, children: revenueChildren },
    { id: 'products', label: 'Sản phẩm & Bảng giá', icon: Package },
    { id: 'clients', label: 'Khách hàng OEM', icon: Users },
    { id: 'sales-plan', label: 'Kế hoạch kinh doanh', icon: CalendarRange },
    { id: 'sop', label: 'Kế hoạch SOP', icon: CalendarClock },
    { id: 'debt-importer', label: 'Công nợ', icon: FileSpreadsheet },
    { id: 'settings', label: 'Cấu hình Google Sheet', icon: Settings }
  ];

  const [expandedGroup, setExpandedGroup] = useState(null);

  // Auto-open the group that owns whatever tab is currently active, so
  // navigating there (eg. the app's initial tab, or a future direct
  // setActiveTab elsewhere) never leaves the active item hidden inside a
  // collapsed accordion.
  useEffect(() => {
    const owner = menuItems.find((m) => m.children && m.children.some((c) => c.id === activeTab));
    if (owner) setExpandedGroup(owner.id);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseButtonStyle = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: effectiveCollapsed ? 'center' : 'space-between',
    width: '100%',
    padding: effectiveCollapsed ? '12px' : '11px 14px',
    borderRadius: 'var(--radius-md)',
    border: isActive ? '1px solid var(--karofi-cyan-border)' : '1px solid transparent',
    background: isActive ? 'var(--karofi-cyan-light)' : 'transparent',
    color: isActive ? 'var(--karofi-cyan)' : 'var(--text-muted)',
    fontWeight: isActive ? 800 : 500,
    fontSize: '0.85rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  });

  return (
    <>
    {isMobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}
    <aside className={`app-sidebar ${isMobileOpen ? 'mobile-open' : ''}`} style={{
      width: effectiveCollapsed ? '72px' : '250px',
      background: 'var(--bg-card)',
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
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--karofi-navy)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Menu Chức Năng
          </span>
        )}

        <button
          onClick={isMobileOpen ? onCloseMobile : onToggleCollapse}
          className="btn btn-secondary btn-sm"
          style={{ padding: '6px', borderRadius: '50%', width: '30px', height: '30px' }}
          title={isMobileOpen ? 'Đóng Menu' : (isCollapsed ? 'Mở rộng Menu' : 'Thu gọn Menu')}
        >
          {effectiveCollapsed ? <ChevronRight size={16} color="var(--karofi-cyan)" /> : <ChevronLeft size={16} color="var(--karofi-cyan)" />}
        </button>
      </div>

      {/* Menu List */}
      {menuItems.map(item => {
        const Icon = item.icon;

        if (item.children) {
          const isGroupActive = item.children.some((c) => c.id === activeTab);
          const isOpen = expandedGroup === item.id;
          return (
            <div key={item.id}>
              <button
                onClick={() => {
                  // Collapsed sidebar has no room to show children inline —
                  // jump straight to the first one, same as a normal item.
                  if (effectiveCollapsed) { handleSelect(item.children[0].id); return; }
                  setExpandedGroup(isOpen ? null : item.id);
                }}
                title={effectiveCollapsed ? item.label : ''}
                style={baseButtonStyle(isGroupActive)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={18} color={isGroupActive ? 'var(--karofi-cyan)' : 'var(--text-dim)'} />
                  {!effectiveCollapsed && <span>{item.label}</span>}
                </div>
                {!effectiveCollapsed && (
                  <ChevronDown size={14} color="var(--text-dim)" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                )}
              </button>

              {!effectiveCollapsed && isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '16px', marginTop: '4px', marginBottom: '2px', borderLeft: '2px solid var(--border-color)' }}>
                  {item.children.map((child) => {
                    const ChildIcon = child.icon;
                    const isActive = activeTab === child.id;
                    return (
                      <button
                        key={child.id}
                        onClick={() => handleSelect(child.id)}
                        style={{ ...baseButtonStyle(isActive), padding: '9px 12px', fontSize: '0.8rem' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <ChildIcon size={15} color={isActive ? 'var(--karofi-cyan)' : 'var(--text-dim)'} />
                          <span>{child.label}</span>
                        </div>
                        {child.count && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--surface-sunk)', padding: '2px 6px', borderRadius: '4px' }}>
                            {child.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => handleSelect(item.id)}
            title={effectiveCollapsed ? item.label : ''}
            style={baseButtonStyle(isActive)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Icon size={18} color={isActive ? 'var(--karofi-cyan)' : 'var(--text-dim)'} />
              {!effectiveCollapsed && <span>{item.label}</span>}
            </div>

            {!effectiveCollapsed && item.count && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--surface-sunk)', padding: '2px 6px', borderRadius: '4px' }}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}

      {!effectiveCollapsed && (
        <div style={{ marginTop: 'auto', padding: '12px 10px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <Sparkles size={14} color="var(--karofi-cyan)" />
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
