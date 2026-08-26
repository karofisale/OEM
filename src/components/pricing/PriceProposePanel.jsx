import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Save, Users } from 'lucide-react';
import * as api from '../../services/api';
import Pagination, { usePagedSlice } from '../Pagination';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';

const PAGE_SIZE = 25;
const fmt = (v) => (v || 0).toLocaleString('vi-VN');

const parseDigits = (text) => {
  const digits = String(text).replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
};
const formatDigits = (v) => (v ? Number(v).toLocaleString('vi-VN') : '');

// Sale (hoặc Admin/Creator) chọn nhiều SKU, nhập Giá lẻ/SL KM/Giá KM đề xuất,
// gửi 1 lần thành 1 "đợt" (Mã đợt) — mỗi lần Gửi luôn tạo đợt MỚI, không
// upsert vào đợt cũ (khác với SOP: không có khái niệm "kỳ" ở đây, muốn sửa
// thì gửi đợt mới, Admin tự chọn duyệt đúng đợt hoặc từ chối đợt sai).
// Chọn "Khách hàng" cụ thể thay vì "Áp dụng chung" biến đây thành đề xuất
// giá RIÊNG chỉ cho khách đó (không đụng giá chung trên Products).
export default function PriceProposePanel({ token, materials, clients, activeUser, onSubmitted }) {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [clientCode, setClientCode] = useState(''); // '' = áp dụng chung
  const [clientOverrides, setClientOverrides] = useState({});
  const [draftMap, setDraftMap] = useState({}); // sku -> { retail, promoQty, promoPrice }
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!clientCode) { setClientOverrides({}); return; }
    api.getClientPriceOverrides(token, clientCode)
      .then((res) => setClientOverrides(res.overrides || {}))
      .catch(() => setClientOverrides({}));
  }, [token, clientCode]);

  const groupsList = useMemo(() => {
    const set = new Set(materials.map((m) => m.group).filter(Boolean));
    return Array.from(set).sort();
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return materials.filter((m) => {
      if (groupFilter !== 'ALL' && m.group !== groupFilter) return false;
      if (q && !(m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q) || (m.alias || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [materials, searchTerm, groupFilter]);

  const { safePage, pageItems: pagedMaterials } = usePagedSlice(filteredMaterials, page, PAGE_SIZE);

  // Giá hiện tại để SO SÁNH — theo khách (nếu đã có giá riêng) hoặc giá chung.
  const currentPriceFor = (m) => {
    const override = clientOverrides[m.sku];
    if (override) return { retail: override.retail, promoQty: override.promoQty, promoPrice: override.promoPrice };
    return { retail: m.suggestedPrice || 0, promoQty: m.promoQty || 0, promoPrice: m.promoPrice || 0 };
  };

  const getDraft = (m) => draftMap[m.sku] || { retail: '', promoQty: '', promoPrice: '' };

  const setCell = (sku, field, value) => {
    setDraftMap((prev) => {
      const current = prev[sku] || { retail: '', promoQty: '', promoPrice: '' };
      return { ...prev, [sku]: { ...current, [field]: value } };
    });
  };

  const pctChange = (m) => {
    const current = currentPriceFor(m);
    const d = getDraft(m);
    if (!current.retail || d.retail === '' || d.retail == null) return null;
    return ((Number(d.retail) - current.retail) / current.retail) * 100;
  };

  const touchedRows = useMemo(() => {
    return filteredMaterials.filter((m) => {
      const d = draftMap[m.sku];
      return d && d.retail !== '' && d.retail != null;
    });
  }, [filteredMaterials, draftMap]);

  const handleSubmit = async () => {
    if (!touchedRows.length) return;
    setIsSaving(true);
    try {
      const rows = touchedRows.map((m) => {
        const d = getDraft(m);
        return {
          sku: m.sku,
          clientCode: clientCode || '',
          retail: Number(d.retail) || 0,
          promoQty: Number(d.promoQty) || 0,
          promoPrice: Number(d.promoPrice) || 0
        };
      });
      const result = await api.submitPriceProposal(token, rows);
      toast.success(`Đã gửi đề xuất giá cho ${result.savedCount} mã SKU (đợt ${result.batchId}), chờ Admin duyệt.`);
      setDraftMap({});
      setConfirming(false);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      toast.error('Không gửi được đề xuất: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" className="input-field" style={{ paddingLeft: '36px' }}
            placeholder="Tìm mã SKU, tên, alias..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>

        <select className="input-field" style={{ width: '190px' }} value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}>
          <option value="ALL">Tất cả Nhóm SP</option>
          {groupsList.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Users size={15} color="var(--text-muted)" />
          <select className="input-field" style={{ width: '220px' }} value={clientCode} onChange={(e) => setClientCode(e.target.value)}>
            <option value="">Áp dụng chung (mọi khách hàng)</option>
            {clients.map((c) => <option key={c.codeSearch} value={c.codeSearch}>{c.name}</option>)}
          </select>
        </div>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={12} /> {filteredMaterials.length.toLocaleString('vi-VN')} sản phẩm khớp bộ lọc
        </span>
      </div>

      {clientCode && (
        <div className="glass-card" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={14} color="var(--karofi-cyan)" />
          Đang đề xuất giá <strong>RIÊNG</strong> cho khách hàng này — không ảnh hưởng giá chung trên Products.
        </div>
      )}

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
            {pagedMaterials.map((m) => {
              const current = currentPriceFor(m);
              const d = getDraft(m);
              const pct = pctChange(m);
              return (
                <tr key={m.sku}>
                  <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{m.sku}</td>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmt(current.retail)}</td>
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-dim)' }}>{current.promoPrice ? fmt(current.promoPrice) : '-'}</td>
                  <td>
                    <input
                      type="text" inputMode="numeric" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }}
                      value={formatDigits(d.retail)} placeholder="0"
                      onChange={(e) => setCell(m.sku, 'retail', parseDigits(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="text" inputMode="numeric" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }}
                      value={formatDigits(d.promoQty)} placeholder="0"
                      onChange={(e) => setCell(m.sku, 'promoQty', parseDigits(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="text" inputMode="numeric" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }}
                      value={formatDigits(d.promoPrice)} placeholder="0"
                      onChange={(e) => setCell(m.sku, 'promoPrice', parseDigits(e.target.value))}
                    />
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 700, color: pct == null ? 'var(--text-dim)' : (pct >= 0 ? 'var(--accent-emerald-text)' : 'var(--danger)') }}>
                    {pct == null ? '-' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredMaterials.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '28px 16px' }}>
          Không có sản phẩm nào khớp bộ lọc.
        </div>
      ) : (
        <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={filteredMaterials.length} onPageChange={setPage} itemLabel="sản phẩm" />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setConfirming(true)} disabled={isSaving || !touchedRows.length} className="btn btn-emerald">
          <Save size={16} /> Gửi Đề Xuất ({touchedRows.length.toLocaleString('vi-VN')} SKU)
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Gửi đề xuất giá bán?"
          message={`Sẽ tạo 1 đợt đề xuất mới cho ${touchedRows.length.toLocaleString('vi-VN')} mã SKU${clientCode ? ' (áp dụng RIÊNG cho khách hàng đã chọn)' : ' (áp dụng chung)'}, chờ Admin/Creator duyệt.`}
          confirmLabel={isSaving ? 'Đang gửi...' : 'Gửi Duyệt'}
          onConfirm={handleSubmit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
