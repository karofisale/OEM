import React, { useState } from 'react';
import { Search, Send, Copy, Loader2, CheckCircle2, Inbox } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { lamSachLoi } from '../../utils/errorText';
import { dinhDangTien, nhanDong, nhanLyDo, bangGiaThanhTsv } from '../../utils/checkGia';

/**
 * "Giá bán từ kho": Sale nhập 1 mã hoặc dán danh sách (1 cột mã, hoặc mã | tên) → bảng GIÁ BÁN CÓ VAT (không bao giờ thấy giá vốn).
 * Mã chưa có giá vốn / chưa có trong CSDL → "Chưa có thông tin" + nút "Chuyển yêu cầu VHKD" gửi CẢ danh sách cho Admin/Creator.
 */
export default function KhoTraGia({ token, onSent, onOpenRequest }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [ket, setKet] = useState(null);       // kết quả cgTraGiaKho (kèm text đã tra)
  const [dangTra, setDangTra] = useState(false);
  const [loi, setLoi] = useState('');
  const [xacNhan, setXacNhan] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [daGui, setDaGui] = useState(null);   // { id, soDong, soChuaCo }

  const tra = async () => {
    if (dangTra) return;
    setLoi(''); setDaGui(null);
    if (!text.trim()) { setLoi('Nhập 1 mã hoặc dán danh sách mã (mỗi dòng 1 mã, hoặc mã | tên).'); return; }
    setDangTra(true);
    try {
      const r = await api.cgTraGiaKho(token, { text });
      setKet({ ...r, textDaTra: text });
    } catch (e) { setKet(null); setLoi(e.message || String(e)); }
    finally { setDangTra(false); }
  };

  const guiVhkd = async () => {
    if (dangGui || !ket) return;
    setDangGui(true);
    try {
      // Gửi đúng danh sách đã tra (không phải ô nhập hiện tại, có thể đã bị sửa sau khi tra).
      const r = await api.cgGuiKho(token, { lines: ket.lines.map((l) => ({ code: l.code, name: l.name })) });
      setDaGui(r); setXacNhan(false);
      toast.success('Đã chuyển yêu cầu #' + r.id + ' cho VHKD.');
      if (onSent) onSent(r);
    } catch (e) { toast.error(e.message || String(e)); setXacNhan(false); }
    finally { setDangGui(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(bangGiaThanhTsv(ket.lines)); toast.success('Đã copy bảng giá — dán vào Excel.'); }
    catch (e) { toast.error('Không copy được: ' + (e.message || e)); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontWeight: 700 }}>Tra giá bán từ kho</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Nhập 1 mã hoặc dán danh sách (1 cột mã, hoặc 2 cột <em>mã | tên</em>). Giá hiển thị là <strong>giá bán đã gồm VAT</strong>.
        </div>
        <textarea
          className="input-field" rows={6} value={text} placeholder={'Ví dụ:\n1100001234\n1100005678\tMáy lọc nước ABC'}
          aria-label="Danh sách mã cần tra giá" style={{ fontFamily: 'inherit', resize: 'vertical' }}
          onChange={(e) => setText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={tra} disabled={dangTra}>
            {dangTra ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Tra giá
          </button>
          {ket && <button type="button" className="btn btn-ghost" onClick={() => { setText(''); setKet(null); setDaGui(null); setLoi(''); }}>Làm mới</button>}
        </div>
        {loi && <div className="state-card state-error" role="alert">{lamSachLoi(loi)}</div>}
      </div>

      {ket && (
        <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontWeight: 700 }}>
              {ket.lines.length} mã · <span style={{ color: 'var(--success-text)' }}>{ket.lines.length - ket.soChuaCo} có giá</span>
              {ket.soChuaCo > 0 && <> · <span style={{ color: 'var(--warning-text)' }}>{ket.soChuaCo} chưa có thông tin</span></>}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Copy size={14} /> Copy bảng</button>
          </div>
          {ket.tooMany && <div className="state-card" role="status">Chỉ tra {ket.lines.length} mã đầu — danh sách dài hơn mức cho phép.</div>}
          {ket.skipped && ket.skipped.length > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bỏ qua {ket.skipped.length} dòng không đọc được: {ket.skipped.slice(0, 3).join(' | ')}{ket.skipped.length > 3 ? ' …' : ''}</div>}

          <div className="table-container">
            <table className="custom-table">
              <thead><tr><th>Mã</th><th>Tên sản phẩm</th><th>Trạng thái</th><th style={{ textAlign: 'right' }}>Giá bán có VAT (đ)</th></tr></thead>
              <tbody>
                {ket.lines.map((l) => {
                  const nh = nhanDong(l.status === 'co_gia' ? 'co_gia' : 'chua_co');
                  return (
                    <tr key={l.code}>
                      <td style={{ fontWeight: 600 }}>{l.code}</td>
                      <td>{l.name || '—'}</td>
                      <td><span className={'badge badge-' + nh.tone}>{l.status === 'co_gia' ? nh.text : 'Chưa có thông tin'}</span>
                        {l.status !== 'co_gia' && <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{nhanLyDo(l.reason)}</span>}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.status === 'co_gia' ? dinhDangTien(l.price) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {ket.soChuaCo > 0 && !daGui && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => setXacNhan(true)} disabled={dangGui}><Send size={16} /> Chuyển yêu cầu VHKD</button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gửi cả danh sách {ket.lines.length} mã để VHKD kiểm tra giá vốn; có kết quả bạn sẽ nhận thông báo "Hỏi giá được trả lời".</span>
            </div>
          )}
          {daGui && (
            <div className="state-card" role="status" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <CheckCircle2 size={18} color="var(--success-text)" />
              <span>Đã chuyển yêu cầu <strong>#{daGui.id}</strong> cho VHKD ({daGui.soChuaCo} mã cần kiểm tra).</span>
              {onOpenRequest && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenRequest(daGui.id)}><Inbox size={14} /> Xem yêu cầu</button>}
            </div>
          )}
        </div>
      )}

      {xacNhan && (
        <ConfirmDialog
          title="Chuyển yêu cầu cho VHKD?"
          message={`Gửi danh sách ${ket ? ket.lines.length : 0} mã (${ket ? ket.soChuaCo : 0} mã chưa có thông tin) cho VHKD kiểm tra giá vốn. Thời điểm gửi được ghi lại.`}
          confirmLabel="Chuyển yêu cầu" busy={dangGui} busyLabel="Đang gửi…"
          onConfirm={guiVhkd} onCancel={() => { if (!dangGui) setXacNhan(false); }}
        />
      )}
    </div>
  );
}
