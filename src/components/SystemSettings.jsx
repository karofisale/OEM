import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SlidersHorizontal, RefreshCw, Loader2, Save, RotateCcw, History, ChevronDown, ChevronRight, Info, AlertTriangle, CheckCircle2, CalendarClock, Layers } from 'lucide-react';
import * as api from '../services/api';
import { refresh as lamMoiGiaTriHeThong } from '../services/systemValues';
import { lamSachLoi } from '../utils/errorText';
import { hienNgay, sapXepNgay } from '../utils/vnDate';
import {
  laMaster, gomTheoNhom, giaTriVaoO, docGiaTriTuO, khoangHienThi, laPhanTram, dinhDangGiaTri, nhanGiaTriLichSu,
  kiemTraNgayHieuLuc, ngayToiDa, trangThaiCaiDat, cauXacNhan, dungLenhLuu
} from '../utils/systemSettings';
import ConfirmDialog from './ConfirmDialog';

// Trang "Cài đặt hệ thống" (14/10/2026) — CHỈ vai trò `creator` (master). Dựng TỔNG QUÁT từ getSystemSettings của oem-api (nhóm theo `nhom`,
// mỗi dòng một cài đặt) nên thêm cài đặt mới ở máy chủ không phải sửa client. Giá trị lưu là số thực; `fmt = 'percent'` thì hiện/sửa dưới dạng
// phần trăm (0.08 <-> "8"). Mỗi thay đổi có NGÀY HIỆU LỰC (từ hôm nay đến +1 năm) và ghi chú; máy chủ là nơi quyết định, client chỉ báo lỗi sớm.
// Khác Cài đặt cá nhân (Settings.jsx): có nút Lưu + hộp xác nhận, vì giá trị này ảnh hưởng MỌI người dùng.

const nhanGio = (v) => hienNgay(v) || '—';

function Khung({ icon: Icon, title, children }) {
  return (
    <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }} aria-label={title}>
      <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 6px' }}>
        <Icon size={18} color="var(--karofi-cyan)" /> {title}
      </h3>
      {children}
    </section>
  );
}

function Bang({ nhom, tone, children, role }) {
  const nen = tone === 'loi' ? 'rgba(220, 38, 38, 0.12)' : (tone === 'canhbao' ? 'var(--warning-bg)' : 'rgba(59, 130, 246, 0.1)');
  const chu = tone === 'loi' ? 'var(--danger)' : (tone === 'canhbao' ? 'var(--warning-text)' : 'var(--karofi-navy)');
  return (
    <div role={role || 'status'} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: nen, color: chu, fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap', lineHeight: 1.45 }} data-nhom={nhom}>
      {children}
    </div>
  );
}

/** Lịch sử một cài đặt: lần sửa mới nhất đứng đầu. */
function LichSu({ s }) {
  const ds = (Array.isArray(s.lichSu) ? s.lichSu : []).slice().sort((a, b) => {
    const x = sapXepNgay(b.lucSua), y = sapXepNgay(a.lucSua);
    return (Number.isNaN(x) ? 0 : x) - (Number.isNaN(y) ? 0 : y);
  });
  if (!ds.length) return <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '6px 0' }}>Chưa có thay đổi nào.</div>;
  return (
    <div className="table-container" style={{ marginTop: '6px', maxHeight: '260px', overflowY: 'auto' }}>
      <table className="custom-table">
        <thead>
          <tr><th>Lúc sửa</th><th>Người sửa</th><th>Giá trị</th><th>Hiệu lực từ</th><th>Ghi chú</th></tr>
        </thead>
        <tbody>
          {ds.map((e, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: 'nowrap' }}>{nhanGio(e.lucSua)}</td>
              <td>{e.nguoiSua || '—'}</td>
              <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{nhanGiaTriLichSu(s, e.giaTri)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{hienNgay(e.hieuLucTu, { gio: false }) || '—'}</td>
              <td style={{ color: 'var(--text-muted)' }}>{e.ghiChu || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DongCaiDat({ s, today, tableMissing, canEdit, token, onSaved }) {
  const [text, setText] = useState(() => giaTriVaoO(s, s.giaTri));
  const [ngay, setNgay] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');
  const [xacNhan, setXacNhan] = useState(null);   // { giaTri: số | null, ngay }
  const [moLichSu, setMoLichSu] = useState(false);

  // Sau khi tải lại danh sách mà giá trị hiện hành đổi (do bản vừa lưu hoặc người khác sửa) thì ô nhập theo giá trị mới.
  useEffect(() => { setText(giaTriVaoO(s, s.giaTri)); }, [s.giaTri, s.hieuLucTu]);   // eslint-disable-line react-hooks/exhaustive-deps

  const kh = khoangHienThi(s);
  const pc = laPhanTram(s);
  const donVi = pc ? '%' : (s.donVi || '');
  const ngayDung = ngay || today;
  const khoa = !canEdit || tableMissing || busy;
  const cho = Array.isArray(s.choHieuLuc) ? s.choHieuLuc : [];
  const idId = 'hs-' + String(s.khoa).replace(/[^A-Za-z0-9_-]/g, '_');

  const batDauLuu = () => {
    setXong('');
    const r = docGiaTriTuO(s, text);
    if (!r.ok) { setLoi(r.error); return; }
    const e = kiemTraNgayHieuLuc(ngayDung, today);
    if (e) { setLoi(e); return; }
    if (String(ghiChu).length > 300) { setLoi('Ghi chú tối đa 300 ký tự.'); return; }
    setLoi('');
    setXacNhan({ giaTri: r.value, ngay: ngayDung });
  };
  const batDauVeMacDinh = () => {
    setXong('');
    const e = kiemTraNgayHieuLuc(ngayDung, today);
    if (e) { setLoi(e); return; }
    setLoi('');
    setXacNhan({ giaTri: null, ngay: ngayDung });
  };

  const luu = async () => {
    if (busy || !xacNhan) return;
    const { giaTri, ngay: nd } = xacNhan;
    setBusy(true);
    try {
      const res = await api.setSystemSetting(token, dungLenhLuu(s, giaTri, nd, ghiChu, today));
      setXacNhan(null);
      setLoi('');
      setGhiChu('');
      setNgay('');
      const tu = (res && res.hieuLucTu) || nd;
      setXong((giaTri === null ? 'Đã đặt về mặc định' : 'Đã lưu') + ', hiệu lực từ ' + hienNgay(tu, { gio: false }) + '.');
      await onSaved();
    } catch (err) {
      setXacNhan(null);
      setLoi(lamSachLoi((err && err.message) || String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-row" style={{ padding: '14px 0', borderTop: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '10px' }} data-khoa={s.khoa}>
      <div>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          {s.nhan || s.khoa}
          <code style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-dim)' }}>{s.khoa}</code>
        </div>
        {s.ghiChu && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.45 }}>{s.ghiChu}</div>}
        <div style={{ fontSize: '0.8rem', marginTop: '6px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--cyan-text)' }} aria-label="Giá trị đang dùng">{dinhDangGiaTri(s, s.giaTri)}</span>
          <span className={'badge ' + (s.daDat ? 'badge-blue' : 'badge-neutral')} style={{ fontSize: '0.7rem' }}>{trangThaiCaiDat(s, today)}</span>
        </div>
        {cho.length > 0 && (
          <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: 'var(--warning-text)' }}><CalendarClock size={13} /> Sắp có hiệu lực</div>
            {cho.map((c, i) => (
              <div key={i} style={{ paddingLeft: '18px', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-main)' }}>{nhanGiaTriLichSu(s, c.giaTri)}</strong> từ {hienNgay(c.hieuLucTu, { gio: false })}
                {c.nguoiSua ? ' — ' + c.nguoiSua : ''}{c.lucSua ? ' (' + nhanGio(c.lucSua) + ')' : ''}{c.ghiChu ? ' · ' + c.ghiChu : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor={idId + '-v'}>Giá trị mới{donVi ? ' (' + donVi + ')' : ''}</label>
          <input
            id={idId + '-v'}
            type="number"
            inputMode="decimal"
            className="input-field"
            style={{ width: '120px' }}
            min={kh.min == null ? undefined : kh.min}
            max={kh.max == null ? undefined : kh.max}
            step={kh.buoc == null ? (s.kieu === 'integer' ? 1 : 'any') : kh.buoc}
            value={text}
            disabled={khoa}
            onChange={(e) => { setText(e.target.value); setLoi(''); setXong(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!khoa) batDauLuu(); } }}
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor={idId + '-d'}>Hiệu lực từ</label>
          <input
            id={idId + '-d'}
            type="date"
            className="input-field"
            value={ngayDung}
            min={today || undefined}
            max={ngayToiDa(today) || undefined}
            disabled={khoa}
            onChange={(e) => { setNgay(e.target.value); setLoi(''); setXong(''); }}
          />
        </div>
        <div className="form-group" style={{ margin: 0, flex: '1 1 200px', minWidth: '160px' }}>
          <label className="form-label" htmlFor={idId + '-n'}>Ghi chú (không bắt buộc)</label>
          <input
            id={idId + '-n'}
            type="text"
            className="input-field"
            maxLength={300}
            value={ghiChu}
            placeholder="Lý do đổi"
            disabled={khoa}
            onChange={(e) => setGhiChu(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={khoa} onClick={batDauLuu}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Lưu
          </button>
          <button type="button" className="btn btn-secondary" disabled={khoa} onClick={batDauVeMacDinh} title={'Đưa về mặc định (' + dinhDangGiaTri(s, s.macDinh) + ')'}>
            <RotateCcw size={16} /> Về mặc định
          </button>
        </div>
      </div>

      {loi && <Bang tone="loi" role="alert"><AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} /> <span>{loi}</span></Bang>}
      {xong && !loi && <Bang tone="thongtin"><CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: '2px' }} /> <span>{xong}</span></Bang>}

      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={moLichSu}
          aria-controls={idId + '-ls'}
          onClick={() => setMoLichSu((v) => !v)}
        >
          {moLichSu ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <History size={14} /> Lịch sử ({(s.lichSu || []).length})
        </button>
        {moLichSu && <div id={idId + '-ls'}><LichSu s={s} /></div>}
      </div>

      {xacNhan && (
        <ConfirmDialog
          title={xacNhan.giaTri === null ? 'Đưa về mặc định?' : 'Lưu cài đặt hệ thống?'}
          message={cauXacNhan(s, xacNhan.giaTri, xacNhan.ngay, today) + ' Thay đổi áp dụng cho mọi người dùng.'}
          confirmLabel={xacNhan.giaTri === null ? 'Về mặc định' : 'Lưu'}
          busy={busy}
          onConfirm={luu}
          onCancel={() => { if (!busy) setXacNhan(null); }}
        />
      )}
    </div>
  );
}

export default function SystemSettings({ token, activeUser, isActive = true }) {
  const master = laMaster(activeUser && activeUser.role);
  const [data, setData] = useState(null);
  const [dangTai, setDangTai] = useState(false);
  const [loiTai, setLoiTai] = useState('');
  const dem = useRef(0);

  const tai = useCallback(async () => {
    if (!master || !token) return;
    const luot = ++dem.current;
    setDangTai(true);
    try {
      const d = await api.getSystemSettings(token);
      if (luot !== dem.current) return;
      setData(d && typeof d === 'object' ? d : { settings: [] });
      setLoiTai('');
    } catch (err) {
      if (luot !== dem.current) return;
      setLoiTai(lamSachLoi((err && err.message) || String(err)));
    } finally {
      if (luot === dem.current) setDangTai(false);
    }
  }, [master, token]);

  // Tải khi mở trang, và mỗi lần quay lại tab (KeepAliveTab giữ trang sống nên không tự dựng lại).
  useEffect(() => { if (isActive) tai(); }, [isActive, tai]);

  // Sau khi lưu: tải lại danh sách + làm mới giá trị hiệu lực của chính máy này (VAT / LNG) — nuốt lỗi phần làm mới.
  const sauKhiLuu = useCallback(async () => {
    await Promise.all([tai(), lamMoiGiaTriHeThong()]);
  }, [tai]);

  if (!master) {
    return (
      <div className="glass-card" role="alert" style={{ maxWidth: '860px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>Cài đặt hệ thống</h2>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Chỉ master (Creator) mới xem được cài đặt hệ thống.</p>
      </div>
    );
  }

  const settings = data && Array.isArray(data.settings) ? data.settings : [];
  const today = (data && data.today) || '';
  const tableMissing = !!(data && data.tableMissing);
  const canEdit = !!(data && data.canEdit) && !tableMissing;
  const nhom = gomTheoNhom(settings);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '980px' }}>
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <SlidersHorizontal size={24} color="var(--karofi-cyan)" /> Cài đặt hệ thống
            </h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              Giá trị dùng chung cho mọi người dùng OEM Portal (khác “Cài đặt cá nhân”). Mỗi thay đổi có ngày hiệu lực — từ hôm nay đến một năm sau;
              người dùng đang mở app nhận giá trị mới khi tải lại trang.
              {today ? ' Hôm nay: ' + hienNgay(today, { gio: false }) + '.' : ''}
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={tai} disabled={dangTai} title="Tải lại danh sách cài đặt">
            <RefreshCw size={14} className={dangTai ? 'animate-spin' : ''} /> Tải lại
          </button>
        </div>
      </div>

      {tableMissing && (
        <Bang tone="thongtin"><Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> <span>Chưa chạy SQL đợt 8 — chưa lưu được. Các giá trị bên dưới là mặc định có sẵn; khi bảng được tạo, trang này sẽ cho phép lưu.</span></Bang>
      )}
      {data && !data.canEdit && !tableMissing && (
        <Bang tone="canhbao"><Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> <span>Tài khoản này chỉ được xem, không sửa được cài đặt hệ thống.</span></Bang>
      )}
      {loiTai && (
        <Bang tone="loi" role="alert">
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span style={{ flex: '1 1 240px' }}>Không tải được cài đặt hệ thống: {loiTai}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={tai} disabled={dangTai}>Thử lại</button>
        </Bang>
      )}

      {!data && dangTai && (
        <div className="glass-card" role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          <Loader2 size={16} className="animate-spin" /> Đang tải cài đặt hệ thống...
        </div>
      )}

      {data && !settings.length && !loiTai && (
        <div className="glass-card" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Máy chủ chưa có cài đặt hệ thống nào.</div>
      )}

      {nhom.map((g) => (
        <Khung key={g.nhom} icon={Layers} title={g.nhom}>
          {g.items.map((s) => (
            <DongCaiDat key={s.khoa} s={s} today={today} tableMissing={tableMissing} canEdit={canEdit} token={token} onSaved={sauKhiLuu} />
          ))}
        </Khung>
      ))}
    </div>
  );
}
