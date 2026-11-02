import React, { useState, useMemo, useEffect } from 'react';
import { CheckCircle2, Users, Undo2 } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import ReasonDialog from '../ReasonDialog';
import SortableTh from '../SortableTh';
import StatusBadge from '../StatusBadge';
import TableState from '../TableState';
import { useToast } from '../ToastProvider';
import { useTableSort } from '../../hooks/useTableSort';
import { doneTheoKhach, doneDong } from '../../utils/salesPlan';
import {
  TT_CHO, TT_SUA, TT_TRA_LAI_DUOC, cacThangCoKeHoach, thangMacDinh, demTheoTrangThai, locTheoTrangThai, maTraLaiDuoc
} from '../../utils/salesPlanRevision';

const fmt = (v) => (v || 0).toLocaleString('vi-VN');

// Admin/Creator duyệt kế hoạch tháng: một lần cho CẢ THÁNG (mọi dòng 'Chờ duyệt') — mirrors SopApprovePanel, không cần bước tổng hợp vì
// mỗi dòng Plan_Thang đã duy nhất theo (tháng, khách). Từ 02/11/2026 màn này còn cho Admin YÊU CẦU SỬA LẠI: chọn từng khách (hoặc cả
// tháng) đang 'Chờ duyệt' / 'Đã duyệt', ghi lý do -> dòng thành 'Cần sửa'; Sale thấy lý do ở màn Đề Xuất, sửa rồi gửi lại thì về 'Chờ duyệt'.
// Số liệu của dòng bị trả lại không bị đụng.
export default function SalesPlanApprovePanel({ token, plans, transactions, onApproved, onChanged }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [hoiSua, setHoiSua] = useState(null);     // { codes: [] | [mã...] } — hộp nhập lý do đang mở (codes rỗng = cả tháng)
  const [dangTraLai, setDangTraLai] = useState(false);
  const [locTT, setLocTT] = useState('ALL');
  const [chon, setChon] = useState(() => new Set());

  const monthsAll = useMemo(() => cacThangCoKeHoach(plans), [plans]);
  const [monthSaved, setMonth] = useState(() => thangMacDinh(plans));
  // Tháng đã chọn mà không còn dòng nào (vd vừa trả lại hết) -> về tháng mặc định thay vì để ô chọn trống.
  const month = monthsAll.includes(monthSaved) ? monthSaved : thangMacDinh(plans);

  const rowsThang = useMemo(() => plans.filter(p => p.month === month), [plans, month]);
  const dem = useMemo(() => demTheoTrangThai(rowsThang), [rowsThang]);
  const shownRows = useMemo(() => locTheoTrangThai(rowsThang, locTT), [rowsThang, locTT]);
  const pendingRows = useMemo(() => rowsThang.filter(p => p.status === TT_CHO), [rowsThang]);
  const traLaiDuoc = useMemo(() => rowsThang.filter(p => TT_TRA_LAI_DUOC.includes(p.status)), [rowsThang]);

  // Đổi tháng / đổi bộ lọc: bỏ chọn các khách không còn hiển thị (lựa chọn luôn nằm trong tập đang hiện).
  useEffect(() => {
    setChon(prev => {
      if (!prev.size) return prev;
      const hien = new Set(shownRows.map(p => p.searchCode));
      const next = new Set([...prev].filter(c => hien.has(c)));
      return next.size === prev.size ? prev : next;
    });
  }, [shownRows]);
  const chonHopLe = useMemo(() => maTraLaiDuoc(shownRows, chon), [shownRows, chon]);

  // Doanh thu đã thực hiện của đúng tháng đang duyệt — người duyệt cần đối
  // chiếu kế hoạch đề xuất với số khách đã mua thật, không chỉ với KPI năm.
  // Tính từ tab Data, xem doneTheoKhach().
  const doneByCode = useMemo(() => doneTheoKhach(transactions, month), [transactions, month]);

  // Sắp xếp theo cột (Đợt 2 / mục 3). Cột "Doanh thu done" tính từ Data nên cần `get`.
  const cols = useMemo(() => [
    { key: 'searchCode' }, { key: 'clientName' }, { key: 'sale' }, { key: 'status' },
    { key: 'planKpi', type: 'number' },
    ...['w1', 'w2', 'w3', 'w4', 'w5'].map((k) => ({ key: k, type: 'number' })),
    { key: 'planUpdate', type: 'number' },
    { key: 'done', type: 'number', get: (p) => doneDong(p, p.searchCode, doneByCode).value },
    { key: 'note' }
  ], [doneByCode]);
  const { rows: sortedRows, sort, onSort } = useTableSort(shownRows, cols);

  const totals = useMemo(() => shownRows.reduce((acc, p) => {
    acc.planKpi += p.planKpi || 0;
    acc.planUpdate += p.planUpdate || 0;
    acc.w1 += p.w1 || 0; acc.w2 += p.w2 || 0; acc.w3 += p.w3 || 0; acc.w4 += p.w4 || 0; acc.w5 += p.w5 || 0;
    acc.done += doneDong(p, p.searchCode, doneByCode).value;
    return acc;
  }, { planKpi: 0, planUpdate: 0, w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, done: 0 }), [shownRows, doneByCode]);

  const handleApprove = async () => {
    if (isApproving) return; // chặn bấm Duyệt lần hai khi lượt đầu chưa về
    setIsApproving(true);
    try {
      const result = await api.approveSalesPlan(token, month);
      toast.success(`Đã duyệt ${result.approvedCount} kế hoạch cho tháng ${result.thang}.`);
      setConfirming(false);
      if (onApproved) onApproved();
    } catch (err) {
      toast.error('Không duyệt được kế hoạch: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  // Trả lại để Sale sửa: codes rỗng = cả tháng (server chỉ đổi các dòng đang Chờ duyệt / Đã duyệt).
  const handleTraLai = async (lyDo) => {
    if (dangTraLai || !hoiSua) return; // chặn gửi trùng khi lượt đầu chưa về
    setDangTraLai(true);
    try {
      const r = await api.requestSalesPlanRevision(token, month, hoiSua.codes, lyDo);
      toast.success(`Đã yêu cầu Sale sửa lại ${r.count} khách của tháng ${r.thang}.`);
      setHoiSua(null);
      setChon(new Set());
      if (onChanged) onChanged();
    } catch (err) {
      toast.error('Không gửi được yêu cầu sửa: ' + err.message);
    } finally {
      setDangTraLai(false);
    }
  };

  const toggleRow = (code) => setChon(prev => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  const traLaiHienThi = shownRows.filter(p => TT_TRA_LAI_DUOC.includes(p.status)).map(p => p.searchCode);
  const chonTatCa = traLaiHienThi.length > 0 && traLaiHienThi.every(c => chon.has(c));
  const toggleTatCa = () => setChon(chonTatCa ? new Set() : new Set(traLaiHienThi));

  if (!monthsAll.length) {
    return <TableState isEmpty emptyText="Không có tháng nào đang chờ duyệt." />;
  }

  const nhanTrangThai = (p) => (
    <>
      <StatusBadge status={p.status} />
      {p.status === TT_SUA && p.revisionNote && (
        <div style={{ fontSize: '0.7rem', color: 'var(--danger)', marginTop: '3px', maxWidth: '220px', lineHeight: 1.35 }} title={`${p.revisionBy || 'Admin'}${p.revisionAt ? ' · ' + p.revisionAt : ''}`}>
          {p.revisionNote}
        </div>
      )}
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <select className="input-field" style={{ width: '160px' }} value={month} onChange={(e) => { setMonth(e.target.value); setChon(new Set()); }} aria-label="Tháng kế hoạch">
            {monthsAll.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="input-field" style={{ width: '170px' }} value={locTT} onChange={(e) => setLocTT(e.target.value)} aria-label="Lọc theo trạng thái">
            <option value="ALL">Tất cả trạng thái ({dem.tong})</option>
            <option value="Chờ duyệt">Chờ duyệt ({dem.cho})</option>
            <option value="Đã duyệt">Đã duyệt ({dem.duyet})</option>
            <option value="Cần sửa">Cần sửa ({dem.sua})</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button" onClick={() => setHoiSua({ codes: chonHopLe })} disabled={!chonHopLe.length}
            className="btn btn-secondary btn-sm" title="Trả các khách đã chọn về cho Sale sửa lại (kèm lý do)"
          >
            <Undo2 size={14} aria-hidden="true" /> Yêu cầu sửa lại ({chonHopLe.length})
          </button>
          <button
            type="button" onClick={() => setHoiSua({ codes: [] })} disabled={!traLaiDuoc.length}
            className="btn btn-secondary btn-sm" title="Trả cả tháng (mọi khách đang Chờ duyệt / Đã duyệt) về cho Sale sửa lại"
          >
            <Undo2 size={14} aria-hidden="true" /> Yêu cầu sửa cả tháng
          </button>
          <button onClick={() => setConfirming(true)} disabled={!pendingRows.length} className="btn btn-primary btn-sm">
            <CheckCircle2 size={14} /> Duyệt Toàn Bộ Tháng {month}{pendingRows.length ? ` (${pendingRows.length})` : ''}
          </button>
        </div>
      </div>

      <TableState isEmpty={shownRows.length === 0} emptyText="Không có khách nào ở trạng thái này." emptyHint="Đổi bộ lọc trạng thái ở trên.">
        <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox" style={{ width: '16px', height: '16px' }} aria-label="Chọn tất cả khách có thể trả lại"
                    checked={chonTatCa} disabled={!traLaiHienThi.length} onChange={toggleTatCa}
                  />
                </th>
                <SortableTh col="searchCode" sort={sort} onSort={onSort}>Mã KH</SortableTh>
                <SortableTh col="clientName" sort={sort} onSort={onSort}>Khách hàng</SortableTh>
                <SortableTh col="sale" sort={sort} onSort={onSort}><Users size={12} /> SALE</SortableTh>
                <SortableTh col="status" sort={sort} onSort={onSort}>Trạng thái</SortableTh>
                <SortableTh col="planKpi" sort={sort} onSort={onSort} align="right" style={{ width: '140px' }}>Plan KPI</SortableTh>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SortableTh key={n} col={'w' + n} sort={sort} onSort={onSort} align="right" style={{ width: '120px' }}>Tuần {n}</SortableTh>
                ))}
                <SortableTh col="planUpdate" sort={sort} onSort={onSort} align="right" style={{ width: '140px' }}>Plan update</SortableTh>
                <SortableTh col="done" sort={sort} onSort={onSort} align="right" style={{ width: '140px' }}>Doanh thu done</SortableTh>
                <SortableTh col="note" sort={sort} onSort={onSort}>Note</SortableTh>
              </tr>
            </thead>
            <tbody>
              <tr className="top-summary-row">
                <td colSpan={5} style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>Σ TỔNG CỘNG ({shownRows.length} khách đang hiện)</td>
                <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.planKpi)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w1)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w2)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w3)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w4)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w5)}</td>
                <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.planUpdate)}</td>
                <td style={{ textAlign: 'right', color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.done)}</td>
                <td />
              </tr>
              {sortedRows.map((p, idx) => {
                const duoc = TT_TRA_LAI_DUOC.includes(p.status);
                return (
                  <tr key={`${p.searchCode}_${idx}`} className={chon.has(p.searchCode) ? 'sop-row-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox" style={{ width: '16px', height: '16px' }}
                        checked={chon.has(p.searchCode)} disabled={!duoc} onChange={() => toggleRow(p.searchCode)}
                        aria-label={`Chọn ${p.searchCode}`}
                        title={duoc ? undefined : 'Đã yêu cầu sửa — đang chờ Sale gửi lại'}
                      />
                    </td>
                    <td className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)', fontSize: '0.8rem' }}>{p.searchCode}</td>
                    <td style={{ fontWeight: 600 }}>{p.clientName}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.sale}</td>
                    <td>{nhanTrangThai(p)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.planKpi)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.w1)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.w2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.w3)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.w4)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(p.w5)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{fmt(p.planUpdate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(doneDong(p, p.searchCode, doneByCode).value)}</td>
                    <td style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>{p.note || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TableState>

      {confirming && (
        <ConfirmDialog
          title={`Duyệt toàn bộ kế hoạch tháng ${month}?`}
          message={`Sẽ đánh dấu Đã duyệt cho toàn bộ ${pendingRows.length} khách hàng đang chờ duyệt của tháng ${month}. Không thể duyệt lại từng dòng riêng sau khi xác nhận.`}
          confirmLabel={`Duyệt kế hoạch ${month}`}
          busy={isApproving}
          busyLabel="Đang duyệt..."
          onConfirm={handleApprove}
          onCancel={() => setConfirming(false)}
        />
      )}

      {hoiSua && (
        <ReasonDialog
          title={hoiSua.codes.length ? `Yêu cầu Sale sửa lại ${hoiSua.codes.length} khách?` : `Yêu cầu Sale sửa lại cả tháng ${month}?`}
          message={hoiSua.codes.length
            ? `Các khách đã chọn của tháng ${month} chuyển sang "Cần sửa" kèm lý do bên dưới. Số liệu giữ nguyên; Sale thấy lý do ở màn Đề Xuất, sửa rồi gửi lại thì quay về "Chờ duyệt".`
            : `Mọi khách đang "Chờ duyệt" hoặc "Đã duyệt" của tháng ${month} (${traLaiDuoc.length} khách) chuyển sang "Cần sửa" kèm lý do bên dưới. Khách đã ở "Cần sửa" giữ lý do cũ. Số liệu giữ nguyên.`}
          reasonLabel="Lý do yêu cầu sửa (Sale sẽ đọc)"
          placeholder="VD: Tuần 2 thấp hơn KPI, cần rà lại với khách…"
          confirmLabel="Gửi yêu cầu sửa"
          busy={dangTraLai}
          busyLabel="Đang gửi..."
          onConfirm={handleTraLai}
          onCancel={() => { if (!dangTraLai) setHoiSua(null); }}
        />
      )}
    </div>
  );
}
