import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import { RefreshCw, Droplets, LogOut, Menu, KeyRound, Sun, Moon, Monitor, ArrowLeft, Settings, SlidersHorizontal, LayoutGrid, ChevronDown, Repeat, ExternalLink } from 'lucide-react';
import { setSetting } from '../services/prefsSync';
import { useSetting } from '../hooks/useSetting';
import { appKhacDungDuoc } from '../services/karofiSession';
import { lamNongTrang, laBamDiThang } from '../utils/chuyenApp';
import { nhanVaiTro, TONE_CLASS } from '../utils/glossary';

/**
 * Menu thả của thanh trên (10/11/2026). Thanh trên từng có tới 9 nút trần (Portal, từng app, Tải lại, người dùng, giao diện, Cài đặt,
 * Hệ thống, Đổi PIN, Đăng xuất) nên tràn xuống dòng 2 ở màn hình hẹp; nay chỉ còn HAI menu: "Ứng dụng" và menu người dùng.
 * Đóng bằng Esc, bấm ra ngoài, hoặc chọn một mục (mục có data-giu-mo thì giữ menu mở — vd đổi giao diện bấm nhiều lần). Mũi tên lên / xuống chuyển mục.
 */
function MenuTha({ nut, nhan, align = 'right', children, minWidth = 220 }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const id = 'nav-menu-' + useId().replace(/:/g, '');

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      const b = wrapRef.current && wrapRef.current.querySelector('[aria-haspopup]');
      if (b) b.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const onListKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const els = Array.from(listRef.current.querySelectorAll('.more-menu-item:not([disabled])'));
    if (!els.length) return;
    const i = els.indexOf(document.activeElement);
    e.preventDefault();
    els[e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length].focus();
  };
  // Chọn xong một mục thì gập menu — trừ mục xin giữ mở.
  const onListClick = (e) => {
    const it = e.target.closest && e.target.closest('.more-menu-item');
    if (it && !it.hasAttribute('data-giu-mo')) setOpen(false);
  };

  return (
    <div ref={wrapRef} className="more-menu nav-menu">
      {nut({ open, toggle: () => setOpen((v) => !v), props: { 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': open ? id : undefined, 'aria-label': nhan } })}
      {open && (
        <div ref={listRef} id={id} role="menu" aria-label={nhan} className="more-menu-list" style={{ ...(align === 'left' ? { left: 0 } : { right: 0 }), minWidth }}
          onKeyDown={onListKey} onClick={onListClick}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function Navbar({ activeUser, sso = false, sessionKey = '', onOpenLoginModal, onLogout, isSyncing, onRefreshData, onOpenMobileMenu, onOpenChangePassword, onOpenSettings, onOpenSystemSettings, systemActive }) {
  // App khác mà người này vào được, lấy từ khối quyền trong token của PHIÊN DÙNG CHUNG. Tính lại khi phiên đổi (trước đây chỉ đọc một lần
  // lúc dựng: phiên chung hết hạn rồi đăng nhập lại bằng form của OEM thì nút chuyển app cũ vẫn còn, bấm vào là gặp màn đăng nhập ở app kia).
  // Đang dùng phiên RIÊNG của OEM (không phải từ cổng) thì không hiện app nào — chỉ còn đường về Portal.
  const appKhac = useMemo(() => (sso ? appKhacDungDuoc('OEM') : []), [sso, sessionKey]);

  // Địa chỉ vừa được bấm — nút "Ứng dụng" đổi sang "Đang mở…" + vòng xoay ngay, vì trang đích mất vài giây
  // mới hiện, không có thì người dùng tưởng nút không ăn. Về lại bằng nút Back (trang lấy từ bộ nhớ đệm,
  // không chạy lại) thì pageshow.persisted trả nút về như cũ.
  const [dangChuyen, setDangChuyen] = useState(null);
  useEffect(() => {
    const boLopPhu = (e) => { if (e.persisted) setDangChuyen(null); };
    window.addEventListener('pageshow', boLopPhu);
    return () => window.removeEventListener('pageshow', boLopPhu);
  }, []);
  // Trình duyệt hỏi "rời trang?" (còn ô chưa lưu) mà người dùng chọn Ở LẠI thì trang không đi đâu:
  // trả nút về như cũ thay vì kẹt "Đang mở…".
  useEffect(() => {
    if (!dangChuyen) return undefined;
    const t = setTimeout(() => setDangChuyen(null), 15000);
    return () => clearTimeout(t);
  }, [dangChuyen]);
  const linkChuyen = (href) => ({
    href,
    onClick: (e) => { if (laBamDiThang(e)) setDangChuyen(href); },
    onPointerEnter: () => lamNongTrang(href),
    onFocus: () => lamNongTrang(href),
    onTouchStart: () => lamNongTrang(href)
  });

  // Nhãn vai trò lấy từ utils/glossary.js (có cả 'account' — bản cũ bỏ sót nên kế
  // toán hiện thành "Sale: Chung"). Emoji chỉ để dễ nhìn lướt, không mang nghĩa.
  const ROLE_EMOJI = { creator: '👑', admin: '🛡️', leader: '📊', account: '🧾', sale: '💼' };
  const getRoleLabel = (role) => {
    const v = nhanVaiTro(role, activeUser.saleId);
    return { text: `${ROLE_EMOJI[String(role || '').toLowerCase()] || ROLE_EMOJI.sale} ${v.text}`, badge: TONE_CLASS[v.tone] };
  };
  const roleInfo = getRoleLabel(activeUser.role);
  const tenNgan = String(activeUser.name || '').split('@')[0];

  // Cycles system -> light -> dark. 'system' is the default and follows the OS,
  // which is why it is a three-way toggle rather than a two-way switch.
  // Theme là một Cài đặt cá nhân (st.theme): đổi ở đây hay ở trang Cài đặt đều lưu cục bộ + đồng bộ lên máy chủ.
  const theme = useSetting('st.theme');
  const THEME_UI = {
    system: { Icon: Monitor, label: 'Giao diện: theo hệ thống', next: 'light' },
    light:  { Icon: Sun,     label: 'Giao diện: sáng',          next: 'dark' },
    dark:   { Icon: Moon,    label: 'Giao diện: tối',           next: 'system' }
  };
  const themeUi = THEME_UI[theme] || THEME_UI.system;
  const cycleTheme = () => {
    setSetting('st.theme', themeUi.next);
  };

  const mauAvatar = activeUser.role === 'creator' ? 'var(--accent-amber)' : activeUser.role === 'admin' ? 'var(--accent-purple)' : activeUser.role === 'leader' ? 'var(--karofi-cyan)' : 'var(--accent-emerald)';
  const avatar = (
    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: mauAvatar, color: 'var(--on-accent)', fontWeight: 800, fontSize: '0.75rem',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {String(activeUser.name || '?')[0].toUpperCase()}
    </div>
  );

  return (
    <header className="app-navbar" style={{
      height: '68px',
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '0 32px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: 'var(--shadow-sm)'
    }}>
      {/* Brand & Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
        <button
          onClick={onOpenMobileMenu}
          className="btn btn-secondary btn-sm mobile-menu-toggle"
          style={{ padding: '8px', borderRadius: '50%', width: '36px', height: '36px' }}
          title="Mở Menu"
        >
          <Menu size={18} color="var(--karofi-cyan)" />
        </button>

        {/* Menu "Ứng dụng": đường về cổng (cần thiết vì khi chạy như ứng dụng đã cài, cửa sổ không có nút back của trình duyệt)
            + các app khác mà người này được vào. Gộp MỘT nút thay cho mỗi app một nút. */}
        <MenuTha align="left" nhan="Chuyển ứng dụng" minWidth={200}
          nut={({ toggle, props }) => (
            <button type="button" {...props} onClick={toggle} className="btn btn-secondary btn-sm" title="Về Karofi Portal / chuyển sang app khác"
              aria-busy={dangChuyen ? true : undefined}
              style={dangChuyen ? { color: 'var(--cyan-text)', borderColor: 'var(--cyan-text)', pointerEvents: 'none', cursor: 'progress' } : undefined}>
              {dangChuyen ? <RefreshCw size={14} className="animate-spin" /> : <LayoutGrid size={14} />}
              <span className="hide-mobile-xs">{dangChuyen ? 'Đang mở…' : 'Ứng dụng'}</span>
              {!dangChuyen && <ChevronDown size={12} aria-hidden="true" />}
            </button>
          )}>
          <a role="menuitem" className="more-menu-item" style={{ textDecoration: 'none' }} title="Về Karofi Portal" {...linkChuyen('/VHKD/')}>
            <ArrowLeft size={14} /> Portal
          </a>
          {appKhac.map((a) => (
            <a key={a.key} role="menuitem" className="more-menu-item" style={{ textDecoration: 'none' }} title={'Sang ' + a.ten} {...linkChuyen(a.href)}>
              <ExternalLink size={14} /> {a.ten}
            </a>
          ))}
        </MenuTha>

        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #00a0e9, #004e89)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0, 160, 233, 0.3)',
          flexShrink: 0
        }}>
          <Droplets size={24} color="#fff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--cyan-text)', letterSpacing: '-0.03em' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <button
          onClick={onRefreshData}
          disabled={isSyncing}
          className="btn btn-secondary btn-sm"
          title="Tải lại dữ liệu mới nhất"
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          <span className="hide-mobile-xs">{isSyncing ? 'Đang tải...' : 'Tải lại'}</span>
        </button>

        {/* Menu người dùng: Tài khoản (đổi người dùng) · Cài đặt · Giao diện · Hệ thống (master) · Đổi PIN · Đăng xuất */}
        <MenuTha nhan="Tài khoản và cài đặt" minWidth={240}
          nut={({ toggle, props }) => (
            <button type="button" {...props} onClick={toggle} title={'Tài khoản: ' + tenNgan}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-main)', padding: '6px 12px', borderRadius: '9999px',
                border: '1px solid var(--karofi-cyan-border)', cursor: 'pointer', transition: 'all 0.15s ease', maxWidth: '260px' }}>
              {avatar}
              <div className="hide-mobile-xs" style={{ textAlign: 'left', lineHeight: 1.2, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                  {tenNgan}
                </div>
                <span className={`badge ${roleInfo.badge}`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                  {roleInfo.text}
                </span>
              </div>
              <ChevronDown size={14} aria-hidden="true" color="var(--text-muted)" />
            </button>
          )}>
          <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--border-color)', marginBottom: '4px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            {avatar}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tenNgan}</div>
              <span className={`badge ${roleInfo.badge}`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>{roleInfo.text}</span>
            </div>
          </div>

          <button type="button" role="menuitem" className="more-menu-item" onClick={onOpenLoginModal} title="Đăng nhập bằng tài khoản khác trên máy này">
            <Repeat size={14} /> Đổi người dùng
          </button>

          {onOpenSettings && (
            <button type="button" role="menuitem" className="more-menu-item" onClick={onOpenSettings} title="Cài đặt cá nhân">
              <Settings size={14} /> Cài đặt
            </button>
          )}

          <button type="button" role="menuitem" data-giu-mo="" className="more-menu-item" onClick={cycleTheme} title={`${themeUi.label} — bấm để đổi`}>
            <themeUi.Icon size={14} /> {themeUi.label}
          </button>

          {/* Cài đặt HỆ THỐNG: chỉ master (creator) — App chỉ truyền onOpenSystemSettings cho vai đó. */}
          {onOpenSystemSettings && (
            <button type="button" role="menuitem" className="more-menu-item" onClick={onOpenSystemSettings}
              title="Cài đặt hệ thống (dùng chung cho mọi người dùng)" aria-current={systemActive ? 'page' : undefined}>
              <SlidersHorizontal size={14} /> Hệ thống
            </button>
          )}

          <button type="button" role="menuitem" className="more-menu-item" onClick={onOpenChangePassword} title="Đổi mã PIN">
            <KeyRound size={14} /> Đổi PIN
          </button>

          <button type="button" role="menuitem" className="more-menu-item is-danger" onClick={onLogout} title="Đăng xuất"
            style={{ borderTop: '1px solid var(--border-color)', borderRadius: 0, marginTop: '4px', paddingTop: '10px' }}>
            <LogOut size={14} /> Đăng xuất
          </button>
        </MenuTha>
      </div>
    </header>
  );
}
