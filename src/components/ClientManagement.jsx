import React, { useState } from 'react';
import { Users, Plus, Edit3, Search, MapPin, UserCheck, Lock } from 'lucide-react';

export default function ClientManagement({ clients, activeUser, onAddClient }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);

  const isLeader = activeUser.role === 'leader';
  const isSale = activeUser.role === 'sale';
  const canEdit = ['creator', 'admin'].includes(activeUser.role);

  // Form state
  const [codeSearch, setCodeSearch] = useState('');
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [sale, setSale] = useState('KH Đình Hoan');
  const [address, setAddress] = useState('');

  // Scoped clients list if Sale role
  const scopedClients = clients.filter(c => {
    if (isSale) {
      return c.sale.toLowerCase().includes((activeUser.saleId || '').toLowerCase());
    }
    return true; // Creator, Admin, Leader see all
  });

  const filteredClients = scopedClients.filter(c => 
    !searchTerm ||
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.codeSearch.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.alias && c.alias.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSaveClient = (e) => {
    e.preventDefault();
    if (!codeSearch || !name) return;

    const newClient = {
      code: 'CLI-' + Math.floor(1000 + Math.random() * 9000),
      codeSearch: codeSearch.toUpperCase(),
      name,
      alias,
      type: 'Doanh nghiệp',
      sale,
      address: address || 'Hà Nội',
      status: 'Active'
    };

    onAddClient(newClient);
    setShowModal(false);
    setCodeSearch('');
    setName('');
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={22} color="#00a0e9" /> Danh Bạ Khách Hàng OEM Karofi
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            {isSale ? `Hiển thị danh sách Khách hàng được gán cho ${activeUser.saleId}.` : 'Quản lý toàn bộ đối tác OEM và nhân sự phụ trách.'}
          </p>
        </div>

        {canEdit && (
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <Plus size={16} /> Thêm Khách Hàng Mới
          </button>
        )}

        {isLeader && (
          <span className="badge badge-blue">
            <Lock size={12} /> Leader View-Only Mode
          </span>
        )}
      </div>

      {/* Search */}
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text"
            className="input-field"
            style={{ paddingLeft: '38px' }}
            placeholder="Tìm theo Mã (TECOM, MAKXIM), tên khách..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <span className="badge badge-purple">Hiển thị {filteredClients.length} Đối tác</span>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
        {filteredClients.map((client) => (
          <div key={client.code || client.name} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <span className="code-font" style={{ fontSize: '0.75rem', color: '#00a0e9', fontWeight: 800 }}>
                  Search Code: {client.codeSearch}
                </span>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: 'var(--text-main)' }}>{client.name}</h4>
              </div>
              <span className="badge badge-emerald">{client.status}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserCheck size={14} color="#00a0e9" />
                <span>Sales phụ trách: <strong style={{ color: 'var(--karofi-navy)' }}>{client.sale}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} color="#f59e0b" />
                <span>{client.address || 'Hà Nội'}</span>
              </div>
            </div>

            {canEdit && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                <button className="btn btn-secondary btn-sm">
                  <Edit3 size={14} /> Chỉnh Sửa
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card animate-fade-in" style={{ width: '460px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Thêm Khách Hàng OEM Mới</h3>
            
            <form onSubmit={handleSaveClient} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Mã Tìm Kiếm (Code Search / Viết Tắt):</label>
                <input type="text" required className="input-field" placeholder="VD: TECOM, MAKXIM" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Tên Công Ty / Khách Hàng:</label>
                <input type="text" required className="input-field" placeholder="VD: Công ty CP ABC" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu Khách Hàng</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
