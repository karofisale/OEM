import React, { useMemo, useState } from 'react';
import { History, Copy, ChevronDown, ChevronUp, Search } from 'lucide-react';
import {
  thangNguon, giaTriThang, viTriDichHopLe, nhanThang, congThang
} from '../../utils/sopPlan';
import { chuanTim, khopBatKy } from '../../utils/searchText';

const TOI_DA_COT = 8;      // số tháng gần nhất hiện ở bảng xem lại
const TOI_DA_DONG = 300;   // số mã tối đa hiện ở bảng xem lại (có ô tìm để thu hẹp)

const NHAN_TRANG_THAI = { duyet: 'đã duyệt', cho: 'chờ duyệt', dangSoan: 'đang soạn' };

// Thẻ "Các tháng đã lập trước đây" của màn Lập Kế Hoạch (02/11/2026). Quên lập một kỳ thì kỳ sau không còn số mang sang — thẻ này cho
// XEM mọi tháng Sale từng lập (đã duyệt lẫn chờ duyệt) và SAO CHÉP số của tháng X sang các tháng tiếp theo trong kế hoạch đang soạn để
// sửa rồi mới gửi duyệt. Thẻ chỉ gọi `onSaoChep`; việc ghi vào bản đang soạn (và Hoàn tác) do SopPlanPanel làm. Logic: utils/sopPlan.js.
export default function SopLichSuSaoChep({ anchor, monthLabels, lichSu, dangTai, loi, onThuLai, draftMap, inPlan, materials, moSan, onSaoChep }) {
  const [mo, setMo] = useState(!!moSan);
  const [ymChon, setYmChon] = useState('');
  const [dichChon, setDichChon] = useState(null);      // null = mọi tháng đích hợp lệ
  const [chiODangTrong, setChiODangTrong] = useState(true);
  const [tim, setTim] = useState('');

  const dsNguon = useMemo(() => thangNguon(anchor, draftMap, inPlan, lichSu), [anchor, draftMap, inPlan, lichSu]);
  const tenTheoMa = useMemo(() => {
    const m = {};
    (materials || []).forEach((x) => { m[x.sku] = x; });
    return m;
  }, [materials]);

  // Mặc định: tháng cũ gần nhất TRƯỚC kỳ đang soạn (đúng ca "quên lập kỳ trước"); không có thì tháng mới nhất trong danh sách.
  const macDinh = (dsNguon.find((t) => t.ym < anchor) || dsNguon[0] || {}).ym || '';
  const ym = dsNguon.some((t) => t.ym === ymChon) ? ymChon : macDinh;
  const hopLe = useMemo(() => (ym ? viTriDichHopLe(ym, anchor) : []), [ym, anchor]);
  const dich = hopLe.filter((i) => !dichChon || dichChon.includes(i));
  const nguon = useMemo(() => (ym ? giaTriThang(ym, anchor, draftMap, inPlan, lichSu) : { skus: {}, nguon: 'lichSu' }), [ym, anchor, draftMap, inPlan, lichSu]);
  const soMaNguon = Object.keys(nguon.skus).length;
  const thangChon = dsNguon.find((t) => t.ym === ym);

  const doiNguon = (v) => { setYmChon(v); setDichChon(null); };
  const batTatDich = (i) => {
    const hienTai = dich;
    setDichChon(hienTai.includes(i) ? hienTai.filter((x) => x !== i) : hienTai.concat(i));
  };

  // Bảng xem lại: TOI_DA_COT tháng gần nhất có số trong lịch sử (các tháng cũ bên trái).
  const cot = useMemo(() => {
    const ds = Object.keys((lichSu && lichSu.thang) || {}).sort();
    return ds.slice(-TOI_DA_COT);
  }, [lichSu]);
  const dongXem = useMemo(() => {
    if (!lichSu || !cot.length) return [];
    const q = chuanTim(tim);
    const kq = [];
    Object.keys(lichSu.grid).sort().forEach((sku) => {
      const g = lichSu.grid[sku];
      if (!cot.some((c) => g[c] && g[c].v > 0)) return;
      const m = tenTheoMa[sku] || {};
      if (q && !khopBatKy(q, sku, m.name, m.alias)) return;
      kq.push({ sku, ten: m.name || '(không có trong danh mục)', g });
    });
    return kq;
  }, [lichSu, cot, tim, tenTheoMa]);

  const coLichSu = !!lichSu && Object.keys(lichSu.thang).length > 0;
  const nDichText = dich.length ? dich.map((i) => (monthLabels && monthLabels[i]) || nhanThang(congThang(anchor, i))).join(', ') : '';

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <button
        type="button" onClick={() => setMo((v) => !v)} aria-expanded={mo}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit' }}
      >
        <History size={18} color="var(--karofi-cyan)" aria-hidden="true" />
        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Các tháng đã lập trước đây — xem lại và sao chép sang kế hoạch này</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {dangTai ? 'đang tải…' : (loi ? 'không tải được' : (coLichSu ? `${Object.keys(lichSu.thang).length.toLocaleString('vi-VN')} tháng` : 'chưa có'))}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex' }} aria-hidden="true">{mo ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>

      {mo && (
        <>
          {loi && (
            <div role="alert" style={{ fontSize: '0.82rem', color: 'var(--danger)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              Không tải được các tháng đã lập: {loi}
              {onThuLai && <button type="button" className="btn btn-secondary btn-sm" onClick={onThuLai}>Thử lại</button>}
            </div>
          )}
          {!loi && !dangTai && !dsNguon.length && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Bạn chưa lập kế hoạch tháng nào trước đây nên chưa có gì để sao chép.</div>
          )}

          {dsNguon.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-hover)', border: '1px solid var(--border-color)' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
                Sao chép tháng
                <select className="input-field" style={{ width: 'auto', minWidth: '260px' }} value={ym} onChange={(e) => doiNguon(e.target.value)} aria-label="Tháng nguồn để sao chép">
                  {dsNguon.map((t) => (
                    <option key={t.ym} value={t.ym}>
                      {t.nhan} — {t.soMa.toLocaleString('vi-VN')} mã, {Math.round(t.tongSL).toLocaleString('vi-VN')} SL ({NHAN_TRANG_THAI[t.nguon]})
                    </option>
                  ))}
                </select>
              </label>

              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>sang:</span>
              {hopLe.length === 0 ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>không có tháng nào của kế hoạch này nằm SAU {thangChon ? thangChon.nhan : 'tháng đã chọn'}</span>
              ) : hopLe.map((i) => (
                <label key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: '16px', height: '16px' }} checked={dich.includes(i)} onChange={() => batTatDich(i)} />
                  {(monthLabels && monthLabels[i]) || nhanThang(congThang(anchor, i))}
                </label>
              ))}

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', cursor: 'pointer' }} title="Bỏ tick để ghi đè cả những ô đã có số">
                <input type="checkbox" style={{ width: '16px', height: '16px' }} checked={chiODangTrong} onChange={(e) => setChiODangTrong(e.target.checked)} />
                Chỉ điền ô đang trống
              </label>

              <button
                type="button" className="btn btn-primary btn-sm"
                disabled={!dich.length || !soMaNguon}
                onClick={() => onSaoChep({ ym, dich, chiODangTrong, nguon: nguon.skus, nhanNguon: thangChon ? thangChon.nhan : nhanThang(ym) })}
              >
                <Copy size={14} aria-hidden="true" /> Sao chép vào kế hoạch đang soạn
              </button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexBasis: '100%' }}>
                {soMaNguon.toLocaleString('vi-VN')} mã có số ở {thangChon ? thangChon.nhan : 'tháng này'}
                {dich.length ? <> → sẽ vào {nDichText}. Mã chưa có trong kế hoạch được thêm; chưa gửi gì lên hệ thống — bạn sửa số rồi bấm “Lưu Kế Hoạch, Gửi Duyệt”.</> : ''}
              </span>
            </div>
          )}

          {coLichSu && (
            <>
              <div style={{ position: 'relative', maxWidth: '360px' }}>
                <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} aria-hidden="true" />
                <input type="text" className="input-field" style={{ paddingLeft: '30px' }} placeholder="Tìm trong các tháng đã lập…" aria-label="Tìm trong các tháng đã lập" value={tim} onChange={(e) => setTim(e.target.value)} />
              </div>
              <div className="table-container" style={{ maxHeight: '340px', overflow: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th>Tên SP</th>
                      {cot.map((c) => (
                        <th key={c} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {nhanThang(c)}
                          <div style={{ fontSize: '0.65rem', fontWeight: 600, color: lichSu.thang[c].status === 'duyet' ? 'var(--accent-emerald-text)' : 'var(--warning-text)' }}>
                            {NHAN_TRANG_THAI[lichSu.thang[c].status]}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dongXem.slice(0, TOI_DA_DONG).map((r) => (
                      <tr key={r.sku}>
                        <td className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)', fontSize: '0.8rem' }}>{r.sku}</td>
                        <td style={{ fontWeight: 600, minWidth: '150px' }}>{r.ten}</td>
                        {cot.map((c) => {
                          const o = r.g[c];
                          return <td key={c} style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: o && o.v > 0 ? 'inherit' : 'var(--text-dim)' }}>{o && o.v > 0 ? o.v.toLocaleString('vi-VN') : '—'}</td>;
                        })}
                      </tr>
                    ))}
                    {dongXem.length === 0 && <tr><td colSpan={cot.length + 2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Không có mã nào khớp.</td></tr>}
                  </tbody>
                </table>
              </div>
              {dongXem.length > TOI_DA_DONG && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hiện {TOI_DA_DONG} mã đầu trong {dongXem.length.toLocaleString('vi-VN')} — gõ ô tìm để thu hẹp. Việc sao chép vẫn áp cho TẤT CẢ mã của tháng đã chọn.</div>
              )}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                Mỗi tháng lấy số của kỳ LẬP SAU CÙNG chứa tháng đó (đã duyệt hoặc đang chờ duyệt). Hiện {cot.length} tháng gần nhất có số.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
