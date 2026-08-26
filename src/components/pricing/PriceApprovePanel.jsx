import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Users, Clock } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';

const fmt = (v) => (v || 0).toLocaleString('vi-VN');
const fmtPct = (v) => {
  const n = Number(v);
  if (!isFinite(n) || v === '' || v == null) return '-';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
};

function todayStr() {
  // Không dùng new Date() trực tiếp cho input[type=date] để tránh lệch múi giờ
  // hiển thị — giá trị này chỉ là gợi ý ban đầu, Admin có thể đổi.
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Admin/Creator xem TỪNG ĐỢT đề xuất giá đang chờ duyệt (nhóm theo Mã đợt),
// sửa số nếu cần, chọn Ngày hiệu lực, rồi Duyệt (ghi thẳng vào Products hoặc
// Gia_KhachHang tuỳ đợt là giá chung hay giá riêng) hoặc Từ chối cả đợt.
export default function PriceApprovePanel({ token, onApproved }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [editedRows, setEditedRows] = useState({}); // sku -> { retail, promoQty, promoPrice }
  const [effectiveDate, setEffectiveDate] = useState(todayStr());
  const [confirmAction, setConfirmAction] = useState(null); // 'approve' | 'reject' | null
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPending = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await api.getPendingPriceProposals(token);
      setRows(result.rows || []);
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchPending(); }, [token]);

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
    return order.map((id) => groups[id]).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
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
  }, [selectedBatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCell = (sku, field, value) => {
    setEditedRows((prev) => ({ ...prev, [sku]: { ...prev[sku], [field]: value === '' ? 0 : (parseFloat(value) || 0) } }));
  };

  const handleApprove = async () => {
    if (!currentBatch) return;
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

  const handleReject = async () => {
    if (!currentBatch) return;
    setIsSubmitting(true);
    try {
      await api.rejectPriceBatch(token, currentBatch.batchId, '');
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

  if (isLoading) return <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '28px 16px' }}>Đang tải...</div>;

  if (loadError) {
    return (
      <div className="glass-card" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <span>Lỗi tải bảng chờ duyệt: {loadError}</span>
        <button onClick={fetchPending} className="btn btn-secondary btn-sm">Thử lại</button>
      </div>
    );
  }

  if (!batches.length) {
    return (
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-muted)' }}>Chưa có đợt đề xuất giá nào đang chờ duyệt.</span>
        <button onClick={fetchPending} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Tải lại</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select className="input-field" style={{ width: '320px' }} value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}>
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.submittedAt} — {b.sale}{b.clientCode ? ` — Riêng: ${b.clientCode}` : ' — Áp dụng chung'} ({b.rows.length} SKU)
              </option>
            ))}
          </select>
          <button onClick={fetchPending} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Tải lại</button>
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
            <button onClick={() => setConfirmAction('approve')} disabled={isSubmitting} className="btn btn-emerald btn-sm">
              <CheckCircle2 size={14} /> Duyệt & Áp Dụng
            </button>
          </div>
        )}
      </div>

      {currentBatch && currentBatch.clientCode && (
        <div className="glass-card" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={14} color="var(--karofi-cyan)" />
          Đợt này là giá <strong>RIÊNG</strong> cho khách hàng <strong>{currentBatch.clientCode}</strong> — duyệt sẽ ghi vào tab "Gia_KhachHang", không đổi giá chung.
        </div>
      )}

      {currentBatch && (
        <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên SP</th>
                <th style={{ textAlign: 'right', width: '130px' }}>Giá lẻ hiện tại</th>
                <th style={{ textAlign: 'right', width: '130px' }}>Giá KM hiện tại</th>
                <th style={{ textAlign: 'right', width: '140px' }}>Giá lẻ ĐX</th>
                <th style={{ textAlign: 'right', width: '110px' }}>SL KM ĐX</th>
                <th style={{ textAlign: 'right', width: '140px' }}>Giá KM ĐX</th>
                <th style={{ textAlign: 'right', width: '90px' }}>% thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {currentBatch.rows.map((r) => {
                const e = editedRows[r.sku] || {};
                return (
                  <tr key={r.sku}>
                    <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{r.sku}</td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(r.currentRetail)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-dim)' }}>{r.currentPromo ? fmt(r.currentPromo) : '-'}</td>
                    <td>
                      <input type="number" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }} value={e.retail ?? ''} onChange={(ev) => setCell(r.sku, 'retail', ev.target.value)} />
                    </td>
                    <td>
                      <input type="number" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }} value={e.promoQty ?? ''} onChange={(ev) => setCell(r.sku, 'promoQty', ev.target.value)} />
                    </td>
                    <td>
                      <input type="number" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }} value={e.promoPrice ?? ''} onChange={(ev) => setCell(r.sku, 'promoPrice', ev.target.value)} />
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 700 }}>{fmtPct(r.pctChange)}</td>
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
          message={`Sẽ ghi ngay ${currentBatch.rows.length} mã SKU vào ${currentBatch.clientCode ? `giá riêng của khách "${currentBatch.clientCode}"` : 'giá chung trên Products'}, với Ngày hiệu lực ${effectiveDate}. Không thể hoàn tác qua app.`}
          confirmLabel={isSubmitting ? 'Đang duyệt...' : 'Duyệt & Áp Dụng'}
          onConfirm={handleApprove}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'reject' && (
        <ConfirmDialog
          title="Từ chối đợt đề xuất này?"
          message={`Toàn bộ ${currentBatch.rows.length} mã SKU trong đợt sẽ chuyển sang "Từ chối" — Sale cần gửi đợt mới nếu muốn đề xuất lại.`}
          confirmLabel={isSubmitting ? 'Đang từ chối...' : 'Từ Chối'}
          destructive
          onConfirm={handleReject}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
