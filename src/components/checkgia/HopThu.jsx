import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import * as api from '../../services/api';
import TableState from '../TableState';
import { nhanLoai, nhanTrangThai } from '../../utils/checkGia';

const LOC = [
  { id: '', label: 'Tất cả' },
  { id: 'cho', label: 'Đang chờ' },
  { id: 'da_tra_loi', label: 'Đã trả lời' }
];

/**
 * Danh sách yêu cầu hỏi giá. Sale: của mình; Admin/Creator: tất cả (mặc định lọc "Đang chờ" = hỏi giá cần kiểm tra).
 * `tick` đổi thì nạp lại (sau khi gửi yêu cầu mới / trả lời).
 */
export default function HopThu({ token, laQuanTri, tick, onOpen }) {
  const [loc, setLoc] = useState(laQuanTri ? 'cho' : '');
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState('');

  const tai = useCallback(async () => {
    setLoading(true); setLoi('');
    try { const r = await api.cgDanhSach(token, { status: loc }); setItems(r.items || []); }
    catch (e) { setLoi(e.message || String(e)); }
    finally { setLoading(false); }
  }, [token, loc]);

  useEffect(() => { tai(); }, [tai, tick]);

  return (
    <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }} role="group" aria-label="Lọc yêu cầu">
          {LOC.map((f) => (
            <button key={f.id} type="button" className={'btn btn-sm ' + (loc === f.id ? 'btn-primary' : 'btn-secondary')} aria-pressed={loc === f.id} onClick={() => setLoc(f.id)}>{f.label}</button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={tai} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Tải lại</button>
      </div>

      <TableState loading={loading && !items} error={loi} isEmpty={!!items && !items.length} onRetry={tai}
        emptyText={loc === 'cho' ? 'Không có yêu cầu nào đang chờ.' : 'Chưa có yêu cầu hỏi giá nào.'} errorPrefix="Không tải được hộp thư hỏi giá">
        <div className="table-container">
          <table className="custom-table">
            <thead><tr><th>#</th><th>Loại</th>{laQuanTri && <th>Người gửi</th>}<th>Ngày giờ gửi</th><th style={{ textAlign: 'right' }}>Số mã</th><th style={{ textAlign: 'right' }}>Cần kiểm tra</th><th>Trạng thái</th><th>Ngày trả lời</th></tr></thead>
            <tbody>
              {(items || []).map((r) => {
                const nh = nhanTrangThai(r.status, r.kind);
                const moi = !laQuanTri && r.status === 'da_tra_loi' && !r.seen;
                return (
                  <tr key={r.id} onClick={() => onOpen(r.id)} style={{ cursor: 'pointer', fontWeight: moi ? 700 : 400 }} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r.id); }}>
                    <td>#{r.id}</td>
                    <td>{nhanLoai(r.kind)}</td>
                    {laQuanTri && <td>{r.createdBy}</td>}
                    <td>{r.submittedAt}</td>
                    <td style={{ textAlign: 'right' }}>{r.soDong}</td>
                    <td style={{ textAlign: 'right' }}>{r.kind === 'kho' ? (r.soThieu || '—') : '—'}</td>
                    <td><span className={'badge badge-' + nh.tone}>{nh.text}</span>{moi && <span className="badge badge-blue" style={{ marginLeft: '6px' }}>Mới</span>}</td>
                    <td>{r.answeredAt || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TableState>
    </div>
  );
}
