import React, { useState } from 'react';
import { Plus, Trash2, Loader2, EyeOff } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { lamSachLoi } from '../../utils/errorText';

const fmt = (v) => (Number(v) || 0).toLocaleString('vi-VN');

/**
 * Tab "Bộ lọc hàng" (Admin): các TỪ KHOÁ loại hàng khỏi danh sách thanh lý — hàng gia dụng ngoài lọc nước (bếp từ, xoong chảo,
 * điều hòa, bình nước nóng, quạt...) và lõi / màng RO mã EZ270...
 * Khớp theo ĐẦU TỪ trong tên hàng, không phân biệt hoa/thường và dấu ("EZ270" loại cả "EZ270T-2RV"). Số tồn thô vẫn lưu đủ nên
 * đổi từ khoá có hiệu lực NGAY, không cần cào lại SAP. Cột "Đang ẩn" bên dưới để kiểm tra từ khoá có loại nhầm hàng không.
 */
export default function BoLocPanel({ token, data, onReload }) {
  const toast = useToast();
  const [tuKhoa, setTuKhoa] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [dang, setDang] = useState(false);
  const [xoa, setXoa] = useState(null);
  const kws = data.keywords || [];
  const hidden = data.hidden || [];

  const them = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (dang || !tuKhoa.trim()) return;
    setDang(true);
    try {
      const kq = await api.tlAddExclude(token, tuKhoa.trim(), ghiChu.trim());
      if (kq.added) toast.success(`Đã thêm từ khoá "${tuKhoa.trim()}".`); else toast.info ? toast.info('Từ khoá này đã có trong danh sách.') : toast.error('Từ khoá này đã có trong danh sách.');
      setTuKhoa('');
      setGhiChu('');
      if (onReload) onReload();
    } catch (err) {
      toast.error(lamSachLoi(err.message || String(err)));
    } finally {
      setDang(false);
    }
  };

  const xoaKw = async () => {
    if (!xoa || dang) return;
    setDang(true);
    try {
      await api.tlRemoveExclude(token, xoa.id);
      toast.success(`Đã xoá từ khoá "${xoa.keyword}".`);
      setXoa(null);
      if (onReload) onReload();
    } catch (err) {
      setXoa(null);
      toast.error(lamSachLoi(err.message || String(err)));
    } finally {
      setDang(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <strong style={{ color: 'var(--karofi-navy)' }}>Từ khoá loại hàng khỏi danh sách thanh lý ({kws.length})</strong>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Hàng có TÊN chứa một từ khoá dưới đây (khớp từ đầu từ, không phân biệt hoa/thường và dấu) sẽ không hiện ở Tồn kho và không lên đơn được.
          Dùng cụm từ cho chữ dễ trùng linh kiện lọc nước (vd "nồi cơm" thay vì "nồi").
        </span>
        <form onSubmit={them} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <input className="input-field" style={{ width: '240px' }} placeholder="Từ khoá, vd: máy sấy" aria-label="Từ khoá mới" value={tuKhoa} onChange={(e) => setTuKhoa(e.target.value)} maxLength={80} />
          <input className="input-field" style={{ width: '260px' }} placeholder="Ghi chú (tuỳ chọn)" aria-label="Ghi chú" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} maxLength={200} />
          <button type="submit" disabled={dang || !tuKhoa.trim()} className="btn btn-primary btn-sm">
            {dang ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Thêm từ khoá
          </button>
        </form>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {kws.map((k) => (
            <span key={k.id} className="badge badge-neutral" title={(k.note || '') + (k.by ? ' · ' + k.by : '')} style={{ gap: '6px' }}>
              {k.keyword}
              <button type="button" onClick={() => setXoa(k)} className="btn btn-ghost" style={{ padding: '0 2px', lineHeight: 1 }} aria-label={`Xoá từ khoá ${k.keyword}`}>
                <Trash2 size={12} />
              </button>
            </span>
          ))}
          {!kws.length && <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Chưa có từ khoá nào — mọi mã trong kho 1402 đều hiện.</span>}
        </div>
      </div>

      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <strong style={{ color: 'var(--karofi-navy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <EyeOff size={16} aria-hidden="true" /> Đang ẩn ({hidden.length} mã)
        </strong>
        {hidden.length === 0 ? (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Chưa có mã nào bị ẩn.</span>
        ) : (
          <div className="table-container" style={{ maxHeight: '420px', overflow: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '140px' }}>Mã hàng</th>
                  <th>Tên hàng</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Tồn</th>
                  <th style={{ width: '150px' }}>Từ khoá khớp</th>
                </tr>
              </thead>
              <tbody>
                {hidden.map((h) => (
                  <tr key={h.sku}>
                    <td className="code-font" style={{ fontWeight: 700 }}>{h.sku}</td>
                    <td>{h.name}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(h.qty)}</td>
                    <td><span className="badge badge-neutral">{h.keyword}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {xoa && (
        <ConfirmDialog
          title="Xoá từ khoá?"
          message={`Bỏ từ khoá "${xoa.keyword}": các mã bị ẩn vì từ khoá này sẽ hiện lại ở Tồn kho thanh lý ngay.`}
          confirmLabel="Xoá từ khoá"
          danger
          busy={dang}
          busyLabel="Đang xoá..."
          onConfirm={xoaKw}
          onCancel={() => setXoa(null)}
        />
      )}
    </div>
  );
}
