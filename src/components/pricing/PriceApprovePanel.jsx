import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Users, Clock } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import ReasonDialog from '../ReasonDialog';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import { useToast } from '../ToastProvider';
import { vnToday, hienNgay, sapXepNgay } from '../../utils/vnDate';
import { useTableSort } from '../../hooks/useTableSort';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';

const KHONG_DONG = [];
// Cột sắp xếp được: chỉ các cột KHÔNG sửa được (sắp theo ô đang gõ thì dòng nhảy chỗ).
const COLS = [
  { key: 'sku' }, { key: 'name' },
  { key: 'currentRetail', type: 'number' }, { key: 'currentPromo', type: 'number' },
  { key: 'pctChange', type: 'number' }
];

const fmt = (v) => (v || 0).toLocaleString('vi-VN');
const fmtPct = (v) => {
  const n = Number(v);
  if (!isFinite(n) || v === '' || v == null) return '-';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
};

// Gợi ý ban đầu cho Ngày hiệu lực: hôm nay THEO GIỜ VIỆT NAM (utils/vnDate.js). Cách cũ
// ghép getFullYear/getMonth/getDate theo múi giờ của máy nên máy đặt sai múi giờ ra nhầm ngày.
const todayStr = () => vnToday();

// Admin/Creator xem TỪNG ĐỢT đề xuất giá đang chờ duyệt (nhóm theo Mã đợt),
// sửa số nếu cần, chọn Ngày hiệu lực, rồi Duyệt (ghi thẳng vào Products hoặc
// Gia_KhachHang tuỳ đợt là giá chung hay giá riêng) hoặc Từ chối cả đợt.
// Cột Giá vốn (VAT)/LNG % chỉ hiện cho Creator — theo đúng yêu cầu, Admin
// duyệt được giá nhưng không xem giá vốn.
export default function PriceApprovePanel({ token, activeUser, refreshTick, onApproved }) {
  const toast = useToast();
  const isCreator = activeUser.role === 'creator';
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [editedRows, setEditedRows] = useState({}); // sku -> { retail, promoQty, promoPrice }
  const [effectiveDate, setEffectiveDate] = useState(todayStr());
  // Ảnh chụp số lúc mở đợt: khác ảnh chụp = người duyệt đã sửa số, chưa Duyệt (Đợt 2 / mục 5).
  const [editedInit, setEditedInit] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // 'approve' | 'reject' | null
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [costBySku, setCostBySku] = useState({});

  // Perf (2026-08-26): getPendingPriceProposals giờ gộp luôn costBySku cho
  // Creator trong CÙNG 1 lượt gọi — trước đây màn này mở lên phải chờ 2 API
  // tuần tự (danh sách chờ duyệt, rồi mới giá vốn).
  // forceRefresh: nút "Tải lại" ép backend đọc lại tab Gia_DeXuat (cache 90s chỉ
  // tự dọn khi app gửi/duyệt/từ chối đợt). `=== true` vì nút truyền thẳng hàm
  // này vào onClick sẽ đưa Event vào tham số đầu.
  const fetchPending = async (forceRefresh) => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await api.getPendingPriceProposals(token, forceRefresh === true);
      setRows(result.rows || []);
      if (isCreator) setCostBySku(result.costBySku || {});
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // refreshTick: panel này không còn remount khi chuyển sub-tab (KeepAliveTab),
  // nên nó không tự biết là Sale vừa gửi thêm đợt đề xuất hoặc Creator vừa nhập
  // giá vốn mới ở sub-tab bên cạnh — ProductPricing tăng tick để báo.
  useEffect(() => { fetchPending(); }, [token, refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const batches = useMemo(() => {
    const order = [];
    const groups = {};
    rows.forEach((r) => {
      if (!groups[r.batchId]) {
        groups[r.batchId] = { batchId: r.batchId, sale: r.sale, clientCode: r.clientCode, submittedAt: r.submittedAt, rows: [] };
        order.push(r.batchId);
      }
      groups[r.batchId].rows.push(r);
    });
    // Mới nhất trước. So theo thời điểm đã đọc (dd/MM/yyyy HH:mm so như chữ sẽ sai khi qua tháng).
    return order.map((id) => groups[id]).sort((a, b) => {
      const x = sapXepNgay(a.submittedAt), y = sapXepNgay(b.submittedAt);
      if (isNaN(x) || isNaN(y)) return a.submittedAt < b.submittedAt ? 1 : -1;
      return y - x;
    });
  }, [rows]);

  useEffect(() => {
    if (!selectedBatch && batches.length) setSelectedBatch(batches[0].batchId);
  }, [batches, selectedBatch]);

  const currentBatch = batches.find((b) => b.batchId === selectedBatch);

  useEffect(() => {
    if (!currentBatch) return;
    const init = {};
    currentBatch.rows.forEach((r) => {
      init[r.sku] = { retail: r.retailPropose, promoQty: r.promoQtyPropose, promoPrice: r.promoPricePropose };
    });
    setEditedRows(init);
    setEditedInit(JSON.stringify(init));
  }, [selectedBatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sắp xếp theo cột + cảnh báo mất số đã sửa — phải đặt TRƯỚC các `return` sớm bên dưới (quy tắc hook).
  const { rows: sortedRows, sort, onSort } = useTableSort(currentBatch ? currentBatch.rows : KHONG_DONG, COLS);
  useUnsavedGuard(!!currentBatch && !!editedInit && JSON.stringify(editedRows) !== editedInit, 'Duyệt giá');

  const setCell = (sku, field, value) => {
    // Số âm không có nghĩa với giá/SL: kẹp về 0 (ô cũng có min=0).
    setEditedRows((prev) => ({ ...prev, [sku]: { ...prev[sku], [field]: value === '' ? 0 : Math.max(0, parseFloat(value) || 0) } }));
  };

  // LNG % = (Giá đề xuất - Giá vốn+VAT) / Giá đề xuất — cả 2 vế đều sau VAT
  // theo đúng yêu cầu ("Cost + VAT để so với giá đề xuất sau VAT"). null khi
  // chưa có giá vốn cho SKU này — hiện cảnh báo thay vì %.
  const marginFor = (sku, retailValue) => {
    const cost = costBySku[sku];
    if (!cost || !retailValue) return null;
    return ((retailValue - cost.costWithVat) / retailValue) * 100;
  };

  const handleApprove = async () => {
    if (!currentBatch || isSubmitting) return; // chặn gửi trùng khi lượt đầu chưa về
    setIsSubmitting(true);
    try {
      const overrideRows = currentBatch.rows.map((r) => ({ sku: r.sku, ...editedRows[r.sku] }));
      const result = await api.approvePriceBatch(token, currentBatch.batchId, effectiveDate, overrideRows);
      toast.success(`Đã duyệt và áp dụng giá mới cho ${result.appliedCount} mã SKU.`);
      setConfirmAction(null);
      setSelectedBatch('');
      fetchPending();
      if (onApproved) onApproved();
    } catch (err) {
      toast.error('Không duyệt được: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Lý do từ chối bắt buộc (Đợt 3), gửi kèm làm tham số `note` của rejectPriceBatch — server đã nhận và lưu
  // vào cột note của đợt (oem.price_proposals.note). Sale chưa xem lại được lý do trên màn hình: chưa có endpoint
  // trả đợt đã từ chối (xem báo cáo Đợt 3).
  const handleReject = async (lyDo) => {
    if (!currentBatch || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.rejectPriceBatch(token, currentBatch.batchId, String(lyDo || '').trim());
      toast.success('Đã từ chối đợt đề xuất này.');
      setConfirmAction(null);
      setSelectedBatch('');
      fetchPending();
    } catch (err) {
      toast.error('Không từ chối được: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tải / lỗi / rỗng dùng chung một mẫu (TableState): lỗi luôn có Thử lại, không kẹt "Đang tải…".
  if (isLoading || loadError || !batches.length) {
    return (
      <TableState
        loading={isLoading}
        error={loadError}
        isEmpty={!batches.length}
        errorPrefix="Lỗi tải bảng chờ duyệt"
        loadingLabel="Đang tải các đợt đề xuất giá..."
        emptyText="Chưa có đợt đề xuất giá nào đang chờ duyệt."
        emptyAction={<button onClick={() => fetchPending(true)} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Tải lại</button>}
        onRetry={() => fetchPending(true)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select className="input-field" style={{ width: '320px' }} value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}>
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {hienNgay(b.submittedAt)} — {b.sale}{b.clientCode ? ` — Riêng: ${b.clientCode}` : ' — Áp dụng chung'} ({b.rows.length} SKU)
              </option>
            ))}
          </select>
          <button onClick={() => fetchPending(true)} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Tải lại</button>
        </div>

        {currentBatch && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <Clock size={14} /> Ngày hiệu lực:
              <input type="date" className="input-field" style={{ width: '160px' }} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </label>
            <button onClick={() => setConfirmAction('reject')} disabled={isSubmitting} className="btn btn-secondary btn-sm">
              <XCircle size={14} /> Từ Chối
            </button>
            <button onClick={() => setConfirmAction('approve')} disabled={isSubmitting} className="btn btn-primary btn-sm">
              <CheckCircle2 size={14} /> Duyệt & Áp Dụng
            </button>
          </div>
        )}
      </div>

      {currentBatch && currentBatch.clientCode && (
        <div className="glass-card" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={14} color="var(--karofi-cyan)" />
          Đợt này là giá <strong>RIÊNG</strong> cho khách hàng <strong>{currentBatch.clientCode}</strong> — duyệt sẽ ghi vào bảng giá riêng của khách, không đổi giá chung.
        </div>
      )}

      {currentBatch && (
        <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <SortableTh col="sku" sort={sort} onSort={onSort}>Mã</SortableTh>
                <SortableTh col="name" sort={sort} onSort={onSort}>Tên SP</SortableTh>
                <SortableTh col="currentRetail" sort={sort} onSort={onSort} align="right" style={{ width: '130px' }}>Giá lẻ hiện tại</SortableTh>
                <SortableTh col="currentPromo" sort={sort} onSort={onSort} align="right" style={{ width: '130px' }}>Giá KM hiện tại</SortableTh>
                <th style={{ textAlign: 'right', width: '140px' }}>Giá lẻ ĐX</th>
                <th style={{ textAlign: 'right', width: '110px' }}>SL KM ĐX</th>
                <th style={{ textAlign: 'right', width: '140px' }}>Giá KM ĐX</th>
                <SortableTh col="pctChange" sort={sort} onSort={onSort} align="right" style={{ width: '90px' }}>% thay đổi</SortableTh>
                {isCreator && <th style={{ textAlign: 'right', width: '130px' }}>Giá vốn (VAT)</th>}
                {isCreator && <th style={{ textAlign: 'right', width: '90px' }}>LNG %</th>}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const e = editedRows[r.sku] || {};
                const cost = costBySku[r.sku];
                const margin = isCreator ? marginFor(r.sku, e.retail) : null;
                return (
                  <tr key={r.sku}>
                    <td className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)', fontSize: '0.8rem' }}>{r.sku}</td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(r.currentRetail)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-dim)' }}>{r.currentPromo ? fmt(r.currentPromo) : '-'}</td>
                    <td>
                      <input type="number" min="0" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }} value={e.retail ?? ''} onChange={(ev) => setCell(r.sku, 'retail', ev.target.value)} />
                    </td>
                    <td>
                      <input type="number" min="0" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }} value={e.promoQty ?? ''} onChange={(ev) => setCell(r.sku, 'promoQty', ev.target.value)} />
                    </td>
                    <td>
                      <input type="number" min="0" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }} value={e.promoPrice ?? ''} onChange={(ev) => setCell(r.sku, 'promoPrice', ev.target.value)} />
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 700 }}>{fmtPct(r.pctChange)}</td>
                    {isCreator && (
                      <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                        {cost ? fmt(cost.costWithVat) : <span style={{ color: 'var(--danger)' }} title="Chưa có giá vốn cho SKU này">⚠️ Chưa có</span>}
                      </td>
                    )}
                    {isCreator && (
                      <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 700, color: margin == null ? 'var(--text-dim)' : (margin >= 0 ? 'var(--accent-emerald-text)' : 'var(--danger)') }}>
                        {margin == null ? '-' : `${margin.toFixed(1)}%`}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmAction === 'approve' && (
        <ConfirmDialog
          title="Duyệt và áp dụng đợt giá này?"
          message={`Sẽ ghi ngay ${currentBatch.rows.length} mã SKU vào ${currentBatch.clientCode ? `giá riêng của khách "${currentBatch.clientCode}"` : 'giá chung của danh mục sản phẩm'}, với Ngày hiệu lực ${effectiveDate}. Không thể hoàn tác qua app.`}
          confirmLabel="Duyệt & Áp Dụng"
          busy={isSubmitting}
          busyLabel="Đang duyệt..."
          onConfirm={handleApprove}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'reject' && (
        <ReasonDialog
          title="Từ chối đợt đề xuất này?"
          message={`Toàn bộ ${currentBatch.rows.length} mã SKU trong đợt sẽ chuyển sang "Từ chối" — Sale cần gửi đợt mới nếu muốn đề xuất lại.`}
          reasonLabel="Lý do từ chối"
          placeholder="VD: Giá lẻ thấp hơn giá vốn, đề nghị Sale xem lại…"
          confirmLabel="Từ Chối"
          busy={isSubmitting}
          busyLabel="Đang từ chối..."
          danger
          onConfirm={handleReject}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
