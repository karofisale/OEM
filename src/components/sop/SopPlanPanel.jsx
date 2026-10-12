import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Filter, CheckCircle2, Save, ShieldCheck, TrendingUp, RotateCcw, Plus, Trash2, PackagePlus, Undo2, X } from 'lucide-react';
import * as api from '../../services/api';
import Pagination, { usePagedSlice } from '../Pagination';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import ConfirmDialog from '../ConfirmDialog';
import SopAddProductModal from './SopAddProductModal';
import { useToast } from '../ToastProvider';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useTableSort } from '../../hooks/useTableSort';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import {
  khoiTaoKeHoach, dongGui, chuKy, boKhoiKeHoach, hoanTacBo, themVaoKeHoach, diffGui, tomTatMa,
  trangThaiChonTatCa, chonTatCa, giuChonConHien, khopLoc, dongKeHoach, datLenDau, doanhThuTheoThang, coSL
} from '../../utils/sopPlan';

const PAGE_SIZE = 25;
const UNDO_MS = 15000;   // dải Hoàn tác tự hết hiệu lực sau ~15 giây
const FLASH_MS = 4500;   // dòng vừa thêm nổi bật chừng này rồi mờ

// Màn nhập kế hoạch SOP của Sale. "Kế hoạch của tôi" là DANH SÁCH SKU THUỘC KẾ HOẠCH (inPlan): bảng chỉ hiện các mã này.
// Sale tìm/lọc, tick chọn rồi BỎ mã khỏi kế hoạch (có Hoàn tác), hoặc THÊM mã từ danh mục / tạo SP mới vào danh mục.
// Server thay thế hoàn toàn theo (kỳ, sale): mã không gửi lên bị xoá khỏi kỳ đó — nên "bỏ mã" ở đây chỉ là không gửi mã đó.
// Logic thuần nằm ở utils/sopPlan.js (có test).
export default function SopPlanPanel({ token, materials, refreshTick, onSubmitted, onAddMaterial }) {
  const toast = useToast();
  const [context, setContext] = useState(null); // { anchor, monthLabels, myDraft, carryForwardBySku }
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [periodConfirmed, setPeriodConfirmed] = useState(false);
  const [draftMap, setDraftMap] = useState({}); // sku -> [sl1,sl2,sl3,sl4], CHỈ mã thuộc kế hoạch
  const [inPlan, setInPlan] = useState([]);     // SKU thuộc kế hoạch
  const [savedSig, setSavedSig] = useState(''); // chữ ký bản đã tải/đã gửi
  const [baseSkus, setBaseSkus] = useState([]); // mã (có SL > 0) của bản đã tải/đã gửi — để so khi gửi
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [selected, setSelected] = useState(() => new Set());
  const [undo, setUndo] = useState(null);       // { daBo, tieuDe } — dải Hoàn tác đang hiện
  const [pinned, setPinned] = useState(() => new Set()); // mã vừa thêm: lên đầu bảng tới lần sắp xếp/lọc kế tiếp
  const [flash, setFlash] = useState(() => new Set());   // mã vừa thêm: nổi bật vài giây
  const tableWrapRef = useRef(null);
  const [scrollTick, setScrollTick] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  // Bộ lọc nhớ qua F5; giá trị đã nhớ mà không còn trong danh mục thì quay về "Tất cả".
  const [groupSaved, setGroupFilter] = usePersistentState('sop.group', 'ALL');
  const [exclusiveSaved, setExclusiveFilter] = usePersistentState('sop.exclusive', 'ALL');
  const [page, setPage] = useState(1);

  const fetchContext = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.getSopPlanningContext(token);
      setContext(data);
      // Có bản nháp của kỳ này (đã gửi, chưa duyệt) thì CHÍNH NÓ là kế hoạch; chưa có thì lấy số mang sang từ kỳ đã duyệt mới nhất.
      const kh = khoiTaoKeHoach(data.carryForwardBySku, data.myDraft);
      setDraftMap(kh.draftMap);
      setInPlan(kh.inPlan);
      setSavedSig(chuKy(kh.draftMap, kh.inPlan));
      setBaseSkus(kh.inPlan);
      setSelected(new Set());
      setUndo(null);
      setPinned(new Set());
      setFlash(new Set());
    } catch (err) {
      setLoadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // refreshTick: panel không remount khi chuyển sub-tab (KeepAliveTab), nên sau mỗi lần gửi/duyệt phải tải lại context.
  useEffect(() => { fetchContext(); }, [token, refreshTick]);

  const groupsList = useMemo(() => {
    const set = new Set(materials.map(m => m.group).filter(Boolean));
    return Array.from(set).sort();
  }, [materials]);

  // "Độc quyền" là chữ tự do (khách/thương hiệu giữ độc quyền), lọc như Nhóm SP: danh sách giá trị đang có.
  const exclusiveList = useMemo(() => {
    const set = new Set(materials.map(m => m.exclusiveTo).filter(Boolean));
    return Array.from(set).sort();
  }, [materials]);

  const groupFilter = groupSaved === 'ALL' || groupsList.includes(groupSaved) ? groupSaved : 'ALL';
  const exclusiveFilter = exclusiveSaved === 'ALL' || exclusiveList.includes(exclusiveSaved) ? exclusiveSaved : 'ALL';

  const debouncedSearchTerm = useDebouncedValue(searchTerm);
  const inPlanSet = useMemo(() => new Set(inPlan), [inPlan]);

  // Mọi mã trong kế hoạch (kể cả mã mất khỏi danh mục) — nguồn của bảng và của thẻ doanh thu.
  const planRows = useMemo(() => dongKeHoach(materials, inPlan), [materials, inPlan]);

  const filteredRows = useMemo(() => {
    const loc = { q: debouncedSearchTerm, group: groupFilter, exclusive: exclusiveFilter };
    return planRows.filter(m => khopLoc(m, loc));
  }, [planRows, debouncedSearchTerm, groupFilter, exclusiveFilter]);

  // Sắp xếp theo cột — chỉ Mã, Tên, Giá bán (các ô số lượng đang gõ không làm khoá sắp xếp).
  const cols = useMemo(() => [{ key: 'sku' }, { key: 'name' }, { key: 'suggestedPrice', type: 'number' }], []);
  const { rows: sortedRows, sort, onSort } = useTableSort(filteredRows, cols);
  const sortedPinnedRows = useMemo(() => datLenDau(sortedRows, pinned), [sortedRows, pinned]);
  const { safePage, pageItems: pagedRows } = usePagedSlice(sortedPinnedRows, page, PAGE_SIZE);

  const filteredSkus = useMemo(() => filteredRows.map(r => r.sku), [filteredRows]);
  // Bộ lọc đổi: bỏ chọn các mã không còn hiển thị (lựa chọn luôn nằm trong tập đang lọc).
  useEffect(() => { setSelected(prev => giuChonConHien(prev, filteredSkus)); }, [filteredSkus]);
  const chonTT = trangThaiChonTatCa(selected, filteredSkus);

  // Doanh thu ước tính từng tháng trên TOÀN BỘ kế hoạch (đúng thứ sẽ gửi), cập nhật theo từng ô.
  const revenueByMonth = useMemo(() => doanhThuTheoThang(planRows, draftMap), [planRows, draftMap]);
  const fmtBillion = (v) => (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

  // Gửi: mã thuộc kế hoạch có SL > 0. Mã bỏ khỏi kế hoạch (hoặc về 0 hết) không có trong payload nên server xoá khỏi kỳ này.
  const submissionRows = useMemo(() => dongGui(draftMap, inPlan), [draftMap, inPlan]);
  const sigNow = useMemo(() => chuKy(draftMap, inPlan), [draftMap, inPlan]);

  // F5 / đổi tab khi còn thay đổi chưa gửi -> cảnh báo.
  useUnsavedGuard(!!context && sigNow !== savedSig, 'Kế hoạch SOP');

  // Dải Hoàn tác tự hết hiệu lực.
  useEffect(() => {
    if (!undo) return undefined;
    const h = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(h);
  }, [undo]);

  // Nổi bật dòng vừa thêm vài giây (và đưa bảng về đầu).
  useEffect(() => {
    if (!flash.size) return undefined;
    const h = setTimeout(() => setFlash(new Set()), FLASH_MS);
    return () => clearTimeout(h);
  }, [flash]);
  useEffect(() => {
    if (!scrollTick) return;
    const el = tableWrapRef.current;
    if (!el) return;
    el.scrollTop = 0;
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [scrollTick]);

  // Đổi bộ lọc/tìm/sắp xếp: dòng vừa thêm hết được ghim lên đầu, về trang 1.
  const doiLoc = (fn) => (...a) => { fn(...a); setPinned(new Set()); setPage(1); };
  const onSearch = doiLoc((v) => setSearchTerm(v));
  const onGroup = doiLoc((v) => setGroupFilter(v));
  const onExclusive = doiLoc((v) => setExclusiveFilter(v));
  const onSortCot = (key) => { setPinned(new Set()); onSort(key); };
  const locDangBat = !!(searchTerm.trim() || groupFilter !== 'ALL' || exclusiveFilter !== 'ALL');
  const xoaLoc = () => { setSearchTerm(''); setGroupFilter('ALL'); setExclusiveFilter('ALL'); setPinned(new Set()); setPage(1); };

  const setCell = (sku, idx, value) => {
    setUndo(null); // sửa số = thao tác khác: Hoàn tác hết hiệu lực
    setDraftMap(prev => {
      const current = prev[sku] || [0, 0, 0, 0];
      const next = current.slice();
      next[idx] = value === '' ? 0 : (parseFloat(value) || 0);
      return { ...prev, [sku]: next };
    });
  };

  const toggleRow = (sku) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(sku)) next.delete(sku); else next.add(sku);
    return next;
  });

  // ----- Bỏ mã khỏi kế hoạch (+ Hoàn tác) -----------------------------------
  const selectedList = useMemo(() => sortedPinnedRows.filter(r => selected.has(r.sku)).map(r => r.sku), [sortedPinnedRows, selected]);

  const handleConfirmRemove = () => {
    const kq = boKhoiKeHoach(inPlan, draftMap, selectedList);
    setConfirmingRemove(false);
    if (!kq.daBo) return;
    setInPlan(kq.inPlan);
    setDraftMap(kq.draftMap);
    setSelected(new Set());
    setPinned(new Set());
    setUndo({ daBo: kq.daBo, tieuDe: `Đã bỏ ${kq.daBo.skus.length.toLocaleString('vi-VN')} mã khỏi kế hoạch.` });
  };

  const handleUndo = () => {
    if (!undo) return;
    const kq = hoanTacBo(inPlan, draftMap, undo.daBo);
    setInPlan(kq.inPlan);
    setDraftMap(kq.draftMap);
    setUndo(null);
    if (kq.khoiPhuc.length) {
      setPinned(new Set(kq.khoiPhuc));
      setFlash(new Set(kq.khoiPhuc));
      setPage(1);
      setScrollTick(t => t + 1);
      toast.success(`Đã khôi phục ${kq.khoiPhuc.length.toLocaleString('vi-VN')} mã về kế hoạch cùng số lượng cũ.`);
    }
  };

  // "Tạo mới từ đầu": kế hoạch về TRỐNG (cùng cơ chế Hoàn tác như bỏ mã). Chưa đụng gì trên hệ thống — việc thay thế thật
  // chỉ xảy ra khi bấm "Lưu Kế Hoạch, Gửi Duyệt" sau đó (server thay toàn bộ theo kỳ + sale).
  const handleResetFromScratch = () => {
    const kq = boKhoiKeHoach(inPlan, draftMap, inPlan);
    setConfirmingReset(false);
    if (!kq.daBo) return;
    setInPlan(kq.inPlan);
    setDraftMap(kq.draftMap);
    setSelected(new Set());
    setPinned(new Set());
    setUndo({ daBo: kq.daBo, tieuDe: `Đã xoá toàn bộ kế hoạch đang soạn (${kq.daBo.skus.length.toLocaleString('vi-VN')} mã).` });
  };

  // ----- Thêm mã vào kế hoạch -----------------------------------------------
  // `mats`: các bản ghi danh mục vừa thêm (để kiểm bộ lọc hiện tại có ẩn chúng không). Trả số mã thật sự mới.
  const addToPlan = (skus, mats) => {
    const kq = themVaoKeHoach(inPlan, draftMap, skus);
    if (!kq.themMoi.length) return 0;
    setInPlan(kq.inPlan);
    setDraftMap(kq.draftMap);
    setUndo(null);
    const loc = { q: searchTerm, group: groupFilter, exclusive: exclusiveFilter };
    const bi = (mats || kq.themMoi.map(s => materials.find(m => m.sku === s)).filter(Boolean));
    if (locDangBat && bi.some(m => !khopLoc(m, loc))) xoaLoc(); // bộ lọc đang ẩn mã vừa thêm -> bỏ lọc để thấy ngay
    setPinned(new Set(kq.themMoi));
    setFlash(new Set(kq.themMoi));
    setPage(1);
    setScrollTick(t => t + 1);
    return kq.themMoi.length;
  };

  const handleAddExisting = (skus) => {
    const n = addToPlan(skus);
    setShowAdd(false);
    if (n) toast.success(`Đã thêm ${n.toLocaleString('vi-VN')} sản phẩm vào kế hoạch — nhập số lượng cho từng mã rồi bấm "Lưu Kế Hoạch, Gửi Duyệt".`);
    else toast.info('Các sản phẩm này đã nằm trong kế hoạch.');
  };

  // Ghi SP mới vào danh mục qua handler của App (cùng đường lạc quan: danh mục `materials` cập nhật ngay, hỏng thì lùi lại),
  // rồi tự thêm vào kế hoạch. Trả { ok, error } cho hộp thoại để giữ form khi lỗi.
  const handleCreate = async (mat) => {
    if (!onAddMaterial) return { ok: false, error: 'Không có quyền thêm sản phẩm vào danh mục từ màn này.' };
    const kq = await onAddMaterial(mat);
    if (kq && kq.ok === false) return kq;
    addToPlan([mat.sku], [mat]);
    setShowAdd(false);
    toast.success(`Đã thêm ${mat.sku} vào danh mục và vào kế hoạch.`);
    return { ok: true };
  };

  // ----- Gửi ------------------------------------------------------------------
  const diff = useMemo(() => diffGui(baseSkus, submissionRows.map(r => r.sku)), [baseSkus, submissionRows]);

  const handleSubmit = async () => {
    if (isSaving || !submissionRows.length) return; // chặn gửi trùng khi lượt đầu chưa về
    setIsSaving(true);
    try {
      const result = await api.submitSopDraft(token, context.anchor, submissionRows);
      toast.success(`Đã lưu kế hoạch cho ${result.savedCount} mã SKU, chờ Admin duyệt.`);
      setSavedSig(sigNow);
      setBaseSkus(submissionRows.map(r => r.sku));
      setUndo(null);
      setConfirmingSubmit(false);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      toast.error('Không lưu được kế hoạch: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Tải / lỗi dùng chung một mẫu (TableState): lỗi luôn có Thử lại, không kẹt "Đang tải…".
  if (isLoading || loadError || !context) {
    return <TableState loading={isLoading} error={loadError} errorPrefix="Lỗi tải kỳ kế hoạch" loadingLabel="Đang tải kỳ kế hoạch..." onRetry={fetchContext} />;
  }

  // Confirm-the-period gate — shown before the table so entering on the wrong
  // side of a month boundary (eg. mùng 1-2 đầu tháng) doesn't slip through unnoticed.
  if (!periodConfirmed) {
    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center', padding: '32px 20px' }}>
        <ShieldCheck size={32} color="var(--karofi-cyan)" />
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
            Kỳ kế hoạch: {context.monthLabels[0]} → {context.monthLabels[context.monthLabels.length - 1]}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '440px' }}>
            Kiểm tra đúng 4 tháng trên trước khi nhập sản lượng — kỳ này được tính từ tháng hiện tại,
            không đổi ngay cả khi bạn hoàn tất việc nhập vào đầu tháng sau.
          </p>
        </div>
        <button onClick={() => setPeriodConfirmed(true)} className="btn btn-primary">
          <CheckCircle2 size={16} /> Xác nhận kỳ, bắt đầu lập kế hoạch
        </button>
      </div>
    );
  }

  const kyLabel = `${context.monthLabels[0]} → ${context.monthLabels[context.monthLabels.length - 1]}`;
  const nChua = inPlan.filter(s => !coSL(draftMap[s])).length; // mã trong kế hoạch mà chưa nhập SL nào

  // Dải Hoàn tác: nằm ngay trên bảng (hoặc trên khối "kế hoạch trống" sau khi xoá hết) để sale thấy ngay chỗ vừa thao tác.
  const undoBar = undo && (
    <div className="sop-undo-bar" role="status">
      <span>{undo.tieuDe} Mã bị bỏ sẽ không còn trong kế hoạch kỳ này sau khi bạn bấm “Lưu Kế Hoạch, Gửi Duyệt”.</span>
      <span style={{ display: 'inline-flex', gap: '6px' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleUndo}><Undo2 size={14} aria-hidden="true" /> Hoàn tác</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUndo(null)} aria-label="Đóng thông báo hoàn tác"><X size={14} aria-hidden="true" /></button>
      </span>
    </div>
  );


  // Nội dung hộp xác nhận (JSX) dựng sẵn ở đây để phần props của hộp xác nhận không chứa thẻ tự đóng (test khung dot2 soát props bằng regex).
  const msgRemove = (
    <>
      Sẽ bỏ <strong>{selectedList.length.toLocaleString('vi-VN')} mã</strong> khỏi kế hoạch: {tomTatMa(selectedList)}.
      {' '}Số lượng đang nhập của các mã này sẽ bị xoá, và các mã sẽ bị loại khỏi kế hoạch kỳ này khi bạn bấm
      “Lưu Kế Hoạch, Gửi Duyệt”. Chưa gửi thì chưa mất gì trên hệ thống — bạn có thể Hoàn tác trong 15 giây.
    </>
  );
  const msgSubmit = (
    <>
      Sẽ gửi kế hoạch SOP kỳ {kyLabel} cho <strong>{submissionRows.length.toLocaleString('vi-VN')} mã SKU</strong> có số lượng &gt; 0.
      {diff.moi.length > 0 && <>{' '}<strong>{diff.moi.length.toLocaleString('vi-VN')} mã mới</strong> so với bản đã tải/đã lưu ({tomTatMa(diff.moi)}).</>}
      {diff.bo.length > 0 && <>{' '}<strong>{diff.bo.length.toLocaleString('vi-VN')} mã sẽ bị bỏ</strong> khỏi kế hoạch kỳ này so với bản đã tải/đã lưu ({tomTatMa(diff.bo)}).</>}
      {' '}Nếu kỳ này đã từng gửi trước đó, bản cũ sẽ bị THAY THẾ HOÀN TOÀN bằng bản này — mã SKU nào không còn số lượng trong lần gửi này sẽ bị xoá khỏi kế hoạch.
      Hãy chắc chắn đã kiểm tra kỹ số lượng trước khi xác nhận.
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Doanh thu ước tính theo SL đang nhập — SUMPRODUCT(SL x Giá bán), cập nhật theo từng ô */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${context.monthLabels.length > 3 ? 150 : 170}px, 1fr))`, gap: '12px' }}>
        {context.monthLabels.map((label, i) => (
          <div key={label + i} className="glass-card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <TrendingUp size={13} color="var(--accent-emerald)" /> {label}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", marginTop: '4px' }}>
              {fmtBillion(revenueByMonth[i])} tỷ đ
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Giá trị kế hoạch đang nhập</div>
          </div>
        ))}
      </div>

      {inPlan.length === 0 ? (
        /* Kế hoạch chưa có SKU nào: hướng dẫn lớn + nút thêm */
        <>
        {undoBar}
        <div className="glass-card sop-empty-plan">
          <PackagePlus size={36} color="var(--karofi-cyan)" aria-hidden="true" />
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Kế hoạch kỳ {kyLabel} chưa có sản phẩm nào</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '6px auto 0', maxWidth: '520px', lineHeight: 1.5 }}>
              Thêm các mã SKU bạn muốn lập kế hoạch từ danh mục sản phẩm (tìm theo mã, tên hoặc alias, tick được nhiều mã một lúc),
              rồi nhập số lượng cho từng tháng. Sản phẩm chưa có trong danh mục thì thêm mới ngay trong hộp tìm.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} aria-hidden="true" /> Thêm sản phẩm vào kế hoạch
          </button>
        </div>
        </>
      ) : (
        <>
          {/* Filter bar */}
          <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} aria-hidden="true" />
              <input
                type="text" className="input-field" style={{ paddingLeft: '36px' }}
                placeholder="Tìm trong kế hoạch theo mã SKU, tên, alias…"
                aria-label="Tìm trong kế hoạch"
                value={searchTerm}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>

            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} aria-hidden="true" /> Thêm sản phẩm vào kế hoạch
            </button>

            <select className="input-field" style={{ width: '190px' }} value={groupFilter} onChange={(e) => onGroup(e.target.value)} aria-label="Lọc theo Nhóm SP">
              <option value="ALL">Tất cả Nhóm SP</option>
              {groupsList.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            <select className="input-field" style={{ width: '190px' }} value={exclusiveFilter} onChange={(e) => onExclusive(e.target.value)} aria-label="Lọc theo Độc quyền">
              <option value="ALL">Tất cả Độc quyền</option>
              {exclusiveList.map(v => <option key={v} value={v}>{v}</option>)}
            </select>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <Filter size={12} aria-hidden="true" /> {filteredRows.length.toLocaleString('vi-VN')} sản phẩm khớp bộ lọc
              <span aria-hidden="true">·</span>
              <strong style={{ color: 'var(--text-muted)' }}>Trong kế hoạch: {inPlan.length.toLocaleString('vi-VN')} SKU</strong>
            </span>
          </div>

          {/* Chọn nhiều + Bỏ khỏi kế hoạch */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: filteredSkus.length ? 'pointer' : 'default' }}>
              <input
                type="checkbox" style={{ width: '16px', height: '16px' }}
                checked={chonTT.checked} disabled={!filteredSkus.length}
                ref={(el) => { if (el) el.indeterminate = chonTT.indeterminate; }}
                onChange={(e) => setSelected(prev => chonTatCa(prev, filteredSkus, e.target.checked))}
              />
              Chọn tất cả (đang lọc: {filteredSkus.length.toLocaleString('vi-VN')})
            </label>
            <span role="status" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Đã chọn <strong>{selected.size.toLocaleString('vi-VN')}</strong>
            </span>
            {selected.size > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Bỏ chọn</button>
            )}
            <button
              type="button" className="btn btn-secondary btn-danger-outline btn-sm"
              disabled={selected.size === 0} onClick={() => setConfirmingRemove(true)}
            >
              <Trash2 size={14} aria-hidden="true" /> Bỏ khỏi kế hoạch ({selected.size.toLocaleString('vi-VN')})
            </button>
          </div>

          {undoBar}

          <TableState
            isEmpty={filteredRows.length === 0}
            emptyText="Không có sản phẩm nào trong kế hoạch khớp bộ lọc."
            emptyHint="Đổi từ khoá / nhóm, hoặc thêm sản phẩm khác vào kế hoạch."
            emptyAction={locDangBat ? <button type="button" className="btn btn-secondary btn-sm" onClick={xoaLoc}>Xoá bộ lọc</button> : undefined}
          >
            <div ref={tableWrapRef} className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox" style={{ width: '16px', height: '16px' }}
                        aria-label="Chọn tất cả sản phẩm đang lọc"
                        checked={chonTT.checked} disabled={!filteredSkus.length}
                        ref={(el) => { if (el) el.indeterminate = chonTT.indeterminate; }}
                        onChange={(e) => setSelected(prev => chonTatCa(prev, filteredSkus, e.target.checked))}
                      />
                    </th>
                    <SortableTh col="sku" sort={sort} onSort={onSortCot}>Mã</SortableTh>
                    <SortableTh col="name" sort={sort} onSort={onSortCot}>Tên SP</SortableTh>
                    <SortableTh col="suggestedPrice" sort={sort} onSort={onSortCot} align="right">Giá bán</SortableTh>
                    {context.monthLabels.map((label, i) => <th key={label + i} style={{ width: '110px', textAlign: 'right' }}>{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map(m => {
                    const v = draftMap[m.sku] || [0, 0, 0, 0];
                    const chuaNhap = !coSL(v);
                    const cls = (selected.has(m.sku) ? 'sop-row-selected ' : '') + (flash.has(m.sku) ? 'sop-row-flash' : '');
                    return (
                      <tr key={m.sku} className={cls.trim() || undefined}>
                        <td>
                          <input
                            type="checkbox" style={{ width: '16px', height: '16px' }}
                            checked={selected.has(m.sku)} onChange={() => toggleRow(m.sku)}
                            aria-label={`Chọn ${m.sku}`}
                          />
                        </td>
                        <td className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)', fontSize: '0.8rem' }}>
                          {m.sku}
                        </td>
                        <td style={{ fontWeight: 600, minWidth: '150px' }}>
                          {m.name}
                          {chuaNhap && <div title="Mã này chưa có số lượng nên chưa được gửi" style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--warning-text)' }}>chưa nhập SL</div>}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>{(m.suggestedPrice || 0).toLocaleString('vi-VN')}</td>
                        {[0, 1, 2, 3].map(i => (
                          <td key={i}>
                            <input
                              type="number" className="input-field" style={{ textAlign: 'right', padding: '6px 8px' }}
                              value={v[i] || ''}
                              placeholder="0"
                              aria-label={`${m.sku} — ${context.monthLabels[i]}`}
                              onChange={(e) => setCell(m.sku, i, e.target.value)}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={sortedPinnedRows.length} onPageChange={setPage} itemLabel="sản phẩm" />
          </TableState>
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
        {inPlan.length > 0 && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: 'auto' }}>
            {nChua > 0
              ? `${nChua.toLocaleString('vi-VN')} mã trong kế hoạch chưa nhập SL — các mã này không được gửi.`
              : 'Mọi mã trong kế hoạch đều đã có SL.'}
          </span>
        )}
        <button onClick={() => setConfirmingReset(true)} disabled={isSaving || inPlan.length === 0} className="btn btn-secondary">
          <RotateCcw size={16} /> Tạo Mới Từ Đầu
        </button>
        <button
          onClick={() => setConfirmingSubmit(true)} disabled={isSaving || !submissionRows.length} className="btn btn-primary"
          title={!submissionRows.length ? 'Cần ít nhất 1 mã có số lượng > 0 ở một tháng để gửi.' : undefined}
        >
          <Save size={16} /> Lưu Kế Hoạch ({submissionRows.length.toLocaleString('vi-VN')} SKU), Gửi Duyệt
        </button>
      </div>

      {showAdd && (
        <SopAddProductModal
          materials={materials}
          inPlanSet={inPlanSet}
          groupsList={groupsList}
          exclusiveList={exclusiveList}
          initialQuery=""
          initialGroup="ALL"
          canCreate={!!onAddMaterial}
          onAddExisting={handleAddExisting}
          onCreate={handleCreate}
          onClose={() => setShowAdd(false)}
        />
      )}

      {confirmingRemove && (
        <ConfirmDialog
          title={`Bỏ ${selectedList.length.toLocaleString('vi-VN')} mã khỏi kế hoạch?`}
          message={msgRemove}
          confirmLabel={`Bỏ ${selectedList.length.toLocaleString('vi-VN')} mã`}
          danger
          onConfirm={handleConfirmRemove}
          onCancel={() => setConfirmingRemove(false)}
        />
      )}

      {confirmingReset && (
        <ConfirmDialog
          title="Tạo mới từ đầu?"
          message={`Sẽ xoá toàn bộ kế hoạch đang soạn (${inPlan.length.toLocaleString('vi-VN')} mã SKU, kể cả số mang sang từ kỳ trước): kế hoạch trở về TRỐNG, rồi bạn thêm lại từng sản phẩm bằng nút “Thêm sản phẩm vào kế hoạch”. Chưa lưu gì lên hệ thống — chỉ khi bấm “Lưu Kế Hoạch, Gửi Duyệt” sau đó, bản cũ của kỳ này mới bị thay thế (mã nào không còn trong kế hoạch sẽ bị xoá khỏi kỳ này). Bạn có thể Hoàn tác trong 15 giây.`}
          confirmLabel="Xoá toàn bộ kế hoạch đang soạn"
          destructive
          onConfirm={handleResetFromScratch}
          onCancel={() => setConfirmingReset(false)}
        />
      )}

      {confirmingSubmit && (
        <ConfirmDialog
          title="Đã kiểm tra kỹ chưa?"
          message={msgSubmit}
          confirmLabel="Gửi và thay kế hoạch kỳ này"
          danger
          busy={isSaving}
          busyLabel="Đang gửi..."
          onConfirm={handleSubmit}
          onCancel={() => setConfirmingSubmit(false)}
        />
      )}
    </div>
  );
}
