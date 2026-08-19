import React, { useState, useMemo } from 'react';
import { Users, Plus, Edit3, Search, MapPin, UserCheck, Lock, Table, LayoutGrid, Filter } from 'lucide-react';

export default function ClientManagement({ clients, activeUser, onAddClient, onEditClient }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('table');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [editSale, setEditSale] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editStatus, setEditStatus] = useState('Active');

  // Default to Active only — most day-to-day lookups don't want inactive
  // clients cluttering the list; "Tất cả" is one click away.
  const [statusFilter, setStatusFilter] = useState('Active');
  const [saleFilter, setSaleFilter] = useState('ALL');

  const isLeader = activeUser.role === 'leader';
  const isSale = activeUser.role === 'sale';
  // Sales can add their own leads (same pattern as propose-price/propose-plan);
  // only Creator/Admin can edit existing records. Leader stays view-only.
  const canAdd = ['creator', 'admin', 'sale'].includes(activeUser.role);
  const canEditExisting = ['creator', 'admin'].includes(activeUser.role);
  // Sale accounts already only ever see their own clients (scopedClients below) —
  // a Sale filter dropdown is only useful for roles that see everyone.
  const canFilterAllSales = ['creator', 'admin', 'leader'].includes(activeUser.role);

  // Form state
  const [codeSearch, setCodeSearch] = useState('');
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [sale, setSale] = useState(activeUser.saleId || 'KH Đình Hoan');
  const [address, setAddress] = useState('');

  // Scoped clients list if Sale role
  const scopedClients = clients.filter(c => {
    if (isSale) {
      return c.sale.toLowerCase().includes((activeUser.saleId || '').toLowerCase());
    }
    return true; // Creator, Admin, Leader see all
  });

  const salesList = useMemo(() => {
    const set = new Set(clients.map(c => c.sale).filter(Boolean));
    return Array.from(set);
  }, [clients]);

  const filteredClients = scopedClients.filter(c => {
    const matchSearch =
      !searchTerm ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.codeSearch.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.alias && c.alias.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchStatus = statusFilter === 'ALL' || (c.status || 'Active') === statusFilter;
    const matchSale = !canFilterAllSales || saleFilter === 'ALL' || c.sale === saleFilter;
    return matchSearch && matchStatus && matchSale;
  });

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

  const openEditModal = (client) => {
    setEditingClient(client);
    setEditName(client.name);
    setEditAlias(client.alias || '');
    setEditSale(client.sale);
    setEditAddress(client.address || '');
    setEditStatus(client.status || 'Active');
  };

  const handleUpdateClient = (e) => {
    e.preventDefault();
    if (!editingClient || !editName) return;

    onEditClient({
      ...editingClient,
      name: editName,
      alias: editAlias,
      sale: editSale,
      address: editAddress,
      status: editStatus
    });
    setEditingClient(null);
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

        {canAdd && (
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
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '400px' }}>
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

        {canFilterAllSales && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCheck size={15} color="var(--text-muted)" />
            <select className="input-field" style={{ width: '160px' }} value={saleFilter} onChange={(e) => setSaleFilter(e.target.value)}>
              <option value="ALL">Tất cả Sale</option>
              {salesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={15} color="var(--text-muted)" />
          <select className="input-field" style={{ width: '150px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="ALL">Tất cả trạng thái</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="badge badge-purple">Hiển thị {filteredClients.length} Đối tác</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-main)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <button onClick={() => setViewMode('table')} className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}>
              <Table size={14} /> Dạng Bảng
            </button>
            <button onClick={() => setViewMode('grid')} className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}>
              <LayoutGrid size={14} /> Dạng Lưới
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'table' ? (
      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Search Code</th>
              <th>Tên Khách Hàng</th>
              <th>Sale phụ trách</th>
              <th>Địa chỉ</th>
              <th>Trạng thái</th>
              {canEditExisting && <th style={{ width: '110px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => (
              <tr key={client.code || client.name}>
                <td className="code-font" style={{ fontWeight: 800, color: '#00a0e9', fontSize: '0.8rem' }}>{client.codeSearch}</td>
                <td style={{ fontWeight: 700 }}>{client.name}</td>
                <td style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>{client.sale}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.address || 'Hà Nội'}</td>
                <td><span className="badge badge-emerald">{client.status}</span></td>
                {canEditExisting && (
                  <td>
                    <button onClick={() => openEditModal(client)} className="btn btn-secondary btn-sm">
                      <Edit3 size={14} /> Sửa
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }} className="animate-fade-in">
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

            {canEditExisting && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                <button onClick={() => openEditModal(client)} className="btn btn-secondary btn-sm">
                  <Edit3 size={14} /> Chỉnh Sửa
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card animate-fade-in" style={{ width: '460px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

      {/* Edit Modal */}
      {editingClient && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card animate-fade-in" style={{ width: '460px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Chỉnh Sửa Khách Hàng — {editingClient.codeSearch}</h3>

            <form onSubmit={handleUpdateClient} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Tên Công Ty / Khách Hàng:</label>
                <input type="text" required className="input-field" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Alias / Tên viết tắt:</label>
                <input type="text" className="input-field" value={editAlias} onChange={(e) => setEditAlias(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Sale phụ trách:</label>
                <input type="text" className="input-field" value={editSale} onChange={(e) => setEditSale(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Địa chỉ:</label>
                <input type="text" className="input-field" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Trạng thái:</label>
                <select className="input-field" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setEditingClient(null)} className="btn btn-secondary">Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu Thay Đổi</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
