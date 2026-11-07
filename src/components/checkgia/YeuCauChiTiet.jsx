import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import * as api from '../../services/api';
import TableState from '../TableState';
import ChiTietKho from './ChiTietKho';
import ChiTietNhapKhau from './ChiTietNhapKhau';
import { nhanLoai, nhanTrangThai, dangCaoSap } from '../../utils/checkGia';

const NHIP_CAO_MS = 5000;

/**
 * Một yêu cầu hỏi giá. Nạp cgChiTiet (máy chủ tự cắt cột theo vai trò: Sale không thấy giá vốn / thuế / chi phí), rồi giao cho màn
 * Kho hoặc Nhập khẩu. Sale mở bảng đã trả lời → tự báo "đã xem" để tắt thông báo. Đang cào SAP → tự hỏi lại mỗi 5 giây.
 */
export default function YeuCauChiTiet({ token, id, laQuanTri, onBack, onChanged }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState('');
  const daBaoXem = useRef(0);

  const tai = useCallback(async ({ im } = {}) => {
    if (!im) setLoading(true);
    setLoi('');
    try { setD(await api.cgChiTiet(token, id)); }
    catch (e) { if (!im) setLoi(e.message || String(e)); }
    finally { if (!im) setLoading(false); }
  }, [token, id]);

  useEffect(() => { setD(null); tai(); }, [tai]);

  // Sale đã mở bảng trả lời -> tắt thông báo (một lần cho mỗi yêu cầu).
  useEffect(() => {
    if (!d || laQuanTri) return;
    const rq = d.request;
    if (rq.status === 'da_tra_loi' && !rq.seen && daBaoXem.current !== rq.id) {
      daBaoXem.current = rq.id;
      api.cgDaXem(token, rq.id).then(() => { if (onChanged) onChanged({ soloThongBao: true }); }).catch(() => {});
    }
  }, [d, laQuanTri, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Đang cào SAP: hỏi lại nền.
  const dangCao = !!(d && laQuanTri && d.scrape && dangCaoSap(d.scrape));
  useEffect(() => {
    if (!dangCao) return undefined;
    const h = setInterval(() => tai({ im: true }), NHIP_CAO_MS);
    return () => clearInterval(h);
  }, [dangCao, tai]);

  const sauKhiDoi = (opts) => { tai({ im: true }); if (onChanged) onChanged(opts || {}); };
  const rq = d && d.request;
  const nh = rq ? nhanTrangThai(rq.status, rq.kind) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}><ArrowLeft size={14} /> Danh sách yêu cầu</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => tai({ im: !!d })} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Tải lại</button>
      </div>

      <TableState loading={loading && !d} error={loi} onRetry={() => tai()} errorPrefix={'Không mở được yêu cầu #' + id}>
        {d && (
          <>
            <div className="glass-card" style={{ padding: '14px 16px', display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>Yêu cầu #{rq.id}</div>
              <span className="badge badge-blue">{nhanLoai(rq.kind)}</span>
              <span className={'badge badge-' + nh.tone}>{nh.text}</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Gửi bởi <strong>{rq.createdBy}</strong> lúc {rq.submittedAt}
                {rq.answeredAt && <> · trả lời bởi <strong>{rq.answeredBy}</strong> lúc {rq.answeredAt}</>}
              </span>
              {rq.note && <div style={{ flexBasis: '100%', fontSize: '0.82rem' }}>Ghi chú của Sale: {rq.note}</div>}
              {rq.recalcNote && <div style={{ flexBasis: '100%', fontSize: '0.82rem', color: 'var(--warning-text)' }}>Sale yêu cầu tính lại: {rq.recalcNote}</div>}
              {rq.answerNote && <div style={{ flexBasis: '100%', fontSize: '0.82rem' }}>Ghi chú trả lời: {rq.answerNote}</div>}
            </div>
            {rq.kind === 'kho'
              ? <ChiTietKho token={token} d={d} laQuanTri={laQuanTri} onChanged={sauKhiDoi} />
              : <ChiTietNhapKhau token={token} d={d} laQuanTri={laQuanTri} onChanged={sauKhiDoi} />}
          </>
        )}
      </TableState>
    </div>
  );
}
