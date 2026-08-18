import React, { useState } from 'react';
import { Package, Plus, Edit3, DollarSign, Search, Sparkles, Tag, Check, ArrowUpRight, Lock, AlertCircle, Table, LayoutGrid } from 'lucide-react';

export default function ProductManagement({ materials, clients, transactions, activeUser, onAddMaterial }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('table');
  const [selectedClientForPrice, setSelectedClientForPrice] = useState(clients[0]?.name || '');
  const [showAddModal, setShowAddModal] = useState(false);
  const [proposeModalMat, setProposeModalMat] = useState(null);
  const [proposedPriceInput, setProposedPriceInput] = useState('');

  // Permission flags
  const isLeader = activeUser.role === 'leader';
  const isSale = activeUser.role === 'sale';
  // Sales can add new SKUs too (same pattern as propose-price/propose-plan/add-client).
  const canEditCatalogue = ['creator', 'admin', 'sale'].includes(activeUser.role);

  // New Material form state
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newGroup, setNewGroup] = useState('LK nóng lạnh');
  const [newUnit, setNewUnit] = useState('PC');
  const [newPrice, setNewPrice] = useState('');

  const filteredMaterials = materials.filter(m => 
    !searchTerm || 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.alias && m.alias.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreateMaterial = (e) => {
    e.preventDefault();
    if (!newSku || !newName) return;
    
    const mat = {
      sku: newSku,
      name: newName,
      alias: newAlias || newName.split(' ')[0],
      group: newGroup,
      unit: newUnit,
      avgPrice: parseFloat(newPrice) || 100000,
      minPrice: parseFloat(newPrice) || 90000,
      maxPrice: parseFloat(newPrice) || 110000,
      totalQty: 0
    };

    onAddMaterial(mat);
    setShowAddModal(false);
    setNewSku('');
    setNewName('');
    setNewAlias('');
    setNewPrice('');
  };

  const handleSavePriceProposal = (e) => {
    e.preventDefault();
    if (!proposeModalMat || !proposedPriceInput) return;
    alert(`✅ Đã gửi đề xuất giá mới ${parseInt(proposedPriceInput).toLocaleString('vi-VN')} ₫ cho mã SP ${proposeModalMat.sku} (${proposeModalMat.name}) tới Admin phê duyệt!`);
    setProposeModalMat(null);
    setProposedPriceInput('');
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Banner */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={22} color="#00a0e9" /> Danh Mục Sản Phẩm & Đề Xuất Giá Karofi
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Quản lý mã vật tư, alias tên viết tắt. {isSale ? '💡 Sale được quyền đề xuất giá bán cho toàn bộ 440+ mã sản phẩm.' : 'Tra cứu lịch sử giá min/max/trung bình.'}
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
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Client Pricing Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Đề xuất giá theo KH:</span>
          <select
            className="input-field"
            style={{ width: '240px' }}
            value={selectedClientForPrice}
            onChange={(e) => setSelectedClientForPrice(e.target.value)}
          >
            {clients.map(c => <option key={c.code || c.name} value={c.name}>{c.name}</option>)}
          </select>
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
              <th style={{ textAlign: 'right' }}>Giá Thấp Nhất</th>
              <th style={{ textAlign: 'right' }}>Giá Trung Bình</th>
              <th style={{ textAlign: 'right' }}>Giá Cao Nhất</th>
              <th style={{ textAlign: 'right' }}>Tổng Bán</th>
              <th style={{ width: '140px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredMaterials.map((mat) => (
              <tr key={mat.sku}>
                <td className="code-font" style={{ fontWeight: 700, color: '#00a0e9', fontSize: '0.8rem' }}>{mat.sku}</td>
                <td style={{ fontWeight: 600 }}>{mat.name}{mat.alias && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}> ({mat.alias})</span>}</td>
                <td><span className="badge badge-purple">{mat.group}</span></td>
                <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }}>{mat.minPrice ? mat.minPrice.toLocaleString('vi-VN') + ' ₫' : '-'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>{mat.avgPrice ? mat.avgPrice.toLocaleString('vi-VN') + ' ₫' : '-'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }}>{mat.maxPrice ? mat.maxPrice.toLocaleString('vi-VN') + ' ₫' : '-'}</td>
                <td style={{ textAlign: 'right', fontSize: '0.8rem' }}>{mat.totalQty?.toLocaleString('vi-VN') || 0} {mat.unit}</td>
                <td>
                  <button
                    onClick={() => { setProposeModalMat(mat); setProposedPriceInput(mat.avgPrice || ''); }}
                    className="btn btn-secondary btn-sm"
                  >
                    <DollarSign size={14} color="#00a0e9" /> Đề Xuất Giá
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }} className="animate-fade-in">
        {filteredMaterials.map((mat) => (
          <div key={mat.sku} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <span className="code-font" style={{ fontSize: '0.75rem', color: '#00a0e9', fontWeight: 800 }}>
                  SKU: {mat.sku}
                </span>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: 'var(--text-main)' }}>{mat.name}</h4>
              </div>
              <span className="badge badge-purple">{mat.group}</span>
            </div>

            {mat.alias && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                🏷️ Alias: <strong>{mat.alias}</strong>
              </div>
            )}

            {/* Price Historical Metrics */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px',
              background: '#f8fafc', border: '1px solid var(--border-color)', padding: '10px', borderRadius: 'var(--radius-md)', textAlign: 'center'
            }}>
              <div>
                <span style={{ fontSize: '0.675rem', color: 'var(--text-dim)' }}>Giá Thấp Nhất</span>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--karofi-navy)' }}>
                  {mat.minPrice ? mat.minPrice.toLocaleString('vi-VN') + ' ₫' : '-'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.675rem', color: 'var(--text-dim)' }}>Giá Trung Bình</span>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                  {mat.avgPrice ? mat.avgPrice.toLocaleString('vi-VN') + ' ₫' : '-'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.675rem', color: 'var(--text-dim)' }}>Giá Cao Nhất</span>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
                  {mat.maxPrice ? mat.maxPrice.toLocaleString('vi-VN') + ' ₫' : '-'}
                </div>
              </div>
            </div>

            {/* Card Footer Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Tổng bán: <strong>{mat.totalQty?.toLocaleString('vi-VN') || 0} {mat.unit}</strong>
              </span>

              {/* Proposal button available for ALL Sales & Admins */}
              <button 
                onClick={() => { setProposeModalMat(mat); setProposedPriceInput(mat.avgPrice || ''); }}
                className="btn btn-secondary btn-sm"
              >
                <DollarSign size={14} color="#00a0e9" /> Đề Xuất Giá
              </button>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Proposal Price Modal */}
      {proposeModalMat && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card animate-fade-in" style={{ width: '440px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Đề Xuất Giá Bán Sản Phẩm</h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
              Mã SP: <strong>{proposeModalMat.sku}</strong> - {proposeModalMat.name}
            </p>

            <form onSubmit={handleSavePriceProposal} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Chọn Khách Hàng OEM Áp Dụng:</label>
                <select className="input-field" value={selectedClientForPrice} onChange={(e) => setSelectedClientForPrice(e.target.value)}>
                  {clients.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Đơn Giá Đề Xuất Mới (VND):</label>
                <input 
                  type="number" required className="input-field"
                  value={proposedPriceInput}
                  onChange={(e) => setProposedPriceInput(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setProposeModalMat(null)} className="btn btn-secondary">Hủy</button>
                <button type="submit" className="btn btn-primary">Gửi Đề Xuất Giá</button>
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

            <div style={{ fontSize: '0.75rem', color: '#b45309', background: 'rgba(245, 158, 11, 0.12)', padding: '8px 10px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              Sản phẩm này chỉ lưu tạm trên trình duyệt — Google Sheet chưa có tab danh mục sản phẩm riêng để ghi vào (tab "Materials" hiện tại là bảng số lượng bán theo tháng, không phải danh mục).
            </div>

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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu Sản Phẩm</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
