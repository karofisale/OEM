import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ClipboardList, RefreshCw, Copy, Check, Save, Loader2, Trash2, FileSpreadsheet, ArrowDownUp, Search, X, AlertTriangle } from 'lucide-react';
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
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { lamSachLoi } from '../utils/errorText';
import { giaTriDong, dungTsvDon, dongDaSua, luuTuanTu, cauKetQuaLuu, khoiPhucSuaDo, boSuaDo, locNhomDon, coLocDon } from '../utils/ordersEdit';

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
  // "Lưu cả đơn" đang chạy cho đơn nào ('' = không). Khoá nút Lưu từng dòng của đơn đó để hai đường lưu không chồng nhau.
  const [savingOrderNo, setSavingOrderNo] = useState('');
  // Tìm (SO / khách / mã VT) + lọc ngày tạo từ–đến theo giờ VN (Đợt 3). Không nhớ qua F5: là thao tác tra cứu tức thời.
  const [searchTerm, setSearchTerm] = useState('');
  const [tuNgay, setTuNgay] = useState('');
  const [denNgay, setDenNgay] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm);
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

  // Đọc qua ref để các hàm async (lưu cả đơn, chèn/xoá rồi tải lại) luôn thấy sửa đổi MỚI NHẤT, không phải bản chụp
  // lúc bấm — người dùng vẫn gõ tiếp trong lúc chờ máy chủ.
  const editedRef = useRef(editedRows);
  editedRef.current = editedRows;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  // Trả danh sách đơn mới (hoặc null nếu lỗi). `{ giuSua: true }`: KHÔNG tự dọn sửa đổi của dòng không còn tồn tại —
  // chèn/xoá dòng tự khớp lại (taiLaiGiuSua). Handler onClick truyền Event vào tham số này nên chỉ nhận đúng `giuSua === true`.
  const fetchOrders = async (opts) => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = (await api.getOrders(token)) || [];
      setOrders(data);
      if (!(opts && opts.giuSua === true)) {
        // Tải lại thường: sửa dở của dòng đã biến mất (người khác xoá) không còn chỗ gắn -> bỏ, kẻo cảnh báo "chưa lưu" kẹt mãi.
        const co = new Set(data.map((o) => Number(o.rowIndex)));
        setEditedRows((prev) => {
          const ma = Object.keys(prev).filter((k) => !co.has(Number(k)));
          return ma.length ? boSuaDo(prev, ma) : prev;
        });
      }
      if (onLoaded) onLoaded();
      return data;
    } catch (err) {
      setLoadError(err.message || String(err));
      return null;
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

  // Tìm + lọc ngày (Đợt 3). Lọc ở mức ĐƠN: một đơn hiện nếu bất kỳ dòng nào khớp từ khoá. Dòng đang sửa dở của đơn bị lọc ẩn
  // vẫn còn trong bộ nhớ — banner bên dưới báo để không ai tưởng đã mất.
  const locBoLoc = { q: debouncedSearch, tu: tuNgay, den: denNgay, khachTheoMa: clientByCode };
  const dangLoc = coLocDon(locBoLoc);
  const hienThi = useMemo(() => locNhomDon(groups, locBoLoc), [groups, debouncedSearch, tuNgay, denNgay, clientByCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const tuSauDen = !!(tuNgay && denNgay && tuNgay > denNgay);
  const xoaLoc = () => { setSearchTerm(''); setTuNgay(''); setDenNgay(''); };

  // Số dòng đang có sửa chưa lưu (chỉ đếm dòng còn tồn tại trong danh sách).
  const soDongChuaLuu = useMemo(() => {
    const co = new Set(orders.map((o) => Number(o.rowIndex)));
    return Object.keys(editedRows).filter((k) => co.has(Number(k))).length;
  }, [editedRows, orders]);
  // F5 / đổi tab khi còn dòng đã sửa mà chưa bấm Lưu -> cảnh báo (Đợt 2 / mục 5).
  useUnsavedGuard(soDongChuaLuu > 0, 'Đơn hàng chờ duyệt');

  // Đơn có sửa dở nhưng đang bị bộ lọc ẩn.
  const donSuaDoBiAn = useMemo(() => {
    if (!dangLoc) return 0;
    const dangHien = new Set(hienThi.map(([no]) => no));
    const co = new Set();
    orders.forEach((o) => { if (editedRows[o.rowIndex] && !dangHien.has(o.orderNo)) co.add(o.orderNo); });
    return co.size;
  }, [dangLoc, hienThi, orders, editedRows]);

  const getValue = (row, field) => {
    const edited = editedRows[row.rowIndex];
    return edited && edited[field] !== undefined ? edited[field] : row[field];
  };

  const handleFieldChange = (rowIndex, field, value) => {
    setEditedRows(prev => ({ ...prev, [rowIndex]: { ...(prev[rowIndex] || {}), [field]: value } }));
  };

  const hasEdits = (rowIndex) => !!editedRows[rowIndex];

  // Lưu MỘT dòng (ném lỗi nếu hỏng) — dùng chung cho nút "Lưu" từng dòng và "Lưu cả đơn".
  // Giá trị lấy từ sửa đổi MỚI NHẤT (ref). Lưu xong chỉ xoá bản sửa nếu người dùng chưa gõ thêm trong lúc chờ
  // (so tham chiếu: mỗi lần gõ tạo object mới), không thì dòng vẫn "chưa lưu" đúng như thực tế.
  const luuMotDong = async (row) => {
    const sua = editedRef.current[row.rowIndex];
    const g = giaTriDong(row, sua);
    const payload = { sku: g.sku, name: g.name, qty: g.qty, price: g.price, total: g.total, clientCode: g.clientCode, clientCodeSearch: g.clientCodeSearch };
    await api.updateOrderLine(token, row.rowIndex, payload);
    setOrders(prev => prev.map(o => o.rowIndex === row.rowIndex ? { ...o, ...payload } : o));
    setEditedRows(prev => {
      if (prev[row.rowIndex] !== sua) return prev;
      const next = { ...prev };
      delete next[row.rowIndex];
      return next;
    });
    return payload;
  };

  const handleSaveRow = async (row) => {
    if (savingRow != null || savingOrderNo) return;
    setSavingRow(row.rowIndex);
    try {
      await luuMotDong(row);
    } catch (err) {
      toast.error('Không lưu được thay đổi: ' + err.message);
    } finally {
      setSavingRow(null);
    }
  };

  // "Lưu cả đơn": gom mọi dòng của đơn đang có sửa, lưu LẦN LƯỢT (một dòng hỏng không chặn các dòng sau) rồi báo
  // từng dòng. Dòng hỏng giữ nguyên số đã sửa để thử lại. Trả danh sách kết quả, hoặc null nếu không chạy.
  const handleSaveOrder = async (orderNo, rows) => {
    if (savingOrderNo || savingRow != null) return null;
    const dirty = dongDaSua(rows, editedRef.current);
    if (!dirty.length) return null;
    setSavingOrderNo(orderNo);
    try {
      const kq = await luuTuanTu(dirty, luuMotDong);
      const tt = cauKetQuaLuu(kq, (r) => r.sku || `dòng ${r.rowIndex}`);
      if (tt.loi) toast.error(tt.text); else toast.success(tt.text);
      return kq;
    } finally {
      setSavingOrderNo('');
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

  // Tải lại danh sách SAU khi chèn/xoá mà KHÔNG làm mất sửa đổi chưa lưu của các dòng khác (Đợt 3).
  // Trước đây xoá sạch mọi sửa đổi vì sợ chỉ số dòng dịch chuyển; nay rowIndex là id Postgres (ổn định) nên sửa đổi giữ
  // nguyên chỗ. Phòng khi quay lại backend cũ (chỉ số dịch), khoiPhucSuaDo đối chiếu NỘI DUNG GỐC của dòng và chỉ giữ
  // khi còn khớp — không khớp thì tìm theo nội dung, không thấy thì bỏ và báo, không bao giờ gắn nhầm vào dòng khác.
  const taiLaiGiuSua = async (idsBo = []) => {
    const cu = ordersRef.current;
    const moi = await fetchOrders({ giuSua: true });
    if (!moi) { setEditedRows((prev) => boSuaDo(prev, idsBo)); return; }
    const kq = khoiPhucSuaDo(boSuaDo(editedRef.current, idsBo), cu, moi);
    setEditedRows(kq.edited);
    if (kq.mat.length) {
      toast.info(`${kq.mat.length} dòng sửa dở không khớp lại được sau khi tải lại (${kq.mat.map((m) => m.sku || `#${m.rowIndex}`).join(', ')}) nên đã bỏ — kiểm tra lại các dòng này.`);
    }
  };

  const handleInsertRow = async (row, position) => {
    if (savingOrderNo) return;
    setBusyRowIndex(row.rowIndex);
    try {
      await api.insertOrderLine(token, row.rowIndex, position, {});
      await taiLaiGiuSua();
    } catch (err) {
      toast.error('Không chèn được dòng: ' + err.message);
    } finally {
      setBusyRowIndex(null);
    }
  };

  const handleDeleteRow = (row) => setConfirming({
    kind: 'row',
    title: 'Xoá dòng này?',
    message: `Dòng "${row.sku || '(chưa có mã)'} — ${row.name || ''}" sẽ bị xoá khỏi danh sách đơn.${hasEdits(row.rowIndex) ? ' Phần bạn đang sửa dở ở dòng này cũng mất.' : ''} Các dòng khác đang sửa dở vẫn được giữ.`,
    confirmLabel: 'Xoá dòng',
    danger: true,
    run: () => deleteRowConfirmed(row)
  });

  const deleteRowConfirmed = async (row) => {
    if (savingOrderNo) return;
    setBusyRowIndex(row.rowIndex);
    try {
      await api.deleteOrderLine(token, row.rowIndex);
      await taiLaiGiuSua([row.rowIndex]);
    } catch (err) {
      toast.error('Không xoá được dòng: ' + err.message);
    } finally {
      setBusyRowIndex(null);
    }
  };

  const handleDeleteOrder = (orderNo) => {
    const coSua = dongDaSua(ordersRef.current.filter((o) => o.orderNo === orderNo), editedRef.current).length;
    setConfirming({
      kind: 'order',
      title: `Xoá toàn bộ đơn ${orderNo}?`,
      message: `Tất cả các dòng của đơn này sẽ bị xoá khỏi danh sách đơn${coSua ? ` (kể cả ${coSua} dòng đang sửa dở)` : ''}. Thao tác này không thể hoàn tác. Các đơn khác không bị ảnh hưởng.`,
      confirmLabel: 'Xoá cả đơn',
      danger: true,
      run: () => deleteOrderConfirmed(orderNo)
    });
  };

  const deleteOrderConfirmed = async (orderNo) => {
    setDeletingOrderNo(orderNo);
    try {
      await api.deleteOrder(token, orderNo);
      // Chỉ bỏ sửa đổi của CHÍNH đơn bị xoá; đơn khác giữ nguyên.
      const ids = ordersRef.current.filter((o) => o.orderNo === orderNo).map((o) => o.rowIndex);
      await taiLaiGiuSua(ids);
    } catch (err) {
      toast.error('Không xoá được đơn hàng: ' + err.message);
    } finally {
      setDeletingOrderNo('');
    }
  };

  const copyText = async (orderNo, tsv, sauKhiLuu) => {
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedOrderNo(orderNo);
      setTimeout(() => setCopiedOrderNo(''), 2000);
    } catch (err) {
      // Trình duyệt chỉ cho sao chép ngay sau thao tác của người dùng; chờ lưu vài giây là hết "quyền" đó.
      if (sauKhiLuu) toast.info('Đã lưu xong. Trình duyệt không cho tự sao chép sau khi chờ — bấm "Copy Dán SAP" một lần nữa.');
      else toast.error('Không sao chép được vào bộ nhớ tạm — trình duyệt đang chặn. Thử lại hoặc dùng Xuất Excel.');
    }
  };

  // "Copy dán SAP" phải dán đúng SỐ ĐANG SỬA, và số đó phải đã nằm trên server (Đợt 3). Bản cũ copy số CHƯA SỬA
  // trong khi màn hình đã hiện số mới -> dán sai vào SAP. Đơn còn dòng sửa dở thì hỏi: lưu rồi copy (không copy số chưa lưu).
  const handleCopyGroup = (orderNo, rows) => {
    const dirty = dongDaSua(rows, editedRef.current);
    if (dirty.length && canEditOrder(rows[0].pic)) {
      setConfirming({
        kind: 'copy',
        title: 'Đơn còn dòng sửa chưa lưu',
        message: `Đơn ${orderNo} có ${dirty.length} dòng đã sửa nhưng chưa lưu. Mã dán vào SAP phải khớp số đã lưu — lưu ${dirty.length} dòng này rồi copy luôn?`,
        confirmLabel: 'Lưu rồi Copy',
        cancelLabel: 'Để sau',
        run: () => saveThenCopy(orderNo, rows)
      });
      return;
    }
    copyText(orderNo, dungTsvDon(rows, editedRef.current));
  };

  const saveThenCopy = async (orderNo, rows) => {
    const tsv = dungTsvDon(rows, editedRef.current);   // chụp số đang sửa TRƯỚC khi lưu (sau khi lưu bản sửa bị xoá)
    const kq = await handleSaveOrder(orderNo, rows);
    if (!kq) return;
    if (kq.some((r) => !r.ok)) return;                  // đã báo lỗi từng dòng; không copy số chưa lưu được
    await copyText(orderNo, tsv, true);
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

      {/* Tìm + lọc ngày (Đợt 3). Ngày tính theo GIỜ VIỆT NAM của ngày tạo đơn; gồm cả hai đầu. */}
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 16px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '36px' }}
            placeholder="Tìm theo Mã SO, khách hàng, mã vật tư..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Tìm đơn hàng"
          />
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          Từ ngày
          <input type="date" className="input-field" style={{ width: '150px', padding: '6px 10px' }} value={tuNgay} max={denNgay || undefined} onChange={(e) => setTuNgay(e.target.value)} aria-label="Lọc từ ngày" />
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          Đến ngày
          <input type="date" className="input-field" style={{ width: '150px', padding: '6px 10px' }} value={denNgay} min={tuNgay || undefined} onChange={(e) => setDenNgay(e.target.value)} aria-label="Lọc đến ngày" />
        </label>
        {dangLoc && (
          <button type="button" onClick={xoaLoc} className="btn btn-ghost btn-sm"><X size={14} /> Xoá lọc</button>
        )}
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {dangLoc ? <>Hiện <strong>{hienThi.length.toLocaleString('vi-VN')}</strong> / {groups.length.toLocaleString('vi-VN')} đơn</> : <>{groups.length.toLocaleString('vi-VN')} đơn</>}
        </span>
      </div>

      {tuSauDen && (
        <div className="state-card state-error" role="alert"><span>"Từ ngày" đang sau "Đến ngày" nên không có đơn nào khớp — đổi lại một trong hai ngày.</span></div>
      )}

      {donSuaDoBiAn > 0 && (
        <div role="alert" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <AlertTriangle size={16} />
          <span>Có {donSuaDoBiAn} đơn đang sửa dở nhưng bị bộ lọc ẩn — chưa lưu.</span>
          <button type="button" onClick={xoaLoc} className="btn btn-secondary btn-sm">Xoá lọc để xem</button>
        </div>
      )}

      {/* Tải / lỗi / rỗng dùng chung một mẫu (TableState). Đang tải lại mà đã có danh sách thì GIỮ danh
          sách (các dòng đang sửa không bị che), chỉ nút "Tải lại" quay. Lỗi mà đã có danh sách thì hiện
          thanh lỗi + Thử lại phía trên, không xoá danh sách. */}
      {loadError && groups.length > 0 && (
        <div className="state-card state-error" role="alert">
          <span>Không tải lại được danh sách đơn hàng: {lamSachLoi(loadError)}</span>
          <button type="button" onClick={fetchOrders} className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Thử lại</button>
        </div>
      )}

      <TableState
        loading={isLoading && groups.length === 0 && !loadError}
        error={groups.length === 0 ? loadError : ''}
        isEmpty={!isLoading && hienThi.length === 0}
        errorPrefix="Không tải được danh sách đơn hàng"
        loadingLabel="Đang tải danh sách đơn hàng chờ duyệt..."
        emptyText={groups.length > 0 ? 'Không có đơn nào khớp bộ lọc hiện tại.' : 'Chưa có đơn hàng nào được lưu.'}
        emptyAction={groups.length > 0 ? <button type="button" onClick={xoaLoc} className="btn btn-secondary btn-sm"><X size={14} /> Xoá lọc</button> : undefined}
        onRetry={fetchOrders}
      >
      {hienThi.map(([orderNo, rows]) => {
        const groupTotal = rows.reduce((sum, r) => sum + (Number(getValue(r, 'qty')) * Number(getValue(r, 'price')) || r.total || 0), 0);
        // Mọi dòng của một đơn dùng chung PIC (ghi một lần lúc lưu đơn), nên
        // khoá theo cả đơn chứ không theo từng dòng.
        const canEditThis = canEditOrder(rows[0].pic);
        const soSuaDon = canEditThis ? dongDaSua(rows, editedRows).length : 0;
        const dangLuuDon = savingOrderNo === orderNo;
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
              {/* Một nút chính: đơn còn dòng sửa dở -> "Lưu cả đơn"; không còn -> "Copy dán SAP" (bước tiếp theo của đơn).
                  Xuất Excel / Xoá gom vào "Thêm". */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {soSuaDon > 0 && (
                  <button
                    onClick={() => handleSaveOrder(orderNo, rows)}
                    disabled={dangLuuDon || !!savingOrderNo || savingRow != null}
                    className="btn btn-primary btn-sm"
                    title="Lưu tất cả các dòng đã sửa của đơn này một lượt"
                  >
                    {dangLuuDon ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {dangLuuDon ? 'Đang lưu...' : `Lưu cả đơn (${soSuaDon})`}
                  </button>
                )}
                <button
                  onClick={() => handleCopyGroup(orderNo, rows)}
                  className={soSuaDon > 0 ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
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
                                disabled={savingRow === row.rowIndex || !!savingOrderNo}
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
          cancelLabel={confirming.cancelLabel || 'Hủy'}
          danger={!!confirming.danger}
          onConfirm={() => { const run = confirming.run; setConfirming(null); run(); }}
          onCancel={() => setConfirming(null)}
        />
      )}

    </div>
  );
}
