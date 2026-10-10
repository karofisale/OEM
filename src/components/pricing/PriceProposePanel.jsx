import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Filter, Save, Users } from 'lucide-react';
import * as api from '../../services/api';
import Pagination, { usePagedSlice } from '../Pagination';
import ConfirmDialog from '../ConfirmDialog';
import Combobox from '../Combobox';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import { useToast } from '../ToastProvider';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useTableSort } from '../../hooks/useTableSort';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { dongDeXuat, soMaCoNhap, boNhapDaGui } from '../../utils/priceDraft';
import { chuanTim } from '../../utils/searchText';

const PAGE_SIZE = 25;
// Lựa chọn "không chọn khách" trong ô tìm khách: đề xuất giá CHUNG.
const KHACH_CHUNG = { codeSearch: '', name: 'Áp dụng chung (mọi khách hàng)' };
const nhanKhach = (c) => (c.codeSearch ? `${c.codeSearch} — ${c.name}` : c.name);
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
  // Nhóm SP nhớ qua F5 (Đợt 2 / mục 9). Khách KHÔNG nhớ: giá nháp gắn với khách đang chọn.
  const [groupSaved, setGroupFilter] = usePersistentState('price.group', 'ALL');
  const [clientCode, setClientCode] = useState(''); // '' = áp dụng chung
  const [clientOverrides, setClientOverrides] = useState({});
  const [draftMap, setDraftMap] = useState({}); // sku -> { retail, promoQty, promoPrice }
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Khách đang chờ xác nhận đổi sang (null = không chờ) — đổi khách khi còn giá nháp thì hỏi trước.
  const [pendingClientCode, setPendingClientCode] = useState(null);

  // Perf (2026-08-27): nhớ lại giá riêng của từng khách đã tra trong phiên này.
  // Trước đây mỗi lần đổi ô chọn khách là một lượt gọi backend mới, nên xem qua
  // lại 3 khách = 6 lượt gọi — trên đường mạng ~50% lượt bị lỗi phải retry
  // (xem đầu src/services/api.js) thì đó là vài giây chờ mỗi lần bấm. Cache
  // sống theo vòng đời panel, mất khi rời hẳn trang, nên không có nguy cơ giữ
  // số cũ qua phiên làm việc khác.
  const overridesCacheRef = useRef({}); // clientCode -> overrides object

  useEffect(() => {
    if (!clientCode) { setClientOverrides({}); return; }

    const cached = overridesCacheRef.current[clientCode];
    if (cached) { setClientOverrides(cached); return; }

    let cancelled = false;
    api.getClientPriceOverrides(token, clientCode)
      .then((res) => {
        const overrides = res.overrides || {};
        overridesCacheRef.current[clientCode] = overrides;
        if (!cancelled) setClientOverrides(overrides);
      })
      .catch(() => { if (!cancelled) setClientOverrides({}); });

    return () => { cancelled = true; };
  }, [token, clientCode]);

  // Ô chọn khách tìm được (Đợt 3): danh bạ có hàng trăm khách, <select> không gõ để lọc được. Bỏ trùng theo Mã KH chữ
  // (một khách thật có thể có nhiều dòng danh bạ); "Áp dụng chung" luôn đứng đầu.
  const clientOptions = useMemo(() => {
    const seen = new Set();
    const out = [KHACH_CHUNG];
    (clients || []).forEach((c) => {
      if (!c.codeSearch || seen.has(c.codeSearch)) return;
      seen.add(c.codeSearch);
      out.push(c);
    });
    return out;
  }, [clients]);
  const khachDangChon = clientOptions.find((c) => c.codeSearch === clientCode) || KHACH_CHUNG;
  const nhanDangChon = nhanKhach(khachDangChon);
  const khopKhach = (c, q) => {
    const k = chuanTim(q);
    // Ô đang hiện đúng nhãn đã chọn (vừa bấm vào ô, chưa gõ gì) -> cho xem đủ danh sách, không chỉ đúng 1 dòng.
    if (!k || q === nhanDangChon) return true;
    return [c.codeSearch, c.name, c.code, c.alias].some((t) => chuanTim(t).includes(k));
  };

  const groupsList = useMemo(() => {
    const set = new Set(materials.map((m) => m.group).filter(Boolean));
    return Array.from(set).sort();
  }, [materials]);

  // Nhóm đã nhớ mà không còn trong danh mục -> về "Tất cả" (không để bảng trống vì bộ lọc cũ).
  const groupFilter = groupSaved === 'ALL' || groupsList.includes(groupSaved) ? groupSaved : 'ALL';

  // Debounce ô tìm — nhất quán với ClientManagement/ProductManagement.
  const debouncedSearchTerm = useDebouncedValue(searchTerm);

  const filteredMaterials = useMemo(() => {
    const q = debouncedSearchTerm.trim().toLowerCase();
    return materials.filter((m) => {
      if (groupFilter !== 'ALL' && m.group !== groupFilter) return false;
      if (q && !(m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q) || (m.alias || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [materials, debouncedSearchTerm, groupFilter]);

  // Giá hiện tại để SO SÁNH — theo khách (nếu đã có giá riêng) hoặc giá chung.
  const currentPriceFor = (m) => {
    const override = clientOverrides[m.sku];
    if (override) return { retail: override.retail, promoQty: override.promoQty, promoPrice: override.promoPrice };
    return { retail: m.suggestedPrice || 0, promoQty: m.promoQty || 0, promoPrice: m.promoPrice || 0 };
  };

  // Sắp xếp theo cột (Đợt 2 / mục 3) — chỉ các cột KHÔNG sửa được. Sắp theo ô đang gõ thì dòng
  // nhảy chỗ ngay dưới tay người nhập.
  const cols = useMemo(() => [
    { key: 'sku' }, { key: 'name' },
    { key: 'retail', type: 'number', get: (m) => currentPriceFor(m).retail },
    { key: 'promo', type: 'number', get: (m) => currentPriceFor(m).promoPrice }
  ], [clientOverrides]); // eslint-disable-line react-hooks/exhaustive-deps
  const { rows: sortedMaterials, sort, onSort } = useTableSort(filteredMaterials, cols);
  const { safePage, pageItems: pagedMaterials } = usePagedSlice(sortedMaterials, page, PAGE_SIZE);

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

  // Dòng sẽ gửi: đọc thẳng từ draftMap trên TOÀN BỘ danh mục, KHÔNG qua bộ lọc
  // (09/10/2026, cùng cách SalesPlanProposePanel.handleSubmit). Bản trước lấy
  // filteredMaterials, rồi gửi xong lại setDraftMap({}) — giá đã gõ cho SKU đang
  // bị ô tìm / Nhóm SP ẩn đi vừa không được gửi vừa bị xoá, im lặng.
  // Giá lẻ > 0: gõ số rồi xoá trắng ô thì parseDigits trả 0 — không được coi là đề xuất giá 0đ.
  const touchedRows = useMemo(() => dongDeXuat(materials, draftMap), [materials, draftMap]);

  const hiddenTouchedCount = useMemo(() => {
    const visible = new Set(filteredMaterials.map((m) => m.sku));
    return touchedRows.filter((m) => !visible.has(m.sku)).length;
  }, [touchedRows, filteredMaterials]);

  // Có ô nháp nào đang có số không (kể cả SL KM / Giá KM chưa kèm Giá lẻ).
  const draftCount = useMemo(() => soMaCoNhap(draftMap), [draftMap]);
  // F5 / đổi tab khi còn giá nháp chưa gửi -> cảnh báo (Đợt 2 / mục 5).
  useUnsavedGuard(draftCount > 0, 'Đề xuất giá');

  // Giá nháp gắn với khách ĐANG CHỌN (giá riêng hay giá chung) — đổi khách mà
  // giữ nháp là gửi nhầm giá của khách A thành giá của khách B. Còn nháp thì hỏi
  // trước, đồng ý thì bỏ nháp rồi mới đổi.
  const requestClientChange = (code) => {
    if (code === clientCode) return;
    if (draftCount > 0) { setPendingClientCode(code); return; }
    setClientCode(code);
  };

  const confirmClientChange = () => {
    setDraftMap({});
    setClientCode(pendingClientCode || '');
    setPendingClientCode(null);
  };

  const handleSubmit = async () => {
    if (isSaving || !touchedRows.length) return;
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
      // Chỉ bỏ nháp của các SKU VỪA gửi; nháp chưa đủ Giá lẻ (không được gửi) giữ nguyên.
      const daGui = rows.map((r) => r.sku);
      setDraftMap((prev) => boNhapDaGui(prev, daGui));
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
          <div style={{ width: '280px' }}>
            {/* key theo khách đang chọn: đổi khách (đã xác nhận) thì ô dựng lại với đúng nhãn mới. */}
            <Combobox
              key={clientCode || '__chung__'}
              initialText={nhanDangChon}
              restoreText={nhanDangChon}
              disabled={isSaving}
              options={clientOptions}
              filterFn={khopKhach}
              toText={nhanKhach}
              getKey={(c) => c.codeSearch || '__chung__'}
              renderOption={(c) => (
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    {c.codeSearch ? <span className="code-font" style={{ color: 'var(--cyan-text)' }}>{c.codeSearch}</span> : 'Áp dụng chung'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.codeSearch ? c.name : 'Giá chung của danh mục, không riêng khách nào'}</div>
                </div>
              )}
              onSelect={(c) => requestClientChange(c.codeSearch)}
              placeholder="Gõ tên / mã khách để tìm…"
              ariaLabel="Chọn khách hàng cho đề xuất giá"
              maxOptions={40}
            />
          </div>
        </div>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={12} /> {filteredMaterials.length.toLocaleString('vi-VN')} sản phẩm khớp bộ lọc
        </span>
      </div>

      {clientCode && (
        <div className="glass-card" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={14} color="var(--karofi-cyan)" />
          Đang đề xuất giá <strong>RIÊNG</strong> cho khách hàng này — không ảnh hưởng giá chung của danh mục sản phẩm.
        </div>
      )}

      <TableState isEmpty={filteredMaterials.length === 0} emptyText="Không có sản phẩm nào khớp bộ lọc.">
      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <SortableTh col="sku" sort={sort} onSort={onSort}>Mã</SortableTh>
              <SortableTh col="name" sort={sort} onSort={onSort}>Tên SP</SortableTh>
              <SortableTh col="retail" sort={sort} onSort={onSort} align="right" style={{ width: '130px' }}>Giá lẻ hiện tại</SortableTh>
              <SortableTh col="promo" sort={sort} onSort={onSort} align="right" style={{ width: '130px' }}>Giá KM hiện tại</SortableTh>
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
                  <td className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)', fontSize: '0.8rem' }}>{m.sku}</td>
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
      <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={filteredMaterials.length} onPageChange={setPage} itemLabel="sản phẩm" />
      </TableState>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setConfirming(true)} disabled={isSaving || !touchedRows.length} className="btn btn-primary">
          <Save size={16} /> Gửi Đề Xuất ({touchedRows.length.toLocaleString('vi-VN')} SKU{hiddenTouchedCount ? `, ${hiddenTouchedCount.toLocaleString('vi-VN')} đang bị lọc ẩn` : ''})
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Gửi đề xuất giá bán?"
          message={`Sẽ tạo 1 đợt đề xuất mới cho ${touchedRows.length.toLocaleString('vi-VN')} mã SKU${hiddenTouchedCount ? ` (trong đó ${hiddenTouchedCount.toLocaleString('vi-VN')} mã đang bị bộ lọc ẩn)` : ''}${clientCode ? ' (áp dụng RIÊNG cho khách hàng đã chọn)' : ' (áp dụng chung)'}, chờ Admin/Creator duyệt.`}
          confirmLabel="Gửi đề xuất giá"
          busy={isSaving}
          busyLabel="Đang gửi..."
          onConfirm={handleSubmit}
          onCancel={() => setConfirming(false)}
        />
      )}

      {pendingClientCode !== null && (
        <ConfirmDialog
          title="Đổi khách hàng?"
          message={`Đang có giá nháp cho ${draftCount.toLocaleString('vi-VN')} mã SKU của ${clientCode ? `khách ${nhanDangChon}` : 'giá chung'}. Đổi sang ${pendingClientCode ? (clientOptions.find((c) => c.codeSearch === pendingClientCode) ? nhanKhach(clientOptions.find((c) => c.codeSearch === pendingClientCode)) : pendingClientCode) : 'giá chung'} sẽ BỎ các giá nháp này (chưa gửi) để không gửi nhầm giá của khách này sang khách khác. Bấm "Ở lại" nếu muốn gửi đề xuất hiện tại trước.`}
          confirmLabel="Bỏ nháp và đổi khách"
          cancelLabel="Ở lại"
          destructive
          onConfirm={confirmClientChange}
          onCancel={() => setPendingClientCode(null)}
        />
      )}
    </div>
  );
}
