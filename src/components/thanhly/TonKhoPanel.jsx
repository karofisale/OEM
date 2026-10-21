import React, { useMemo, useState, useEffect } from 'react';
import { Search, Filter, Send, Loader2, X, ExternalLink, CheckCircle2, Info } from 'lucide-react';
import * as api from '../../services/api';
import Pagination, { usePagedSlice } from '../Pagination';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import ConfirmDialog from '../ConfirmDialog';
import ClientPickerCell from '../ClientPickerCell';
import { useToast } from '../ToastProvider';
import { useTableSort } from '../../hooks/useTableSort';
import { useDefaultPageSize } from '../../hooks/useSetting';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { lamSachLoi } from '../../utils/errorText';
import { locTon, danhSachNhom, nhomCua, lyDoKhongChon, dongDon, tongDon, loiDon, dinhDangTien } from '../../utils/thanhLy';

const PAGE_SIZE_MAC_DINH = 50;
const fmt = (v) => (Number(v) || 0).toLocaleString('vi-VN');
const COLS = [
  { key: 'sku' }, { key: 'name' }, { key: 'group' },
  { key: 'qty', type: 'number' }, { key: 'pending', type: 'number' }, { key: 'avail', type: 'number' }, { key: 'price', type: 'number' }
];

/**
 * Tab "Tồn kho & Lên đơn": tra cứu tồn kho thanh lý (lọc theo tên / mã / nhóm), tick các mã bán + nhập số lượng, chọn khách,
 * rồi "Xuất đơn chờ duyệt" — đơn đi thẳng vào "Đơn Hàng Chờ Duyệt" (mã TL-xxxxxx) cho Admin đưa vào SAP, xong xoá trên app.
 * Giá lấy từ Bảng giá thanh lý (đã gồm VAT), server dùng lại giá đó — số gửi lên không quyết định giá.
 */
export default function TonKhoPanel({ token, data, clients, onReload, onOrderSaved, onOpenOrders }) {
  const toast = useToast();
  const PAGE_SIZE = useDefaultPageSize(PAGE_SIZE_MAC_DINH);
  const items = data.items || [];
  const canOrder = !!data.canOrder;

  const [q, setQ] = useState('');
  const [nhom, setNhom] = useState('');
  const [chiConHang, setChiConHang] = useState(false);
  const [chiDaChon, setChiDaChon] = useState(false);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState({});            // { sku: số lượng (chữ đang gõ) }
  const [client, setClient] = useState(null);    // { code, codeSearch, name }
  const [clientKey, setClientKey] = useState(0); // đổi để ô chọn khách về rỗng
  const [xacNhan, setXacNhan] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [vuaXuat, setVuaXuat] = useState(null);  // { orderNo, savedCount, total }

  // Số liệu tải lại (người khác lên đơn, giá đổi...): bỏ mã không còn chọn được khỏi phần đã tick.
  useEffect(() => {
    setSel((cur) => {
      const by = new Map(items.map((i) => [i.sku, i]));
      const next = {};
      let doi = false;
      Object.keys(cur).forEach((sku) => {
        const it = by.get(sku);
        if (it && !lyDoKhongChon(it)) next[sku] = cur[sku]; else doi = true;
      });
      return doi ? next : cur;
    });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const nhoms = useMemo(() => danhSachNhom(items), [items]);
  const locDuoc = useMemo(() => {
    const ds = locTon(items, { q, nhom, chiConHang });
    return chiDaChon ? ds.filter((i) => sel[i.sku] !== undefined) : ds;
  }, [items, q, nhom, chiConHang, chiDaChon, sel]);
  const { rows: sapXep, sort, onSort } = useTableSort(locDuoc, COLS, { key: 'sku', dir: 'asc' });
  const { safePage, pageItems } = usePagedSlice(sapXep, page, PAGE_SIZE);

  const tong = useMemo(() => tongDon(sel, items), [sel, items]);
  useUnsavedGuard(tong.soMa > 0, 'Bán hàng thanh lý (đơn đang chọn)');

  const chonDuoc = (it) => canOrder && !lyDoKhongChon(it);
  const duocChonTrongLoc = locDuoc.filter(chonDuoc);
  const tatCaDaChon = duocChonTrongLoc.length > 0 && duocChonTrongLoc.every((i) => sel[i.sku] !== undefined);

  const bat = (it, on) => setSel((cur) => {
    const n = { ...cur };
    if (on) n[it.sku] = n[it.sku] !== undefined ? n[it.sku] : '1'; else delete n[it.sku];
    return n;
  });
  const batTatCa = (on) => setSel((cur) => {
    const n = { ...cur };
    duocChonTrongLoc.forEach((it) => { if (on) { if (n[it.sku] === undefined) n[it.sku] = '1'; } else delete n[it.sku]; });
    return n;
  });
  const doiSl = (sku, v) => setSel((cur) => ({ ...cur, [sku]: String(v).replace(/[^\d]/g, '') }));

  const dongs = dongDon(sel, items);
  const loi = loiDon(sel, items, client);
  const moXacNhan = () => {
    if (loi.length) { toast.error(loi.join('\n')); return; }
    setXacNhan(true);
  };
  const xuatDon = async () => {
    if (dangGui) return;
    setDangGui(true);
    try {
      const kq = await api.tlSubmitOrder(token, {
        client: { code: client.code, codeSearch: client.codeSearch || '' },
        items: dongs.map((d) => ({ sku: d.sku, qty: d.qty }))
      });
      setVuaXuat({ orderNo: kq.orderNo, savedCount: kq.savedCount, total: kq.total, khach: client.name || client.code });
      toast.success(`Đã xuất đơn ${kq.orderNo} (${kq.savedCount} mã) sang Đơn Hàng Chờ Duyệt.`);
      setSel({});
      setClient(null);
      setClientKey((k) => k + 1);
      setXacNhan(false);
      if (onOrderSaved) onOrderSaved();
      if (onReload) onReload();
    } catch (err) {
      setXacNhan(false);
      toast.error(lamSachLoi(err.message || String(err)));
      if (onReload) onReload();   // thường là tồn vừa đổi — tải lại để thấy số mới
    } finally {
      setDangGui(false);
    }
  };

  const oSl = { padding: '3px 6px', fontSize: '0.78rem', width: '74px', textAlign: 'right' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {!canOrder && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--karofi-cyan-light)', color: 'var(--cyan-text)', fontSize: '0.82rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Info size={14} aria-hidden="true" /> Vai trò của anh/chị chỉ xem tồn kho thanh lý, không lên đơn.
        </div>
      )}

      {vuaXuat && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.84rem', display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center' }}>
          <CheckCircle2 size={16} color="var(--badge-emerald-ink)" aria-hidden="true" />
          <span>
            Đã xuất đơn <b className="code-font">{vuaXuat.orderNo}</b> cho <b>{vuaXuat.khach}</b>: {vuaXuat.savedCount} mã, {dinhDangTien(vuaXuat.total)} đ (đã gồm VAT).
            Admin sẽ nhập vào SAP rồi xoá đơn ở "Đơn Hàng Chờ Duyệt".
          </span>
          {onOpenOrders && <button onClick={onOpenOrders} className="btn btn-secondary btn-sm"><ExternalLink size={14} /> Mở Đơn Hàng Chờ Duyệt</button>}
          <button onClick={() => setVuaXuat(null)} className="btn btn-ghost btn-sm" aria-label="Đóng thông báo"><X size={14} /></button>
        </div>
      )}

      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" className="input-field" style={{ paddingLeft: '36px' }}
            placeholder="Tìm theo tên hoặc mã hàng (không cần gõ dấu)..."
            aria-label="Tìm tồn kho thanh lý"
            value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input-field" style={{ width: 'auto', minWidth: '180px' }} aria-label="Lọc theo nhóm" value={nhom} onChange={(e) => { setNhom(e.target.value); setPage(1); }}>
          <option value="">Tất cả nhóm ({items.length})</option>
          {nhoms.map((g) => <option key={g.nhom} value={g.nhom}>{g.nhom} ({g.soMa})</option>)}
        </select>
        <label style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={chiConHang} onChange={(e) => { setChiConHang(e.target.checked); setPage(1); }} /> Chỉ mã còn hàng
        </label>
        {canOrder && (
          <label style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={chiDaChon} onChange={(e) => { setChiDaChon(e.target.checked); setPage(1); }} /> Chỉ mã đã chọn ({tong.soMa})
          </label>
        )}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={12} /> {locDuoc.length.toLocaleString('vi-VN')} mã khớp
          {data.hiddenCount > 0 && <> · {data.hiddenCount} mã gia dụng ngoài lọc nước đã ẩn</>}
        </span>
      </div>

      {canOrder && (
        <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 18px', alignItems: 'center', borderColor: tong.soMa ? 'var(--karofi-cyan-border)' : undefined }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '180px' }}>
            <strong style={{ color: 'var(--karofi-navy)' }}>Đơn thanh lý đang chọn</strong>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {tong.soMa} mã · {fmt(tong.tongSl)} cái · <b>{dinhDangTien(tong.tongTien)} đ</b> (gồm VAT)
            </span>
          </div>
          <div style={{ flex: 1, minWidth: '260px', maxWidth: '420px' }}>
            <ClientPickerCell
              key={clientKey}
              code={client ? client.code : ''}
              name={client ? client.name : ''}
              clients={clients}
              onSelect={(c) => setClient({ code: c.code, codeSearch: c.codeSearch || '', name: c.name || '' })}
            />
            <div style={{ fontSize: '0.72rem', color: client ? 'var(--text-muted)' : 'var(--text-dim)', marginTop: '2px' }}>
              {client ? <>Khách: <b>{client.name || client.code}</b></> : 'Chọn khách hàng của đơn thanh lý'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button onClick={() => setSel({})} disabled={!tong.soMa || dangGui} className="btn btn-secondary btn-sm">Bỏ chọn tất cả</button>
            <button onClick={moXacNhan} disabled={dangGui || !tong.soMa} className="btn btn-primary btn-sm" title={loi.length ? loi.join('\n') : 'Xuất sang Đơn Hàng Chờ Duyệt'}>
              {dangGui ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Xuất đơn chờ duyệt
            </button>
          </div>
        </div>
      )}

      <TableState isEmpty={locDuoc.length === 0} emptyText={items.length ? 'Không có mã nào khớp bộ lọc.' : 'Chưa có dữ liệu tồn kho thanh lý. Admin bấm "Cập nhật tồn ngay" để cào từ SAP.'}>
        <div className="table-container animate-fade-in" style={{ maxHeight: '560px', overflow: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                {canOrder && (
                  <th style={{ width: '38px' }}>
                    <input type="checkbox" aria-label="Chọn tất cả mã đang lọc" title={`Chọn / bỏ chọn tất cả ${duocChonTrongLoc.length} mã bán được đang lọc`}
                           checked={tatCaDaChon} disabled={!duocChonTrongLoc.length} onChange={(e) => batTatCa(e.target.checked)} />
                  </th>
                )}
                <SortableTh col="sku" sort={sort} onSort={onSort} style={{ width: '130px' }}>Mã hàng</SortableTh>
                <SortableTh col="name" sort={sort} onSort={onSort} style={{ minWidth: '240px' }}>Tên hàng</SortableTh>
                <SortableTh col="group" sort={sort} onSort={onSort} style={{ width: '140px' }}>Nhóm</SortableTh>
                <SortableTh col="qty" sort={sort} onSort={onSort} align="right" style={{ width: '80px' }}>Tồn</SortableTh>
                <SortableTh col="pending" sort={sort} onSort={onSort} align="right" style={{ width: '90px' }}>Chờ duyệt</SortableTh>
                <SortableTh col="avail" sort={sort} onSort={onSort} align="right" style={{ width: '90px' }}>Còn bán</SortableTh>
                <SortableTh col="price" sort={sort} onSort={onSort} align="right" style={{ width: '120px' }}>Giá (gồm VAT)</SortableTh>
                {canOrder && <th style={{ width: '170px', textAlign: 'right' }}>SL bán</th>}
                {canOrder && <th style={{ width: '120px', textAlign: 'right' }}>Thành tiền</th>}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((it) => {
                const lyDo = lyDoKhongChon(it);
                const dang = sel[it.sku] !== undefined;
                const sl = Math.floor(Number(sel[it.sku]));
                const vuot = dang && sl > it.avail;
                return (
                  <tr key={it.sku} className={dang ? 'sop-row-selected' : undefined}>
                    {canOrder && (
                      <td>
                        <input type="checkbox" aria-label={`Chọn ${it.sku}`} title={lyDo || 'Chọn mã này để bán'} checked={dang} disabled={!!lyDo} onChange={(e) => bat(it, e.target.checked)} />
                      </td>
                    )}
                    <td className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)' }}>{it.sku}</td>
                    <td>{it.name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{nhomCua(it)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(it.qty)}</td>
                    <td style={{ textAlign: 'right', color: it.pending ? 'var(--badge-amber-ink)' : 'var(--text-dim)' }}>{it.pending ? fmt(it.pending) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(it.avail)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {it.price > 0 ? fmt(it.price) : <span className="badge badge-neutral" title="Admin cập nhật ở tab Bảng giá">Chưa có giá</span>}
                    </td>
                    {canOrder && (
                      <td style={{ textAlign: 'right' }}>
                        {dang ? (
                          <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} title="Bán hết số còn lại" onClick={() => doiSl(it.sku, it.avail)}>Tối đa</button>
                            <input
                              className="input-field" style={{ ...oSl, borderColor: vuot ? 'var(--danger)' : undefined }}
                              inputMode="numeric" aria-label={`Số lượng bán ${it.sku}`}
                              aria-invalid={vuot || undefined}
                              value={sel[it.sku]} onChange={(e) => doiSl(it.sku, e.target.value)}
                            />
                          </span>
                        ) : <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>{lyDo ? '' : '—'}</span>}
                      </td>
                    )}
                    {canOrder && <td style={{ textAlign: 'right', fontWeight: 700 }}>{dang && sl > 0 ? fmt(sl * it.price) : ''}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={sapXep.length} onPageChange={setPage} itemLabel="mã hàng" />
      </TableState>

      {xacNhan && (
        <ConfirmDialog
          title="Xuất đơn thanh lý sang Đơn Hàng Chờ Duyệt?"
          message={`Khách ${client ? (client.name || client.code) : ''}: ${tong.soMa} mã, ${fmt(tong.tongSl)} cái, ${dinhDangTien(tong.tongTien)} đ (giá thanh lý đã gồm VAT). ` +
                   'Đơn đi thẳng cho Admin nhập vào SAP; tồn kho sẽ trừ phần này ở cột "Chờ duyệt" cho tới khi đơn bị xoá.'}
          confirmLabel="Xuất đơn"
          busy={dangGui}
          busyLabel="Đang xuất..."
          onConfirm={xuatDon}
          onCancel={() => setXacNhan(false)}
        />
      )}
    </div>
  );
}
