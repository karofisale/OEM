import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardList, RefreshCw, Copy, Check, Save, Loader2, Trash2, FileSpreadsheet, ArrowDownUp } from 'lucide-react';
import * as api from '../services/api';
import TableState from './TableState';
import MoreMenu from './MoreMenu';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './ToastProvider';
import SkuPickerCell from './SkuPickerCell';
import ClientPickerCell from './ClientPickerCell';
import RowActionButtons from './RowActionButtons';
import { ownsOrder } from '../utils/roles';
import { vnDateSlug, hienNgay, sapXepNgay } from '../utils/vnDate';
import { usePersistentState } from '../hooks/usePersistentState';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';

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
  // Thứ tự các đơn nhớ qua F5 (Đợt 2 / mục 3, 9).
  const [orderSort, setOrderSort] = usePersistentState('orders.sort', 'newest', (v) => ['newest', 'oldest', 'total', 'orderNo'].includes(v));

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

  // 14/09/2026: mọi role thấy đơn của mọi người. Nhưng Sale chỉ SỬA được đơn
  // do chính mình tạo — xem canEditOrder bên dưới, và chốt thật ở backend
  // (oemAppRequireOrderOwnership_).
  const visibleOrders = orders;

  const canEditOrder = (pic) => canEdit && ownsOrder(activeUser, pic);

  const groups = useMemo(() => {
    const map = new Map();
    visibleOrders.forEach(o => {
      if (!map.has(o.orderNo)) map.set(o.orderNo, []);
      map.get(o.orderNo).push(o);
    });
    // So theo THỜI ĐIỂM đã đọc, không so chữ: createdAt dạng 'dd/MM/yyyy HH:mm' so như chữ sẽ xếp
    // 31/08 sau 01/10 (utils/vnDate.js). Đơn không đọc được ngày thì xuống cuối.
    const when = (g) => { const t = sapXepNgay(g[1][0].createdAt); return isNaN(t) ? -Infinity : t; };
    const tong = (g) => g[1].reduce((sum, r) => sum + (Number(r.total) || (Number(r.qty) * Number(r.price)) || 0), 0);
    const cmp = {
      newest: (a, b) => when(b) - when(a) || String(b[0]).localeCompare(String(a[0])),
      oldest: (a, b) => when(a) - when(b) || String(a[0]).localeCompare(String(b[0])),
      total: (a, b) => tong(b) - tong(a),
      orderNo: (a, b) => String(a[0]).localeCompare(String(b[0]), 'vi', { numeric: true })
    }[orderSort];
    return Array.from(map.entries()).sort((a, b) => {
      const x = when(a), y = when(b);
      if (orderSort === 'newest' && x === -Infinity && y === -Infinity) return 0;
      return cmp(a, b);
    });
  }, [visibleOrders, orderSort]);

  // F5 / đổi tab khi còn dòng đã sửa mà chưa bấm Lưu -> cảnh báo (Đợt 2 / mục 5).
  useUnsavedGuard(Object.keys(editedRows).length > 0, 'Đơn hàng chờ duyệt');

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
    title: 'Xoá dòng này?',
    message: `Dòng "${row.sku || '(chưa có mã)'} — ${row.name || ''}" sẽ bị xoá khỏi danh sách đơn.`,
    confirmLabel: 'Xoá dòng',
    run: () => deleteRowConfirmed(row)
  });

  const deleteRowConfirmed = async (row) => {
    setBusyRowIndex(row.rowIndex);
    try {
      await api.deleteOrderLine(token, row.rowIndex);
      setEditedRows({});
      await fetchOrders();
    } catch (err) {
      toast.error('Không xoá được dòng: ' + err.message);
    } finally {
      setBusyRowIndex(null);
    }
  };

  const handleDeleteOrder = (orderNo) => setConfirming({
    kind: 'order',
    title: `Xoá toàn bộ đơn ${orderNo}?`,
    message: 'Tất cả các dòng của đơn này sẽ bị xoá khỏi danh sách đơn. Thao tác này không thể hoàn tác.',
    confirmLabel: 'Xoá cả đơn',
    run: () => deleteOrderConfirmed(orderNo)
  });

  const deleteOrderConfirmed = async (orderNo) => {
    setDeletingOrderNo(orderNo);
    try {
      await api.deleteOrder(token, orderNo);
      setEditedRows({});
      await fetchOrders();
    } catch (err) {
      toast.error('Không xoá được đơn hàng: ' + err.message);
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
      const today = vnDateSlug();
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
            <ClipboardList size={24} color="var(--karofi-cyan)" /> Đơn Hàng Chờ Duyệt
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Rà soát các đơn AI Agent đã tạo, chỉnh sửa nếu cần, rồi copy mã dán vào SAP.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            <ArrowDownUp size={14} aria-hidden="true" />
            <select className="input-field" style={{ width: '170px', padding: '6px 10px' }} value={orderSort} onChange={(e) => setOrderSort(e.target.value)} aria-label="Sắp xếp các đơn">
              <option value="newest">Mới nhất trước</option>
              <option value="oldest">Cũ nhất trước</option>
              <option value="total">Tổng tiền cao → thấp</option>
              <option value="orderNo">Mã đơn A → Z</option>
            </select>
          </label>
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

      {/* Tải / lỗi / rỗng dùng chung một mẫu (TableState). Đang tải lại mà đã có danh sách thì GIỮ danh
          sách (các dòng đang sửa không bị che), chỉ nút "Tải lại" quay. Lỗi mà đã có danh sách thì hiện
          thanh lỗi + Thử lại phía trên, không xoá danh sách. */}
      {loadError && groups.length > 0 && (
        <div className="state-card state-error" role="alert">
          <span>Không tải lại được danh sách đơn hàng: {loadError}</span>
          <button type="button" onClick={fetchOrders} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Thử lại</button>
        </div>
      )}

      <TableState
        loading={isLoading && groups.length === 0 && !loadError}
        error={groups.length === 0 ? loadError : ''}
        isEmpty={!isLoading && groups.length === 0}
        errorPrefix="Không tải được danh sách đơn hàng"
        loadingLabel="Đang tải danh sách đơn hàng chờ duyệt..."
        emptyText="Chưa có đơn hàng nào được lưu."
        onRetry={fetchOrders}
      >
      {groups.map(([orderNo, rows]) => {
        const groupTotal = rows.reduce((sum, r) => sum + (Number(getValue(r, 'qty')) * Number(getValue(r, 'price')) || r.total || 0), 0);
        // Mọi dòng của một đơn dùng chung PIC (ghi một lần lúc lưu đơn), nên
        // khoá theo cả đơn chứ không theo từng dòng.
        const canEditThis = canEditOrder(rows[0].pic);
        return (
          <div key={orderNo} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <span className="code-font" style={{ fontWeight: 800, color: 'var(--purple-text)' }}>{orderNo}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Mã KH: <strong>{rows[0].clientCode}{rows[0].clientCodeSearch ? ` - ${rows[0].clientCodeSearch}` : ''}</strong>
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{hienNgay(rows[0].createdAt)}</span>
                <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>PIC: {rows[0].pic}</span>
              </div>
              {/* Một nút chính (Copy dán SAP — bước tiếp theo của đơn); Xuất Excel / Xoá gom vào "Thêm". */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => handleCopyGroup(orderNo, rows)}
                  className="btn btn-primary btn-sm"
                  title="Copy các dòng của đơn này để dán vào SAP"
                >
                  {copiedOrderNo === orderNo ? <Check size={14} /> : <Copy size={14} />}
                  {copiedOrderNo === orderNo ? 'Đã Sao Chép!' : 'Copy Dán SAP'}
                </button>
                <MoreMenu
                  items={[
                    {
                      label: exportingOrderNo === orderNo ? 'Đang xuất...' : 'Xuất Excel',
                      icon: <FileSpreadsheet size={14} />,
                      disabled: exportingOrderNo === orderNo,
                      onClick: () => handleExportOrder(orderNo, rows)
                    },
                    {
                      label: deletingOrderNo === orderNo ? 'Đang xoá...' : 'Xoá cả đơn',
                      icon: <Trash2 size={14} />,
                      danger: true,
                      hidden: !canDeleteOrder,
                      disabled: deletingOrderNo === orderNo,
                      onClick: () => handleDeleteOrder(orderNo)
                    }
                  ]}
                />
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
                    {canEditThis && <th style={{ width: '150px' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.rowIndex}>
                      <td>
                        {canEditThis ? (
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
                        {canEditThis ? (
                          <input
                            className="input-field"
                            style={{ padding: '4px 6px', fontSize: '0.775rem' }}
                            value={getValue(row, 'name')}
                            onChange={(e) => handleFieldChange(row.rowIndex, 'name', e.target.value)}
                          />
                        ) : row.name}
                      </td>
                      <td>
                        {canEditThis ? (
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
                        {canEditThis ? (
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
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-emerald-text)', whiteSpace: 'nowrap' }}>
                        {Math.round((parseFloat(getValue(row, 'qty')) || 0) * (parseFloat(getValue(row, 'price')) || 0)).toLocaleString('vi-VN')} ₫
                      </td>
                      <td>
                        {canEditThis ? (
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
                      {canEditThis && (
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
      </TableState>

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
