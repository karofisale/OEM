import React, { useState, useMemo } from 'react';
import { Package, Plus, Edit3, Search, Lock, Layers } from 'lucide-react';
import Pagination, { usePagedSlice } from './Pagination';
import BomModal from './products/BomModal';
import Modal from './Modal';
import SortableTh from './SortableTh';
import TableState from './TableState';
import ViewModeToggle from './ViewModeToggle';
import { laMaMay } from '../utils/bom';
import { catKhoangTrang, timMaTrung, kiemGia } from '../utils/formClean';
import { NHAN_CHI_XEM } from '../utils/glossary';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTableSort } from '../hooks/useTableSort';
import { usePersistentState } from '../hooks/usePersistentState';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';

const fmtPrice = (v) => (v ? v.toLocaleString('vi-VN') : '-');
const PAGE_SIZE = 25;
// Cột sắp xếp được (Đợt 2 / mục 3).
const COLS = [
  { key: 'sku' }, { key: 'name' }, { key: 'group' },
  { key: 'latestPriceVat', type: 'number' }, { key: 'suggestedPrice', type: 'number' },
  { key: 'promoPrice', type: 'number' }, { key: 'promoQty', type: 'number' }, { key: 'totalQty', type: 'number' }
];

// `transactions` used to be passed in and destructured here but was never read —
// dropped, so this component no longer re-renders when the transaction list changes.
export default function ProductManagement({ materials, token, activeUser, onAddMaterial, onEditMaterial }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = usePersistentState('products.view', 'table', (v) => v === 'table' || v === 'grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMat, setEditingMat] = useState(null);
  const [editAlias, setEditAlias] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [editSuggestedPrice, setEditSuggestedPrice] = useState('');
  const [editInit, setEditInit] = useState('');
  // Mã máy đang mở BOM (null = đóng). Chỉ mã máy mới có BOM — xem laMaMay().
  const [bomMat, setBomMat] = useState(null);
  // withOptimistic cập nhật bảng ngay rồi mới gọi backend nền — trước đây modal
  // đóng NGAY sau khi bấm Lưu nên không có gì chặn việc mở lại và Lưu lần nữa
  // cho ĐÚNG SKU đó trước khi lượt ghi đầu về, gửi hai lệnh chồng nhau. Giữ
  // modal mở và khoá riêng nút Lưu tới khi call() xong — overlay của modal đã
  // chặn thao tác khác, không cần khoá cả màn hình.
  const [savingAdd, setSavingAdd] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Lỗi lượt Lưu gần nhất của từng modal (09/10/2026): lưu hỏng thì GIỮ modal + chữ đã gõ, hiện lỗi trong form.
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');

  // Permission flags
  const isLeader = activeUser.role === 'leader';
  const isSale = activeUser.role === 'sale';
  // Sales can add new SKUs too (same pattern as propose-price/propose-plan/add-client).
  const canEditCatalogue = ['creator', 'admin', 'sale'].includes(activeUser.role);
  const isAdmin = ['creator', 'admin'].includes(activeUser.role);

  const groupsList = useMemo(() => {
    const set = new Set(materials.map(m => m.group).filter(Boolean));
    return Array.from(set).sort();
  }, [materials]);

  // New Material form state
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newGroup, setNewGroup] = useState('LK nóng lạnh');
  const [newUnit, setNewUnit] = useState('PC');
  const [newSuggestedPrice, setNewSuggestedPrice] = useState('');

  // Đã gõ chữ vào form chưa — để Modal không đóng nhầm khi bấm nền và F5 có cảnh báo.
  const addDirty = showAddModal && !!(newSku || newName || newAlias || newSuggestedPrice || newGroup !== 'LK nóng lạnh' || newUnit !== 'PC');
  const editDirty = !!editingMat && JSON.stringify([editAlias, editGroup, editSuggestedPrice]) !== editInit;
  useUnsavedGuard(addDirty || editDirty, 'Form sản phẩm');

  // Debounce ô tìm — nhất quán với ClientManagement, dữ liệu còn nhỏ nên chưa
  // giật nhưng gõ nhanh không nên lọc lại toàn bộ danh mục ở mỗi ký tự.
  const debouncedSearchTerm = useDebouncedValue(searchTerm);

  // Memoised: this ran on every render, including every keystroke in an
  // unrelated modal input, and lowercased the search term once per material.
  const filteredMaterials = useMemo(() => {
    const q = debouncedSearchTerm.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.sku.toLowerCase().includes(q) ||
      (m.alias && m.alias.toLowerCase().includes(q))
    );
  }, [materials, debouncedSearchTerm]);

  // Every one of the 440 SKUs used to be rendered at once — ~8,000 DOM elements,
  // each row carrying one or two icon buttons.
  // Sắp xếp TRƯỚC khi cắt trang.
  const { rows: sortedMaterials, sort, onSort } = useTableSort(filteredMaterials, COLS);
  const { safePage, pageItems: pagedMaterials } = usePagedSlice(sortedMaterials, page, PAGE_SIZE);

  const handleCreateMaterial = async (e) => {
    e.preventDefault();
    if (savingAdd) return;
    // Cắt khoảng trắng đầu-cuối TRƯỚC khi so trùng và lưu (Đợt 3): mã dán từ Excel/SAP hay dính dấu cách,
    // "MAT1000 " và "MAT1000" nhìn giống nhau nhưng server so chính xác nên cho lọt thành hai mã.
    const sku = catKhoangTrang(newSku);
    const name = catKhoangTrang(newName);
    if (!sku || !name) { setAddError('Nhập đủ Mã SKU và Tên vật tư (khoảng trắng đơn thuần không tính).'); return; }
    const loiGia = kiemGia(newSuggestedPrice, 'Giá bán');
    if (loiGia) { setAddError(loiGia); return; }
    const trung = timMaTrung(materials, (m) => m.sku, sku);
    if (trung) {
      setAddError(`Mã SKU "${trung.sku}" đã có trong danh mục (${trung.name}). ${isAdmin ? 'Dùng nút "Sửa" ở dòng đó để cập nhật.' : 'Nhờ Admin cập nhật nếu cần đổi thông tin.'}`);
      return;
    }

    const mat = {
      sku,
      name,
      alias: catKhoangTrang(newAlias) || name.split(' ')[0],
      group: catKhoangTrang(newGroup),
      unit: newUnit,
      suggestedPrice: parseFloat(newSuggestedPrice) || 0,
      avgPrice: parseFloat(newSuggestedPrice) || 0,
      latestPrice: 0,
      latestPriceVat: 0,
      totalQty: 0
    };

    setSavingAdd(true);
    setAddError('');
    try {
      // onAddMaterial trả { ok, error } (withOptimistic ở App.jsx) — chỉ đóng + xoá form khi đã lưu thật.
      const kq = await onAddMaterial(mat);
      if (kq && kq.ok === false) { setAddError(kq.error || 'Không lưu được, thử lại.'); return; }
      setShowAddModal(false);
      setNewSku('');
      setNewName('');
      setNewAlias('');
      setNewSuggestedPrice('');
    } finally {
      setSavingAdd(false);
    }
  };

  const openEditModal = (mat) => {
    setEditingMat(mat);
    setEditAlias(mat.alias || '');
    setEditGroup(mat.group || '');
    setEditSuggestedPrice(mat.suggestedPrice || '');
    setEditInit(JSON.stringify([mat.alias || '', mat.group || '', mat.suggestedPrice || '']));
    setEditError('');
  };

  const handleSaveEditMaterial = async (e) => {
    e.preventDefault();
    if (!editingMat || savingEdit) return;
    const loiGia = kiemGia(editSuggestedPrice, 'Giá bán');
    if (loiGia) { setEditError(loiGia); return; }
    setSavingEdit(true);
    setEditError('');
    try {
      const kq = await onEditMaterial(editingMat.sku, {
        alias: catKhoangTrang(editAlias),
        group: catKhoangTrang(editGroup),
        suggestedPrice: parseFloat(editSuggestedPrice) || 0
      });
      if (kq && kq.ok === false) { setEditError(kq.error || 'Không lưu được, thử lại.'); return; }
      setEditingMat(null);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header Banner */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={22} color="var(--karofi-cyan)" /> Danh Mục Sản Phẩm & Đề Xuất Giá Karofi
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            {/* Count comes from the data, not a hardcoded "440+" that never changed. */}
            Quản lý mã vật tư, alias tên viết tắt — {materials.length.toLocaleString('vi-VN')} mã sản phẩm.
            {' '}{isAdmin ? 'Dùng nút "Sửa" để cập nhật Alias, Nhóm SP và Giá bán.' : 'Tra cứu giá bán mới nhất theo dữ liệu SAP.'}
          </p>
        </div>

        {canEditCatalogue && (
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            <Plus size={16} /> Thêm Sản Phẩm Mới
          </button>
        )}

        {isLeader && (
          <span className="badge badge-blue">
            <Lock size={12} /> {NHAN_CHI_XEM}
          </span>
        )}
      </div>

      {/* Filter & Pricing Bar */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <Search size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '38px' }}
            placeholder="Tìm theo mã SKU, tên vật tư, hoặc alias..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            aria-label="Tìm sản phẩm"
          />
        </div>

        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </div>

      <TableState
        isEmpty={filteredMaterials.length === 0}
        emptyText="Không tìm thấy sản phẩm nào khớp bộ lọc."
        emptyHint={searchTerm ? `Từ khóa: "${searchTerm}"` : undefined}
      >
      {viewMode === 'table' ? (
      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <SortableTh col="sku" sort={sort} onSort={onSort}>SKU</SortableTh>
              <SortableTh col="name" sort={sort} onSort={onSort}>Tên Vật Tư</SortableTh>
              <SortableTh col="group" sort={sort} onSort={onSort}>Nhóm</SortableTh>
              <SortableTh col="latestPriceVat" sort={sort} onSort={onSort} align="right">Giá Mới Nhất (VAT)</SortableTh>
              <SortableTh col="suggestedPrice" sort={sort} onSort={onSort} align="right">Giá Lẻ</SortableTh>
              <SortableTh col="promoPrice" sort={sort} onSort={onSort} align="right">Giá KM</SortableTh>
              <SortableTh col="promoQty" sort={sort} onSort={onSort} align="right">SL KM</SortableTh>
              <SortableTh col="totalQty" sort={sort} onSort={onSort} align="right">Tổng Bán</SortableTh>
              <th style={{ width: '190px' }}></th>
            </tr>
          </thead>
          <tbody>
            {pagedMaterials.map((mat) => (
              <tr key={mat.sku}>
                <td className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)', fontSize: '0.8rem' }}>{mat.sku}</td>
                <td style={{ fontWeight: 600 }}>{mat.name}{mat.alias && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}> ({mat.alias})</span>}</td>
                <td><span className="badge badge-purple">{mat.group}</span></td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-emerald-text)' }}>{fmtPrice(mat.latestPriceVat)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmtPrice(mat.suggestedPrice)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: mat.promoPrice ? 'var(--karofi-navy)' : 'var(--text-dim)' }}>{mat.promoPrice ? fmtPrice(mat.promoPrice) : '-'}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-dim)' }}>{mat.promoQty || '-'}</td>
                <td style={{ textAlign: 'right', fontSize: '0.8rem' }}>{mat.totalQty?.toLocaleString('vi-VN') || 0} {mat.unit}</td>
                {/* display:flex on a <td> takes the cell out of table layout, so it
                    stopped honouring the 190px <th> width and broke row alignment. */}
                <td>
                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                    {laMaMay(mat.sku) && (
                      <button onClick={() => setBomMat(mat)} className="btn btn-ghost btn-sm" title="Xem định mức nguyên vật liệu">
                        <Layers size={14} /> BOM
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => openEditModal(mat)} className="btn btn-secondary btn-sm">
                        <Edit3 size={14} /> Sửa
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }} className="animate-fade-in">
        {pagedMaterials.map((mat) => (
          <div key={mat.sku} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <span className="code-font" style={{ fontSize: '0.75rem', color: 'var(--cyan-text)', fontWeight: 800 }}>
                  SKU: {mat.sku}
                </span>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: 'var(--text-main)' }}>{mat.name}</h4>
              </div>
              <span className="badge badge-purple">{mat.group}</span>
            </div>

            {mat.alias && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--surface-sunk)', padding: '4px 8px', borderRadius: '4px' }}>
                🏷️ Alias: <strong>{mat.alias}</strong>
              </div>
            )}

            {/* Price Metrics */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
              background: 'var(--bg-card-hover)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: 'var(--radius-md)', textAlign: 'center'
            }}>
              <div>
                <span style={{ fontSize: '0.675rem', color: 'var(--text-dim)' }}>Giá Mới Nhất (VAT)</span>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-emerald-text)' }}>
                  {fmtPrice(mat.latestPriceVat)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.675rem', color: 'var(--text-dim)' }}>Giá Bán</span>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--karofi-navy)' }}>
                  {fmtPrice(mat.suggestedPrice)}
                </div>
              </div>
            </div>

            {/* Card Footer Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Tổng bán: <strong>{mat.totalQty?.toLocaleString('vi-VN') || 0} {mat.unit}</strong>
              </span>

              <div style={{ display: 'inline-flex', gap: '6px' }}>
                {laMaMay(mat.sku) && (
                  <button onClick={() => setBomMat(mat)} className="btn btn-ghost btn-sm" title="Xem định mức nguyên vật liệu">
                    <Layers size={14} /> BOM
                  </button>
                )}
                {isAdmin && (
                  <button onClick={() => openEditModal(mat)} className="btn btn-secondary btn-sm">
                    <Edit3 size={14} /> Sửa
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
      </TableState>

      <Pagination
        page={safePage}
        pageSize={PAGE_SIZE}
        totalItems={filteredMaterials.length}
        onPageChange={setPage}
        itemLabel="sản phẩm"
      />

      {/* Admin Edit Modal (Alias / Nhóm SP / Giá bán đề xuất) — khung chung Modal */}
      {editingMat && (
        <Modal title={`Sửa Sản Phẩm — ${editingMat.sku}`} width={440} onClose={() => setEditingMat(null)} busy={savingEdit} dirty={editDirty}>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: 0 }}>{editingMat.name}</p>

          <form onSubmit={handleSaveEditMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Alias / Tên Viết Tắt (Dùng cho AI):</label>
              <input type="text" className="input-field" value={editAlias} onChange={(e) => setEditAlias(e.target.value)} />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nhóm SP:</label>
              <input type="text" list="product-group-options" className="input-field" value={editGroup} onChange={(e) => setEditGroup(e.target.value)} />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Giá Bán (VND):</label>
              <input type="number" min="0" step="any" className="input-field" value={editSuggestedPrice} onChange={(e) => setEditSuggestedPrice(e.target.value)} />
            </div>

            {editError && (
              <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)', background: 'var(--danger-bg)', padding: '8px 10px', borderRadius: 'var(--radius-md)' }}>
                {editError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button type="button" onClick={() => setEditingMat(null)} className="btn btn-secondary" disabled={savingEdit}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={savingEdit}>{savingEdit ? 'Đang lưu...' : 'Lưu Thay Đổi'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Product Modal */}
      {showAddModal && (
        <Modal title="Thêm Vật Tư / Sản Phẩm OEM Mới" width={460} onClose={() => { setShowAddModal(false); setAddError(''); }} busy={savingAdd} dirty={addDirty}>
          <form onSubmit={handleCreateMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Mã SKU Vật Tư (SAP Code):</label>
              <input type="text" required className="input-field" value={newSku} onChange={(e) => setNewSku(e.target.value)} onBlur={() => setNewSku((v) => catKhoangTrang(v))} />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Tên Vật Tư / Linh Kiện:</label>
              <input type="text" required className="input-field" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Alias / Tên Viết Tắt (Dùng cho AI):</label>
              <input type="text" className="input-field" value={newAlias} onChange={(e) => setNewAlias(e.target.value)} />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nhóm SP:</label>
              <input type="text" list="product-group-options" className="input-field" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Giá Bán (VND):</label>
              <input type="number" min="0" step="any" className="input-field" value={newSuggestedPrice} onChange={(e) => setNewSuggestedPrice(e.target.value)} />
            </div>

            {addError && (
              <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)', background: 'var(--danger-bg)', padding: '8px 10px', borderRadius: 'var(--radius-md)' }}>
                {addError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button type="button" onClick={() => { setShowAddModal(false); setAddError(''); }} className="btn btn-secondary" disabled={savingAdd}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={savingAdd}>{savingAdd ? 'Đang lưu...' : 'Lưu Sản Phẩm'}</button>
            </div>
          </form>
        </Modal>
      )}

      <datalist id="product-group-options">
        {groupsList.map(g => <option key={g} value={g} />)}
      </datalist>

      {bomMat && (
        <BomModal
          token={token}
          sku={bomMat.sku}
          materialName={bomMat.name}
          canUpdate={isAdmin}
          onClose={() => setBomMat(null)}
        />
      )}

    </div>
  );
}
