import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Target, Plus, Trash2, ClipboardPaste, Save, RefreshCw, Loader2 } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { parseKpiDan } from '../../utils/adminTables';

const THANG = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
const fmt = (v) => (v || 0).toLocaleString('vi-VN');
const namHienTai = () => new Date().getFullYear();
const dongTrong = () => ({ code: '', name: '', pic: '', months: new Array(12).fill(0) });

/**
 * KPI năm theo khách — thay cho tab "Plan2026" trước đây sửa tay trên Google
 * Sheet. Màn "Đề xuất kế hoạch" dựng bảng từ chính số này, và thẻ Mục tiêu KPI
 * trên cổng VHKD cộng từ đây.
 *
 * Sửa trên màn hình chưa ghi gì; chỉ nút Lưu mới ghi, và ghi = THAY TOÀN BỘ
 * KPI của năm đang chọn (khách bị xoá khỏi bảng là bị xoá thật).
 */
export default function PlanNamPanel({ token, onSaved }) {
  const toast = useToast();
  const [nam, setNam] = useState(namHienTai());
  const [rows, setRows] = useState([]);
  const [dangDoc, setDangDoc] = useState(false);
  const [loiDoc, setLoiDoc] = useState('');
  const [daSua, setDaSua] = useState(false);
  const [moDan, setMoDan] = useState(false);
  const [vanBan, setVanBan] = useState('');
  const [xacNhan, setXacNhan] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);

  const doc = useCallback(async () => {
    setDangDoc(true);
    setLoiDoc('');
    try {
      const d = await api.getPlanNam(token, nam);
      setRows(d.rows || []);
      setDaSua(false);
    } catch (err) {
      setLoiDoc(err.message || String(err));
    } finally {
      setDangDoc(false);
    }
  }, [token, nam]);

  useEffect(() => { doc(); }, [doc]);

  const sua = (i, patch) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDaSua(true);
  };
  const suaThang = (i, m, v) => {
    // KPI là VND chẵn; ô hiển thị kiểu vi-VN ("1.000.000") nên dấu chấm là phân
    // cách nghìn — chỉ giữ chữ số, giữ dấu chấm là Number("1.000.000") = NaN.
    const n = Number(String(v).replace(/[^\d]/g, '')) || 0;
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, months: r.months.map((x, k) => (k === m ? n : x)) } : r)));
    setDaSua(true);
  };

  const apDan = () => {
    try {
      const kq = parseKpiDan(vanBan);
      setRows(kq.rows);
      setDaSua(true);
      setMoDan(false);
      setVanBan('');
      toast.success(`Đã đọc ${kq.rows.length} khách từ bảng dán${kq.boQua ? ` (bỏ ${kq.boQua} dòng tiêu đề/tổng)` : ''}. Bấm Lưu để ghi.`);
    } catch (err) {
      toast.error(err.message || String(err));
    }
  };

  const maTrung = useMemo(() => {
    const dem = {};
    rows.forEach((r) => { const k = r.code.trim(); if (k) dem[k] = (dem[k] || 0) + 1; });
    return Object.keys(dem).filter((k) => dem[k] > 1);
  }, [rows]);

  const tong = useMemo(() => THANG.map((_, m) => rows.reduce((s, r) => s + (r.months[m] || 0), 0)), [rows]);

  const luu = async () => {
    setDangLuu(true);
    try {
      const kq = await api.savePlanNam(token, nam, rows);
      toast.success(`Đã lưu KPI năm ${kq.nam}: ${kq.savedCount} khách.`);
      setXacNhan(false);
      setDaSua(false);
      await doc();
      if (onSaved) onSaved().catch(() => {});
    } catch (err) {
      toast.error('Không lưu được KPI năm: ' + (err.message || err));
    } finally {
      setDangLuu(false);
    }
  };

  const oSo = { width: '92px', padding: '4px 6px', fontSize: '0.75rem', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Target size={20} color="var(--accent-emerald)" />
          <strong>KPI năm</strong>
          <select className="input-field" style={{ width: '110px' }} value={nam}
                  onChange={(e) => { if (!daSua || window.confirm('Bỏ các chỗ đã sửa chưa lưu?')) setNam(Number(e.target.value)); }}>
            {[namHienTai() - 1, namHienTai(), namHienTai() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{rows.length} khách{daSua ? ' · có thay đổi CHƯA lưu' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={doc} disabled={dangDoc || dangLuu} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} className={dangDoc ? 'animate-spin' : undefined} /> Tải lại
          </button>
          <button onClick={() => setMoDan((v) => !v)} disabled={dangLuu} className="btn btn-secondary btn-sm">
            <ClipboardPaste size={14} /> {moDan ? 'Đóng ô dán' : 'Dán từ Excel'}
          </button>
          <button onClick={() => { setRows((rs) => [...rs, dongTrong()]); setDaSua(true); }} disabled={dangLuu} className="btn btn-secondary btn-sm">
            <Plus size={14} /> Thêm khách
          </button>
          <button onClick={() => setXacNhan(true)} disabled={!daSua || dangLuu || maTrung.length > 0} className="btn btn-emerald btn-sm">
            {dangLuu ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu KPI năm {nam}
          </button>
        </div>
      </div>

      {maTrung.length > 0 && (
        <div className="glass-card" style={{ color: 'var(--danger-strong)', fontSize: '0.82rem' }}>
          Mã KH bị lặp: {maTrung.join(', ')} — mỗi khách chỉ một dòng, sửa lại trước khi lưu.
        </div>
      )}

      {moDan && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Bôi bảng trong Excel rồi dán vào đây. Cột: <b>Mã KH · Tên KH · PIC · T1 … T12</b> (15 cột), hoặc có thêm cột
            "Năm" sau PIC như tab Plan2026 cũ (16 cột). Dòng tiêu đề và dòng tổng tự bỏ. Dán xong bảng bên dưới được
            THAY bằng dữ liệu dán — vẫn phải bấm Lưu mới ghi.
          </span>
          <textarea className="input-field" style={{ minHeight: '120px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }}
                    value={vanBan} onChange={(e) => setVanBan(e.target.value)}
                    placeholder={'Mã KH\tTên KH\tPIC\tT1\tT2\t…\tT12\nTECOM\tCông ty TECOM\tKH Luyến\t1000000\t…'} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={apDan} disabled={!vanBan.trim()} className="btn btn-primary btn-sm">Thay bảng bằng dữ liệu dán</button>
          </div>
        </div>
      )}

      <div className="table-container" style={{ maxHeight: '620px', overflow: 'auto' }}>
        {loiDoc ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--danger-strong)' }}>Không đọc được KPI năm: {loiDoc}</div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ minWidth: '120px' }}>Mã KH</th>
                <th style={{ minWidth: '200px' }}>Tên khách</th>
                <th style={{ minWidth: '120px' }}>PIC</th>
                {THANG.map((t) => <th key={t} style={{ textAlign: 'right' }}>{t}</th>)}
                <th style={{ textAlign: 'right' }}>Cả năm</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr className="top-summary-row">
                <td colSpan={3} style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>Σ TỔNG</td>
                {tong.map((v, m) => (
                  <td key={m} style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900, fontSize: '0.75rem' }}>{fmt(v)}</td>
                ))}
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900, fontSize: '0.75rem' }}>{fmt(tong.reduce((a, b) => a + b, 0))}</td>
                <td />
              </tr>
              {!rows.length && !dangDoc && (
                <tr><td colSpan={17} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>
                  Chưa có KPI năm {nam}. Dán từ Excel hoặc Thêm khách.
                </td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><input className="input-field code-font" style={{ padding: '4px 6px', fontSize: '0.75rem' }} value={r.code} onChange={(e) => sua(i, { code: e.target.value })} /></td>
                  <td><input className="input-field" style={{ padding: '4px 6px', fontSize: '0.75rem' }} value={r.name} onChange={(e) => sua(i, { name: e.target.value })} /></td>
                  <td><input className="input-field" style={{ padding: '4px 6px', fontSize: '0.75rem' }} value={r.pic} onChange={(e) => sua(i, { pic: e.target.value })} /></td>
                  {r.months.map((v, m) => (
                    <td key={m}><input className="input-field" style={oSo} value={v ? fmt(v) : ''} onChange={(e) => suaThang(i, m, e.target.value)} /></td>
                  ))}
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', fontWeight: 700 }}>
                    {fmt(r.months.reduce((a, b) => a + (b || 0), 0))}
                  </td>
                  <td>
                    <button onClick={() => { setRows((rs) => rs.filter((_, j) => j !== i)); setDaSua(true); }} className="btn btn-ghost btn-sm" aria-label="Xoá dòng">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {xacNhan && (
        <ConfirmDialog
          title={`Lưu KPI năm ${nam}?`}
          message={`Sẽ THAY TOÀN BỘ KPI năm ${nam} bằng ${rows.filter((r) => r.code.trim()).length} khách đang có trên màn hình. Khách đã xoá khỏi bảng sẽ bị xoá thật.`}
          confirmLabel={dangLuu ? 'Đang lưu...' : 'Lưu'}
          onConfirm={luu}
          onCancel={() => setXacNhan(false)}
        />
      )}
    </div>
  );
}
