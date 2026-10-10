import React, { useState, useMemo } from 'react';
import { Users, Plus, Edit3, Search, MapPin, UserCheck, Lock, Filter } from 'lucide-react';
import Pagination, { usePagedSlice } from './Pagination';
import Modal from './Modal';
import SortableTh from './SortableTh';
import StatusBadge from './StatusBadge';
import TableState from './TableState';
import ViewModeToggle from './ViewModeToggle';
import { canSeeAllSales } from '../utils/roles';
import { catKhoangTrang, timMaTrung } from '../utils/formClean';
import { NHAN_CHI_XEM } from '../utils/glossary';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTableSort } from '../hooks/useTableSort';
import { usePersistentState } from '../hooks/usePersistentState';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';

const PAGE_SIZE = 25;
// Cột sắp xếp được (Đợt 2 / mục 3). Khai báo ngoài component để mảng ổn định.
const COLS = [
  { key: 'code' }, { key: 'codeSearch' }, { key: 'name' }, { key: 'sale' }, { key: 'address' }, { key: 'status' }
];

export default function ClientManagement({ clients, activeUser, onAddClient, onEditClient }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  // Kiểu xem + bộ lọc nhớ qua F5 (Đợt 2 / mục 9).
  const [viewMode, setViewMode] = usePersistentState('clients.view', 'table', (v) => v === 'table' || v === 'grid');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  // withOptimistic cập nhật bảng ngay rồi mới gọi backend nền — trước đây modal
  // đóng NGAY sau khi bấm Lưu nên không có gì chặn việc mở lại và Lưu lần nữa
  // cho ĐÚNG khách đó trước khi lượt ghi đầu về, gửi hai lệnh chồng nhau. Giữ
  // modal mở và khoá riêng nút Lưu tới khi call() xong — overlay của modal đã
  // chặn thao tác khác, không cần khoá cả màn hình.
  const [savingAdd, setSavingAdd] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Lỗi lượt Lưu gần nhất (09/10/2026): lưu hỏng thì GIỮ modal + chữ đã gõ, hiện lỗi ngay trong form.
  const [saveError, setSaveError] = useState('');

  // Default to Active only — most day-to-day lookups don't want inactive
  // clients cluttering the list; "Tất cả" is one click away.
  const [statusFilter, setStatusFilter] = usePersistentState('clients.status', 'Active', (v) => ['Active', 'Inactive', 'ALL'].includes(v));
  const [saleFilterSaved, setSaleFilter] = usePersistentState('clients.sale', 'ALL');

  const isLeader = activeUser.role === 'leader';
  // Sales can add their own leads (same pattern as propose-price/propose-plan);
  // only Creator/Admin can edit existing records. Leader stays view-only.
  const canAdd = ['creator', 'admin', 'sale'].includes(activeUser.role);
  const canEditExisting = ['creator', 'admin'].includes(activeUser.role);
  const canFilterAllSales = canSeeAllSales(activeUser.role);

  // Form thêm / sửa (30/09/2026): đủ mọi cột của danh bạ, sửa được cả Code + Search Code.
  const [form, setForm] = useState(null);
  // Ảnh chụp form lúc mở: khác ảnh chụp = người dùng đã gõ -> bấm nền không đóng, Esc hỏi trước, F5 cảnh báo.
  const [formInit, setFormInit] = useState('');
  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const lockSale = activeUser.role === 'sale';

  // 14/09/2026: mọi role thấy toàn bộ danh bạ; muốn xem của riêng ai thì dùng
  // bộ lọc SALE. Quyền SỬA không đổi — canEditExisting vẫn chỉ Creator/Admin.
  const scopedClients = clients;

  const salesList = useMemo(() => {
    const set = new Set(clients.map(c => c.sale).filter(Boolean));
    return Array.from(set);
  }, [clients]);
  // Sale đã nhớ mà không còn trong danh bạ -> về "Tất cả Sale" (không để bảng trống vì bộ lọc cũ).
  const saleFilter = saleFilterSaved === 'ALL' || salesList.includes(saleFilterSaved) ? saleFilterSaved : 'ALL';

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

  // Sắp xếp TRƯỚC khi cắt trang, để bấm tiêu đề cột là sắp cả danh sách chứ không chỉ trang đang xem.
  const { rows: sortedClients, sort, onSort } = useTableSort(filteredClients, COLS);
  const { safePage, pageItems: pagedClients } = usePagedSlice(sortedClients, page, PAGE_SIZE);

  const openAddModal = () => {
    setEditingClient(null);
    const f0 = { code: '', codeSearch: '', name: '', alias: '', type: 'Doanh nghiệp', sale: activeUser.saleId || '',
      address: '', status: 'Active', reconciliationAcct: '' };
    setForm(f0);
    setFormInit(JSON.stringify(f0));
    setSaveError('');
    setShowModal(true);
  };

  const openEditModal = (client) => {
    setEditingClient(client);
    const f0 = { code: client.rawCode != null ? client.rawCode : (client.code || ''), codeSearch: client.codeSearch || '',
      name: client.name || '', alias: client.alias || '', type: client.type || 'Doanh nghiệp', sale: client.sale || '',
      address: client.address || '', status: client.status || 'Active', reconciliationAcct: client.reconciliationAcct || '' };
    setForm(f0);
    setFormInit(JSON.stringify(f0));
    setSaveError('');
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingClient(null); setForm(null); setFormInit(''); setSaveError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const f = form;
    if (!f || savingAdd || savingEdit) return;
    // Cắt khoảng trắng đầu-cuối (kể cả NBSP dán từ Excel) TRƯỚC khi so trùng và lưu (Đợt 3).
    const data = {
      code: catKhoangTrang(f.code), codeSearch: catKhoangTrang(f.codeSearch).toUpperCase(), name: catKhoangTrang(f.name), alias: catKhoangTrang(f.alias),
      type: f.type, sale: catKhoangTrang(f.sale), address: catKhoangTrang(f.address), status: f.status, reconciliationAcct: catKhoangTrang(f.reconciliationAcct)
    };
    if (!data.codeSearch || !data.name) { setSaveError('Nhập đủ Search Code và Tên khách hàng (khoảng trắng đơn thuần không tính).'); return; }
    // Mã KH (Code SAP) trùng khách khác: chặn sớm cho khỏi chờ server. Server cũng chặn, nhưng báo lỗi sau một lượt gọi.
    // Không chặn Search Code trùng: một khách thật có thể có nhiều dòng danh bạ (khác địa chỉ/liên hệ).
    const trung = timMaTrung(clients, (c) => (c.rawCode != null ? c.rawCode : c.code), data.code, (c) => !!editingClient && (c === editingClient || (c.id != null ? c.id === editingClient.id : c.code === editingClient.code)));
    if (trung) { setSaveError(`Mã KH ${data.code} đã có trong danh bạ (${trung.codeSearch} — ${trung.name}). ${editingClient ? 'Mỗi khách chỉ có một Code.' : 'Dùng nút Sửa của khách đó nếu cần cập nhật.'}`); return; }
    setSaveError('');
    // onEditClient/onAddClient trả { ok, error } (withOptimistic ở App.jsx) — chỉ đóng modal khi đã lưu thật.
    if (editingClient) {
      setSavingEdit(true);
      try {
        const kq = await onEditClient({ ...editingClient, ...data, rawCode: data.code, code: data.code || editingClient.code });
        if (kq && kq.ok === false) setSaveError(kq.error || 'Không lưu được, thử lại.');
        else closeModal();
      } finally {
        setSavingEdit(false);
      }
    } else {
      // Chưa có mã SAP thì cấp mã tạm CLI-xxxx như trước (khoá dòng trên màn); có mã thì server chặn trùng.
      const code = data.code || ('CLI-' + Math.floor(1000 + Math.random() * 9000));
      setSavingAdd(true);
      try {
        const kq = await onAddClient({ ...data, code, rawCode: code, address: data.address || 'Hà Nội' });
        if (kq && kq.ok === false) setSaveError(kq.error || 'Không lưu được, thử lại.');
        else closeModal();
      } finally {
        setSavingAdd(false);
      }
    }
  };

  const doiMaChu = !!(editingClient && form && form.codeSearch.trim().toUpperCase() !== String(editingClient.codeSearch || '').toUpperCase());
  const saving = savingAdd || savingEdit;
  const formDirty = !!form && JSON.stringify(form) !== formInit;
  useUnsavedGuard(showModal && formDirty, 'Form khách hàng');

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
            <Lock size={12} /> {NHAN_CHI_XEM}
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
            <option value="Active">Đang hoạt động</option>
            <option value="Inactive">Ngừng hoạt động</option>
            <option value="ALL">Tất cả trạng thái</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="badge badge-purple">Hiển thị {filteredClients.length} Đối tác</span>

          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <TableState
        isEmpty={filteredClients.length === 0}
        emptyText="Không tìm thấy khách hàng nào khớp với bộ lọc hiện tại."
        emptyHint={searchTerm ? `Từ khóa: "${searchTerm}"` : undefined}
      >
      {viewMode === 'table' ? (
      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <SortableTh col="code" sort={sort} onSort={onSort}>Code</SortableTh>
              <SortableTh col="codeSearch" sort={sort} onSort={onSort}>Search Code</SortableTh>
              <SortableTh col="name" sort={sort} onSort={onSort}>Tên Khách Hàng</SortableTh>
              <SortableTh col="sale" sort={sort} onSort={onSort}>Sale phụ trách</SortableTh>
              <SortableTh col="address" sort={sort} onSort={onSort}>Địa chỉ</SortableTh>
              <SortableTh col="status" sort={sort} onSort={onSort}>Trạng thái</SortableTh>
              {canEditExisting && <th style={{ width: '110px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {pagedClients.map((client) => (
              <tr key={client.code || client.name}>
                <td className="code-font" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.code}</td>
                <td className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)', fontSize: '0.8rem' }}>{client.codeSearch}</td>
                <td style={{ fontWeight: 700 }}>{client.name}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{client.sale}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.address || 'Hà Nội'}</td>
                <td><StatusBadge status={client.status || 'Active'} /></td>
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
                <span className="code-font" style={{ fontSize: '0.75rem', color: 'var(--cyan-text)', fontWeight: 800 }}>
                  Search Code: {client.codeSearch}
                </span>
                {client.code && (
                  <span className="code-font" style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: '8px' }}>
                    Code: {client.code}
                  </span>
                )}
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: 'var(--text-main)' }}>{client.name}</h4>
              </div>
              <StatusBadge status={client.status || 'Active'} />
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
      </TableState>

      <Pagination
        page={safePage}
        pageSize={PAGE_SIZE}
        totalItems={filteredClients.length}
        onPageChange={setPage}
        itemLabel="khách hàng"
      />

      {/* Modal thêm / sửa — cùng một form đủ trường (30/09/2026). Khung chung: Esc, focus, role=dialog. */}
      {showModal && form && (
        <Modal
          title={editingClient ? `Chỉnh Sửa Khách Hàng — ${editingClient.codeSearch}` : 'Thêm Khách Hàng OEM Mới'}
          width={620}
          onClose={closeModal}
          busy={saving}
          dirty={formDirty}
        >
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
                <option value="Active">Đang hoạt động</option>
                <option value="Inactive">Ngừng hoạt động</option>
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
            {saveError && (
              <div role="alert" style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: 'var(--danger)', background: 'var(--danger-bg)', padding: '8px 10px', borderRadius: 'var(--radius-md)' }}>
                {saveError}
              </div>
            )}
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button type="button" onClick={closeModal} className="btn btn-secondary" disabled={saving}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : editingClient ? 'Lưu Thay Đổi' : 'Lưu Khách Hàng'}
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
}
