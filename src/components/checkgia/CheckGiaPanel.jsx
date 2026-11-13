import React, { useEffect, useRef, useState } from 'react';
import { Warehouse, Ship, Inbox, Anchor } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import KhoTraGia from './KhoTraGia';
import NhapKhauForm from './NhapKhauForm';
import HopThu from './HopThu';
import YeuCauChiTiet from './YeuCauChiTiet';
import CangCuoc from './CangCuoc';

const VIEWS = [
  { id: 'kho', label: 'Giá bán từ kho', Icon: Warehouse },
  { id: 'nhapkhau', label: 'Tính giá hàng nhập khẩu', Icon: Ship },
  { id: 'hopthu', label: 'Yêu cầu đã gửi', Icon: Inbox },
  { id: 'cang', label: 'Cảng & cước', Icon: Anchor, quanTri: true }   // 13/11/2026: Admin/Creator cài cước theo cảng đi
];

/**
 * Sản phẩm & Bảng giá › Check giá bán. Giá luôn SAU VAT; Sale không thấy giá vốn.
 *  - Giá bán từ kho: tra mã → giá bán (giá vốn × 1,08 ÷ 0,92); thiếu thì "Chuyển yêu cầu VHKD".
 *  - Tính giá hàng nhập khẩu: gửi bảng hàng để VHKD tính thuế + chi phí.
 *  - Yêu cầu: Sale xem câu trả lời; Admin/Creator (tiêu đề "Hỏi giá cần kiểm tra") kiểm tra SAP / tính giá / gửi.
 * `jump` = { n, id?, view? } từ thông báo ở Dashboard: mở thẳng yêu cầu `id`.
 */
export default function CheckGiaPanel({ token, activeUser, jump, onChanged, thongBaoSo }) {
  const laQuanTri = ['admin', 'creator'].includes(String(activeUser.role || '').toLowerCase());
  const [viewSaved, setView] = usePersistentState('cg.view', laQuanTri ? 'hopthu' : 'kho');
  const views = VIEWS.filter((v) => !v.quanTri || laQuanTri);
  const view = views.some((v) => v.id === viewSaved) ? viewSaved : 'kho';
  const [openId, setOpenId] = useState(null);
  const [tick, setTick] = useState(0);
  const daAp = useRef(0);

  // Lệnh mở từ thông báo (n tăng mỗi lần): mở yêu cầu, hoặc chỉ mở hộp thư.
  useEffect(() => {
    if (!jump || !jump.n || jump.n === daAp.current) return;
    daAp.current = jump.n;
    if (jump.id) { setView('hopthu'); setOpenId(Number(jump.id)); }
    else if (jump.view && VIEWS.some((v) => v.id === jump.view)) { setView(jump.view); setOpenId(null); }
  }, [jump]); // eslint-disable-line react-hooks/exhaustive-deps

  const doi = (opts) => {
    setTick((t) => t + 1);
    if (onChanged) onChanged(opts);
  };
  const moYeuCau = (id) => { setView('hopthu'); setOpenId(id); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div role="tablist" aria-label="Chế độ Check giá bán" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {views.map(({ id, label, Icon }) => {
          const hop = id === 'hopthu';
          return (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={'btn ' + (view === id ? 'btn-primary' : 'btn-secondary')}
              onClick={() => { setView(id); if (hop) setOpenId(null); }}>
              <Icon size={16} /> {hop && laQuanTri ? 'Hỏi giá cần kiểm tra' : label}
              {hop && thongBaoSo > 0 && <span className="badge badge-rose" style={{ marginLeft: '6px' }}>{thongBaoSo}</span>}
            </button>
          );
        })}
      </div>

      {view === 'kho' && <KhoTraGia token={token} onSent={() => doi()} onOpenRequest={moYeuCau} />}
      {view === 'nhapkhau' && <NhapKhauForm token={token} onSent={() => doi()} onOpenRequest={moYeuCau} />}
      {view === 'cang' && laQuanTri && <CangCuoc token={token} />}
      {view === 'hopthu' && (openId
        ? <YeuCauChiTiet token={token} id={openId} laQuanTri={laQuanTri} onBack={() => setOpenId(null)} onChanged={doi} />
        : <HopThu token={token} laQuanTri={laQuanTri} tick={tick} onOpen={setOpenId} />)}
    </div>
  );
}
