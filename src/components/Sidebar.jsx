import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { NAV, ACCOUNT_TAB_IDS, iconOf } from '../utils/navMeta';
import { nhanVaiTro } from '../utils/glossary';
import { version as APP_VERSION } from '../../package.json';

// Vai trò "account" (kế toán) chỉ cần Sản phẩm & Bảng giá, Khách hàng, Công
// nợ — không liên quan tới đặt hàng/doanh thu/kế hoạch kinh doanh nội bộ Sale
// (2026-08-26). Mọi vai trò khác vẫn thấy đủ menu như trước — phân quyền chi
// tiết hơn (view-only, ai được sửa gì) nằm trong từng trang, không phải ở đây.
// Danh sách id + icon + nhãn nằm ở utils/navMeta.js (mỗi mục một icon riêng).

export default function Sidebar({ activeTab, setActiveTab, isCollapsed, onToggleCollapse, isMobileOpen, onCloseMobile, transactionCount = 0, activeUser }) {
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
  //
  // Số dòng là số thật đã nạp (từng là chuỗi cứng '1,890+' không bao giờ đổi).
  const gan = (m) => {
    const icon = iconOf(m.icon);
    if (m.children) return { ...m, icon, children: m.children.map(gan) };
    return m.id === 'transactions'
      ? { ...m, icon, count: transactionCount ? transactionCount.toLocaleString('vi-VN') : '' }
      : { ...m, icon };
  };
  const allMenuItems = NAV.map(gan);

  const menuItems = activeUser && activeUser.role === 'account'
    ? allMenuItems.filter((m) => ACCOUNT_TAB_IDS.includes(m.id))
    : allMenuItems;

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
    color: isActive ? 'var(--cyan-text)' : 'var(--text-muted)',
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
                        aria-current={isActive ? 'page' : undefined}
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
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
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

      {/* Chân menu (Đợt 3): thay thẻ quảng cáo (tên engine, không có thông tin) bằng đúng hai thông tin hữu ích — mình đang đăng
          nhập với vai trò gì và đang chạy bản nào (báo lỗi cho admin thì cần số bản). */}
      {!effectiveCollapsed && (
        <div style={{ marginTop: 'auto', padding: '8px 10px', borderTop: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {activeUser && activeUser.role && (
            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{nhanVaiTro(activeUser.role, activeUser.saleId).text}</div>
          )}
          <div>OEM Portal · v{APP_VERSION}</div>
        </div>
      )}
    </aside>
    </>
  );
}
