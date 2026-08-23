import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, CheckCircle2, Save, ShieldCheck, TrendingUp } from 'lucide-react';
import * as api from '../../services/api';
import Pagination, { usePagedSlice } from '../Pagination';
import LoadingScreen from '../LoadingScreen';
import { useToast } from '../ToastProvider';

const PAGE_SIZE = 25;

// Sale's bulk-entry screen: pick a period (confirmed up front so a late entry
// early next month can't silently drift onto the wrong 4 months), filter the
// product table down to what's worth touching, type quantities, save once.
export default function SopPlanPanel({ token, materials, onSubmitted }) {
  const toast = useToast();
  const [context, setContext] = useState(null); // { anchor, monthLabels, myDraft, priorApprovedBySku }
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [periodConfirmed, setPeriodConfirmed] = useState(false);
  const [draftMap, setDraftMap] = useState({}); // sku -> [sl1,sl2,sl3,sl4]
  const [isSaving, setIsSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [exclusiveOnly, setExclusiveOnly] = useState(false);
  const [onlyPriorPlanned, setOnlyPriorPlanned] = useState(true);
  const [page, setPage] = useState(1);

  const fetchContext = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.getSopPlanningContext(token);
      setContext(data);
      // Base: carried forward from whatever was last approved (normally fills
      // the first 3 of the 4 months — the 4th is genuinely new, stays 0), then
      // an in-progress-but-unapproved draft for THIS exact period overrides it.
      const map = {};
      Object.entries(data.carryForwardBySku || {}).forEach(([sku, sl]) => { map[sku] = sl.slice(); });
      (data.myDraft || []).forEach(d => { map[d.sku] = [d.sl1 || 0, d.sl2 || 0, d.sl3 || 0, d.sl4 || 0]; });
      setDraftMap(map);
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchContext(); }, [token]);

  const groupsList = useMemo(() => {
    const set = new Set(materials.map(m => m.group).filter(Boolean));
    return Array.from(set).sort();
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    if (!context) return [];
    const q = searchTerm.trim().toLowerCase();
    return materials.filter(m => {
      if (onlyPriorPlanned && !(context.priorApprovedBySku[m.sku] > 0)) return false;
      if (groupFilter !== 'ALL' && m.group !== groupFilter) return false;
      if (exclusiveOnly && !m.isExclusive) return false;
      if (q && !(m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q) || (m.alias || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [materials, context, searchTerm, groupFilter, exclusiveOnly, onlyPriorPlanned]);

  const { safePage, pageItems: pagedMaterials } = usePagedSlice(filteredMaterials, page, PAGE_SIZE);

  // Live SUMPRODUCT(SL x Giá bán) per month over the FULL filtered set (not
  // just the visible page) — recomputes on every keystroke so Sale sees the
  // value of what they're entering before submitting, same idea as the
  // approved-plan revenue summary in "Xem SOP".
  const revenueByMonth = useMemo(() => {
    return [0, 1, 2, 3].map(i => filteredMaterials.reduce((sum, m) => {
      const v = draftMap[m.sku] || [0, 0, 0, 0];
      return sum + (v[i] || 0) * (m.suggestedPrice || 0);
    }, 0));
  }, [filteredMaterials, draftMap]);

  const fmtBillion = (v) => (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

  const setCell = (sku, idx, value) => {
    setDraftMap(prev => {
      const current = prev[sku] || [0, 0, 0, 0];
      const next = current.slice();
      next[idx] = value === '' ? 0 : (parseFloat(value) || 0);
      return { ...prev, [sku]: next };
    });
  };

  // Saves every row CURRENTLY in the filtered table (not just the visible
  // page) — "điền SL và ghi cả bảng đã lọc 1 lần". A SKU left untouched saves
  // as 0, which is how a Sale intentionally drops a SKU they no longer plan.
  const handleSubmit = async () => {
    if (!filteredMaterials.length) return;
    setIsSaving(true);
    try {
      const rows = filteredMaterials.map(m => {
        const v = draftMap[m.sku] || [0, 0, 0, 0];
        return { sku: m.sku, sl1: v[0], sl2: v[1], sl3: v[2], sl4: v[3] };
      });
      const result = await api.submitSopDraft(token, context.anchor, rows);
      toast.success(`Đã lưu kế hoạch cho ${result.savedCount} mã SKU, chờ Admin duyệt.`);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      toast.error('Không lưu được kế hoạch: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <LoadingScreen label="Đang tải kỳ kế hoạch..." />;

  if (loadError) {
    return (
      <div className="glass-card" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <span>Lỗi tải kỳ kế hoạch: {loadError}</span>
        <button onClick={fetchContext} className="btn btn-secondary btn-sm">Thử lại</button>
      </div>
    );
  }

  // Confirm-the-period gate — shown before the table so entering on the wrong
  // side of a month boundary (eg. mùng 1-2 đầu tháng) doesn't slip through unnoticed.
  if (!periodConfirmed) {
    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center', padding: '32px 20px' }}>
        <ShieldCheck size={32} color="var(--karofi-cyan)" />
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
            Kỳ kế hoạch: {context.monthLabels[0]} → {context.monthLabels[context.monthLabels.length - 1]}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '440px' }}>
            Kiểm tra đúng 4 tháng trên trước khi nhập sản lượng — kỳ này được tính từ tháng hiện tại,
            không đổi ngay cả khi bạn hoàn tất việc nhập vào đầu tháng sau.
          </p>
        </div>
        <button onClick={() => setPeriodConfirmed(true)} className="btn btn-primary">
          <CheckCircle2 size={16} /> Xác nhận kỳ, bắt đầu lập kế hoạch
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Doanh thu ước tính theo SL đang nhập — SUMPRODUCT(SL x Giá bán), cập nhật theo từng ô */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${context.monthLabels.length}, 1fr)`, gap: '12px' }}>
        {context.monthLabels.map((label, i) => (
          <div key={label + i} className="glass-card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <TrendingUp size={13} color="var(--accent-emerald)" /> {label}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", marginTop: '4px' }}>
              {fmtBillion(revenueByMonth[i])} tỷ đ
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Giá trị kế hoạch đang nhập</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" className="input-field" style={{ paddingLeft: '36px' }}
            placeholder="Tìm mã SKU, tên, alias để hiện SP đang ẩn..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>

        <select className="input-field" style={{ width: '190px' }} value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}>
          <option value="ALL">Tất cả Nhóm SP</option>
          {groupsList.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={exclusiveOnly} onChange={(e) => { setExclusiveOnly(e.target.checked); setPage(1); }} style={{ width: '16px', height: '16px' }} />
          Chỉ Độc quyền
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyPriorPlanned} onChange={(e) => { setOnlyPriorPlanned(e.target.checked); setPage(1); }} style={{ width: '16px', height: '16px' }} />
          Chỉ SP có SL kế hoạch tháng trước &gt; 0
        </label>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={12} /> {filteredMaterials.length.toLocaleString('vi-VN')} sản phẩm khớp bộ lọc
        </span>
      </div>

      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên SP</th>
              <th style={{ textAlign: 'right' }}>Giá bán</th>
              {context.monthLabels.map((label, i) => <th key={label + i} style={{ width: '110px', textAlign: 'right' }}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {pagedMaterials.map(m => {
              const v = draftMap[m.sku] || [0, 0, 0, 0];
              return (
                <tr key={m.sku}>
                  <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>
                    {m.sku}
                  </td>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{(m.suggestedPrice || 0).toLocaleString('vi-VN')}</td>
                  {[0, 1, 2, 3].map(i => (
                    <td key={i}>
                      <input
                        type="number" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }}
                        value={v[i] || ''}
                        placeholder="0"
                        onChange={(e) => setCell(m.sku, i, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredMaterials.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '28px 16px' }}>
          Không có sản phẩm nào khớp bộ lọc — bỏ lọc "SL kế hoạch tháng trước" hoặc tìm theo mã/tên để thêm SP mới vào kế hoạch.
        </div>
      ) : (
        <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={filteredMaterials.length} onPageChange={setPage} itemLabel="sản phẩm" />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSubmit} disabled={isSaving || !filteredMaterials.length} className="btn btn-emerald">
          <Save size={16} /> Lưu Kế Hoạch ({filteredMaterials.length.toLocaleString('vi-VN')} SKU), Gửi Duyệt
        </button>
      </div>
    </div>
  );
}
