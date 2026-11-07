import React, { useEffect, useRef, useState } from 'react';
import { Calculator, Send, Loader2, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import ReasonDialog from '../ReasonDialog';
import { useToast } from '../ToastProvider';
import { dinhDangTien, dinhDangUsd, nhanLoai, lngDuoiToiThieu, lngToiThieu, thamSoTuForm, dongTuForm, CONT_LOAI, NOI_GIAO } from '../../utils/checkGia';

const txt = (v) => (v === null || v === undefined ? '' : String(v));
const nhanCont = (id) => (CONT_LOAI.find((c) => c.id === id) || { label: id }).label;
const nhanGiao = (id) => (NOI_GIAO.find((c) => c.id === id) || { label: id }).label;

function CanhBaoCont({ kc }) {
  if (!kc || !kc.canhBao) return null;
  return (
    <div className="state-card" role="status" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> <span>{kc.canhBao}</span>
    </div>
  );
}

/** Màn của Sale: bảng đã gửi + (khi đã trả lời) CHỈ thêm cột Giá bán có VAT. Có thể yêu cầu tính lại. */
function SaleView({ token, d, onChanged }) {
  const toast = useToast();
  const rq = d.request;
  const tra = rq.status === 'da_tra_loi';
  const [hoiLai, setHoiLai] = useState(false);
  const [dang, setDang] = useState(false);

  const gui = async (note) => {
    if (dang) return;
    setDang(true);
    try { await api.cgYeuCauTinhLai(token, { id: rq.id, note }); toast.success('Đã gửi yêu cầu tính lại cho VHKD.'); setHoiLai(false); onChanged(); }
    catch (e) { toast.error(e.message || String(e)); setHoiLai(false); }
    finally { setDang(false); }
  };

  return (
    <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{nhanCont(rq.container)} · {nhanGiao(rq.delivery)}</div>
      {!tra && <div className="state-card" role="status">VHKD đang tính giá. Có kết quả bạn sẽ nhận thông báo "Hỏi giá được trả lời".</div>}
      <CanhBaoCont kc={d.kiemCont} />
      <div className="table-container">
        <table className="custom-table">
          <thead><tr><th>Mã</th><th>Tên sản phẩm</th><th style={{ textAlign: 'right' }}>FOB (USD)</th><th style={{ textAlign: 'right' }}>SL</th>{tra && <th style={{ textAlign: 'right' }}>Giá bán có VAT (đ)</th>}</tr></thead>
          <tbody>
            {d.lines.map((l) => (
              <tr key={l.id}>
                <td style={{ fontWeight: 600 }}>{l.code}</td><td>{l.name || '—'}</td>
                <td style={{ textAlign: 'right' }}>{dinhDangUsd(l.fobUsd)}</td><td style={{ textAlign: 'right' }}>{dinhDangTien(l.qty)}</td>
                {tra && <td style={{ textAlign: 'right', fontWeight: 700 }}>{dinhDangTien(l.priceVnd)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tra && <div><button type="button" className="btn btn-secondary" onClick={() => setHoiLai(true)} disabled={dang}><RotateCcw size={15} /> Yêu cầu tính lại</button></div>}
      {hoiLai && (
        <ReasonDialog title="Yêu cầu tính lại giá?" message="VHKD sẽ xem lại thuế, chi phí và LNG rồi gửi bảng giá mới."
          reasonLabel="Lý do cần tính lại" placeholder="Ví dụ: giá còn cao so với báo giá đối thủ…" confirmLabel="Gửi yêu cầu"
          busy={dang} busyLabel="Đang gửi…" onConfirm={gui} onCancel={() => { if (!dang) setHoiLai(false); }} />
      )}
    </div>
  );
}

/** Màn Admin/Creator: thuế suất + chi phí chung + tỷ giá + LNG → Calculate → kiểm tra điều chỉnh → Gửi. */
function QuanTriView({ token, d, onChanged }) {
  const toast = useToast();
  const rq = d.request;
  const cho = rq.status === 'cho_review';
  const p = d.params;

  const khoiTao = () => ({
    freightUsd: txt(p.freightUsd), customsVnd: txt(p.customsVnd), truckingVnd: txt(p.truckingVnd),
    fx: txt(p.fx), fxSource: p.fxSource || 'tay', lngPct: txt(p.lngPct), lngConfirmed: !!p.lngConfirmed
  });
  const [f, setF] = useState(khoiTao);
  const [rows, setRows] = useState(() => d.lines.map((l) => ({ id: l.id, name: l.name, taxImportPct: txt(l.taxImportPct), vatPct: txt(l.vatPct), note: l.note })));
  const [apThue, setApThue] = useState('');
  const [apVat, setApVat] = useState('');
  const [dirty, setDirty] = useState(false);
  const [ban, setBan] = useState('');
  const [xacNhan, setXacNhan] = useState(false);
  const [answerNote, setAnswerNote] = useState('');
  const layVcb = useRef(false);

  // Dữ liệu máy chủ đổi (sau Calculate / Tải lại) → dựng lại form từ máy chủ.
  useEffect(() => {
    setF(khoiTao());
    setRows(d.lines.map((l) => ({ id: l.id, name: l.name, taxImportPct: txt(l.taxImportPct), vatPct: txt(l.vatPct), note: l.note })));
    setDirty(false);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const doiF = (k, v) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); };
  const doiDong = (i, k, v) => { setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setDirty(true); };

  const vcb = async (im) => {
    if (ban) return;
    setBan('vcb');
    try {
      const r = await api.cgTyGia(token);
      if (r.usdSell) { setF((x) => ({ ...x, fx: String(r.usdSell), fxSource: 'vcb' })); setDirty(true); if (!im) toast.success('Tỷ giá VCB bán ' + r.day + ': ' + dinhDangTien(r.usdSell) + ' đ/USD.'); }
      else if (!im) toast.error(r.error || 'Chưa lấy được tỷ giá VCB — nhập tay.');
    } catch (e) { if (!im) toast.error(e.message || String(e)); }
    finally { setBan(''); }
  };
  // Chưa có tỷ giá → tự lấy VCB bán trong ngày một lần.
  useEffect(() => {
    if (cho && !p.fx && !layVcb.current) { layVcb.current = true; vcb(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apDung = () => {
    setRows((r) => r.map((x) => ({ ...x, taxImportPct: apThue !== '' ? apThue : x.taxImportPct, vatPct: apVat !== '' ? apVat : x.vatPct })));
    setDirty(true);
  };

  const duoiMin = lngDuoiToiThieu(f.lngPct, rq.delivery);
  const calc = async () => {
    if (ban) return;
    if (duoiMin && !f.lngConfirmed) { toast.error('LNG ' + f.lngPct + '% thấp hơn mức tối thiểu ' + lngToiThieu(rq.delivery) + '% — tick xác nhận mới tính được.'); return; }
    setBan('calc');
    try {
      const r = await api.cgNhapKhauTinh(token, { id: rq.id, params: thamSoTuForm(f), lines: dongTuForm(rows) });
      toast.success('Đã tính xong ' + r.soDong + ' dòng — kiểm tra rồi bấm Gửi.');
      onChanged();
    } catch (e) { toast.error(e.message || String(e)); }
    finally { setBan(''); }
  };

  const gui = async () => {
    if (ban) return;
    setBan('gui');
    try { await api.cgNhapKhauGui(token, { id: rq.id, answerNote }); toast.success('Đã gửi bảng giá cho ' + rq.createdBy + '.'); setXacNhan(false); onChanged(); }
    catch (e) { toast.error(e.message || String(e)); setXacNhan(false); }
    finally { setBan(''); }
  };

  const daTinh = !!p.calcAt;
  const duocGui = cho && daTinh && !dirty;
  const tong = d.lines.reduce((s, l) => s + (l.goodsVnd || 0), 0);
  const inp = (props) => <input className="input-field" style={{ padding: '4px 8px', width: '100%' }} type="number" step="any" min="0" disabled={!cho} {...props} />;

  return (
    <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{nhanLoai(rq.kind)} · {nhanCont(rq.container)} · {nhanGiao(rq.delivery)}{p.calcAt && <> · tính lúc {p.calcAt} bởi {p.calcBy}</>}</div>
      <CanhBaoCont kc={d.kiemCont} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Cước vận chuyển + LCC (USD)
          {inp({ value: f.freightUsd, onChange: (e) => doiF('freightUsd', e.target.value) })}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>Mặc định: {dinhDangUsd(d.macDinh.freightUsd)}</span></label>
        <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Phí hải quan (đ)
          {inp({ value: f.customsVnd, onChange: (e) => doiF('customsVnd', e.target.value) })}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>Mặc định: {dinhDangTien(d.macDinh.customsVnd)}</span></label>
        <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Phí trucking (đ)
          {inp({ value: f.truckingVnd, onChange: (e) => doiF('truckingVnd', e.target.value) })}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>Mặc định: {dinhDangTien(d.macDinh.truckingVnd)}</span></label>
        <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>
          <label>Tỷ giá USD/VNĐ {inp({ value: f.fx, onChange: (e) => { doiF('fx', e.target.value); setF((x) => ({ ...x, fxSource: 'tay' })); } })}</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => vcb(false)} disabled={!cho || !!ban} style={{ marginTop: '2px' }}>
            {ban === 'vcb' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Lấy VCB bán hôm nay
          </button>
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>{f.fxSource === 'vcb' ? '(VCB)' : f.fx ? '(nhập tay)' : ''}</span>
        </div>
        <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>LNG (%)
          {inp({ value: f.lngPct, max: '99.9', onChange: (e) => doiF('lngPct', e.target.value) })}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>Tối thiểu {lngToiThieu(rq.delivery)}%</span></label>
      </div>
      {duoiMin && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--warning-text)', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={f.lngConfirmed} disabled={!cho} onChange={(e) => doiF('lngConfirmed', e.target.checked)} />
          LNG {f.lngPct}% thấp hơn mức tối thiểu {lngToiThieu(rq.delivery)}% — tôi xác nhận vẫn tính.
        </label>
      )}

      {cho && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Thuế NK (%) cho tất cả
            <input className="input-field" style={{ width: '110px', padding: '4px 8px', display: 'block' }} type="number" step="any" min="0" value={apThue} onChange={(e) => setApThue(e.target.value)} /></label>
          <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>VAT (%) cho tất cả
            <input className="input-field" style={{ width: '110px', padding: '4px 8px', display: 'block' }} type="number" step="any" min="0" value={apVat} onChange={(e) => setApVat(e.target.value)} /></label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={apDung} disabled={apThue === '' && apVat === ''}>Áp dụng tất cả</button>
        </div>
      )}

      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Mã</th><th>Tên sản phẩm</th><th style={{ textAlign: 'right' }}>FOB (USD)</th><th style={{ textAlign: 'right' }}>SL</th>
              <th style={{ minWidth: '90px' }}>Thuế NK %</th><th style={{ minWidth: '90px' }}>VAT %</th>
              <th style={{ textAlign: 'right' }}>Trị giá tiền hàng</th><th style={{ textAlign: 'right' }}>Thuế NK</th><th style={{ textAlign: 'right' }}>Chi phí phân bổ</th>
              <th style={{ textAlign: 'right' }}>Giá vốn chưa VAT</th><th style={{ textAlign: 'right' }}>Giá vốn có VAT</th><th style={{ textAlign: 'right' }}>Giá bán có VAT</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={l.id}>
                <td style={{ fontWeight: 600 }}>{l.sku || l.supplierCode}{l.sku ? '' : <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '4px' }}>NCC</span>}</td>
                <td>{l.name || '—'}</td>
                <td style={{ textAlign: 'right' }}>{dinhDangUsd(l.fobUsd)}</td>
                <td style={{ textAlign: 'right' }}>{dinhDangTien(l.qty)}</td>
                <td>{inp({ value: rows[i] ? rows[i].taxImportPct : '', 'aria-label': 'Thuế NK ' + (l.sku || l.supplierCode), onChange: (e) => doiDong(i, 'taxImportPct', e.target.value) })}</td>
                <td>{inp({ value: rows[i] ? rows[i].vatPct : '', 'aria-label': 'VAT ' + (l.sku || l.supplierCode), onChange: (e) => doiDong(i, 'vatPct', e.target.value) })}</td>
                <td style={{ textAlign: 'right' }}>{dinhDangTien(l.goodsVnd)}</td>
                <td style={{ textAlign: 'right' }}>{dinhDangTien(l.dutyVnd)}</td>
                <td style={{ textAlign: 'right' }}>{dinhDangTien(l.allocVnd)}</td>
                <td style={{ textAlign: 'right' }}>{dinhDangTien(l.costExvat)}</td>
                <td style={{ textAlign: 'right' }}>{dinhDangTien(l.costIncvat)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{dinhDangTien(l.priceVnd)}</td>
              </tr>
            ))}
          </tbody>
          {daTinh && <tfoot><tr><td colSpan={6} style={{ fontWeight: 700 }}>Tổng trị giá tiền hàng</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{dinhDangTien(tong)}</td><td colSpan={5} /></tr></tfoot>}
        </table>
      </div>

      {cho && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={calc} disabled={!!ban}>
            {ban === 'calc' ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />} Calculate
          </button>
          <input className="input-field" style={{ flex: '1 1 240px', maxWidth: '420px' }} placeholder="Ghi chú trả lời cho Sale (tuỳ chọn)" maxLength={500}
            aria-label="Ghi chú trả lời" value={answerNote} onChange={(e) => setAnswerNote(e.target.value)} />
          <button type="button" className="btn btn-primary" onClick={() => setXacNhan(true)} disabled={!!ban || !duocGui}
            title={duocGui ? '' : (daTinh ? 'Đã sửa số liệu — bấm Calculate lại trước khi gửi.' : 'Bấm Calculate trước khi gửi.')}>
            <Send size={16} /> Gửi trả lời Sale
          </button>
          {!duocGui && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{daTinh ? 'Đã sửa số liệu — Calculate lại rồi mới gửi.' : 'Calculate trước khi gửi.'}</span>}
        </div>
      )}
      {xacNhan && (
        <ConfirmDialog title="Gửi bảng giá cho Sale?" message={`${rq.createdBy} sẽ chỉ thấy cột Giá bán có VAT (không thấy thuế, chi phí, giá vốn).`}
          confirmLabel="Gửi trả lời" busy={ban === 'gui'} busyLabel="Đang gửi…" onConfirm={gui} onCancel={() => { if (ban !== 'gui') setXacNhan(false); }} />
      )}
    </div>
  );
}

export default function ChiTietNhapKhau({ token, d, laQuanTri, onChanged }) {
  return laQuanTri ? <QuanTriView token={token} d={d} onChanged={onChanged} /> : <SaleView token={token} d={d} onChanged={onChanged} />;
}
