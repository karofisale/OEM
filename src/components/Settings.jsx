import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Palette, Rocket, Wrench, ShieldCheck, Monitor, Sun, Moon, KeyRound, RotateCcw, CheckCircle2, CloudOff, Loader2 } from 'lucide-react';
import { setSetting, resetSettings } from '../services/prefsSync';
import { useSetting, useSyncStatus } from '../hooks/useSetting';
import { useCalcMargin } from '../hooks/useSystemValue';
import { NAV, ACCOUNT_TAB_IDS } from '../utils/navMeta';
import { CO_TRANG } from '../utils/paging';
import { nhanVaiTro } from '../utils/glossary';
import { chuanLng, tabChoPhep, BIEN_TOAST_GIAY, BIEN_LNG } from '../utils/settings';
import { HUONG_DAN_PIN_SSO } from '../utils/pinRule';
import ConfirmDialog from './ConfirmDialog';

// Trang Cài đặt cá nhân (14/10/2026) — mọi vai trò. Mỗi lựa chọn lưu NGAY (không có nút "Lưu"): ghi cục bộ rồi tự đồng bộ lên
// máy chủ theo tài khoản (services/prefsSync.js). Máy chủ lỗi thì vẫn dùng được, chỉ hiện một dòng thông tin ở đầu trang.

/** Nút chọn một trong vài giá trị (dùng kiểu `.tab-btn` như ViewModeToggle). */
function Seg({ value, options, onChange, label }) {
  return (
    <div className="tab-bar" role="group" aria-label={label} style={{ padding: '3px', borderRadius: 'var(--radius-md)', flexWrap: 'wrap' }}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value === o.value}
            className={'tab-btn' + (value === o.value ? ' is-active' : '')}
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon size={14} aria-hidden="true" />} {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Row({ title, hint, children }) {
  return (
    <div className="settings-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 20px', padding: '12px 0', borderTop: '1px solid var(--border-soft)' }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>{title}</div>
        {hint && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.45 }}>{hint}</div>}
      </div>
      <div style={{ flex: '0 1 auto' }}>{children}</div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }} aria-label={title}>
      <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 6px' }}>
        <Icon size={18} color="var(--karofi-cyan)" /> {title}
      </h3>
      {children}
    </section>
  );
}

/** Ô nhập "Biên lợi nhuận": gõ tự do, lưu khi rời ô / Enter (kẹp 1–60, số lẻ làm tròn), gõ rác thì trả về số đang lưu. */
function LngInput() {
  // Chưa chọn thì ô hiện MẶC ĐỊNH HỆ THỐNG (oem.defaultMargin); gõ số khác mặc định hệ thống mới thành lựa chọn cá nhân.
  const { value: saved } = useCalcMargin();
  const [draft, setDraft] = useState(String(saved));
  useEffect(() => { setDraft(String(saved)); }, [saved]);
  const commit = () => {
    if (draft === String(saved)) return;   // chưa sửa gì (kể cả khi mặc định hệ thống là số lẻ) -> không biến nó thành lựa chọn cá nhân
    const n = chuanLng(draft);
    if (n == null) { setDraft(String(saved)); return; }
    setDraft(String(n));
    if (n !== saved) setSetting('st.calcMargin', n);
  };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="number"
        className="input-field"
        style={{ width: '90px' }}
        min={BIEN_LNG.min}
        max={BIEN_LNG.max}
        step="1"
        value={draft}
        aria-label="Biên lợi nhuận mặc định (%)"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      />
      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>%</span>
    </div>
  );
}

export default function Settings({ activeUser, sso = false, onOpenChangePassword }) {
  const theme = useSetting('st.theme');
  const density = useSetting('st.density');
  const sidebar = useSetting('st.sidebarCollapsed');
  const landing = useSetting('st.landing');
  const pageSize = useSetting('st.pageSize');
  const reportYear = useSetting('st.reportYear');
  const reportSale = useSetting('st.reportSale');
  const toastSec = useSetting('st.toastSec');
  const status = useSyncStatus();
  const margin = useCalcMargin();
  const [confirmReset, setConfirmReset] = useState(false);

  const role = String(activeUser.role || '').toLowerCase();
  const coBaoCao = role !== 'account';   // kế toán chỉ có Sản phẩm / Khách hàng / Công nợ: không có màn báo cáo doanh thu
  const coMayTinhGia = ['admin', 'creator'].includes(role);   // tab "Tính Giá" chỉ có với Admin/Creator (ProductPricing.canCalculate)
  const tabs = tabChoPhep(role, NAV, ACCOUNT_TAB_IDS);
  const vaiTro = nhanVaiTro(activeUser.role, activeUser.saleId);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '860px' }}>
      <div className="glass-card">
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <SettingsIcon size={24} color="var(--karofi-cyan)" /> Cài đặt cá nhân
        </h2>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Lưu theo tài khoản của bạn và tự đi theo sang máy khác. Mỗi lựa chọn có hiệu lực ngay, không cần bấm lưu.
        </p>
        <div role="status" style={{ marginTop: '8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', color: status === 'loi' ? 'var(--warning-text)' : 'var(--text-muted)' }}>
          {status === 'dang' && <><Loader2 size={13} className="animate-spin" /> Đang đồng bộ với tài khoản...</>}
          {status === 'ok' && <><CheckCircle2 size={13} /> Đã đồng bộ với tài khoản.</>}
          {status === 'loi' && <><CloudOff size={13} /> Chưa đồng bộ được với máy chủ — cài đặt vẫn được lưu trên máy này và sẽ tự gửi lại sau.</>}
          {status === 'chua' && <>Cài đặt được lưu trên máy này.</>}
        </div>
      </div>

      <Section icon={Palette} title="Giao diện">
        <Row title="Chủ đề màu" hint="Theo máy: dùng chế độ sáng/tối của hệ điều hành.">
          <Seg label="Chủ đề màu" value={theme} onChange={(v) => setSetting('st.theme', v)} options={[
            { value: 'system', label: 'Theo máy', icon: Monitor }, { value: 'light', label: 'Sáng', icon: Sun }, { value: 'dark', label: 'Tối', icon: Moon }
          ]} />
        </Row>
        <Row title="Mật độ bảng" hint="Gọn: hàng bảng sát hơn để thấy nhiều dòng trên một màn hình.">
          <Seg label="Mật độ bảng" value={density} onChange={(v) => setSetting('st.density', v)} options={[
            { value: 'comfortable', label: 'Thoáng' }, { value: 'compact', label: 'Gọn' }
          ]} />
        </Row>
        <Row title="Menu bên trái" hint="Thu gọn thành các biểu tượng mỗi khi mở app (vẫn bấm mũi tên để mở rộng tạm thời).">
          <Seg label="Menu bên trái" value={sidebar} onChange={(v) => setSetting('st.sidebarCollapsed', v)} options={[
            { value: false, label: 'Mở rộng' }, { value: true, label: 'Thu gọn' }
          ]} />
        </Row>
      </Section>

      <Section icon={Rocket} title="Khi mở app">
        <Row title="Trang đầu" hint="Tự động: tab bạn xem lần trước, hoặc trang mặc định theo vai trò. Chọn một tab cụ thể thì luôn mở tab đó.">
          <select className="input-field" style={{ minWidth: '220px' }} value={landing} aria-label="Trang đầu" onChange={(e) => setSetting('st.landing', e.target.value)}>
            <option value="auto">Tự động theo vai trò</option>
            {tabs.map((t) => <option key={t.id} value={t.id}>{t.nhom ? t.nhom + ' › ' + t.label : t.label}</option>)}
          </select>
        </Row>
        <Row title="Số dòng mỗi trang" hint="Áp cho các bảng có phân trang. Mặc định: mỗi màn dùng cỡ riêng của nó (25 dòng, riêng DT Ngày là 50).">
          <Seg label="Số dòng mỗi trang" value={pageSize} onChange={(v) => setSetting('st.pageSize', v)} options={[{ value: 0, label: 'Theo từng màn' }].concat(CO_TRANG.map((n) => ({ value: n, label: String(n) })))} />
        </Row>
        {coBaoCao && (
          <>
            <Row title="Năm mặc định ở báo cáo" hint="Chỉ dùng khi bạn chưa tự chọn năm ở báo cáo; năm hiện tại chưa có dữ liệu thì báo cáo lấy năm mới nhất có dữ liệu.">
              <Seg label="Năm mặc định ở báo cáo" value={reportYear} onChange={(v) => setSetting('st.reportYear', v)} options={[
                { value: 'latest', label: 'Năm mới nhất có dữ liệu' }, { value: 'current', label: 'Năm hiện tại' }
              ]} />
            </Row>
            <Row title="Sale mặc định ở báo cáo" hint="Áp cho DT Tháng và DT Ngày khi bạn chưa tự chọn Sale. “Của tôi” cần tài khoản có mã Sale.">
              <Seg label="Sale mặc định ở báo cáo" value={reportSale} onChange={(v) => setSetting('st.reportSale', v)} options={[
                { value: 'all', label: 'Tất cả' }, { value: 'mine', label: 'Của tôi' }
              ]} />
            </Row>
          </>
        )}
      </Section>

      <Section icon={Wrench} title="Công cụ">
        {coMayTinhGia && (
          <Row title="Biên lợi nhuận mặc định của máy tính giá" hint={'Điền sẵn vào ô "% LNG" ở Sản phẩm & Bảng giá › Tính Giá. Từ ' + BIEN_LNG.min + ' đến ' + BIEN_LNG.max + '%. Mặc định của hệ thống hiện là ' + String(margin.heThong).replace('.', ',') + '% — bạn chưa chọn số riêng thì dùng số này.'}>
            <LngInput />
          </Row>
        )}
        <Row title="Thời gian hiện thông báo" hint="Thông báo lỗi luôn giữ lại cho tới khi bạn đóng.">
          <Seg label="Thời gian hiện thông báo" value={toastSec} onChange={(v) => setSetting('st.toastSec', v)} options={BIEN_TOAST_GIAY.map((n) => ({ value: n, label: n + ' giây' }))} />
        </Row>
      </Section>

      <Section icon={ShieldCheck} title="Bảo mật">
        <Row title="Tài khoản">
          <div style={{ textAlign: 'right', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{String(activeUser.name || '').split('@')[0]}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{vaiTro.text}</div>
          </div>
        </Row>
        <Row title="Mã PIN" hint={sso ? HUONG_DAN_PIN_SSO : 'PIN mới: ít nhất 6 chữ số, không toàn số giống nhau và không phải dãy liên tiếp.'}>
          <button type="button" className="btn btn-secondary" onClick={onOpenChangePassword}>
            <KeyRound size={16} /> Đổi PIN
          </button>
        </Row>
        <Row title="Khôi phục mặc định" hint="Xoá mọi lựa chọn ở trang này (kể cả trên máy chủ). Bộ lọc và kiểu xem Bảng/Lưới bạn đã chọn ở từng màn không bị ảnh hưởng.">
          <button type="button" className="btn btn-danger-outline" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={16} /> Khôi phục mặc định
          </button>
        </Row>
      </Section>

      {confirmReset && (
        <ConfirmDialog
          title="Khôi phục cài đặt mặc định?"
          message="Chủ đề, mật độ bảng, trang đầu, cỡ trang, biên lợi nhuận và thời gian thông báo sẽ về mặc định, trên mọi máy của bạn."
          confirmLabel="Khôi phục mặc định"
          danger
          onConfirm={() => { resetSettings(); setConfirmReset(false); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
