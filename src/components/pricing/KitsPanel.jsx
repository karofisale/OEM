import React, { useState, useEffect, useMemo } from 'react';
import { Boxes, Plus, Trash2, ClipboardPaste, Save, Loader2 } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import SkuPickerCell from '../SkuPickerCell';
import { useToast } from '../ToastProvider';
import { parseKitsDan } from '../../utils/adminTables';

const dongTrong = () => ({ kitName: '', sku: '', role: '', qtyPerKit: 1, note: '' });

/**
 * Công thức "Bộ sản phẩm" mà AI nhận đơn dùng để tách "2 bộ cốc" thành từng mã
 * — thay cho tab "Kits" trước đây sửa tay trên Google Sheet.
 *
 * Mỗi dòng = một thành phần của một bộ. Nhiều dòng cùng Vai trò trong một bộ
 * là các BIẾN THỂ (màu/loại); AI chọn đúng một theo chữ trong đơn.
 * Lưu = THAY TOÀN BỘ công thức bằng bảng trên màn hình.
 */
export default function KitsPanel({ token, kits, materials, onSaved }) {
  const toast = useToast();
  const [rows, setRows] = useState(() => (kits || []).map((k) => ({ ...k })));
  const [daSua, setDaSua] = useState(false);
  const [moDan, setMoDan] = useState(false);
  const [vanBan, setVanBan] = useState('');
  const [xacNhan, setXacNhan] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);

  // Bootstrap tải lại (sau khi lưu, hoặc bấm Tải lại) thì lấy bản mới — trừ
  // khi đang có chỗ sửa dở, không được đè mất.
  useEffect(() => {
    if (!daSua) setRows((kits || []).map((k) => ({ ...k })));
  }, [kits]);

  const tenSp = useMemo(() => {
    const m = {};
    (materials || []).forEach((x) => { m[x.sku] = x.name; });
    return m;
  }, [materials]);

  const sua = (i, patch) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDaSua(true);
  };

  const soBo = useMemo(() => new Set(rows.map((r) => r.kitName.trim()).filter(Boolean)).size, [rows]);
  const thieu = rows.filter((r) => !r.kitName.trim() || !r.sku.trim()).length;

  const apDan = () => {
    try {
      const kq = parseKitsDan(vanBan);
      setRows(kq.rows);
      setDaSua(true);
      setMoDan(false);
      setVanBan('');
      toast.success(`Đã đọc ${kq.rows.length} dòng từ bảng dán. Bấm Lưu để ghi.`);
    } catch (err) {
      toast.error(err.message || String(err));
    }
  };

  const luu = async () => {
    setDangLuu(true);
    try {
      const kq = await api.saveKits(token, rows);
      toast.success(`Đã lưu ${kq.savedCount} dòng công thức bộ sản phẩm.`);
      setXacNhan(false);
      setDaSua(false);
      if (onSaved) onSaved();
    } catch (err) {
      toast.error('Không lưu được bộ sản phẩm: ' + (err.message || err));
    } finally {
      setDangLuu(false);
    }
  };

  const oChu = { padding: '4px 6px', fontSize: '0.78rem' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Boxes size={20} color="var(--karofi-cyan)" />
          <div>
            <strong>Bộ sản phẩm</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {soBo} bộ · {rows.length} dòng{daSua ? ' · có thay đổi CHƯA lưu' : ''} — AI nhận đơn dùng bảng này để tách "N bộ …" thành từng mã.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setMoDan((v) => !v)} disabled={dangLuu} className="btn btn-secondary btn-sm">
            <ClipboardPaste size={14} /> {moDan ? 'Đóng ô dán' : 'Dán từ Excel'}
          </button>
          <button onClick={() => { setRows((rs) => [...rs, dongTrong()]); setDaSua(true); }} disabled={dangLuu} className="btn btn-secondary btn-sm">
            <Plus size={14} /> Thêm dòng
          </button>
          <button onClick={() => setXacNhan(true)} disabled={!daSua || dangLuu} className="btn btn-emerald btn-sm">
            {dangLuu ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu
          </button>
        </div>
      </div>

      {moDan && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Cột: <b>Tên bộ · Mã SKU · Vai trò · SL trong 1 bộ · Ghi chú</b>, cách nhau bằng Tab (copy thẳng từ Excel).
            Dán xong bảng bên dưới được THAY — vẫn phải bấm Lưu mới ghi.
          </span>
          <textarea className="input-field" style={{ minHeight: '110px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }}
                    value={vanBan} onChange={(e) => setVanBan(e.target.value)}
                    placeholder={'Tên bộ\tMã SKU\tVai trò\tSL\tGhi chú\nBộ cốc\t3001234\tCốc trong\t1\t'} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={apDan} disabled={!vanBan.trim()} className="btn btn-primary btn-sm">Thay bảng bằng dữ liệu dán</button>
          </div>
        </div>
      )}

      <div className="table-container" style={{ maxHeight: '620px', overflow: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ minWidth: '160px' }}>Tên bộ</th>
              <th style={{ minWidth: '260px' }}>Mã SKU</th>
              <th style={{ minWidth: '140px' }}>Vai trò</th>
              <th style={{ width: '90px', textAlign: 'right' }}>SL / bộ</th>
              <th style={{ minWidth: '160px' }}>Ghi chú</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>
                Chưa có công thức bộ nào. Dán từ Excel hoặc Thêm dòng.
              </td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input className="input-field" style={oChu} value={r.kitName} onChange={(e) => sua(i, { kitName: e.target.value })} /></td>
                <td>
                  <SkuPickerCell
                    sku={r.sku}
                    name={tenSp[r.sku] || ''}
                    materials={materials}
                    onSelect={(m) => sua(i, { sku: m.sku })}
                  />
                </td>
                <td><input className="input-field" style={oChu} value={r.role} onChange={(e) => sua(i, { role: e.target.value })} /></td>
                <td>
                  <input className="input-field" style={{ ...oChu, textAlign: 'right' }} value={r.qtyPerKit}
                         onChange={(e) => sua(i, { qtyPerKit: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') })} />
                </td>
                <td><input className="input-field" style={oChu} value={r.note} onChange={(e) => sua(i, { note: e.target.value })} /></td>
                <td>
                  <button onClick={() => { setRows((rs) => rs.filter((_, j) => j !== i)); setDaSua(true); }} className="btn btn-ghost btn-sm" aria-label="Xoá dòng">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {xacNhan && (
        <ConfirmDialog
          title="Lưu công thức bộ sản phẩm?"
          message={`Sẽ THAY TOÀN BỘ công thức bằng ${rows.length - thieu} dòng đang có trên màn hình` +
                   (thieu ? ` (${thieu} dòng thiếu Tên bộ hoặc Mã SKU sẽ bị bỏ).` : '.')}
          confirmLabel={dangLuu ? 'Đang lưu...' : 'Lưu'}
          onConfirm={luu}
          onCancel={() => setXacNhan(false)}
        />
      )}
    </div>
  );
}
