import React, { useState } from 'react';
import { ScanSearch, Send, Loader2, Copy, Save, AlertTriangle } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { dinhDangTien, nhanDong, nhanLyDo, nhanCaoSap, dangCaoSap, duongDanSap, demThieu, bangGiaThanhTsv } from '../../utils/checkGia';

/**
 * Bảng hàng kho của một yêu cầu.
 *  - Sale: mã, tên, GIÁ BÁN CÓ VAT, ghi chú (không giá vốn). Đang chờ → "VHKD đang kiểm tra".
 *  - Admin/Creator (chờ VHKD): giá vốn + giá bán đề xuất, nút "Kiểm tra SAP" (cào VA01 qua karofi-oem://gia-von), nhập giá vốn tay
 *    cho mã cào không ra, sửa ghi chú, "Gửi trả lời Sale". Mã còn thiếu giá vốn khi gửi → ghi chú "Kiểm tra lại thông tin".
 */
export default function ChiTietKho({ token, d, laQuanTri, onChanged }) {
  const toast = useToast();
  const rq = d.request;
  const cho = rq.status === 'cho_vhkd';
  const sua = laQuanTri && cho;
  const [tay, setTay] = useState({});        // { lineId: chuỗi giá vốn đang gõ }
  const [ghiChu, setGhiChu] = useState({});  // { lineId: chuỗi ghi chú đang sửa }
  const [ban, setBan] = useState('');        // khoá thao tác: 'sap' | 'gui' | 'tay:<id>' | 'note:<id>'
  const [xacNhan, setXacNhan] = useState(false);
  const [answerNote, setAnswerNote] = useState('');

  const thieu = demThieu(d.lines);
  const cao = d.scrape;
  const dangCao = dangCaoSap(cao);

  const kiemTraSap = async () => {
    if (ban) return;
    setBan('sap');
    try {
      const r = await api.cgSapYeuCau(token, rq.id);
      toast.info('Đã xếp hàng cào SAP cho ' + r.total + ' mã — đang mở máy có SAP…', { ms: 6000 });
      window.location.href = duongDanSap(rq.id);   // giao thức một chiều: máy có SAP nhận việc rồi đẩy kết quả về, màn này tự hỏi lại
      onChanged();
    } catch (e) { toast.error(e.message || String(e)); }
    finally { setBan(''); }
  };

  const luuGiaVon = async (l) => {
    const cost = Number(String(tay[l.id] || '').replace(/[^\d.]/g, ''));
    if (!(cost > 0)) { toast.error('Nhập giá vốn lớn hơn 0.'); return; }
    if (ban) return;
    setBan('tay:' + l.id);
    try {
      const r = await api.cgNhapGiaVonTay(token, { id: rq.id, lineId: l.id, cost });
      toast.success('Đã ghi giá vốn ' + l.code + (r.moi ? ' (thêm sản phẩm mới vào danh mục)' : '') + '.');
      setTay((t) => { const n = { ...t }; delete n[l.id]; return n; });
      onChanged();
    } catch (e) { toast.error(e.message || String(e)); }
    finally { setBan(''); }
  };

  const luuGhiChu = async (l) => {
    const v = ghiChu[l.id];
    if (v === undefined || v === l.note) return;
    setBan('note:' + l.id);
    try { await api.cgGhiChuDong(token, { id: rq.id, lineId: l.id, note: v }); onChanged(); }
    catch (e) { toast.error(e.message || String(e)); }
    finally { setBan(''); }
  };

  const gui = async () => {
    if (ban) return;
    setBan('gui');
    try {
      const r = await api.cgGuiTraLoiKho(token, { id: rq.id, answerNote });
      toast.success('Đã gửi bảng báo giá cho ' + rq.createdBy + ' (' + r.coGia + ' mã có giá' + (r.thieu ? ', ' + r.thieu + ' mã "Kiểm tra lại thông tin"' : '') + ').');
      setXacNhan(false);
      onChanged();
    } catch (e) { toast.error(e.message || String(e)); setXacNhan(false); }
    finally { setBan(''); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(bangGiaThanhTsv(d.lines)); toast.success('Đã copy bảng giá — dán vào Excel.'); }
    catch (e) { toast.error('Không copy được: ' + (e.message || e)); }
  };

  return (
    <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {!laQuanTri && cho && <div className="state-card" role="status">VHKD đang kiểm tra giá vốn các mã chưa có thông tin. Có kết quả bạn sẽ nhận thông báo "Hỏi giá được trả lời".</div>}

      {sua && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={kiemTraSap} disabled={!!ban || dangCao || !thieu}>
            {ban === 'sap' || dangCao ? <Loader2 size={16} className="animate-spin" /> : <ScanSearch size={16} />} Kiểm tra SAP
          </button>
          <span style={{ fontSize: '0.82rem', color: dangCao ? 'var(--info-text)' : 'var(--text-muted)' }}>
            {nhanCaoSap(cao) || (thieu ? thieu + ' mã chưa có giá vốn — cào VA01 (Internal Price) trên máy có SAP, hoặc nhập giá vốn tay.' : 'Mọi mã đã có giá vốn.')}
          </span>
        </div>
      )}
      {sua && cao && cao.status === 'error' && (
        <div className="state-card state-error" role="alert">Cào SAP lỗi: {cao.message || 'không rõ'}. Bấm "Kiểm tra SAP" thử lại, hoặc nhập giá vốn tay ở cột bên dưới.</div>
      )}

      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Mã</th><th>Tên sản phẩm</th><th>Trạng thái</th>
              {laQuanTri && <th style={{ textAlign: 'right' }}>Giá vốn (đ)</th>}
              <th style={{ textAlign: 'right' }}>Giá bán có VAT (đ)</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => {
              const nh = nhanDong(l.status);
              const chua = l.status === 'chua_co' || l.status === 'kiem_tra_lai';
              return (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{l.code}</td>
                  <td>{l.name || '—'}</td>
                  <td>
                    <span className={'badge badge-' + nh.tone}>{nh.text}</span>
                    {laQuanTri && chua && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{nhanLyDo(l.reason)}</div>}
                  </td>
                  {laQuanTri && (
                    <td style={{ textAlign: 'right' }}>
                      {l.cost ? dinhDangTien(l.cost) : (sua ? (
                        <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                          <input className="input-field" style={{ width: '110px', padding: '4px 8px' }} inputMode="decimal" placeholder="Nhập tay"
                            aria-label={'Giá vốn ' + l.code} value={tay[l.id] || ''} onChange={(e) => setTay((t) => ({ ...t, [l.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') luuGiaVon(l); }} />
                          <button type="button" className="btn btn-secondary btn-sm" title="Ghi giá vốn vào CSDL" onClick={() => luuGiaVon(l)} disabled={!!ban || !(tay[l.id] || '').trim()}>
                            {ban === 'tay:' + l.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          </button>
                        </span>
                      ) : '—')}
                    </td>
                  )}
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.price ? dinhDangTien(l.price) : '—'}</td>
                  <td>
                    {sua && chua ? (
                      <input className="input-field" style={{ padding: '4px 8px', minWidth: '160px' }} aria-label={'Ghi chú ' + l.code} maxLength={500}
                        value={ghiChu[l.id] !== undefined ? ghiChu[l.id] : (l.note || '')}
                        onChange={(e) => setGhiChu((g) => ({ ...g, [l.id]: e.target.value }))} onBlur={() => luuGhiChu(l)} />
                    ) : (l.note || '')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Copy size={14} /> Copy bảng</button>
        {sua && (
          <>
            <input className="input-field" style={{ flex: '1 1 240px', maxWidth: '420px' }} placeholder="Ghi chú trả lời cho Sale (tuỳ chọn)" maxLength={500}
              aria-label="Ghi chú trả lời" value={answerNote} onChange={(e) => setAnswerNote(e.target.value)} />
            <button type="button" className="btn btn-primary" onClick={() => setXacNhan(true)} disabled={!!ban || dangCao}><Send size={16} /> Gửi trả lời Sale</button>
          </>
        )}
      </div>

      {xacNhan && (
        <ConfirmDialog
          title="Gửi bảng báo giá cho Sale?"
          message={thieu
            ? `Còn ${thieu} mã chưa có giá vốn — Sale sẽ thấy các mã đó ghi "Kiểm tra lại thông tin". Bảng sẽ chốt và gửi cho ${rq.createdBy}.`
            : `Gửi bảng báo giá ${d.lines.length} mã cho ${rq.createdBy}. Giá bán = giá vốn × (1 + VAT) ÷ (1 − ${d.lngPct}%), làm tròn 100đ.`}
          confirmLabel="Gửi trả lời" busy={ban === 'gui'} busyLabel="Đang gửi…"
          onConfirm={gui} onCancel={() => { if (ban !== 'gui') setXacNhan(false); }}
        />
      )}
      {sua && thieu > 0 && !dangCao && (
        <div style={{ fontSize: '0.78rem', color: 'var(--warning-text)', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <AlertTriangle size={13} /> {thieu} mã chưa có giá vốn.
        </div>
      )}
    </div>
  );
}
