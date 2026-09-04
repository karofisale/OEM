import React, { useState } from 'react';
import { RefreshCw, Sparkles, ShieldCheck, UserCheck, Droplets, LogOut, Menu, KeyRound, Sun, Moon, Monitor, ArrowLeft } from 'lucide-react';
import { loadTheme, applyTheme } from '../services/theme';
import { appKhacDungDuoc } from '../services/karofiSession';

export default function Navbar({ activeUser, onOpenLoginModal, onLogout, isSyncing, onRefreshData, onOpenMobileMenu, onOpenChangePassword }) {
  // Đọc một lần khi dựng: khối quyền nằm trong token, không đổi giữa các lần vẽ.
  const [appKhac] = useState(() => appKhacDungDuoc('OEM'));

  const getRoleLabel = (role) => {
    switch (role) {
      case 'creator': return { text: '👑 Creator', badge: 'badge-amber' };
      case 'admin': return { text: '🛡️ Admin', badge: 'badge-purple' };
      case 'leader': return { text: '📊 Leader (Xem)', badge: 'badge-blue' };
      case 'sale': default: return { text: `💼 Sale: ${activeUser.saleId || 'Chung'}`, badge: 'badge-emerald' };
    }
  };

  const roleInfo = getRoleLabel(activeUser.role);

  // Cycles system -> light -> dark. 'system' is the default and follows the OS,
  // which is why it is a three-way toggle rather than a two-way switch.
  const [theme, setTheme] = React.useState(loadTheme);
  const THEME_UI = {
    system: { Icon: Monitor, label: 'Giao diện: theo hệ thống', next: 'light' },
    light:  { Icon: Sun,     label: 'Giao diện: sáng',          next: 'dark' },
    dark:   { Icon: Moon,    label: 'Giao diện: tối',           next: 'system' }
  };
  const themeUi = THEME_UI[theme] || THEME_UI.system;
  const cycleTheme = () => {
    const next = themeUi.next;
    setTheme(next);
    applyTheme(next);
  };

  return (
    <header className="app-navbar" style={{
      height: '68px',
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: 'var(--shadow-sm)'
    }}>
      {/* Brand & Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={onOpenMobileMenu}
          className="btn btn-secondary btn-sm mobile-menu-toggle"
          style={{ padding: '8px', borderRadius: '50%', width: '36px', height: '36px' }}
          title="Mở Menu"
        >
          <Menu size={18} color="var(--karofi-cyan)" />
        </button>

        {/* Đường về cổng. Cần thiết vì khi chạy như ứng dụng đã cài, cửa sổ
            không có nút back của trình duyệt. */}
        <a
          href="/VHKD/"
          title="Về Karofi Portal"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 10px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '0.8rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          <ArrowLeft size={14} />
          <span className="hide-mobile-xs">Portal</span>
        </a>

        {/* Chuyển sang app khác mà người này được vào, không phải đi vòng qua
            cổng. Chỉ hiện khi đang dùng phiên chung — đăng nhập riêng bằng
            ?direct=1 thì không có khối quyền nên mảng rỗng và không hiện gì. */}
        {appKhac.map(a => (
          <a
            key={a.key}
            href={a.href}
            title={'Sang ' + a.ten}
            className="hide-mobile-xs"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '0.8rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            {a.nhan}
          </a>
        ))}

        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #00a0e9, #004e89)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0, 160, 233, 0.3)'
        }}>
          <Droplets size={24} color="#fff" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--karofi-cyan)', letterSpacing: '-0.03em' }}>
              KAROFI
            </h1>
            <span className="hide-mobile-xs" style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--karofi-navy)', letterSpacing: '0.05em' }}>
              OEM PORTAL
            </span>
          </div>
          <div className="hide-mobile-xs" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
            <span className="pulse-dot"></span>
            <span>Backend API</span>
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button 
          onClick={onRefreshData}
          disabled={isSyncing}
          className="btn btn-secondary btn-sm"
          title="Tải lại dữ liệu mới nhất từ Google Sheet"
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          <span className="hide-mobile-xs">{isSyncing ? 'Đang tải...' : 'Đồng bộ Sheet'}</span>
        </button>

        {/* Profile Card & Switcher Button */}
        <button
          onClick={onOpenLoginModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'var(--bg-main)',
            padding: '6px 14px',
            borderRadius: '9999px',
            border: '1px solid var(--karofi-cyan-border)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: activeUser.role === 'creator' ? 'var(--accent-amber)' : activeUser.role === 'admin' ? 'var(--accent-purple)' : activeUser.role === 'leader' ? 'var(--karofi-cyan)' : 'var(--accent-emerald)',
            color: 'var(--on-accent)', fontWeight: 800, fontSize: '0.75rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {activeUser.name[0].toUpperCase()}
          </div>

          <div className="hide-mobile-xs" style={{ textAlign: 'left', lineHeight: 1.2 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {activeUser.name.split('@')[0]}
            </div>
            <span className={`badge ${roleInfo.badge}`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
              {roleInfo.text}
            </span>
          </div>

          <span className="hide-mobile-xs" style={{ fontSize: '0.725rem', color: 'var(--karofi-cyan)', fontWeight: 700, marginLeft: '4px' }}>
            Đổi
          </span>
        </button>

        <button
          onClick={cycleTheme}
          className="btn btn-secondary btn-sm"
          title={`${themeUi.label} — bấm để đổi`}
          aria-label={themeUi.label}
          style={{ marginRight: '8px' }}
        >
          <themeUi.Icon size={14} />
        </button>

        <button
          onClick={onOpenChangePassword}
          className="btn btn-secondary btn-sm"
          title="Đổi mã PIN"
        >
          <KeyRound size={14} /> <span className="hide-mobile-xs">Đổi PIN</span>
        </button>

        <button
          onClick={onLogout}
          className="btn btn-secondary btn-sm"
          title="Đăng xuất"
        >
          <LogOut size={14} /> <span className="hide-mobile-xs">Đăng xuất</span>
        </button>
      </div>
    </header>
  );
}
