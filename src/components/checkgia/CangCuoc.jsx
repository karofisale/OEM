import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Loader2, RefreshCw } from 'lucide-react';
import * as api from '../../services/api';
import TableState from '../TableState';
import { useToast } from '../ToastProvider';

const txt = (v) => (v === null || v === undefined ? '' : String(v));
const so = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(/[\s,]/g, '')));

/**
 * Cảng đi + cước cài sẵn (13/11/2026, Admin / Creator). Cước = cước vận chuyển + LCC (USD) theo loại cont; ô trống = chưa cài -> yêu cầu dùng cước chung.
 * Sale chọn / gõ cảng đi khi gửi yêu cầu nhập khẩu; cước mặc định của yêu cầu lấy theo cảng. Admin vẫn sửa được cước khi tính.
 */
export default function CangCuoc({ token }) {
  const toast = useToast();
  const [ds, setDs] = useState(null);
  const [bat, setBat] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState('');
  const [sua, setSua] = useState({});
  const [dang, setDang] = useState('');
  const [moi, setMoi] = useState({ ten: '', freight20: '', freight40: '', freightLcl: '' });

  const tai = useCallback(async () => {
    setLoading(true); setLoi('');
    try { const r = await api.cgDsCang(token); setDs(r.items || []); setBat(r.bat !== false); setSua({}); }
    catch (e) { setLoi(e.message || String(e)); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { tai(); }, [tai]);

  const giaTri = (c, k) => (sua[c.id] && sua[c.id][k] !== undefined ? sua[c.id][k] : (k === 'active' ? c.active : txt(c[k])));
  const doi = (c, k, v) => setSua((s) => ({ ...s, [c.id]: { ...(s[c.id] || {}), [k]: v } }));
  const luu = async (c) => {
    if (dang) return;
    setDang('c' + c.id);
    try {
      await api.cgLuuCang(token, { id: c.id, ten: giaTri(c, 'ten'), freight20: so(giaTri(c, 'freight20')), freight40: so(giaTri(c, 'freight40')), freightLcl: so(giaTri(c, 'freightLcl')), active: giaTri(c, 'active') });
      toast.success('Đã lưu cước cảng ' + giaTri(c, 'ten') + '.'); tai();
    } catch (e) { toast.error(e.message || String(e)); }
    finally { setDang(''); }
  };
  const them = async () => {
    if (dang || !moi.ten.trim()) return;
    setDang('moi');
    try {
      await api.cgLuuCang(token, { ten: moi.ten, freight20: so(moi.freight20), freight40: so(moi.freight40), freightLcl: so(moi.freightLcl) });
      toast.success('Đã thêm cảng ' + moi.ten.trim() + '.'); setMoi({ ten: '', freight20: '', freight40: '', freightLcl: '' }); tai();
    } catch (e) { toast.error(e.message || String(e)); }
    finally { setDang(''); }
  };
  const o = (props) => <input className="input-field" style={{ padding: '4px 8px', width: '100%', textAlign: 'right' }} type="number" step="any" min="0" {...props} />;

  return (
    <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700 }}>Cảng đi & cước cài sẵn</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={tai} disabled={loading} style={{ marginLeft: 'auto' }}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Tải lại</button>
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Cước = <strong>cước vận chuyển + LCC (USD)</strong> theo loại cont. Khi Sale chọn cảng đi, cước mặc định của yêu cầu lấy theo bảng này; ô để trống thì dùng cước chung (20' 650 · 40' 1.000 · LCL 500). Khi tính giá vẫn sửa được cước.
      </div>
      {!bat && <div className="state-card" role="status" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>Chưa chạy SQL đợt 37 (chay-dot37-oem-cg-cang-di) — danh sách dưới đây là gợi ý sẵn, chưa lưu được cước.</div>}
      <TableState loading={loading && !ds} error={loi} isEmpty={false} onRetry={tai} errorPrefix="Không tải được danh sách cảng">
        <div className="table-container">
          <table className="custom-table">
            <thead><tr><th>Cảng đi</th><th style={{ textAlign: 'right' }}>Cont 20' (USD)</th><th style={{ textAlign: 'right' }}>Cont 40' (USD)</th><th style={{ textAlign: 'right' }}>LCL (USD)</th><th>Đang dùng</th><th>Sửa lần cuối</th><th /></tr></thead>
            <tbody>
              {(ds || []).map((c) => (
                <tr key={c.id || c.ten}>
                  <td style={{ minWidth: '140px' }}>{bat ? <input className="input-field" style={{ padding: '4px 8px', width: '100%' }} value={giaTri(c, 'ten')} onChange={(e) => doi(c, 'ten', e.target.value)} aria-label="Tên cảng" /> : c.ten}</td>
                  <td>{bat ? o({ value: giaTri(c, 'freight20'), placeholder: 'chung', 'aria-label': "Cước 20' " + c.ten, onChange: (e) => doi(c, 'freight20', e.target.value) }) : '—'}</td>
                  <td>{bat ? o({ value: giaTri(c, 'freight40'), placeholder: 'chung', 'aria-label': "Cước 40' " + c.ten, onChange: (e) => doi(c, 'freight40', e.target.value) }) : '—'}</td>
                  <td>{bat ? o({ value: giaTri(c, 'freightLcl'), placeholder: 'chung', 'aria-label': 'Cước LCL ' + c.ten, onChange: (e) => doi(c, 'freightLcl', e.target.value) }) : '—'}</td>
                  <td>{bat && <input type="checkbox" checked={!!giaTri(c, 'active')} onChange={(e) => doi(c, 'active', e.target.checked)} aria-label={'Đang dùng ' + c.ten} />}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{c.by ? c.by + ' · ' + c.at : ''}</td>
                  <td>{bat && <button type="button" className="btn btn-secondary btn-sm" disabled={!sua[c.id] || !!dang} onClick={() => luu(c)}>{dang === 'c' + c.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Lưu</button>}</td>
                </tr>
              ))}
              {bat && (
                <tr>
                  <td><input className="input-field" style={{ padding: '4px 8px', width: '100%' }} placeholder="Thêm cảng…" value={moi.ten} onChange={(e) => setMoi({ ...moi, ten: e.target.value })} aria-label="Tên cảng mới" /></td>
                  <td>{o({ value: moi.freight20, onChange: (e) => setMoi({ ...moi, freight20: e.target.value }), 'aria-label': "Cước 20' cảng mới" })}</td>
                  <td>{o({ value: moi.freight40, onChange: (e) => setMoi({ ...moi, freight40: e.target.value }), 'aria-label': "Cước 40' cảng mới" })}</td>
                  <td>{o({ value: moi.freightLcl, onChange: (e) => setMoi({ ...moi, freightLcl: e.target.value }), 'aria-label': 'Cước LCL cảng mới' })}</td>
                  <td colSpan={2} />
                  <td><button type="button" className="btn btn-primary btn-sm" disabled={!moi.ten.trim() || !!dang} onClick={them}>{dang === 'moi' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Thêm</button></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </TableState>
    </div>
  );
}
