import React, { useState, useMemo } from 'react';
import { Users, Plus, Edit3, Search, MapPin, UserCheck, Lock, Table, LayoutGrid, Filter } from 'lucide-react';
import Pagination, { usePagedSlice } from './Pagination';
import { canSeeAllSales } from '../utils/roles';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const PAGE_SIZE = 25;

export default function ClientManagement({ clients, activeUser, onAddClient, onEditClient }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState('table');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  // withOptimistic cập nhật bảng ngay rồi mới gọi backend nền — trước đây modal
  // đóng NGAY sau khi bấm Lưu nên không có gì chặn việc mở lại và Lưu lần nữa
  // cho ĐÚNG khách đó trước khi lượt ghi đầu về, gửi hai lệnh chồng nhau. Giữ
  // modal mở và khoá riêng nút Lưu tới khi call() xong — overlay của modal đã
  // chặn thao tác khác, không cần khoá cả màn hình.
  const [savingAdd, setSavingAdd] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Default to Active only — most day-to-day lookups don't want inactive
  // clients cluttering the list; "Tất cả" is one click away.
  const [statusFilter, setStatusFilter] = useState('Active');
  const [saleFilter, setSaleFilter] = useState('ALL');

  const isLeader = activeUser.role === 'leader';
  // Sales can add their own leads (same pattern as propose-price/propose-plan);
  // only Creator/Admin can edit existing records. Leader stays view-only.
  const canAdd = ['creator', 'admin', 'sale'].includes(activeUser.role);
  const canEditExisting = ['creator', 'admin'].includes(activeUser.role);
  const canFilterAllSales = canSeeAllSales(activeUser.role);

  // Form thêm / sửa (30/09/2026): đủ mọi cột của danh bạ, sửa được cả Code + Search Code.
  const [form, setForm] = useState(null);
  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const lockSale = activeUser.role === 'sale';

  // 14/09/2026: mọi role thấy toàn bộ danh bạ; muốn xem của riêng ai thì dùng
  // bộ lọc SALE. Quyền SỬA không đổi — canEditExisting vẫn chỉ Creator/Admin.
  const scopedClients = clients;

  const salesList = useMemo(() => {
    const set = new Set(clients.map(c => c.sale).filter(Boolean));
    return Array.from(set);
  }, [clients]);

  // Ô "Sale phụ trách" là danh sách sổ xuống: mọi Sale đang có trong danh bạ + Sale của người đang đăng nhập.
  const saleOptions = useMemo(() => {
    const set = new Set(clients.map(c => String(c.sale || '').trim()).filter(Boolean));
    if (activeUser.saleId) set.add(activeUser.saleId);
    return Array.from(set).sort((x, y) => x.localeCompare(y, 'vi'));
  }, [clients, activeUser.saleId]);
  const typeOptions = useMemo(() => {
    const set = new Set(['Doanh nghiệp', 'Cá nhân']);
    clients.forEach(c => { if (String(c.type || '').trim()) set.add(String(c.type).trim()); });
    return Array.from(set);
  }, [clients]);

  // Debounce ô tìm — dữ liệu còn nhỏ nên chưa giật, nhưng gõ nhanh không nên
  // lọc lại toàn bộ danh bạ ở mỗi ký tự.
  const debouncedSearchTerm = useDebouncedValue(searchTerm);

  // Memoised, and the search term is lowercased once rather than once per client
  // per keystroke — this reran on every render, including typing in a modal.
  const filteredClients = useMemo(() => {
    const q = debouncedSearchTerm.trim().toLowerCase();
    return scopedClients.filter(c => {
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.codeSearch.toLowerCase().includes(q) ||
        (c.code && String(c.code).toLowerCase().includes(q)) ||
        (c.alias && c.alias.toLowerCase().includes(q));
      const matchStatus = statusFilter === 'ALL' || (c.status || 'Active') === statusFilter;
      const matchSale = !canFilterAllSales || saleFilter === 'ALL' || c.sale === saleFilter;
      return matchSearch && matchStatus && matchSale;
    });
  }, [scopedClients, debouncedSearchTerm, statusFilter, saleFilter, canFilterAllSales]);

  const { safePage, pageItems: pagedClients } = usePagedSlice(filteredClients, page, PAGE_SIZE);

  const openAddModal = () => {
    setEditingClient(null);
    setForm({ code: '', codeSearch: '', name: '', alias: '', type: 'Doanh nghiệp', sale: activeUser.saleId || '',
      address: '', status: 'Active', reconciliationAcct: '' });
    setShowModal(true);
  };

  const openEditModal = (client) => {
    setEditingClient(client);
    setForm({ code: client.rawCode != null ? client.rawCode : (client.code || ''), codeSearch: client.codeSearch || '',
      name: client.name || '', alias: client.alias || '', type: client.type || 'Doanh nghiệp', sale: client.sale || '',
      address: client.address || '', status: client.status || 'Active', reconciliationAcct: client.reconciliationAcct || '' });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingClient(null); setForm(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const f = form;
    if (!f || !f.codeSearch.trim() || !f.name.trim() || savingAdd || savingEdit) return;
    const data = {
      code: f.code.trim(), codeSearch: f.codeSearch.trim().toUpperCase(), name: f.name.trim(), alias: f.alias.trim(),
      type: f.type, sale: f.sale.trim(), address: f.address.trim(), status: f.status, reconciliationAcct: f.reconciliationAcct.trim()
    };
    if (editingClient) {
      setSavingEdit(true);
      try {
        await onEditClient({ ...editingClient, ...data, rawCode: data.code, code: data.code || editingClient.code });
        closeModal();
      } finally {
        setSavingEdit(false);
      }
    } else {
      // Chưa có mã SAP thì cấp mã tạm CLI-xxxx như trước (khoá dòng trên màn); có mã thì server chặn trùng.
      const code = data.code || ('CLI-' + Math.floor(1000 + Math.random() * 9000));
      setSavingAdd(true);
      try {
        await onAddClient({ ...data, code, rawCode: code, address: data.address || 'Hà Nội' });
        closeModal();
      } finally {
        setSavingAdd(false);
      }
    }
  };

  const doiMaChu = !!(editingClient && form && form.codeSearch.trim().toUpperCase() !== String(editingClient.codeSearch || '').toUpperCase());
  const saving = savingAdd || savingEdit;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={22} color="var(--karofi-cyan)" /> Danh Bạ Khách Hàng OEM Karofi
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Quản lý toàn bộ đối tác OEM và nhân sự phụ trách. Lọc theo cột SALE để xem danh sách của từng người.
          </p>
        </div>

        {canAdd && (
          <button onClick={openAddModal} className="btn btn-primary">
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
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            aria-label="Tìm khách hàng"
          />
        </div>

        {canFilterAllSales && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCheck size={15} color="var(--text-muted)" />
            <select className="input-field" style={{ width: '160px' }} value={saleFilter} onChange={(e) => { setSaleFilter(e.target.value); setPage(1); }} aria-label='Lọc theo sale'>
              <option value="ALL">Tất cả Sale</option>
              {salesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={15} color="var(--text-muted)" />
          <select className="input-field" style={{ width: '150px' }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} aria-label='Lọc theo trạng thái'>
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
              <th>Code</th>
              <th>Search Code</th>
              <th>Tên Khách Hàng</th>
              <th>Sale phụ trách</th>
              <th>Địa chỉ</th>
              <th>Trạng thái</th>
              {canEditExisting && <th style={{ width: '110px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {pagedClients.map((client) => (
              <tr key={client.code || client.name}>
                <td className="code-font" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.code}</td>
                <td className="code-font" style={{ fontWeight: 800, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{client.codeSearch}</td>
                <td style={{ fontWeight: 700 }}>{client.name}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{client.sale}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.address || 'Hà Nội'}</td>
                <td><span className={`badge ${(client.status || "Active") === "Active" ? "badge-emerald" : "badge-rose"}`}>{client.status}</span></td>
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
        {pagedClients.map((client) => (
          <div key={client.code || client.name} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <span className="code-font" style={{ fontSize: '0.75rem', color: 'var(--karofi-cyan)', fontWeight: 800 }}>
                  Search Code: {client.codeSearch}
                </span>
                {client.code && (
                  <span className="code-font" style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: '8px' }}>
                    Code: {client.code}
                  </span>
                )}
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: 'var(--text-main)' }}>{client.name}</h4>
              </div>
              <span className={`badge ${(client.status || "Active") === "Active" ? "badge-emerald" : "badge-rose"}`}>{client.status}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserCheck size={14} color="var(--karofi-cyan)" />
                <span>Sales phụ trách: <strong style={{ color: 'var(--karofi-navy)' }}>{client.sale}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} color="var(--accent-amber)" />
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

      {filteredClients.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px 16px' }}>
          Không tìm thấy khách hàng nào khớp với bộ lọc hiện tại
          {searchTerm && <> (từ khóa "<strong>{searchTerm}</strong>")</>}.
        </div>
      )}

      <Pagination
        page={safePage}
        pageSize={PAGE_SIZE}
        totalItems={filteredClients.length}
        onPageChange={setPage}
        itemLabel="khách hàng"
      />

      {/* Modal thêm / sửa — cùng một form đủ trường (30/09/2026) */}
      {showModal && form && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card animate-fade-in" style={{ width: '620px', maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
              {editingClient ? <>Chỉnh Sửa Khách Hàng — {editingClient.codeSearch}</> : 'Thêm Khách Hàng OEM Mới'}
            </h3>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Code (Mã KH số trên SAP):</label>
                <input type="text" className="input-field" placeholder="VD: 1000700 — trống nếu chưa có mã SAP" value={form.code} onChange={setF('code')} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Search Code (Mã chữ / Viết tắt): *</label>
                <input type="text" required className="input-field" placeholder="VD: TECOM, MAKXIM" value={form.codeSearch} onChange={setF('codeSearch')} style={{ textTransform: 'uppercase' }} />
              </div>
              <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Tên Công Ty / Khách Hàng: *</label>
                <input type="text" required className="input-field" placeholder="VD: Công ty CP ABC" value={form.name} onChange={setF('name')} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Alias / Tên viết tắt (tên hiện trên báo cáo):</label>
                <input type="text" className="input-field" placeholder="VD: Tecom" value={form.alias} onChange={setF('alias')} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Loại khách:</label>
                <select className="input-field" value={form.type} onChange={setF('type')}>
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Sale phụ trách:</label>
                <select className="input-field" value={form.sale} onChange={setF('sale')} disabled={lockSale && !editingClient}>
                  <option value="">— Chọn Sale —</option>
                  {saleOptions.map(x => <option key={x} value={x}>{x}</option>)}
                  {form.sale && !saleOptions.includes(form.sale) && <option value={form.sale}>{form.sale}</option>}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Trạng thái:</label>
                <select className="input-field" value={form.status} onChange={setF('status')}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Địa chỉ:</label>
                <input type="text" className="input-field" value={form.address} onChange={setF('address')} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Reconciliation acct (TK đối chiếu):</label>
                <input type="text" className="input-field" placeholder="VD: 131" value={form.reconciliationAcct} onChange={setF('reconciliationAcct')} />
              </div>
              {doiMaChu && (
                <div style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: 'var(--warning-text)', background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 'var(--radius-md)' }}>
                  ⚠ Đổi Search Code: kế hoạch kinh doanh / giá / công nợ đã lưu theo mã chữ cũ "{editingClient.codeSearch}" KHÔNG tự đổi theo.
                </div>
              )}
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                <button type="button" onClick={closeModal} className="btn btn-secondary" disabled={saving}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : editingClient ? 'Lưu Thay Đổi' : 'Lưu Khách Hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
