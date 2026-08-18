import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardList, RefreshCw, Copy, Check, Save, AlertCircle, Loader2 } from 'lucide-react';
import * as api from '../services/api';
import SkuPickerCell from './SkuPickerCell';
import RowActionButtons from './RowActionButtons';

export default function OrdersReview({ token, activeUser, materials }) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editedRows, setEditedRows] = useState({}); // rowIndex -> { sku, name, qty, price }
  const [savingRow, setSavingRow] = useState(null);
  const [busyRowIndex, setBusyRowIndex] = useState(null); // insert/delete in flight
  const [copiedOrderNo, setCopiedOrderNo] = useState('');

  const canEdit = ['creator', 'admin', 'sale'].includes(activeUser.role);

  const fetchOrders = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.getOrders(token);
      setOrders(data || []);
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

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
    const total = qty * price;
    try {
      await api.updateOrderLine(token, row.rowIndex, { sku, name, qty, price, total });
      setOrders(prev => prev.map(o => o.rowIndex === row.rowIndex ? { ...o, sku, name, qty, price, total } : o));
      setEditedRows(prev => { const next = { ...prev }; delete next[row.rowIndex]; return next; });
    } catch (err) {
      alert('Không lưu được thay đổi: ' + err.message);
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
      alert('Không chèn được dòng: ' + err.message);
    } finally {
      setBusyRowIndex(null);
    }
  };

  const handleDeleteRow = async (row) => {
    if (!window.confirm('Xóa dòng này khỏi tab Orders?')) return;
    setBusyRowIndex(row.rowIndex);
    try {
      await api.deleteOrderLine(token, row.rowIndex);
      setEditedRows({});
      await fetchOrders();
    } catch (err) {
      alert('Không xóa được dòng: ' + err.message);
    } finally {
      setBusyRowIndex(null);
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

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={24} color="#00a0e9" /> Đơn Hàng Chờ Duyệt (tab Orders)
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Rà soát các đơn AI Agent đã tạo, chỉnh sửa nếu cần, rồi copy mã dán vào SAP.
          </p>
        </div>
        <button onClick={fetchOrders} disabled={isLoading} className="btn btn-secondary btn-sm">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Tải lại
        </button>
      </div>

      {loadError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>
          <AlertCircle size={16} /> Không tải được danh sách đơn hàng: {loadError}
        </div>
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
                  Mã KH: <strong>{rows[0].clientCodeSearch || rows[0].clientCode}</strong>
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rows[0].createdAt}</span>
                <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>PIC: {rows[0].pic}</span>
              </div>
              <button
                onClick={() => handleCopyGroup(orderNo, rows)}
                className="btn btn-emerald btn-sm"
                title="Copy các dòng của đơn này để dán vào SAP"
              >
                {copiedOrderNo === orderNo ? <Check size={14} /> : <Copy size={14} />}
                {copiedOrderNo === orderNo ? 'Đã Sao Chép!' : 'Copy Dán SAP'}
              </button>
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
                    <th style={{ width: '160px' }}>Update Alias</th>
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
                          <span className="code-font" style={{ fontWeight: 700, color: '#0369a1' }}>{row.sku}</span>
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
                      <td style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{row.updateAlias}</td>
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
              Tổng đơn: <span style={{ color: '#34d399' }}>{Math.round(groupTotal).toLocaleString('vi-VN')} ₫</span>
            </div>
          </div>
        );
      })}

    </div>
  );
}
