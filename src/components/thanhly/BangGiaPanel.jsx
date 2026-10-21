import React, { useMemo, useState } from 'react';
import { Search, Filter, Save, Loader2, DownloadCloud, Percent, Wand2 } from 'lucide-react';
import * as api from '../../services/api';
import Pagination, { usePagedSlice } from '../Pagination';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { useTableSort } from '../../hooks/useTableSort';
import { useDefaultPageSize } from '../../hooks/useSetting';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { lamSachLoi } from '../../utils/errorText';
import { locTon, danhSachNhom, nhomCua, thayDoiGia, tinhGiaNhom, giaTuChuoi, nhanNguonGia, dinhDangTien } from '../../utils/thanhLy';

const PAGE_SIZE_MAC_DINH = 50;
const fmt = (v) => (Number(v) || 0).toLocaleString('vi-VN');
const COLS = [
  { key: 'sku' }, { key: 'name' }, { key: 'group' }, { key: 'qty', type: 'number' }, { key: 'price', type: 'number' }, { key: 'priceSource' }
];

/**
 * Tab "Bảng giá": giá thanh lý (ĐÃ GỒM VAT) theo mã. Ban đầu lấy từ lịch sử doanh thu (ưu tiên giao dịch xuất từ kho 1402, nhân VAT);
 * Admin tra và sửa — từng mã, hoặc cả một NHÓM một lượt (đặt giá chung / tăng-giảm %). Sửa trên màn hình chỉ có hiệu lực khi bấm Lưu.
 * Giá Admin đã nhập tay không bị lượt cào SAP hay "Lấy giá từ lịch sử" ghi đè. Người khác chỉ xem.
 */
export default function BangGiaPanel({ token, data, canEdit, onReload }) {
  const toast = useToast();
  const PAGE_SIZE = useDefaultPageSize(PAGE_SIZE_MAC_DINH);
  const items = data.items || [];

  const [q, setQ] = useState('');
  const [nhom, setNhom] = useState('');
  const [nguon, setNguon] = useState('');
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({});        // { sku: chữ đang gõ }
  const [dangLuu, setDangLuu] = useState(false);
  const [xacNhan, setXacNhan] = useState(false);
  const [dangLay, setDangLay] = useState(false);
  const [kieu, setKieu] = useState('dat');       // 'dat' | 'phanTram'
  const [giaChung, setGiaChung] = useState('');
  const [phanTram, setPhanTram] = useState('');
  const [lam, setLam] = useState('1000');

  const nhoms = useMemo(() => danhSachNhom(items), [items]);
  const locDuoc = useMemo(() => locTon(items, { q, nhom, nguon }), [items, q, nhom, nguon]);
  const { rows: sapXep, sort, onSort } = useTableSort(locDuoc, COLS, { key: 'sku', dir: 'asc' });
  const { safePage, pageItems } = usePagedSlice(sapXep, page, PAGE_SIZE);

  const thayDoi = useMemo(() => thayDoiGia(draft, items), [draft, items]);
  useUnsavedGuard(thayDoi.length > 0, 'Bảng giá thanh lý');
  const soChuaCo = items.filter((i) => !(i.price > 0)).length;

  const giaHienThi = (it) => (draft[it.sku] !== undefined ? giaTuChuoi(draft[it.sku]) : Math.round(it.price || 0));
  const sua = (sku, v) => setDraft((d) => ({ ...d, [sku]: v }));

  const apDungNhom = () => {
    const kq = tinhGiaNhom(locDuoc, (it) => { const g = giaHienThi(it); return g == null ? 0 : g; },
      { kieu, gia: giaChung, phanTram, lam });
    const n = Object.keys(kq).length;
    if (!n) {
      toast.error(kieu === 'dat' ? 'Chưa nhập giá chung hợp lệ (hoặc mọi mã đang lọc đã đúng giá đó).'
        : 'Chưa nhập % hợp lệ, hoặc các mã đang lọc đều chưa có giá để tính %.');
      return;
    }
    setDraft((d) => { const x = { ...d }; Object.keys(kq).forEach((sku) => { x[sku] = String(kq[sku]); }); return x; });
    toast.success(`Đã đặt giá mới cho ${n} mã trên màn hình. Kiểm tra rồi bấm Lưu giá.`);
  };

  const luu = async () => {
    if (dangLuu || !thayDoi.length) return;
    setDangLuu(true);
    try {
      const kq = await api.tlSetPrices(token, thayDoi);
      toast.success(`Đã lưu giá thanh lý của ${kq.saved} mã.`);
      setDraft({});
      setXacNhan(false);
      if (onReload) onReload();
    } catch (err) {
      setXacNhan(false);
      toast.error('Không lưu được giá: ' + lamSachLoi(err.message || String(err)));
    } finally {
      setDangLuu(false);
    }
  };

  const layTuLichSu = async () => {
    if (dangLay) return;
    setDangLay(true);
    try {
      const kq = await api.tlSeedPrices(token);
      toast.success(kq.added ? `Đã điền giá từ lịch sử doanh thu cho ${kq.added} mã còn thiếu.` : 'Không có mã nào còn thiếu giá mà có lịch sử bán để lấy.');
      if (onReload) onReload();
    } catch (err) {
      toast.error(lamSachLoi(err.message || String(err)));
    } finally {
      setDangLay(false);
    }
  };

  const oGia = { padding: '3px 8px', fontSize: '0.8rem', width: '120px', textAlign: 'right' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input type="text" className="input-field" style={{ paddingLeft: '36px' }} placeholder="Tìm theo tên hoặc mã hàng..." aria-label="Tìm trong bảng giá"
                 value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <select className="input-field" style={{ width: 'auto', minWidth: '180px' }} aria-label="Lọc theo nhóm" value={nhom} onChange={(e) => { setNhom(e.target.value); setPage(1); }}>
          <option value="">Tất cả nhóm ({items.length})</option>
          {nhoms.map((g) => <option key={g.nhom} value={g.nhom}>{g.nhom} ({g.soMa})</option>)}
        </select>
        <select className="input-field" style={{ width: 'auto', minWidth: '170px' }} aria-label="Lọc theo nguồn giá" value={nguon} onChange={(e) => { setNguon(e.target.value); setPage(1); }}>
          <option value="">Mọi nguồn giá</option>
          <option value="chua">Chưa có giá ({soChuaCo})</option>
          <option value="kho1402">Doanh thu xuất kho 1402</option>
          <option value="lichsu">Doanh thu gần nhất</option>
          <option value="admin">Admin nhập</option>
        </select>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={12} /> {locDuoc.length.toLocaleString('vi-VN')} mã khớp
        </span>
      </div>

      {canEdit && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.85rem', color: 'var(--karofi-navy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Wand2 size={15} aria-hidden="true" /> Đặt giá hàng loạt cho {locDuoc.length} mã đang lọc{nhom ? ` (nhóm ${nhom})` : ''}
            </strong>
            <select className="input-field" style={{ width: 'auto' }} aria-label="Cách đặt giá" value={kieu} onChange={(e) => setKieu(e.target.value)}>
              <option value="dat">Đặt một giá chung</option>
              <option value="phanTram">Tăng / giảm theo %</option>
            </select>
            {kieu === 'dat' ? (
              <input className="input-field" style={{ width: '150px', textAlign: 'right' }} inputMode="numeric" placeholder="Giá gồm VAT, vd 150.000" aria-label="Giá chung"
                     value={giaChung} onChange={(e) => setGiaChung(e.target.value)} />
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <input className="input-field" style={{ width: '90px', textAlign: 'right' }} inputMode="decimal" placeholder="-10 hoặc 5" aria-label="Phần trăm tăng giảm"
                       value={phanTram} onChange={(e) => setPhanTram(e.target.value)} />
                <Percent size={14} aria-hidden="true" />
              </span>
            )}
            <label style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Làm tròn
              <select className="input-field" style={{ width: 'auto' }} value={lam} onChange={(e) => setLam(e.target.value)}>
                <option value="1">tới 1 đ</option>
                <option value="100">tới 100 đ</option>
                <option value="1000">tới 1.000 đ</option>
              </select>
            </label>
            <button onClick={apDungNhom} disabled={!locDuoc.length} className="btn btn-secondary btn-sm">Áp dụng lên màn hình</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {thayDoi.length ? <b style={{ color: 'var(--badge-amber-ink)' }}>{thayDoi.length} mã có giá mới CHƯA lưu</b> : 'Chưa có thay đổi.'}
              {' '}Giá luôn là giá <b>đã gồm VAT</b>. Giá Admin nhập tay không bị ghi đè bởi lượt cào SAP.
            </span>
            <span style={{ display: 'inline-flex', gap: '8px' }}>
              <button onClick={layTuLichSu} disabled={dangLay} className="btn btn-secondary btn-sm" title="Chỉ điền mã chưa có giá, theo lịch sử doanh thu (ưu tiên giao dịch xuất từ kho 1402)">
                {dangLay ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />} Lấy giá còn thiếu từ lịch sử doanh thu
              </button>
              <button onClick={() => setDraft({})} disabled={!thayDoi.length || dangLuu} className="btn btn-secondary btn-sm">Bỏ thay đổi</button>
              <button onClick={() => setXacNhan(true)} disabled={!thayDoi.length || dangLuu} className="btn btn-primary btn-sm">
                {dangLuu ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu giá ({thayDoi.length})
              </button>
            </span>
          </div>
        </div>
      )}

      <TableState isEmpty={locDuoc.length === 0} emptyText={items.length ? 'Không có mã nào khớp bộ lọc.' : 'Chưa có dữ liệu tồn kho thanh lý nên chưa có mã để đặt giá.'}>
        <div className="table-container animate-fade-in" style={{ maxHeight: '560px', overflow: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <SortableTh col="sku" sort={sort} onSort={onSort} style={{ width: '130px' }}>Mã hàng</SortableTh>
                <SortableTh col="name" sort={sort} onSort={onSort} style={{ minWidth: '240px' }}>Tên hàng</SortableTh>
                <SortableTh col="group" sort={sort} onSort={onSort} style={{ width: '140px' }}>Nhóm</SortableTh>
                <SortableTh col="qty" sort={sort} onSort={onSort} align="right" style={{ width: '80px' }}>Tồn</SortableTh>
                <SortableTh col="price" sort={sort} onSort={onSort} align="right" style={{ width: '150px' }}>Giá thanh lý (gồm VAT)</SortableTh>
                <SortableTh col="priceSource" sort={sort} onSort={onSort} style={{ width: '230px' }}>Nguồn giá</SortableTh>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((it) => {
                const sua_ = draft[it.sku] !== undefined;
                const hopLe = !sua_ || giaTuChuoi(draft[it.sku]) !== null;
                const doi = sua_ && hopLe && giaTuChuoi(draft[it.sku]) !== Math.round(it.price || 0);
                return (
                  <tr key={it.sku} className={doi ? 'sop-row-selected' : undefined}>
                    <td className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)' }}>{it.sku}</td>
                    <td>{it.name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{nhomCua(it)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(it.qty)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {canEdit ? (
                        <input
                          className="input-field" style={{ ...oGia, borderColor: hopLe ? undefined : 'var(--danger)' }}
                          inputMode="numeric" aria-label={`Giá thanh lý ${it.sku}`} aria-invalid={!hopLe || undefined}
                          placeholder={it.price > 0 ? '' : 'Chưa có giá'}
                          value={sua_ ? draft[it.sku] : (it.price > 0 ? dinhDangTien(it.price) : '')}
                          onChange={(e) => sua(it.sku, e.target.value)}
                        />
                      ) : (it.price > 0 ? fmt(it.price) : <span className="badge badge-neutral">Chưa có giá</span>)}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }} title={it.priceAt ? 'Cập nhật ' + it.priceAt : ''}>
                      {doi ? <b style={{ color: 'var(--badge-amber-ink)' }}>Giá mới chưa lưu</b> : nhanNguonGia(it)}
                    </td>
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
          title="Lưu giá thanh lý?"
          message={`Sẽ cập nhật giá (đã gồm VAT) của ${thayDoi.length} mã. Sale thấy giá mới ngay ở tab Tồn kho & Lên đơn; đơn đã xuất trước đó không đổi.`}
          confirmLabel="Lưu giá"
          busy={dangLuu}
          busyLabel="Đang lưu..."
          onConfirm={luu}
          onCancel={() => setXacNhan(false)}
        />
      )}
    </div>
  );
}
