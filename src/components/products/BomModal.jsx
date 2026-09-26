import React, { useState, useEffect, useCallback } from 'react';
import { X, Layers, RefreshCw, Zap, ClipboardPaste, Loader2, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import * as api from '../../services/api';
import { useToast } from '../ToastProvider';
import { parseBomDan, JOB_BOM_NUT } from '../../utils/bom';

/**
 * Xem / cập nhật BOM (định mức nguyên vật liệu) của một mã máy.
 *
 * XEM: mọi vai. BOM là định mức kỹ thuật của sản phẩm, không gắn với khách hay
 * doanh số của ai — cùng lý lẽ với danh mục sản phẩm.
 *
 * CẬP NHẬT: Admin/Creator, hai đường đặt cạnh nhau có chủ ý, đúng khuôn màn
 * doanh thu đã dùng: cào thẳng từ SAP chỉ chạy được trên máy có SAP, còn dán
 * bảng thì ở đâu cũng chạy — nên khi đường trên không dùng được, đường lui nằm
 * ngay dưới mắt chứ không phải đi tìm.
 */

const NHIP_MS = 5000;
// Bộ điều phối ghi nhịp "đang chạy" ngay dòng đầu, trước cả khi gọi SAP, nên
// chưa thấy gì nhúc nhích sau ngần này gần như chắc chắn là chưa cài giao thức.
const CHO_KHOI_DONG_MS = 25000;
// Z_BOM cho một mã là truy vấn nhỏ hơn hẳn ZSD450 cả tháng, nhưng vẫn để rộng
// cho máy chậm và SAP đang bận.
const CHO_TOI_DA_MS = 3 * 60 * 1000;

const tim = (ds, job) => (ds || []).find((n) => n.job === job) || null;

const fmtNgay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const hai = (n) => String(n).padStart(2, '0');
  return `${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()} ${hai(d.getHours())}:${hai(d.getMinutes())}`;
};

export default function BomModal({ token, sku, materialName, canUpdate, onClose }) {
  const toast = useToast();

  const [bom, setBom] = useState(null);
  const [dangDoc, setDangDoc] = useState(false);
  const [loiDoc, setLoiDoc] = useState('');

  const [moCapNhat, setMoCapNhat] = useState(false);
  const [vanBanDan, setVanBanDan] = useState('');
  const [dangLuu, setDangLuu] = useState(false);

  const [phaCao, setPhaCao] = useState('nghi'); // nghi | choKhoiDong | dangChay | loi | khongCai
  const [loiCao, setLoiCao] = useState('');
  const dungRef = React.useRef(false);
  useEffect(() => () => { dungRef.current = true; }, []);

  const doc = useCallback(async () => {
    setDangDoc(true);
    setLoiDoc('');
    try {
      setBom(await api.getBom(token, sku));
    } catch (err) {
      setLoiDoc(err.message || String(err));
    } finally {
      setDangDoc(false);
    }
  }, [token, sku]);

  useEffect(() => { doc(); }, [doc]);

  const luu = async (rows, nguon) => {
    setDangLuu(true);
    try {
      const kq = await api.updateBom(token, sku, rows);
      toast.success(
        `${kq.laThemMoi ? 'Đã thêm mới' : 'Đã thay'} BOM mã ${sku}: ${kq.soDongMoi} linh kiện` +
        (kq.laThemMoi ? '.' : ` (trước đó ${kq.soDongCu}).`)
      );
      setVanBanDan('');
      setMoCapNhat(false);
      await doc();
    } catch (err) {
      toast.error(`Không cập nhật được BOM (${nguon}): ` + (err.message || err));
    } finally {
      setDangLuu(false);
    }
  };

  const luuBanDan = () => {
    let rows;
    try {
      rows = parseBomDan(vanBanDan, sku);
    } catch (err) {
      toast.error(err.message || String(err));
      return;
    }
    luu(rows, 'bảng dán');
  };

  /**
   * Cào thẳng từ SAP. Giao thức riêng là MỘT CHIỀU — trình duyệt giao URL cho
   * Windows rồi quên luôn, không có chỗ trả kết quả. Đường về là nhịp tim:
   * chụp mốc TRƯỚC khi bấm rồi chờ nó ĐỔI. So một giá trị với chính nó nên
   * không phụ thuộc đồng hồ trình duyệt hay đồng hồ máy chủ.
   */
  const cao = async () => {
    setLoiCao(''); dungRef.current = false;
    let moc = null;
    try {
      const ds = (await api.getNhipTim(token)).nhipTim || [];
      moc = (tim(ds, JOB_BOM_NUT) || {}).lanCuoi || '';
    } catch (err) {
      setPhaCao('loi');
      setLoiCao('Không đọc được nhịp tim để theo dõi lượt chạy: ' + (err.message || err));
      return;
    }

    setPhaCao('choKhoiDong');
    window.location.href = `karofi-oem://bom?material=${encodeURIComponent(sku)}`;

    const batDau = Date.now();
    let daKhoiDong = false;

    while (!dungRef.current) {
      await new Promise((r) => setTimeout(r, NHIP_MS));
      if (dungRef.current) return;

      let ds;
      try {
        ds = (await api.getNhipTim(token)).nhipTim || [];
      } catch (err) {
        continue; // một nhịp hỏng thì nhịp sau hỏi lại
      }

      const nut = tim(ds, JOB_BOM_NUT);
      const doi = nut && (nut.lanCuoi || '') !== moc;
      if (!daKhoiDong && doi) { daKhoiDong = true; setPhaCao('dangChay'); }

      if (!daKhoiDong && Date.now() - batDau > CHO_KHOI_DONG_MS) {
        setPhaCao('khongCai');
        return;
      }

      // 'dang-chay' là hợp đồng với dieu-phoi.ps1 — xem chú thích đầu file đó.
      if (daKhoiDong && nut && nut.trangThai !== 'dang-chay') {
        if (nut.trangThai === 'loi') {
          setPhaCao('loi');
          setLoiCao(nut.ghiChu || 'Lượt chạy báo lỗi nhưng không kèm lý do.');
          return;
        }
        setPhaCao('nghi');
        toast.success('Cào xong, đang đọc lại BOM...');
        setMoCapNhat(false);
        await doc();
        return;
      }

      if (Date.now() - batDau > CHO_TOI_DA_MS) {
        setPhaCao('loi');
        setLoiCao('Chờ quá lâu mà lượt chạy chưa xong. Xem nhật ký ở Scripts\\karofi-oem-protocol\\nhat-ky.log.');
        return;
      }
    }
  };

  const dangCao = phaCao === 'choKhoiDong' || phaCao === 'dangChay';
  const tongSL = bom ? bom.rows.reduce((s, r) => s + (r.quantity || 0), 0) : 0;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !dangCao && !dangLuu) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
      }}
    >
      <div className="glass-card" style={{ width: '100%', maxWidth: '900px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} color="var(--karofi-cyan)" /> BOM — <span className="code-font" style={{ color: 'var(--karofi-cyan)' }}>{sku}</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {bom?.materialName || materialName || ''}
              {bom?.updatedAt ? ` · cập nhật ${fmtNgay(bom.updatedAt)}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={doc} disabled={dangDoc} className="btn btn-secondary btn-sm" title="Đọc lại BOM">
              <RefreshCw size={14} className={dangDoc ? 'animate-spin' : undefined} /> Tải lại
            </button>
            <button onClick={onClose} disabled={dangCao || dangLuu} className="btn btn-ghost btn-sm" aria-label="Đóng">
              <X size={16} />
            </button>
          </div>
        </div>

        {canUpdate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-hover)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <button onClick={cao} disabled={dangCao || dangLuu} className="btn btn-primary btn-sm">
                {dangCao ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {phaCao === 'choKhoiDong' ? 'Đang gọi máy...' : phaCao === 'dangChay' ? 'Đang cào SAP...' : 'Cào từ SAP (Z_BOM)'}
              </button>
              <button onClick={() => setMoCapNhat((v) => !v)} disabled={dangCao || dangLuu} className="btn btn-secondary btn-sm">
                <ClipboardPaste size={14} /> {moCapNhat ? 'Đóng ô dán' : 'Dán bảng từ SAP'}
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <HelpCircle size={12} /> Cào chỉ chạy trên máy đã cài giao thức + có SAP. Dán thì máy nào cũng được.
              </span>
            </div>

            {phaCao === 'khongCai' && (
              <div style={{ fontSize: '0.78rem', color: 'var(--warning-text)', display: 'flex', gap: '6px' }}>
                <AlertTriangle size={14} />
                Không thấy máy phản hồi. Máy này có thể chưa cài giao thức (chạy
                <code style={{ margin: '0 4px' }}>Scripts\karofi-oem-protocol\cai-dat.ps1</code>)
                hoặc trình duyệt đã chặn. Dùng đường "Dán bảng từ SAP" bên cạnh.
              </div>
            )}
            {phaCao === 'loi' && (
              <div style={{ fontSize: '0.78rem', color: 'var(--danger-strong)', display: 'flex', gap: '6px' }}>
                <AlertTriangle size={14} /> {loiCao}
              </div>
            )}

            {moCapNhat && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Bôi cả bảng trong SAP (kể cả dòng tiêu đề) rồi dán vào đây. Chỉ 5 cột đầu được đọc:
                  Material · Material Description · Component · Component Descript · Quantity.
                </span>
                <textarea
                  className="input-field"
                  style={{ minHeight: '120px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }}
                  value={vanBanDan}
                  onChange={(e) => setVanBanDan(e.target.value)}
                  placeholder={'Material\tMaterial Description\tComponent\tComponent Descript\tQuantity\n1000123\tMáy lọc ...\t2000456\tLõi lọc ...\t1'}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button onClick={luuBanDan} disabled={!vanBanDan.trim() || dangLuu} className="btn btn-emerald btn-sm">
                    {dangLuu ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Thay BOM mã {sku}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="table-container" style={{ overflowY: 'auto', flex: 1, minHeight: '120px' }}>
          {loiDoc ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--danger-strong)', fontSize: '0.85rem' }}>
              Không đọc được BOM: {loiDoc}
            </div>
          ) : dangDoc && !bom ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-dim)' }}>Đang đọc BOM...</div>
          ) : !bom || !bom.rows.length ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Chưa có BOM cho mã {sku}.{canUpdate ? ' Dùng nút "Cào từ SAP" hoặc "Dán bảng từ SAP" ở trên.' : ''}
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '50px', textAlign: 'right' }}>#</th>
                  <th style={{ width: '150px' }}>Component</th>
                  <th>Component Descript</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                <tr className="top-summary-row">
                  <td />
                  <td style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>Σ</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{bom.rows.length} linh kiện</td>
                  <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>
                    {tongSL.toLocaleString('vi-VN')}
                  </td>
                </tr>
                {bom.rows.map((r, i) => (
                  <tr key={`${r.component}_${i}`}>
                    <td style={{ textAlign: 'right', color: 'var(--text-dim)', fontSize: '0.75rem' }}>{i + 1}</td>
                    <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{r.component}</td>
                    <td style={{ fontSize: '0.8rem' }}>{r.componentDesc}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 700 }}>
                      {(r.quantity || 0).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
