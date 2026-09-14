import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, Clock, AlertCircle } from 'lucide-react';
import * as api from '../../services/api';

/**
 * "Doanh thu cập nhật lần cuối: ..." trên màn Lịch sử doanh thu.
 *
 * VÌ SAO CẦN: bảng này luôn hiện số, kể cả khi số đã cũ hai tuần — đợt đổ dữ
 * liệu từ SAP hỏng thì không màn nào kêu, người xem vẫn đọc và vẫn tin. Đây là
 * đúng thứ NhipTim.gs sinh ra để chống, chỉ là trước giờ chưa màn nào trong app
 * hiện nó ra (cổng Karofi ID có, app thì không).
 *
 * MỘT MỐC CHO CẢ BA ĐƯỜNG VÀO. Doanh thu vào tab Data theo ba đường: skill
 * `up-dt-oem` chạy tay, nút "Cào từ SAP", và kéo file ZSD450 trong app. Cả ba
 * đều đi qua `replaceMonth_` của dự án up-dt-oem, và chính chỗ đó ghi nhịp
 * `oem.doanh-thu` NGAY SAU KHI dữ liệu vào Sheet thật. Nên đọc một dòng nhịp là
 * đủ cho cả "tải lên", "cào" lẫn "thay đổi" — không phải cộng ba nguồn lại.
 *
 * Đọc qua `getNhipTim` (không cache) chứ không lấy ké `getBootstrap`: mốc cập
 * nhật mà đi kèm payload cache 10 phút thì nó đứng yên đúng 10 phút, tức nói
 * sai về chính thứ nó đang đo.
 */

const JOB_DOANH_THU = 'oem.doanh-thu';

/** tuoiGio do MÁY CHỦ tính (đồng hồ Google), không phải đồng hồ trình duyệt —
 *  hai đồng hồ này lệch nhau vài phút là chuyện thường, xem ntTuoiGio_. */
function moTaTuoi(tuoiGio) {
  if (tuoiGio === null || tuoiGio === undefined) return '';
  if (tuoiGio < 1) return `${Math.max(1, Math.round(tuoiGio * 60))} phút trước`;
  if (tuoiGio < 24) return `${Math.round(tuoiGio)} giờ trước`;
  return `${Math.floor(tuoiGio / 24)} ngày trước`;
}

// Ghép tay chứ không dùng toLocaleString('vi-VN'): locale này trả giờ TRƯỚC
// ngày ("07:18 13/09/2026"), mà đây là dòng "ngày cập nhật" nên ngày phải đọc
// được trước. Các phần vẫn lấy theo múi giờ máy người xem (GMT+7).
function dinhDangMoc(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hai = (n) => String(n).padStart(2, '0');
  return `${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()} ${hai(d.getHours())}:${hai(d.getMinutes())}`;
}

export default function NhipDoanhThu({ token, refreshTick }) {
  const [nhip, setNhip] = useState(null);
  const [dangDoc, setDangDoc] = useState(false);
  const [loi, setLoi] = useState('');

  const doc = useCallback(async () => {
    if (!token) return;
    setDangDoc(true);
    setLoi('');
    try {
      const d = await api.getNhipTim(token);
      const dong = (d.nhipTim || []).find((n) => n.job === JOB_DOANH_THU) || null;
      setNhip(dong);
      // `null` ở đây nghĩa là ĐỌC ĐƯỢC nhưng chưa có dòng nào cho việc này —
      // khác hẳn với không đọc được (loi). Hai trường hợp hiện hai câu khác nhau.
    } catch (err) {
      setLoi(err.message || String(err));
    } finally {
      setDangDoc(false);
    }
  }, [token]);

  useEffect(() => { doc(); }, [doc, refreshTick]);

  const oi = nhip && nhip.tinhTrang === 'oi';
  const hong = nhip && nhip.trangThai === 'loi';
  const mau = hong ? 'var(--danger-strong)' : (oi ? 'var(--warning-text)' : 'var(--text-muted)');
  const Icon = hong ? AlertCircle : (oi ? AlertTriangle : Clock);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.78rem', color: mau }}>
      <Icon size={13} />
      {loi ? (
        <span>Không đọc được mốc cập nhật ({loi})</span>
      ) : !nhip ? (
        <span>{dangDoc ? 'Đang đọc mốc cập nhật doanh thu...' : 'Chưa ghi nhận lần cập nhật doanh thu nào.'}</span>
      ) : (
        <>
          <span>
            Doanh thu cập nhật lần cuối:{' '}
            <strong style={{ color: hong || oi ? mau : 'var(--text-main)' }}>{dinhDangMoc(nhip.lanCuoi) || 'chưa rõ'}</strong>
            {nhip.tuoiGio !== null && nhip.tuoiGio !== undefined ? ` (${moTaTuoi(nhip.tuoiGio)})` : ''}
            {nhip.soDong !== null && nhip.soDong !== undefined ? ` · ${Number(nhip.soDong).toLocaleString('vi-VN')} dòng` : ''}
          </span>
          {oi && !hong && (
            <span style={{ fontWeight: 700 }}>
              — quá nhịp mong muốn{nhip.hanGio ? ` (${nhip.hanGio} giờ)` : ''}, số đang xem có thể đã cũ.
            </span>
          )}
          {hong && (
            <span style={{ fontWeight: 700 }}>— lượt cập nhật gần nhất BÁO LỖI{nhip.ghiChu ? `: ${nhip.ghiChu}` : '.'}</span>
          )}
        </>
      )}
      <button
        type="button"
        onClick={doc}
        disabled={dangDoc}
        title="Đọc lại mốc cập nhật"
        style={{ background: 'none', border: 'none', padding: '2px', cursor: dangDoc ? 'default' : 'pointer', color: 'inherit', display: 'inline-flex', opacity: dangDoc ? 0.5 : 1 }}
      >
        <RefreshCw size={12} className={dangDoc ? 'animate-spin' : undefined} />
      </button>
    </div>
  );
}
