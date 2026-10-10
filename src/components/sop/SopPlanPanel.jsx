import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, CheckCircle2, Save, ShieldCheck, TrendingUp, RotateCcw } from 'lucide-react';
import * as api from '../../services/api';
import Pagination, { usePagedSlice } from '../Pagination';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useTableSort } from '../../hooks/useTableSort';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';

// Chữ ký của bản nhập (chỉ ô > 0): so với lúc tải để biết còn gì chưa gửi.
const chuKy = (map) => JSON.stringify(Object.keys(map).sort().filter((k) => (map[k] || []).some((v) => v > 0)).map((k) => [k, map[k]]));

const PAGE_SIZE = 25;

// Sale's bulk-entry screen: pick a period (confirmed up front so a late entry
// early next month can't silently drift onto the wrong 4 months), filter the
// product table down to what's worth touching, type quantities, save once.
export default function SopPlanPanel({ token, materials, refreshTick, onSubmitted }) {
  const toast = useToast();
  const [context, setContext] = useState(null); // { anchor, monthLabels, myDraft, priorApprovedBySku }
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [periodConfirmed, setPeriodConfirmed] = useState(false);
  const [draftMap, setDraftMap] = useState({}); // sku -> [sl1,sl2,sl3,sl4]
  const [savedSig, setSavedSig] = useState(''); // chữ ký bản đã tải/đã gửi (Đợt 2 / mục 5)
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  // Bộ lọc nhớ qua F5 (Đợt 2 / mục 9); giá trị đã nhớ mà không còn trong danh mục thì quay về "Tất cả".
  const [groupSaved, setGroupFilter] = usePersistentState('sop.group', 'ALL');
  const [exclusiveSaved, setExclusiveFilter] = usePersistentState('sop.exclusive', 'ALL');
  const [onlyPriorPlanned, setOnlyPriorPlanned] = usePersistentState('sop.onlyPrior', true, (v) => typeof v === 'boolean');
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
      setSavedSig(chuKy(map));
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // refreshTick: panel không còn remount khi chuyển sub-tab (KeepAliveTab), nên
  // sau mỗi lần gửi/duyệt phải tải lại context (kỳ hiện hành, bản nháp, số kỳ
  // trước mang sang) thay vì dựa vào remount như trước.
  useEffect(() => { fetchContext(); }, [token, refreshTick]);

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

  const groupFilter = groupSaved === 'ALL' || groupsList.includes(groupSaved) ? groupSaved : 'ALL';
  const exclusiveFilter = exclusiveSaved === 'ALL' || exclusiveList.includes(exclusiveSaved) ? exclusiveSaved : 'ALL';

  // Debounce ô tìm — nhất quán với ClientManagement/ProductManagement.
  const debouncedSearchTerm = useDebouncedValue(searchTerm);

  const filteredMaterials = useMemo(() => {
    if (!context) return [];
    const q = debouncedSearchTerm.trim().toLowerCase();
    return materials.filter(m => {
      if (onlyPriorPlanned && !(context.priorApprovedBySku[m.sku] > 0)) return false;
      if (groupFilter !== 'ALL' && m.group !== groupFilter) return false;
      if (exclusiveFilter !== 'ALL' && (m.exclusiveTo || '') !== exclusiveFilter) return false;
      if (q && !(m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q) || (m.alias || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [materials, context, debouncedSearchTerm, groupFilter, exclusiveFilter, onlyPriorPlanned]);

  // Sắp xếp theo cột (Đợt 2 / mục 3) — chỉ Mã, Tên, Giá bán (các ô số lượng đang gõ không làm khoá sắp xếp).
  const cols = useMemo(() => [{ key: 'sku' }, { key: 'name' }, { key: 'suggestedPrice', type: 'number' }], []);
  const { rows: sortedMaterials, sort, onSort } = useTableSort(filteredMaterials, cols);
  const { safePage, pageItems: pagedMaterials } = usePagedSlice(sortedMaterials, page, PAGE_SIZE);

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

  // F5 / đổi tab khi còn số đã nhập mà chưa gửi -> cảnh báo (Đợt 2 / mục 5).
  useUnsavedGuard(!!context && chuKy(draftMap) !== savedSig, 'Kế hoạch SOP');

  const handleSubmit = async () => {
    if (isSaving || !submissionRows.length) return; // chặn gửi trùng khi lượt đầu chưa về
    setIsSaving(true);
    try {
      const result = await api.submitSopDraft(token, context.anchor, submissionRows);
      toast.success(`Đã lưu kế hoạch cho ${result.savedCount} mã SKU, chờ Admin duyệt.`);
      setSavedSig(chuKy(draftMap));
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

  // Tải / lỗi dùng chung một mẫu (TableState): lỗi luôn có Thử lại, không kẹt "Đang tải…".
  if (isLoading || loadError || !context) {
    return <TableState loading={isLoading} error={loadError} errorPrefix="Lỗi tải kỳ kế hoạch" loadingLabel="Đang tải kỳ kế hoạch..." onRetry={fetchContext} />;
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

      <TableState isEmpty={filteredMaterials.length === 0} emptyText="Không có sản phẩm nào khớp bộ lọc." emptyHint='Bỏ lọc "SL kế hoạch tháng trước" hoặc tìm theo mã/tên để thêm SP mới vào kế hoạch.'>
      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <SortableTh col="sku" sort={sort} onSort={onSort}>Mã</SortableTh>
              <SortableTh col="name" sort={sort} onSort={onSort}>Tên SP</SortableTh>
              <SortableTh col="suggestedPrice" sort={sort} onSort={onSort} align="right">Giá bán</SortableTh>
              {context.monthLabels.map((label, i) => <th key={label + i} style={{ width: '110px', textAlign: 'right' }}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {pagedMaterials.map(m => {
              const v = draftMap[m.sku] || [0, 0, 0, 0];
              return (
                <tr key={m.sku}>
                  <td className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)', fontSize: '0.8rem' }}>
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
      <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={filteredMaterials.length} onPageChange={setPage} itemLabel="sản phẩm" />
      </TableState>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button onClick={() => setConfirmingReset(true)} disabled={isSaving} className="btn btn-secondary">
          <RotateCcw size={16} /> Tạo Mới Từ Đầu
        </button>
        <button onClick={() => setConfirmingSubmit(true)} disabled={isSaving || !submissionRows.length} className="btn btn-primary">
          <Save size={16} /> Lưu Kế Hoạch ({submissionRows.length.toLocaleString('vi-VN')} SKU), Gửi Duyệt
        </button>
      </div>

      {confirmingReset && (
        <ConfirmDialog
          title="Tạo mới từ đầu?"
          message="Sẽ xoá toàn bộ số lượng đang nhập trên màn hình này (kể cả số đã carry-forward từ kỳ trước) để bạn nhập lại từ đầu. Chưa lưu gì lên hệ thống — chỉ thực sự thay thế kế hoạch cũ khi bạn bấm 'Gửi Duyệt' sau đó."
          confirmLabel="Xoá số đang nhập"
          destructive
          onConfirm={handleResetFromScratch}
          onCancel={() => setConfirmingReset(false)}
        />
      )}

      {confirmingSubmit && (
        <ConfirmDialog
          title="Đã kiểm tra kỹ chưa?"
          message={`Sẽ gửi kế hoạch SOP kỳ ${context.monthLabels[0]} → ${context.monthLabels[context.monthLabels.length - 1]} cho ${submissionRows.length.toLocaleString('vi-VN')} mã SKU có số lượng > 0. Nếu kỳ này đã từng gửi trước đó, bản cũ sẽ bị THAY THẾ HOÀN TOÀN bằng bản này — mã SKU nào không còn số lượng trong lần gửi này sẽ bị xoá khỏi kế hoạch. Hãy chắc chắn đã kiểm tra kỹ số lượng trước khi xác nhận.`}
          confirmLabel="Gửi và thay kế hoạch kỳ này"
          danger
          busy={isSaving}
          busyLabel="Đang gửi..."
          onConfirm={handleSubmit}
          onCancel={() => setConfirmingSubmit(false)}
        />
      )}
    </div>
  );
}
