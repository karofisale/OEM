import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, CheckCircle2, Save, ShieldCheck, TrendingUp, RotateCcw } from 'lucide-react';
import * as api from '../../services/api';
import Pagination, { usePagedSlice } from '../Pagination';
import LoadingScreen from '../LoadingScreen';
import ConfirmDialog from '../ConfirmDialog';
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
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [exclusiveFilter, setExclusiveFilter] = useState('ALL');
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

  // "Độc quyền" is free text (eg the client/brand holding exclusivity on a
  // SKU), not yes/no — so it filters the same way as Nhóm SP: a dropdown of
  // whatever distinct values actually exist, not a tick.
  const exclusiveList = useMemo(() => {
    const set = new Set(materials.map(m => m.exclusiveTo).filter(Boolean));
    return Array.from(set).sort();
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    if (!context) return [];
    const q = searchTerm.trim().toLowerCase();
    return materials.filter(m => {
      if (onlyPriorPlanned && !(context.priorApprovedBySku[m.sku] > 0)) return false;
      if (groupFilter !== 'ALL' && m.group !== groupFilter) return false;
      if (exclusiveFilter !== 'ALL' && (m.exclusiveTo || '') !== exclusiveFilter) return false;
      if (q && !(m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q) || (m.alias || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [materials, context, searchTerm, groupFilter, exclusiveFilter, onlyPriorPlanned]);

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

  // What actually gets sent on submit: EVERY sku in draftMap (carried-forward
  // + already-drafted + anything typed this session), NOT just filteredMaterials
  // — the backend now does a full replace (deletes this Sale's rows for the
  // period that aren't in the payload), so submitting only the currently-
  // filtered subset would read as "the Sale deleted everything else" and wipe
  // rows a filter merely hid from view. Rows with 0 in every month are dropped
  // here too (nothing to forecast) — same rule the backend enforces again.
  const submissionRows = useMemo(() => {
    return Object.entries(draftMap)
      .map(([sku, v]) => ({ sku, sl1: v[0] || 0, sl2: v[1] || 0, sl3: v[2] || 0, sl4: v[3] || 0 }))
      .filter(r => r.sl1 > 0 || r.sl2 > 0 || r.sl3 > 0 || r.sl4 > 0);
  }, [draftMap]);

  const handleSubmit = async () => {
    if (!submissionRows.length) return;
    setIsSaving(true);
    try {
      const result = await api.submitSopDraft(token, context.anchor, submissionRows);
      toast.success(`Đã lưu kế hoạch cho ${result.savedCount} mã SKU, chờ Admin duyệt.`);
      setConfirmingSubmit(false);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      toast.error('Không lưu được kế hoạch: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // "Tạo mới từ đầu" — chỉ xoá state cục bộ đang nhập (chưa đụng gì trên
  // Sheet). Việc thay thế thật trên SOP_Plan chỉ xảy ra khi bấm "Gửi Duyệt"
  // sau đó với nội dung mới — cùng cơ chế full-replace ở backend, nên không
  // cần một API riêng cho "tạo mới".
  const handleResetFromScratch = () => {
    setDraftMap({});
    setConfirmingReset(false);
    toast.success('Đã xoá số lượng đang nhập — nhập lại từ đầu rồi bấm "Gửi Duyệt" để lưu.');
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

        <select className="input-field" style={{ width: '190px' }} value={exclusiveFilter} onChange={(e) => { setExclusiveFilter(e.target.value); setPage(1); }}>
          <option value="ALL">Tất cả Độc quyền</option>
          {exclusiveList.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

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

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button onClick={() => setConfirmingReset(true)} disabled={isSaving} className="btn btn-secondary">
          <RotateCcw size={16} /> Tạo Mới Từ Đầu
        </button>
        <button onClick={() => setConfirmingSubmit(true)} disabled={isSaving || !submissionRows.length} className="btn btn-emerald">
          <Save size={16} /> Lưu Kế Hoạch ({submissionRows.length.toLocaleString('vi-VN')} SKU), Gửi Duyệt
        </button>
      </div>

      {confirmingReset && (
        <ConfirmDialog
          title="Tạo mới từ đầu?"
          message="Sẽ xoá toàn bộ số lượng đang nhập trên màn hình này (kể cả số đã carry-forward từ kỳ trước) để bạn nhập lại từ đầu. Chưa lưu gì lên hệ thống — chỉ thực sự thay thế kế hoạch cũ khi bạn bấm 'Gửi Duyệt' sau đó."
          confirmLabel="Xoá và làm lại"
          destructive
          onConfirm={handleResetFromScratch}
          onCancel={() => setConfirmingReset(false)}
        />
      )}

      {confirmingSubmit && (
        <ConfirmDialog
          title="Đã kiểm tra kỹ chưa?"
          message={`Sẽ gửi kế hoạch SOP kỳ ${context.monthLabels[0]} → ${context.monthLabels[context.monthLabels.length - 1]} cho ${submissionRows.length.toLocaleString('vi-VN')} mã SKU có số lượng > 0. Nếu kỳ này đã từng gửi trước đó, bản cũ sẽ bị THAY THẾ HOÀN TOÀN bằng bản này — mã SKU nào không còn số lượng trong lần gửi này sẽ bị xoá khỏi kế hoạch. Hãy chắc chắn đã kiểm tra kỹ số lượng trước khi xác nhận.`}
          confirmLabel={isSaving ? 'Đang gửi...' : 'Đã kiểm tra kỹ, Gửi'}
          onConfirm={handleSubmit}
          onCancel={() => setConfirmingSubmit(false)}
        />
      )}
    </div>
  );
}
