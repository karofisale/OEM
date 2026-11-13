import React, { useEffect, useState } from 'react';
import { Send, Loader2, AlertTriangle, CheckCircle2, Inbox } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { lamSachLoi } from '../../utils/errorText';
import { CONT_LOAI, NOI_GIAO } from '../../utils/checkGia';

const MAU = 'Mã SAP hoặc mã NCC\tTên sản phẩm\tGiá FOB (USD)\tSố lượng\tCBM/đơn vị (tuỳ chọn)\nABC-123\tMáy lọc nước ABC\t45.5\t400\t0.06';

/**
 * "Tính giá hàng nhập khẩu": Sale chọn loại cont + nơi giao, dán bảng hàng (mã SAP hoặc mã NCC | tên | FOB USD | SL | [CBM/đơn vị])
 * rồi gửi. Admin/Creator bổ sung thuế + chi phí, bấm Calculate và gửi lại bảng giá bán (Sale chỉ thấy cột Giá bán có VAT).
 */
export default function NhapKhauForm({ token, onSent, onOpenRequest }) {
  const toast = useToast();
  const [container, setContainer] = useState('40');
  const [delivery, setDelivery] = useState('tcm');
  const [text, setText] = useState('');
  const [cangDi, setCangDi] = useState('');
  const [dsCang, setDsCang] = useState([]);
  const [note, setNote] = useState('');
  const [loi, setLoi] = useState('');
  const [xacNhan, setXacNhan] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [daGui, setDaGui] = useState(null);

  // Cảng đi (13/11/2026): nút chọn nhanh các cảng thường dùng + gõ tay cảng khác. Cước mặc định của yêu cầu lấy theo cảng nếu VHKD đã cài.
  useEffect(() => { api.cgDsCang(token).then((r) => setDsCang((r.items || []).map((x) => x.ten))).catch(() => setDsCang([])); }, [token]);
  const demDong = text.split('\n').filter((l) => l.trim()).length;
  const canhBaoCont = container === '20' || container === '40';

  const mo = () => {
    setLoi('');
    if (!text.trim()) { setLoi('Dán bảng hàng cần tính giá (mã | tên | giá FOB USD | số lượng).'); return; }
    setXacNhan(true);
  };

  const gui = async () => {
    if (dangGui) return;
    setDangGui(true); setLoi('');
    try {
      const r = await api.cgGuiNhapKhau(token, { container, delivery, cangDi: cangDi.trim(), text, note });
      setDaGui(r); setXacNhan(false); setText(''); setNote(''); setCangDi('');
      toast.success('Đã gửi yêu cầu tính giá #' + r.id + ' cho VHKD.');
      if (onSent) onSent(r);
    } catch (e) { setXacNhan(false); setLoi(e.message || String(e)); }
    finally { setDangGui(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontWeight: 700 }}>Tính giá hàng nhập khẩu</div>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Loại container</legend>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              {CONT_LOAI.map((c) => (
                <label key={c.id} style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" name="cg-cont" checked={container === c.id} onChange={() => setContainer(c.id)} /> {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Nơi giao</legend>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              {NOI_GIAO.map((c) => (
                <label key={c.id} style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" name="cg-giao" checked={delivery === c.id} onChange={() => setDelivery(c.id)} /> {c.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Cảng đi</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label="Chọn nhanh cảng đi">
            {dsCang.map((c) => (
              <button key={c} type="button" className={'btn btn-sm ' + (cangDi.trim().toLowerCase() === c.toLowerCase() ? 'btn-primary' : 'btn-secondary')}
                aria-pressed={cangDi.trim().toLowerCase() === c.toLowerCase()} onClick={() => setCangDi(cangDi.trim().toLowerCase() === c.toLowerCase() ? '' : c)}>{c}</button>
            ))}
            <input className="input-field" style={{ width: '200px', padding: '4px 8px' }} list="cg-cang-ds" value={cangDi} maxLength={60}
              placeholder="hoặc gõ cảng khác…" aria-label="Cảng đi" onChange={(e) => setCangDi(e.target.value)} />
            <datalist id="cg-cang-ds">{dsCang.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>

        {canhBaoCont && (
          <div className="state-card" role="status" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>Cont {container}' cần đặt <strong>đủ số lượng để đầy cont</strong>. Nếu nhập thêm cột CBM/đơn vị, hệ thống sẽ tự báo % đầy cont sau khi gửi.</span>
          </div>
        )}

        <div>
          <label className="form-label" htmlFor="cg-nk-text" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Bảng hàng (dán từ Excel)</label>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 6px' }}>
            Mỗi dòng: <strong>Mã SAP hoặc mã NCC | Tên sản phẩm | Giá FOB (USD) | Số lượng</strong> [| CBM/đơn vị]. Cột cách nhau bằng Tab (dán từ Excel).
          </div>
          <textarea id="cg-nk-text" className="input-field" rows={7} value={text} placeholder={MAU}
            style={{ fontFamily: 'inherit', resize: 'vertical' }} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <label className="form-label" htmlFor="cg-nk-note" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Ghi chú cho VHKD (tuỳ chọn)</label>
          <input id="cg-nk-note" className="input-field" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Khách, thời hạn cần giá…" />
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={mo} disabled={dangGui}>
            {dangGui ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Gửi VHKD tính giá {demDong > 0 && `(${demDong} dòng)`}
          </button>
        </div>
        {loi && <div className="state-card state-error" role="alert">{lamSachLoi(loi)}</div>}
      </div>

      {daGui && (
        <div className="state-card" role="status" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <CheckCircle2 size={18} color="var(--success-text)" />
          <span>Đã gửi yêu cầu <strong>#{daGui.id}</strong> ({daGui.soDong} dòng). Có kết quả bạn sẽ nhận thông báo "Hỏi giá được trả lời".</span>
          {daGui.kiemCont && daGui.kiemCont.canhBao && <span style={{ color: 'var(--warning-text)' }}>{daGui.kiemCont.canhBao}</span>}
          {onOpenRequest && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenRequest(daGui.id)}><Inbox size={14} /> Xem yêu cầu</button>}
        </div>
      )}

      {xacNhan && (
        <ConfirmDialog
          title="Gửi VHKD tính giá?"
          message={`Gửi ${demDong} dòng hàng (${CONT_LOAI.find((c) => c.id === container).label}, ${NOI_GIAO.find((c) => c.id === delivery).label.toLowerCase()}${cangDi.trim() ? ', cảng đi ' + cangDi.trim() : ''}) cho Admin/Creator tính giá. Sau khi gửi không sửa được bảng; muốn đổi thì yêu cầu tính lại.`}
          confirmLabel="Gửi yêu cầu" busy={dangGui} busyLabel="Đang gửi…"
          onConfirm={gui} onCancel={() => { if (!dangGui) setXacNhan(false); }}
        />
      )}
    </div>
  );
}
