import React, { useState, useMemo } from 'react';
import { Package, Plus, Edit3, Search, Sparkles, Tag, Check, ArrowUpRight, Lock, Table, LayoutGrid } from 'lucide-react';
import Pagination, { usePagedSlice } from './Pagination';

const fmtPrice = (v) => (v ? v.toLocaleString('vi-VN') : '-');
const PAGE_SIZE = 25;

// `transactions` used to be passed in and destructured here but was never read —
// dropped, so this component no longer re-renders when the transaction list changes.
export default function ProductManagement({ materials, activeUser, onAddMaterial, onEditMaterial }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState('table');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMat, setEditingMat] = useState(null);
  const [editAlias, setEditAlias] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [editSuggestedPrice, setEditSuggestedPrice] = useState('');

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

  // Memoised: this ran on every render, including every keystroke in an
  // unrelated modal input, and lowercased the search term once per material.
  const filteredMaterials = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.sku.toLowerCase().includes(q) ||
      (m.alias && m.alias.toLowerCase().includes(q))
    );
  }, [materials, searchTerm]);

  // Every one of the 440 SKUs used to be rendered at once — ~8,000 DOM elements,
  // each row carrying one or two icon buttons.
  const { safePage, pageItems: pagedMaterials } = usePagedSlice(filteredMaterials, page, PAGE_SIZE);

  const handleCreateMaterial = (e) => {
    e.preventDefault();
    if (!newSku || !newName) return;

    const mat = {
      sku: newSku,
      name: newName,
      alias: newAlias || newName.split(' ')[0],
      group: newGroup,
      unit: newUnit,
      suggestedPrice: parseFloat(newSuggestedPrice) || 0,
      avgPrice: parseFloat(newSuggestedPrice) || 0,
      latestPrice: 0,
      latestPriceVat: 0,
      totalQty: 0
    };

    onAddMaterial(mat);
    setShowAddModal(false);
    setNewSku('');
    setNewName('');
    setNewAlias('');
    setNewSuggestedPrice('');
  };

  const openEditModal = (mat) => {
    setEditingMat(mat);
    setEditAlias(mat.alias || '');
    setEditGroup(mat.group || '');
    setEditSuggestedPrice(mat.suggestedPrice || '');
  };

  const handleSaveEditMaterial = (e) => {
    e.preventDefault();
    if (!editingMat) return;
    onEditMaterial(editingMat.sku, {
      alias: editAlias,
      group: editGroup,
      suggestedPrice: parseFloat(editSuggestedPrice) || 0
    });
    setEditingMat(null);
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
            <Lock size={12} /> Leader View-Only Mode
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-main)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <button onClick={() => setViewMode('table')} className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}>
            <Table size={14} /> Dạng Bảng
          </button>
          <button onClick={() => setViewMode('grid')} className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}>
            <LayoutGrid size={14} /> Dạng Lưới
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Tên Vật Tư</th>
              <th>Nhóm</th>
              <th style={{ textAlign: 'right' }}>Giá Mới Nhất (VAT)</th>
              <th style={{ textAlign: 'right' }}>Giá Lẻ</th>
              <th style={{ textAlign: 'right' }}>Giá KM</th>
              <th style={{ textAlign: 'right' }}>SL KM</th>
              <th style={{ textAlign: 'right' }}>Tổng Bán</th>
              <th style={{ width: '190px' }}></th>
            </tr>
          </thead>
          <tbody>
            {pagedMaterials.map((mat) => (
              <tr key={mat.sku}>
                <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{mat.sku}</td>
                <td style={{ fontWeight: 600 }}>{mat.name}{mat.alias && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}> ({mat.alias})</span>}</td>
                <td><span className="badge badge-purple">{mat.group}</span></td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>{fmtPrice(mat.latestPriceVat)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{fmtPrice(mat.suggestedPrice)}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: mat.promoPrice ? 'var(--karofi-navy)' : 'var(--text-dim)' }}>{mat.promoPrice ? fmtPrice(mat.promoPrice) : '-'}</td>
                <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-dim)' }}>{mat.promoQty || '-'}</td>
                <td style={{ textAlign: 'right', fontSize: '0.8rem' }}>{mat.totalQty?.toLocaleString('vi-VN') || 0} {mat.unit}</td>
                {/* display:flex on a <td> takes the cell out of table layout, so it
                    stopped honouring the 190px <th> width and broke row alignment. */}
                <td>
                  {isAdmin && (
                    <button onClick={() => openEditModal(mat)} className="btn btn-secondary btn-sm">
                      <Edit3 size={14} /> Sửa
                    </button>
                  )}
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
                <span className="code-font" style={{ fontSize: '0.75rem', color: 'var(--karofi-cyan)', fontWeight: 800 }}>
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
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
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

              {isAdmin && (
                <button onClick={() => openEditModal(mat)} className="btn btn-secondary btn-sm">
                  <Edit3 size={14} /> Sửa
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* None of the searchable tables told the user when a search matched
          nothing — a typo just produced an empty grid. */}
      {filteredMaterials.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px 16px' }}>
          Không tìm thấy sản phẩm nào khớp với "<strong>{searchTerm}</strong>".
        </div>
      )}

      <Pagination
        page={safePage}
        pageSize={PAGE_SIZE}
        totalItems={filteredMaterials.length}
        onPageChange={setPage}
        itemLabel="sản phẩm"
      />

      {/* Admin Edit Modal (Alias / Nhóm SP / Giá bán đề xuất) */}
      {editingMat && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card animate-fade-in" style={{ width: '440px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Sửa Sản Phẩm — {editingMat.sku}</h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>{editingMat.name}</p>

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
                <input type="number" className="input-field" value={editSuggestedPrice} onChange={(e) => setEditSuggestedPrice(e.target.value)} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setEditingMat(null)} className="btn btn-secondary">Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu Thay Đổi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card animate-fade-in" style={{ width: '460px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Thêm Vật Tư / Sản Phẩm OEM Mới</h3>

            <form onSubmit={handleCreateMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Mã SKU Vật Tư (SAP Code):</label>
                <input type="text" required className="input-field" value={newSku} onChange={(e) => setNewSku(e.target.value)} />
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
                <input type="number" className="input-field" value={newSuggestedPrice} onChange={(e) => setNewSuggestedPrice(e.target.value)} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu Sản Phẩm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <datalist id="product-group-options">
        {groupsList.map(g => <option key={g} value={g} />)}
      </datalist>

    </div>
  );
}
