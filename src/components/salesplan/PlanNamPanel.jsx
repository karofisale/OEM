import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Target, Plus, Trash2, ClipboardPaste, Save, RefreshCw, Loader2 } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { parseKpiDan } from '../../utils/adminTables';
import { tongThang, tongNam, tyTrongHienTai, datTongNam, datTyTrongThang } from '../../utils/kpiNam';

const THANG = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
const fmt = (v) => (v || 0).toLocaleString('vi-VN');
const namHienTai = () => new Date().getFullYear();
const dongTrong = () => ({ code: '', name: '', pic: '', months: new Array(12).fill(0) });

/** Ô số VNĐ nguyên: sửa tại chỗ, chốt khi rời ô / Enter (không co giãn lại cả bảng theo từng phím). */
function OSoChot({ value, onCommit, style, title }) {
  const [v, setV] = useState(fmt(value));
  useEffect(() => { setV(fmt(value)); }, [value]);
  return (
    <input className="input-field" style={style} title={title} value={v}
           onChange={(e) => setV(e.target.value)}
           onBlur={() => { const n = Number(String(v).replace(/[^\d]/g, '')) || 0; if (n !== Math.round(value)) onCommit(n); else setV(fmt(value)); }}
           onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

/** Ô phần trăm 2 số lẻ (tỷ trọng tháng). */
function OPhanTram({ value, onCommit, style }) {
  const f = (x) => x.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [v, setV] = useState(f(value));
  useEffect(() => { setV(f(value)); }, [value]);
  return (
    <input className="input-field" style={style} value={v}
           onChange={(e) => setV(e.target.value)}
           onBlur={() => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); if (isFinite(n) && Math.abs(n - value) > 1e-9) onCommit(n); else setV(f(value)); }}
           onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

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
  const [nguon, setNguon] = useState(null);          // KPI điền ngược từ Kế hoạch năm FC? (null = nhập tay)
  const [cheDo, setCheDo] = useState('deu');           // sửa tỷ trọng: chia đều | dồn vào tháng chỉ định
  const [thangChon, setThangChon] = useState([]);

  const doc = useCallback(async () => {
    setDangDoc(true);
    setLoiDoc('');
    try {
      const d = await api.getPlanNam(token, nam);
      setRows(d.rows || []);
      setNguon(d.nguon || null);
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
  const tyTrong = useMemo(() => (rows.length && tongNam(rows) > 0 ? tyTrongHienTai(rows).map((v) => v / 100) : new Array(12).fill(0)), [rows]);

  // Sửa TỔNG NĂM / TỶ TRỌNG THÁNG: doanh thu từng tháng và từng khách co giãn theo (src/utils/kpiNam.js). Chưa ghi gì cho tới khi bấm Lưu.
  const suaTongNam = (n) => {
    try { setRows((rs) => datTongNam(rs, n)); setDaSua(true); } catch (err) { toast.error(err.message || String(err)); }
  };
  const suaTyTrong = (m, pct) => {
    if (cheDo === 'chiDinh' && !thangChon.filter((x) => x !== m).length) { toast.error('Chọn ít nhất một tháng khác để nhận phần chênh.'); return; }
    try { setRows((rs) => datTyTrongThang(rs, m, pct, cheDo, thangChon)); setDaSua(true); } catch (err) { toast.error(err.message || String(err)); }
  };

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

      {rows.length > 0 && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
          <div>
            {nguon ? (
              <>
                Nguồn: <b>{nguon.label}</b>
                {nguon.appliedAt ? <> · điền ngược {new Date(nguon.appliedAt).toLocaleDateString('vi-VN')}</> : null}
                {nguon.editedManually
                  ? <span className="badge badge-amber" style={{ marginLeft: '8px' }}>Đã sửa tay{nguon.editedBy ? ' (' + nguon.editedBy + ')' : ''} — kế hoạch năm mới sẽ KHÔNG tự ghi đè</span>
                  : <span className="badge badge-emerald" style={{ marginLeft: '8px' }}>Chưa sửa tay</span>}
              </>
            ) : <span style={{ color: 'var(--text-muted)' }}>KPI nhập tay (không gắn với Kế hoạch năm của FC).</span>}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            Sửa <b>Cả năm</b> hoặc <b>Tỷ trọng tháng (%)</b> ở hai hàng đầu bảng: doanh thu từng tháng và từng khách co giãn theo
            (tổng 12 tháng luôn 100%, mỗi tháng 1–30%). Vẫn phải bấm Lưu mới ghi.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700 }}>Khi sửa tỷ trọng, phần chênh:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><input type="radio" checked={cheDo === 'deu'} onChange={() => setCheDo('deu')} /> chia đều cho các tháng còn lại</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><input type="radio" checked={cheDo === 'chiDinh'} onChange={() => setCheDo('chiDinh')} /> dồn vào các tháng:</label>
            {cheDo === 'chiDinh' && THANG.map((t, i) => (
              <button key={t} type="button" className={`btn btn-sm ${thangChon.includes(i) ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                      onClick={() => setThangChon((c) => (c.includes(i) ? c.filter((x) => x !== i) : c.concat([i])))}>{t}</button>
            ))}
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
                <td style={{ textAlign: 'right' }}>
                  {rows.length > 0 && tongNam(rows) > 0
                    ? <OSoChot value={tong.reduce((a, b) => a + b, 0)} onCommit={suaTongNam} style={{ ...oSo, width: '130px', fontWeight: 900 }} title="Sửa tổng năm: mọi tháng và mọi khách co giãn theo" />
                    : <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 900, fontSize: '0.75rem' }}>{fmt(tong.reduce((a, b) => a + b, 0))}</span>}
                </td>
                <td />
              </tr>
              {rows.length > 0 && tongNam(rows) > 0 && (
                <tr className="top-summary-row">
                  <td colSpan={3} style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>Tỷ trọng tháng (%)</td>
                  {tyTrong.map((v, m) => (
                    <td key={m}><OPhanTram value={v} onCommit={(n) => suaTyTrong(m, n)} style={oSo} /></td>
                  ))}
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', fontWeight: 700 }}>100,00</td>
                  <td />
                </tr>
              )}
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
