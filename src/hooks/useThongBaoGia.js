import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../services/api';

const NHIP_MS = 60000;
const VAI_TRO = ['sale', 'admin', 'creator'];

/**
 * Thông báo Check giá bán (07/11/2026): Admin/Creator "Hỏi giá cần kiểm tra (n)", Sale "Hỏi giá được trả lời (n)".
 * Hỏi máy chủ mỗi phút khi tab đang hiện + khi quay lại tab + khi gọi `reload()` (sau khi gửi / trả lời). Lỗi mạng giữ số cũ, không báo ồn.
 * Chưa chạy SQL đợt 29 -> máy chủ trả { bat:false } -> không hiện gì.
 */
export function useThongBaoGia(token, role) {
  const [tb, setTb] = useState(null);
  const dangHoi = useRef(false);
  const hoiLai = useRef(false);   // có lệnh reload trong lúc đang hỏi -> hỏi thêm một lượt khi xong (số cũ không được thắng)
  const dung = VAI_TRO.includes(String(role || '').toLowerCase()) && !!token;

  const reload = useCallback(async () => {
    if (!dung) return;
    if (dangHoi.current) { hoiLai.current = true; return; }
    dangHoi.current = true;
    try {
      do { hoiLai.current = false; setTb(await api.cgThongBao(token)); } while (hoiLai.current);
    } catch (e) { /* giữ số cũ */ } finally { dangHoi.current = false; hoiLai.current = false; }
  }, [token, dung]);

  useEffect(() => {
    if (!dung) { setTb(null); return undefined; }
    reload();
    const h = setInterval(() => { if (!document.hidden) reload(); }, NHIP_MS);
    const onVis = () => { if (!document.hidden) reload(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(h); document.removeEventListener('visibilitychange', onVis); };
  }, [dung, reload]);

  return { tb, reload };
}
