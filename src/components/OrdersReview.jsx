import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardList, RefreshCw, Copy, Check, Save, AlertCircle, Loader2, Trash2, FileSpreadsheet } from 'lucide-react';
import * as api from '../services/api';
import LoadingScreen from './LoadingScreen';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './ToastProvider';
import SkuPickerCell from './SkuPickerCell';
import ClientPickerCell from './ClientPickerCell';
import RowActionButtons from './RowActionButtons';

export default function OrdersReview({ token, activeUser, materials, clients, isActive = true, isStale = true, onLoaded }) {
  const toast = useToast();
  // Pending destructive action awaiting confirmation, replacing window.confirm().
  const [confirming, setConfirming] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editedRows, setEditedRows] = useState({}); // rowIndex -> { sku, name, qty, price }
  const [savingRow, setSavingRow] = useState(null);
  const [busyRowIndex, setBusyRowIndex] = useState(null); // insert/delete in flight
  const [copiedOrderNo, setCopiedOrderNo] = useState('');
  const [deletingOrderNo, setDeletingOrderNo] = useState('');
  const [exportingOrderNo, setExportingOrderNo] = useState('');
  const [exportingAll, setExportingAll] = useState(false);

  // Orders sheet only stores Mã KH (code) + Mã KH Chữ (codeSearch) — resolve the
  // full display name by looking the code up against the loaded client list.
  const clientByCode = useMemo(() => {
    const map = new Map();
    (clients || []).forEach(c => map.set(String(c.code), c));
    return map;
  }, [clients]);

  const canEdit = ['creator', 'admin', 'sale'].includes(activeUser.role);
  // Whole-order delete is more destructive than a single-row delete (already
  // available to sale/admin above) — restrict to Admin/Creator (phòng lên đơn trùng/nhầm).
  const canDeleteOrder = ['admin', 'creator'].includes(activeUser.role);

  const fetchOrders = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.getOrders(token);
      setOrders(data || []);
      if (onLoaded) onLoaded();
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // This component now stays mounted once opened, so a bare `useEffect(..., [])`
  // would fetch only once ever and then show stale orders forever. Instead it
  // fetches when the tab is on screen AND something has actually changed —
  // first open, or a new order saved from the AI agent (App sets ordersStale).
  // Previously the component unmounted on every tab switch, so returning to it
  // always paid a full backend round-trip even when nothing had changed.
  useEffect(() => {
    if (isActive && isStale) fetchOrders();
  }, [isActive, isStale]);

  // Sale chỉ thấy đơn do mình tạo (cột PIC); admin/creator/leader xem toàn bộ.
  const visibleOrders = useMemo(() => {
    if (activeUser.role === 'sale') {
      return orders.filter(o => o.pic === activeUser.name);
    }
    return orders;
  }, [orders, activeUser]);

  const groups = useMemo(() => {
    const map = new Map();
    visibleOrders.forEach(o => {
      if (!map.has(o.orderNo)) map.set(o.orderNo, []);
      map.get(o.orderNo).push(o);
    });
    return Array.from(map.entries()).sort((a, b) => (b[1][0].createdAt || '').localeCompare(a[1][0].createdAt || ''));
  }, [visibleOrders]);

  const getValue = (row, field) => {
    const edited = editedRows[row.rowIndex];
    return edited && edited[field] !== undefined ? edited[field] : row[field];
  };

  const handleFieldChange = (rowIndex, field, value) => {
    setEditedRows(prev => ({ ...prev, [rowIndex]: { ...(prev[rowIndex] || {}), [field]: value } }));
  };

  const hasEdits = (rowIndex) => !!editedRows[rowIndex];

  const handleSaveRow = async (row) => {
    setSavingRow(row.rowIndex);
    const qty = parseFloat(getValue(row, 'qty')) || 0;
    const price = parseFloat(getValue(row, 'price')) || 0;
    const sku = String(getValue(row, 'sku') || '').trim();
    const name = String(getValue(row, 'name') || '').trim();
    const clientCode = String(getValue(row, 'clientCode') || '').trim();
    const clientCodeSearch = String(getValue(row, 'clientCodeSearch') || '').trim();
    const total = qty * price;
    try {
      await api.updateOrderLine(token, row.rowIndex, { sku, name, qty, price, total, clientCode, clientCodeSearch });
      setOrders(prev => prev.map(o => o.rowIndex === row.rowIndex ? { ...o, sku, name, qty, price, total, clientCode, clientCodeSearch } : o));
      setEditedRows(prev => { const next = { ...prev }; delete next[row.rowIndex]; return next; });
    } catch (err) {
      toast.error('Không lưu được thay đổi: ' + err.message);
    } finally {
      setSavingRow(null);
    }
  };

  // Selecting from the combobox updates sku+name together, marked as a pending edit
  // just like typing qty/price — still needs an explicit "Lưu" to persist.
  const handleSkuSelect = (row, material) => {
    setEditedRows(prev => ({
      ...prev,
      [row.rowIndex]: { ...(prev[row.rowIndex] || {}), sku: material.sku, name: material.name }
    }));
  };

  // Same pattern for correcting a wrongly-detected client on one line — pending
  // edit until "Lưu" is clicked, doesn't touch the other rows of the same order.
  const handleClientSelect = (row, client) => {
    setEditedRows(prev => ({
      ...prev,
      [row.rowIndex]: { ...(prev[row.rowIndex] || {}), clientCode: client.code, clientCodeSearch: client.codeSearch }
    }));
  };

  // Insert/delete mutate real Sheet rows, which shifts every rowIndex after the
  // affected one — simplest correct approach is to just refetch the whole list.
  const handleInsertRow = async (row, position) => {
    setBusyRowIndex(row.rowIndex);
    try {
      await api.insertOrderLine(token, row.rowIndex, position, {});
      // Row indices below the insert point shift, so any unsaved edits keyed by the
      // old rowIndex would silently land on the wrong row after refetch — drop them.
      setEditedRows({});
      await fetchOrders();
    } catch (err) {
      toast.error('Không chèn được dòng: ' + err.message);
    } finally {
      setBusyRowIndex(null);
    }
  };

  const handleDeleteRow = (row) => setConfirming({
    kind: 'row',
    title: 'Xóa dòng này?',
    message: `Dòng "${row.sku || '(chưa có mã)'} — ${row.name || ''}" sẽ bị xóa khỏi tab Orders.`,
    confirmLabel: 'Xóa dòng',
    run: () => deleteRowConfirmed(row)
  });

  const deleteRowConfirmed = async (row) => {
    setBusyRowIndex(row.rowIndex);
    try {
      await api.deleteOrderLine(token, row.rowIndex);
      setEditedRows({});
      await fetchOrders();
    } catch (err) {
      toast.error('Không xóa được dòng: ' + err.message);
    } finally {
      setBusyRowIndex(null);
    }
  };

  const handleDeleteOrder = (orderNo) => setConfirming({
    kind: 'order',
    title: `Xóa toàn bộ đơn ${orderNo}?`,
    message: 'Tất cả các dòng của đơn này sẽ bị xóa khỏi tab Orders. Thao tác này không thể hoàn tác.',
    confirmLabel: 'Xóa cả đơn',
    run: () => deleteOrderConfirmed(orderNo)
  });

  const deleteOrderConfirmed = async (orderNo) => {
    setDeletingOrderNo(orderNo);
    try {
      await api.deleteOrder(token, orderNo);
      setEditedRows({});
      await fetchOrders();
    } catch (err) {
      toast.error('Không xóa được đơn hàng: ' + err.message);
    } finally {
      setDeletingOrderNo('');
    }
  };

  const handleCopyGroup = (orderNo, rows) => {
    let tsv = 'Mã vật tư\tTên vật tư\tSố lượng\tĐơn giá VND\tThành tiền VND\tMã KH\tMã KH Chữ\n';
    rows.forEach(r => {
      tsv += `${r.sku}\t${r.name}\t${r.qty}\t${r.price}\t${r.total}\t${r.clientCode}\t${r.clientCodeSearch}\n`;
    });
    navigator.clipboard.writeText(tsv);
    setCopiedOrderNo(orderNo);
    setTimeout(() => setCopiedOrderNo(''), 2000);
  };

  const buildExportRows = (rows) => rows.map(r => {
    const client = clientByCode.get(String(r.clientCode));
    return {
      'Mã Tham Chiếu SAP SO': r.orderNo,
      'Mã VT': r.sku,
      'Tên Vật Tư': r.name,
      'Số Lượng': r.qty,
      'Đơn Giá VND': r.price,
      'Thành Tiền VND': r.total,
      'Mã KH': r.clientCode,
      'Mã KH Chữ': r.clientCodeSearch,
      'Tên Khách Hàng': client ? client.name : '',
      'Ngày Tạo': r.createdAt,
      'PIC': r.pic
    };
  });

  // xlsx is lazy-loaded (large dependency) — only worth the download when an
  // export is actually requested, same pattern as DebtImporter's Excel import.
  const handleExportOrder = async (orderNo, rows) => {
    setExportingOrderNo(orderNo);
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(buildExportRows(rows));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, String(orderNo).slice(0, 31) || 'Don hang');
      XLSX.writeFile(wb, `Don_${orderNo}.xlsx`);
    } catch (err) {
      toast.error('Không xuất được file Excel: ' + err.message);
    } finally {
      setExportingOrderNo('');
    }
  };

  const handleExportAll = async () => {
    if (!visibleOrders.length) return;
    setExportingAll(true);
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(buildExportRows(visibleOrders));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Don Hang Cho Duyet');
      const today = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
      XLSX.writeFile(wb, `Don_Hang_Cho_Duyet_${today}.xlsx`);
    } catch (err) {
      toast.error('Không xuất được file Excel: ' + err.message);
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={24} color="var(--karofi-cyan)" /> Đơn Hàng Chờ Duyệt (tab Orders)
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Rà soát các đơn AI Agent đã tạo, chỉnh sửa nếu cần, rồi copy mã dán vào SAP.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleExportAll}
            disabled={exportingAll || !visibleOrders.length}
            className="btn btn-secondary btn-sm"
            title="Xuất toàn bộ các đơn đang hiển thị ra 1 file Excel"
          >
            {exportingAll ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            Xuất Excel Tất Cả
          </button>
          <button onClick={fetchOrders} disabled={isLoading} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Tải lại
          </button>
        </div>
      </div>

      {loadError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>
          <AlertCircle size={16} /> Không tải được danh sách đơn hàng: {loadError}
        </div>
      )}

      {/* `isLoading` was tracked but never rendered, so the tab showed a header
          and blank space for the whole fetch — which on this backend can be
          tens of seconds. */}
      {isLoading && !loadError && (
        <LoadingScreen compact label="Đang tải danh sách đơn hàng chờ duyệt..." />
      )}

      {!isLoading && !loadError && groups.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px 16px' }}>
          Chưa có đơn hàng nào được lưu vào tab Orders.
        </div>
      )}

      {groups.map(([orderNo, rows]) => {
        const groupTotal = rows.reduce((sum, r) => sum + (Number(getValue(r, 'qty')) * Number(getValue(r, 'price')) || r.total || 0), 0);
        return (
          <div key={orderNo} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <span className="code-font" style={{ fontWeight: 800, color: 'var(--accent-purple)' }}>{orderNo}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Mã KH: <strong>{rows[0].clientCode}{rows[0].clientCodeSearch ? ` - ${rows[0].clientCodeSearch}` : ''}</strong>
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rows[0].createdAt}</span>
                <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>PIC: {rows[0].pic}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleCopyGroup(orderNo, rows)}
                  className="btn btn-emerald btn-sm"
                  title="Copy các dòng của đơn này để dán vào SAP"
                >
                  {copiedOrderNo === orderNo ? <Check size={14} /> : <Copy size={14} />}
                  {copiedOrderNo === orderNo ? 'Đã Sao Chép!' : 'Copy Dán SAP'}
                </button>
                <button
                  onClick={() => handleExportOrder(orderNo, rows)}
                  disabled={exportingOrderNo === orderNo}
                  className="btn btn-secondary btn-sm"
                  title="Xuất riêng đơn này ra file Excel"
                >
                  {exportingOrderNo === orderNo ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                  Xuất Excel
                </button>
                {canDeleteOrder && (
                  <button
                    onClick={() => handleDeleteOrder(orderNo)}
                    disabled={deletingOrderNo === orderNo}
                    className="btn btn-secondary btn-sm"
                    style={{ color: 'var(--danger)' }}
                    title="Xóa toàn bộ đơn hàng này (phòng lên đơn trùng/nhầm)"
                  >
                    {deletingOrderNo === orderNo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Xóa Cả Đơn
                  </button>
                )}
              </div>
            </div>

            <div className="table-container">
              <table className="custom-table" style={{ fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '130px' }}>Mã VT</th>
                    <th>Tên Vật Tư</th>
                    <th style={{ width: '90px', textAlign: 'right' }}>Số Lượng</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>Đơn Giá</th>
                    <th style={{ width: '130px', textAlign: 'right' }}>Thành Tiền</th>
                    <th style={{ width: '220px' }}>Khách Hàng OEM (Mã KH / Mã KH Chữ)</th>
                    {canEdit && <th style={{ width: '150px' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.rowIndex}>
                      <td>
                        {canEdit ? (
                          <SkuPickerCell
                            sku={getValue(row, 'sku')}
                            name={getValue(row, 'name')}
                            materials={materials}
                            onSelect={(m) => handleSkuSelect(row, m)}
                          />
                        ) : (
                          <span className="code-font" style={{ fontWeight: 700, color: 'var(--code-blue)' }}>{row.sku}</span>
                        )}
                      </td>
                      <td>
                        {canEdit ? (
                          <input
                            className="input-field"
                            style={{ padding: '4px 6px', fontSize: '0.775rem' }}
                            value={getValue(row, 'name')}
                            onChange={(e) => handleFieldChange(row.rowIndex, 'name', e.target.value)}
                          />
                        ) : row.name}
                      </td>
                      <td>
                        {canEdit ? (
                          <input
                            type="number"
                            className="input-field"
                            style={{ padding: '4px 6px', fontSize: '0.775rem', textAlign: 'right' }}
                            value={getValue(row, 'qty')}
                            onChange={(e) => handleFieldChange(row.rowIndex, 'qty', e.target.value)}
                          />
                        ) : (
                          <div style={{ textAlign: 'right' }}>{row.qty.toLocaleString('vi-VN')}</div>
                        )}
                      </td>
                      <td>
                        {canEdit ? (
                          <input
                            type="number"
                            className="input-field"
                            style={{ padding: '4px 6px', fontSize: '0.775rem', textAlign: 'right' }}
                            value={getValue(row, 'price')}
                            onChange={(e) => handleFieldChange(row.rowIndex, 'price', e.target.value)}
                          />
                        ) : (
                          <div style={{ textAlign: 'right' }}>{row.price.toLocaleString('vi-VN')}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-emerald)', whiteSpace: 'nowrap' }}>
                        {Math.round((parseFloat(getValue(row, 'qty')) || 0) * (parseFloat(getValue(row, 'price')) || 0)).toLocaleString('vi-VN')} ₫
                      </td>
                      <td>
                        {canEdit ? (
                          <ClientPickerCell
                            code={getValue(row, 'clientCode')}
                            name={getValue(row, 'clientCodeSearch')}
                            clients={clients}
                            onSelect={(c) => handleClientSelect(row, c)}
                          />
                        ) : (
                          <span className="code-font" style={{ fontWeight: 700, color: 'var(--code-blue)' }}>{row.clientCode}</span>
                        )}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          {getValue(row, 'clientCodeSearch')}
                          {(() => {
                            const fullName = clientByCode.get(String(getValue(row, 'clientCode')))?.name;
                            return fullName ? ` — ${fullName}` : '';
                          })()}
                        </div>
                      </td>
                      {canEdit && (
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <RowActionButtons
                              onInsertAbove={() => handleInsertRow(row, 'above')}
                              onInsertBelow={() => handleInsertRow(row, 'below')}
                              onDelete={() => handleDeleteRow(row)}
                            />
                            {busyRowIndex === row.rowIndex && (
                              <div style={{ textAlign: 'center' }}><Loader2 size={13} className="animate-spin" /></div>
                            )}
                            {hasEdits(row.rowIndex) && (
                              <button
                                onClick={() => handleSaveRow(row)}
                                disabled={savingRow === row.rowIndex}
                                className="btn btn-primary btn-sm"
                                style={{ width: '100%' }}
                              >
                                {savingRow === row.rowIndex ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                Lưu
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              Tổng đơn: <span style={{ color: 'var(--accent-emerald-text)' }}>{Math.round(groupTotal).toLocaleString('vi-VN')} ₫</span>
            </div>
          </div>
        );
      })}

      {confirming && (
        <ConfirmDialog
          title={confirming.title}
          message={confirming.message}
          confirmLabel={confirming.confirmLabel}
          destructive
          onConfirm={() => { const run = confirming.run; setConfirming(null); run(); }}
          onCancel={() => setConfirming(null)}
        />
      )}

    </div>
  );
}
