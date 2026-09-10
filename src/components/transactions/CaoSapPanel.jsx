import React, { useState, useRef, useEffect } from 'react';
import { Zap, Loader2, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import * as api from '../../services/api';

/**
 * Nút "Cào từ SAP" — chạy thẳng bộ script trên máy có SAP, không qua terminal.
 *
 * CÁCH NÓ CHẠY ĐƯỢC: một trang web KHÔNG khởi chạy được tiến trình trên máy
 * người dùng — trình duyệt nào cũng chặn, và chặn có chủ đích. Cầu ở đây là một
 * GIAO THỨC RIÊNG đã đăng ký trong registry:
 *
 *   nút bấm → karofi-oem://dt-oem?month=YYYY-MM
 *           → wscript chay.vbs (lọc chuỗi bằng danh sách cho phép)
 *           → dieu-phoi.ps1 → export_zsd450.py → push_to_sheet.py → tab Data
 *
 * Cài bằng `Scripts/karofi-oem-protocol/cai-dat.ps1`, chỉ trên máy có SAP.
 *
 * ĐƯỜNG VỀ LÀ NHỊP TIM, KHÔNG PHẢI HTTP. Giao thức riêng là MỘT CHIỀU: trình
 * duyệt giao URL cho Windows rồi quên luôn — không có chỗ nào để trả kết quả,
 * cũng không có cách nào biết giao thức đã cài hay chưa (trình duyệt cố tình
 * không cho biết). Nên bộ điều phối ghi trạng thái vào dòng nhịp tim
 * `oem.doanh-thu.nut`, và màn này hỏi vòng dòng đó.
 *
 * SO MỐC VỚI CHÍNH NÓ, KHÔNG SO VỚI ĐỒNG HỒ MÁY. `lanCuoi` do máy chủ Google
 * ghi, còn `Date.now()` là đồng hồ trình duyệt — hai đồng hồ khác nhau, lệch
 * vài phút là chuyện thường. Nên trước khi bấm ta chụp lại mốc hiện tại, rồi
 * chờ nó ĐỔI. Phép so một giá trị với chính nó thì không phụ thuộc đồng hồ nào.
 */

const JOB_NUT = 'oem.doanh-thu.nut';
const JOB_DATA = 'oem.doanh-thu';

const NHIP_MS = 5000;
// Chưa thấy nhịp nào nhúc nhích sau ngần này thì gần như chắc chắn là chưa cài
// giao thức (hoặc trình duyệt chặn). Bộ điều phối ghi nhịp "đang chạy" ngay
// dòng đầu, trước cả khi gọi SAP, nên 25 giây là rất rộng rãi.
const CHO_KHOI_DONG_MS = 25000;
// Cào SAP một tháng mất khoảng một phút. 6 phút là để dành cho tháng nhiều dòng
// và mạng chậm — quá đó thì có gì đó đã chết, và bảo người dùng đi xem nhật ký
// thì đúng hơn là quay vòng mãi.
const CHO_TOI_DA_MS = 6 * 60 * 1000;

const thangHienTai = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** 12 tháng gần nhất, mới nhất trước. */
const cacThang = () => {
  const out = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
};

const tim = (ds, job) => (ds || []).find((n) => n.job === job) || null;

export default function CaoSapPanel({ token, activeUser, onImported }) {
  const [thang, setThang] = useState(thangHienTai());
  const [pha, setPha] = useState('nghi'); // nghi | choKhoiDong | dangChay | xong | loi | khongCai
  const [loi, setLoi] = useState('');
  const [ketQua, setKetQua] = useState('');
  const dungRef = useRef(false);

  // Vòng hỏi phải dừng khi rời màn — không thì nó chạy tiếp trong nền và gọi
  // setState trên một component đã gỡ.
  useEffect(() => () => { dungRef.current = true; }, []);

  const coQuyen = ['admin', 'creator'].includes(activeUser?.role);
  const dangBan = pha === 'choKhoiDong' || pha === 'dangChay';

  const doNhip = async () => {
    const d = await api.getNhipTim(token);
    return d.nhipTim || [];
  };

  const chay = async () => {
    setLoi(''); setKetQua(''); dungRef.current = false;

    // 1. Chụp mốc TRƯỚC khi bấm.
    let mocNut = null, mocData = null;
    try {
      const ds = await doNhip();
      mocNut = (tim(ds, JOB_NUT) || {}).lanCuoi || '';
      mocData = (tim(ds, JOB_DATA) || {}).lanCuoi || '';
    } catch (e) {
      setPha('loi');
      setLoi('Không đọc được nhịp tim để theo dõi lượt chạy: ' + e.message);
      return;
    }

    // 2. Gọi giao thức. Không có phản hồi nào từ bước này, kể cả khi thất bại.
    setPha('choKhoiDong');
    window.location.href = `karofi-oem://dt-oem?month=${thang}`;

    // 3. Hỏi vòng. Dùng vòng lặp tuần tự chứ không setInterval: một nhịp chậm
    //    thì nhịp sau chờ, không chồng lên nhau.
    const batDau = Date.now();
    let daKhoiDong = false;

    while (!dungRef.current) {
      await new Promise((r) => setTimeout(r, NHIP_MS));
      if (dungRef.current) return;

      let ds;
      try {
        ds = await doNhip();
      } catch (e) {
        continue; // một nhịp hỏng thì nhịp sau hỏi lại
      }

      const nut = tim(ds, JOB_NUT);
      const nutDoi = nut && (nut.lanCuoi || '') !== mocNut;

      if (!daKhoiDong && nutDoi) { daKhoiDong = true; setPha('dangChay'); }

      if (!daKhoiDong && Date.now() - batDau > CHO_KHOI_DONG_MS) {
        setPha('khongCai');
        return;
      }

      // 'dang-chay' là hợp đồng với dieu-phoi.ps1 — xem chú thích đầu file.
      if (daKhoiDong && nut && nut.trangThai !== 'dang-chay') {
        if (nut.trangThai === 'loi') {
          setPha('loi');
          setLoi(nut.ghiChu || 'Lượt chạy báo lỗi nhưng không kèm lý do.');
          return;
        }
        setPha('xong');
        setKetQua(nut.ghiChu || 'Xong.');
        // Chỉ tải lại khi dòng DỮ LIỆU cũng đổi. Có ca chạy xong mà không ghi
        // gì (SAP chưa có chứng từ tháng này) — tải lại lúc đó là bắt người
        // dùng chờ một lượt đọc vô ích.
        const data = tim(ds, JOB_DATA);
        if (data && (data.lanCuoi || '') !== mocData && onImported) onImported();
        return;
      }

      if (Date.now() - batDau > CHO_TOI_DA_MS) {
        setPha('loi');
        setLoi('Lượt chạy quá 6 phút mà chưa báo xong. Xem ' +
               'Scripts\\karofi-oem-protocol\\nhat-ky.log trên máy có SAP.');
        return;
      }
    }
  };

  if (!coQuyen) return null;

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Zap size={24} color="var(--warning-text, #B45309)" />
        </div>
        <div style={{ flex: '1', minWidth: '240px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Cào thẳng từ SAP</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Chạy bộ script trên máy có SAP: xuất ZSD450 rồi ghi vào tab Data, không phải mở terminal.
            Chỉ dùng được trên <strong>máy đã cài trình chạy</strong> và <strong>đã đăng nhập SAP</strong>.
          </p>
        </div>
        <select
          className="input-field"
          style={{ width: '130px' }}
          value={thang}
          disabled={dangBan}
          onChange={(e) => setThang(e.target.value)}
        >
          {cacThang().map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="btn btn-primary" onClick={chay} disabled={dangBan}>
          {dangBan ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          {dangBan ? 'Đang chạy…' : 'Cào tháng ' + thang}
        </button>
      </div>

      {pha === 'choKhoiDong' && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Đã gửi lệnh sang máy. Đang chờ trình chạy báo về…
        </div>
      )}

      {pha === 'dangChay' && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Trình chạy đã nhận. Đang xuất ZSD450 từ SAP rồi ghi lên Sheet — việc này thường mất khoảng một phút.
        </div>
      )}

      {pha === 'xong' && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.85rem', color: 'var(--success-text, #167453)' }}>
          <CheckCircle2 size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{ketQua}</span>
        </div>
      )}

      {pha === 'loi' && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.85rem', color: 'var(--critical-text, #DC2626)' }}>
          <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{loi}</span>
        </div>
      )}

      {pha === 'khongCai' && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.85rem', color: 'var(--warning-text, #B45309)' }}>
          <HelpCircle size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong>Không thấy trình chạy trả lời.</strong>
            <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
              Ba lý do có thể, theo thứ tự hay gặp: máy này chưa cài trình chạy
              (chạy <code>Scripts\karofi-oem-protocol\cai-dat.ps1</code> trên máy có SAP);
              trình duyệt đã chặn hoặc anh bấm "Huỷ" ở hộp thoại xác nhận;
              hoặc SAP GUI chưa mở và đăng nhập.
              <div style={{ marginTop: '6px' }}>
                Muốn biết hỏng chỗ nào: dán <code>karofi-oem://tu-kiem</code> vào cửa sổ Run (Win+R)
                trên máy có SAP, rồi xem <code>nhat-ky.log</code> — nó kiểm cả chuỗi mà không đụng SAP
                và không ghi dữ liệu nào.
              </div>
              <div style={{ marginTop: '6px' }}>
                Nếu đây không phải máy có SAP thì dùng <strong>Nhập ZSD450</strong> ngay bên dưới —
                kéo file vào, chạy ở đâu cũng được.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
