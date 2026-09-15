import React, { useState, useMemo } from 'react';
import { PackagePlus, Save, Loader2, CheckCircle2 } from 'lucide-react';
import * as api from '../../services/api';
import { useToast } from '../ToastProvider';

/**
 * "Có N sản phẩm chưa khai báo trong tab Products" — nằm trên màn Lịch sử
 * doanh thu, ngay dưới dòng mốc cập nhật.
 *
 * VÌ SAO CẦN: danh mục sản phẩm của app SUY RA TỪ LỊCH SỬ GIAO DỊCH, nên một
 * SKU mới bán lần đầu vẫn hiện ra khắp nơi — nhưng nó chưa có dòng trong tab
 * Products, tức chưa có Nhóm SP và chưa có alias chuẩn. Hệ quả im lặng: nó rơi
 * vào nhóm mặc định trong mọi báo cáo và bộ lọc theo nhóm, không ai nhận ra cho
 * tới lúc số nhóm lệch.
 *
 * VÌ SAO KHÔNG CHỈ HIỆN NGAY SAU KHI NHẬP: hiện thường trực khi còn mã thiếu.
 * Yêu cầu gốc là "khi cào/tải ZSD450 thì báo" — và đúng lúc đó người dùng đang
 * ở màn này nên vẫn thấy ngay — nhưng nếu chỉ hiện sau lượt nhập thì tải lại
 * trang là lời nhắc biến mất, trong khi việc thì vẫn còn đó.
 *
 * Lưu CẢ LÔ trong một lượt gọi (api.addMaterials): một đợt nhập có thể lòi ra
 * hàng chục SKU, mà đường mạng này hỏng chừng một nửa số lượt — gọi từng mã thì
 * gần như chắc chắn đứt giữa chừng và để lại một nửa danh sách đã lưu.
 */
export default function SanPhamChuaCoPanel({ token, materials, activeUser, onSaved }) {
  const toast = useToast();
  const canAdd = ['creator', 'admin', 'sale'].includes(activeUser?.role);

  const [nhomTheoSku, setNhomTheoSku] = useState({}); // sku -> Nhóm SP người dùng chọn
  const [dangLuu, setDangLuu] = useState(false);
  const [an, setAn] = useState(false);

  const thieu = useMemo(
    () => (materials || []).filter((m) => m && m.sku && !m.inCatalog),
    [materials]
  );

  // Nhóm đã dùng trong danh mục, để chọn lại cho nhanh thay vì gõ tay.
  const nhomList = useMemo(() => {
    const set = new Set();
    (materials || []).forEach((m) => { if (m.inCatalog && m.group) set.add(m.group); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [materials]);

  if (!canAdd || an || !thieu.length) return null;

  const nhomCua = (m) => (nhomTheoSku[m.sku] !== undefined ? nhomTheoSku[m.sku] : (m.group || ''));

  const luu = async () => {
    setDangLuu(true);
    try {
      const kq = await api.addMaterials(token, thieu.map((m) => ({
        sku: m.sku,
        name: m.name || '',
        group: nhomCua(m),
        alias: m.alias || ''
      })));
      toast.success(
        `Đã lưu ${kq.addedCount} sản phẩm vào tab Products` +
        (kq.skippedCount ? ` (bỏ qua ${kq.skippedCount} mã đã có).` : '.')
      );
      if (onSaved) onSaved();
    } catch (err) {
      toast.error('Không lưu được sản phẩm: ' + (err.message || err));
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PackagePlus size={18} color="var(--warning-text)" />
          <div>
            <strong style={{ fontSize: '0.9rem' }}>
              {thieu.length.toLocaleString('vi-VN')} sản phẩm có doanh thu nhưng chưa khai báo trong tab Products
            </strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Chọn Nhóm SP cho từng mã rồi bấm Lưu. Chưa lưu thì chúng vẫn chạy được, chỉ là không có nhóm chuẩn trong báo cáo.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setAn(true)} disabled={dangLuu} className="btn btn-ghost btn-sm">Để sau</button>
          <button onClick={luu} disabled={dangLuu} className="btn btn-emerald btn-sm">
            {dangLuu ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Lưu {thieu.length} sản phẩm
          </button>
        </div>
      </div>

      <div className="table-container" style={{ maxHeight: '260px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ width: '140px' }}>SKU</th>
              <th>Tên vật tư</th>
              <th style={{ width: '120px', textAlign: 'right' }}>Tổng bán</th>
              <th style={{ width: '230px' }}>Nhóm SP</th>
            </tr>
          </thead>
          <tbody>
            {thieu.map((m) => (
              <tr key={m.sku}>
                <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{m.sku}</td>
                <td style={{ fontSize: '0.8rem' }}>{m.name}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {(m.totalQty || 0).toLocaleString('vi-VN')} {m.unit}
                </td>
                <td>
                  {/* input + datalist chứ không phải <select>: nhóm mới hoàn toàn
                      vẫn phải gõ được, đúng khuôn ô "Nhóm SP" ở màn Sản phẩm. */}
                  <input
                    type="text"
                    className="input-field"
                    style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                    list="sp-chua-co-nhom"
                    value={nhomCua(m)}
                    placeholder="Chọn hoặc gõ nhóm..."
                    onChange={(e) => setNhomTheoSku((prev) => ({ ...prev, [m.sku]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <datalist id="sp-chua-co-nhom">
        {nhomList.map((g) => <option key={g} value={g} />)}
      </datalist>

      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <CheckCircle2 size={12} /> Mã đã có sẵn trong tab Products sẽ được bỏ qua, không tạo dòng trùng.
      </span>
    </div>
  );
}
