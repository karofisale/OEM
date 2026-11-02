import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Filter, CheckCircle2, Save, ShieldCheck, User, UserPlus, Plus, RefreshCw, AlertTriangle, Check, Lock, CalendarRange, Download, Upload } from 'lucide-react';
import * as api from '../../services/api';
import Combobox from '../Combobox';
import ConfirmDialog from '../ConfirmDialog';
import Pagination, { usePagedSlice } from '../Pagination';
import SortableTh from '../SortableTh';
import TableState from '../TableState';
import { useToast } from '../ToastProvider';
import { parseMonthKey, formatMonthKey } from '../../utils/period';
import { canSeeAllSales, ownsSaleRow } from '../../utils/roles';
import { doneTheoKhach, doneDong } from '../../utils/salesPlan';
import { trangThai } from '../../utils/glossary';
import { vnPlanMonthKey, vnTimestamp } from '../../utils/vnDate';
import { dungBangMau, docBangKeHoach, ghepVaoNhap } from '../../utils/salesPlanExcel';
import { TT_SUA, dongCanSuaCuaToi, lyDoRiengBiet } from '../../utils/salesPlanRevision';
import { useTableSort } from '../../hooks/useTableSort';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';

import { useDefaultPageSize } from '../../hooks/useSetting';

// Cỡ trang mặc định của màn này; Cài đặt cá nhân (st.pageSize) nếu đã chọn thì thắng.
const PAGE_SIZE_MAC_DINH = 25;

function monthKeyToInputValue(key) {
  const p = parseMonthKey(key);
  return p ? `${p.year}-${String(p.month).padStart(2, '0')}` : '';
}

function inputValueToMonthKey(value) {
  const [y, m] = String(value || '').split('-').map(Number);
  return y && m ? formatMonthKey(m, y) : '';
}

// Diacritics-insensitive + case-insensitive substring match. Sheet-sourced
// Vietnamese text (copy/pasted into Google Sheets from all sorts of places)
// can land as NFD (decomposed accents) while a query typed straight into
// the browser is NFC — visually identical, but plain .includes() on the two
// different Unicode forms silently never matches. Mã KH/mã code are ASCII,
// so they never hit this; tên khách hàng, being Vietnamese, did.
const normalizeForSearch = (s) => String(s || '').normalize('NFC').toLowerCase();

// Chữ ký của một dòng đang nhập, dùng để so "đã lưu chưa". Chỉ gồm đúng những
// gì được gửi lên: 5 tuần + note (Plan KPI lấy từ Plan2026, không phải Sale nhập).
const draftSignature = (d) => JSON.stringify([
  d.w1 || 0, d.w2 || 0, d.w3 || 0, d.w4 || 0, d.w5 || 0, String(d.note || '')
]);

const emptyDraft = { w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, note: '' };

const draftFromPlanRow = (p) => ({
  w1: p.w1 || 0, w2: p.w2 || 0, w3: p.w3 || 0, w4: p.w4 || 0, w5: p.w5 || 0, note: p.note || ''
});

// Sale's bulk-entry screen for the business plan: pick + confirm a month, fill
// in a searchable table, save once. Plan KPI auto-pulled from Plan2026,
// Plan_Update auto-summed from the 5 weeks. Existing rows for that month
// pre-fill for editing — resubmitting re-queues for approval (see
// oemAppSubmitSalesPlan_).
//
// 2026-09-10 — bảng dựng từ Plan2026, không còn từ tab Clients:
// KPI năm (tab Plan2026) mới là danh sách khách mà Sale phải lập kế hoạch cho,
// còn tab Clients là danh bạ — có khách nằm trong KPI năm mà tab Clients chưa
// kịp thêm dòng (hoặc để Inactive) thì trước đây Sale KHÔNG thấy để nhập. Bảng
// giờ là hợp của ba nguồn: (1) mọi mã trong Plan2026 thuộc phạm vi của mình,
// (2) mọi khách đã có dòng kế hoạch của đúng tháng này (kể cả khách không có
// KPI năm), (3) khách Sale tự bổ sung bằng ô tìm + nút "Thêm KH vào kế hoạch".
export default function SalesPlanProposePanel({ token, clients, plans, transactions, plan2026, planDefaultMonth, activeUser, onSubmitted, onReloadPlanKpi }) {
  const PAGE_SIZE = useDefaultPageSize(PAGE_SIZE_MAC_DINH);
  const toast = useToast();
  const canFilterAllSales = canSeeAllSales(activeUser.role);
  const isSale = String(activeUser.role || '').toLowerCase() === 'sale';

  // Backend chưa trả tháng mặc định thì tự tính theo giờ Việt Nam (1-24: tháng này, 25-31: tháng sau).
  const [month, setMonth] = useState(planDefaultMonth || vnPlanMonthKey());
  const [periodConfirmed, setPeriodConfirmed] = useState(false);
  // Đổi tháng sau khi đã xác nhận (Đợt 3): còn nháp chưa lưu thì hỏi trước vì nháp gắn với THÁNG đang lập.
  const [hoiDoiThang, setHoiDoiThang] = useState(false);
  // Sale mở màn này là để lập kế hoạch cho khách CỦA MÌNH, nên mặc định lọc
  // sẵn về mình — xem của người khác thì đổi sang "Tất cả SALE". Nếu vào thẳng
  // danh sách toàn công ty thì khách của chính mình lẫn trong hàng trăm dòng.
  // Bộ lọc SALE nhớ qua F5 (Đợt 2 / mục 9). Tháng lập KHÔNG nhớ: màn có bước xác nhận tháng chính để
  // tránh nhập nhầm sang kỳ cũ.
  const defaultSale = isSale && activeUser.saleId ? activeUser.saleId : 'ALL';
  const [saleSaved, setSelectedSale] = usePersistentState('plan.propose.sale', defaultSale);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloadingKpi, setIsReloadingKpi] = useState(false);
  // Xuất Excel mẫu / Nhập từ Excel (02/11/2026): chỉ đổi bản NHÁP trên màn, không ghi lên máy chủ — Sale kiểm rồi bấm Lưu như thường.
  const fileRef = useRef(null);
  const [dangXuat, setDangXuat] = useState(false);
  const [dangDoc, setDangDoc] = useState(false);
  const [dlgNhap, setDlgNhap] = useState(null); // { ten, thang, gh, loi, trung } — kết quả đọc file, chờ xác nhận áp
  const [chiCanSua, setChiCanSua] = useState(false); // chỉ hiện khách Admin yêu cầu sửa lại

  const [draftMap, setDraftMap] = useState({});   // searchCode -> { w1..w5, note }
  const [savedMap, setSavedMap] = useState({});   // searchCode -> draftSignature đã lưu THÀNH CÔNG
  const [extraCodes, setExtraCodes] = useState([]); // Sale tự bổ sung vào bảng
  const [pickedClient, setPickedClient] = useState(null);
  const [pickerKey, setPickerKey] = useState(0);  // đổi để Combobox tự xoá chữ đã gõ

  const kpiLoaded = useMemo(() => Object.keys(plan2026 || {}).length > 0, [plan2026]);

  // Doanh thu đã thực hiện của đúng tháng đang lập, tính từ tab Data (cùng cách
  // với màn "Xem Kế Hoạch") — xem doneDong().
  const doneByCode = useMemo(() => doneTheoKhach(transactions, month), [transactions, month]);
  const doneCua = (r) => doneDong(r.plan, r.codeSearch, doneByCode);

  // Existing plan row for (month, client), if any — used to pre-fill, to show
  // the current approval status, and to decide when a saved draft can be
  // dropped again (xem effect "settled" bên dưới).
  const existingByCode = useMemo(() => {
    const map = {};
    plans.forEach(p => { if (p.month === month) map[p.searchCode] = p; });
    return map;
  }, [plans, month]);

  // Admin YÊU CẦU SỬA LẠI (02/11/2026): các dòng 'Cần sửa' của CHÍNH Sale này, gom theo tháng. Chỉ hiện cho vai Sale (Admin là người yêu cầu,
  // không phải người sửa). Dòng của tháng đang lập có nhãn + lý do ngay trên bảng; tháng khác chỉ nhắc để Sale biết mà mở.
  const canSuaTheoThang = useMemo(
    () => (isSale ? dongCanSuaCuaToi(plans, (tenSale) => ownsSaleRow(activeUser, tenSale)) : {}),
    [plans, isSale, activeUser] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const canSuaThangNay = canSuaTheoThang[month] || [];
  const thangKhacCanSua = Object.keys(canSuaTheoThang).filter(m => m !== month);

  // Danh bạ khách, tra theo Mã KH chữ. Tab Clients có thể có NHIỀU dòng cho
  // cùng một khách thật (khác địa chỉ/liên hệ) — giữ dòng đầu tiên.
  const clientByCode = useMemo(() => {
    const map = {};
    clients.forEach(c => { if (c.codeSearch && !map[c.codeSearch]) map[c.codeSearch] = c; });
    return map;
  }, [clients]);

  // Toàn bộ danh bạ, bỏ trùng theo Mã KH chữ. Từ 14/09/2026 không cắt theo Sale
  // nữa — ai cũng tra được mọi khách. Bổ sung khách của Sale khác vào bảng thì
  // thấy được số nhưng ô nhập bị khoá (canEditRow), và backend chặn thật ở
  // oemAppRequirePlanOwnership_.
  const pickableClients = useMemo(() => {
    const seen = new Set();
    const out = [];
    clients.forEach(c => {
      if (!c.codeSearch || seen.has(c.codeSearch)) return;
      seen.add(c.codeSearch);
      out.push(c);
    });
    return out;
  }, [clients]);

  // Hợp ba nguồn thành danh sách dòng của bảng. Không ép phạm vi lại cho nguồn
  // (1) và (2): backend đã ép theo PIC/Sale, ép thêm ở đây bằng `c.sale` của tab
  // Clients chỉ tạo nguy cơ ẩn mất chính khách của mình khi hai tab ghi tên Sale
  // lệch nhau.
  const allRows = useMemo(() => {
    const byCode = new Map();
    const add = (code, name, sale, flags) => {
      if (!code) return;
      const found = byCode.get(code);
      if (found) {
        if (!found.name && name) found.name = name;
        if (!found.sale && sale) found.sale = sale;
        Object.assign(found, flags);
        return;
      }
      byCode.set(code, { codeSearch: code, name: name || '', sale: sale || '', ...flags });
    };

    if (kpiLoaded) {
      Object.keys(plan2026).forEach(code => {
        const e = plan2026[code] || {};
        add(code, e.name, e.pic, { hasKpi: true });
      });
    } else {
      // Chưa tải được Plan2026 (endpoint riêng, mạng ở đây hỏng ~50% mỗi lượt).
      // Quay về cách cũ — dựng theo tab Clients — để màn vẫn nhập được, kèm
      // cảnh báo + nút thử lại ở trên bảng.
      pickableClients.forEach(c => {
        if (c.status && c.status !== 'Active') return;
        add(c.codeSearch, c.name, c.sale, {});
      });
    }

    Object.keys(existingByCode).forEach(code => {
      const p = existingByCode[code];
      add(code, p.clientName, p.sale, { plan: p });
    });

    extraCodes.forEach(code => {
      const c = clientByCode[code];
      add(code, c && c.name, c && c.sale, { isAdded: true });
    });

    return Array.from(byCode.values()).map(r => {
      const c = clientByCode[r.codeSearch];
      return {
        ...r,
        name: r.name || (c && c.name) || r.codeSearch,
        sale: r.sale || (c && c.sale) || '',
        inClientList: !!c,
        plan: r.plan || existingByCode[r.codeSearch] || null
      };
    });
  }, [kpiLoaded, plan2026, pickableClients, existingByCode, extraCodes, clientByCode]);

  const rowByCode = useMemo(() => {
    const map = {};
    allRows.forEach(r => { map[r.codeSearch] = r; });
    return map;
  }, [allRows]);

  const salesList = useMemo(() => {
    const set = new Set();
    allRows.forEach(r => { if (r.sale) set.add(r.sale); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [allRows]);

  // Sale đã nhớ mà không còn trong bảng -> về mặc định (khách của mình / tất cả).
  const selectedSale = saleSaved === 'ALL' || saleSaved === activeUser.saleId || salesList.includes(saleSaved) ? saleSaved : defaultSale;

  // Sửa được dòng này không. Khách chưa có chủ (cột Sale trống) thì cho nhập —
  // đó là khách mới, và backend cũng cho qua đúng theo luật đó.
  const canEditRow = (r) => !r.sale || ownsSaleRow(activeUser, r.sale);

  const planKpiForCode = (code) => {
    const p = parseMonthKey(month);
    const e = plan2026 && plan2026[code];
    if (!p || !e || !e.months) return 0;
    return e.months[p.month - 1] || 0;
  };

  // Cao -> thấp theo Plan KPI của đúng tháng đang chọn, để những khách trọng
  // tâm (KPI lớn) luôn nổi lên đầu bảng. Khách vừa bổ sung tay được ghim lên
  // trên cùng — KPI của họ thường bằng 0 nên nếu không ghim thì vừa bấm thêm là
  // dòng đó rơi xuống trang cuối, không thấy đâu mà nhập.
  const scopedRows = useMemo(() => {
    if (!canFilterAllSales || selectedSale === 'ALL') return allRows;
    const q = normalizeForSearch(selectedSale);
    return allRows.filter(r => normalizeForSearch(r.sale).includes(q));
  }, [allRows, canFilterAllSales, selectedSale]);

  const filteredRows = useMemo(() => {
    const q = normalizeForSearch(searchTerm.trim());
    const goc = chiCanSua ? scopedRows.filter(r => r.plan && r.plan.status === TT_SUA) : scopedRows;
    const base = !q ? goc : goc.filter(r =>
      normalizeForSearch(r.name).includes(q) ||
      normalizeForSearch(r.codeSearch).includes(q)
    );
    return [...base].sort((a, b) => {
      if (!!b.isAdded !== !!a.isAdded) return b.isAdded ? 1 : -1;
      return planKpiForCode(b.codeSearch) - planKpiForCode(a.codeSearch);
    });
  }, [scopedRows, searchTerm, month, plan2026, chiCanSua]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sắp xếp theo cột (Đợt 2 / mục 3) — chỉ các cột KHÔNG sửa được (Mã, Tên, Plan KPI, Done), vì sắp
  // theo ô đang gõ thì dòng nhảy chỗ dưới tay người nhập. Không chọn cột nào thì giữ thứ tự mặc định
  // (Plan KPI giảm dần, khách mới thêm ghim lên đầu).
  const cols = useMemo(() => [
    { key: 'codeSearch' }, { key: 'name' },
    { key: 'planKpi', type: 'number', get: (r) => planKpiForCode(r.codeSearch) },
    { key: 'done', type: 'number', get: (r) => doneCua(r).value }
  ], [month, plan2026, doneByCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const { rows: sortedRows, sort, onSort } = useTableSort(filteredRows, cols);
  const { safePage, pageItems: pagedRows } = usePagedSlice(sortedRows, page, PAGE_SIZE);

  const getDraft = (code) => {
    if (draftMap[code]) return draftMap[code];
    const existing = existingByCode[code];
    return existing ? draftFromPlanRow(existing) : emptyDraft;
  };

  const setCell = (code, field, value) => {
    setDraftMap(prev => {
      const current = prev[code] || getDraft(code);
      const next = { ...current };
      if (field === 'note') next.note = value;
      else next[field] = typeof value === 'number' ? value : (value === '' ? 0 : (parseFloat(value) || 0));
      return { ...prev, [code]: next };
    });
  };

  // Dòng đã nhập nhưng CHƯA lưu (hoặc lưu rồi lại sửa tiếp). Đây là danh sách
  // duy nhất được gửi lên, và cũng là thứ khoá/mở nút Lưu.
  const pendingCodes = useMemo(
    () => Object.keys(draftMap).filter(code => draftSignature(draftMap[code]) !== savedMap[code]),
    [draftMap, savedMap]
  );

  // F5 / đổi tab khi còn dòng đã nhập mà chưa lưu -> cảnh báo (Đợt 2 / mục 5).
  useUnsavedGuard(pendingCodes.length > 0, 'Kế hoạch kinh doanh');

  /**
   * Nhả bản nhập tay khi dữ liệu từ Sheet đã đuổi kịp.
   *
   * Vì sao phải có: trước đây lưu xong là `setDraftMap({})` NGAY, nhưng prop
   * `plans` chỉ mới về sau một lượt getBootstrap khác — mà lượt đó mất từ 1,4s
   * tới hơn một phút, và hỏng chừng một nửa số lần. Trong khoảng chờ đó bảng vẽ
   * lại từ `plans` CŨ, tức toàn bộ số Sale vừa nhập BIẾN MẤT khỏi màn hình dù
   * đã ghi vào Sheet thành công. Sale tưởng mất, bấm Lưu lần nữa và nhận đúng
   * câu "Chưa nhập kế hoạch cho khách hàng nào" (lúc này draftMap đã rỗng) —
   * chính lỗi được báo ngày 2026-09-10: báo lỗi nhưng file vẫn có dữ liệu.
   *
   * Nên: giữ bản nhập trên màn, chỉ nhả khi `plans` về và khớp đúng chữ ký đã
   * lưu. Giữ vô thời hạn cũng không được — tab này ở lại trong DOM cả ngày
   * (KeepAliveTab), bản nhập cũ sẽ che mất số mới mỗi lần bấm "Đồng bộ Sheet".
   */
  useEffect(() => {
    const settled = Object.keys(savedMap).filter(code => {
      const p = existingByCode[code];
      return p && draftSignature(draftFromPlanRow(p)) === savedMap[code];
    });
    if (!settled.length) return;
    const drop = (obj) => {
      const next = { ...obj };
      settled.forEach(code => { delete next[code]; });
      return next;
    };
    setDraftMap(drop);
    setSavedMap(drop);
  }, [existingByCode, savedMap]);

  // Tuần 1-5 are revenue figures (hundreds of millions/billions) — a plain
  // <input type="number"> in a ~100px cell shows only the leading digits, cut
  // off mid-number. Displaying with thousand separators (like the read-only
  // Plan KPI/Plan_Update cells already do) needs a text input: strip
  // everything but digits on change, format with separators for display.
  const parseDigits = (text) => {
    const digits = String(text).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  };
  const formatDigits = (v) => (v ? Number(v).toLocaleString('vi-VN') : '');

  // Full-column totals (Plan KPI, từng Tuần, Plan_Update) over the whole
  // filtered table — not just rows touched this session — so the summary row
  // reflects what's actually on screen while filling in the table, same idea
  // as SalesPlanViewPanel's Σ TỔNG CỘNG row.
  const totals = useMemo(() => {
    return filteredRows.reduce((acc, r) => {
      const d = getDraft(r.codeSearch);
      acc.planKpi += planKpiForCode(r.codeSearch);
      acc.w1 += d.w1 || 0; acc.w2 += d.w2 || 0; acc.w3 += d.w3 || 0; acc.w4 += d.w4 || 0; acc.w5 += d.w5 || 0;
      acc.done += doneCua(r).value;
      return acc;
    }, { planKpi: 0, w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, done: 0 });
  }, [filteredRows, draftMap, existingByCode, month, plan2026, doneByCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPlanUpdate = totals.w1 + totals.w2 + totals.w3 + totals.w4 + totals.w5;
  const fmt = (v) => (v || 0).toLocaleString('vi-VN');

  // Sale xem yêu cầu sửa mà thấy số đã đúng: "Giữ nguyên số, gửi lại" đưa dòng vào danh sách CHƯA LƯU y hệt số hiện có — bấm Lưu thì dòng
  // về 'Chờ duyệt' (server xoá lý do). Không có nút này thì dòng không đổi số sẽ không bao giờ được gửi lại.
  const guiLaiKhongDoi = (code) => {
    setDraftMap(prev => ({ ...prev, [code]: { ...getDraft(code) } }));
  };

  const handleAddClientToPlan = () => {
    if (!pickedClient) return;
    const code = pickedClient.codeSearch;
    if (rowByCode[code]) {
      toast.info(`${code} đã có trong bảng kế hoạch — đã lọc để anh/chị thấy dòng đó.`);
      setSearchTerm(code);
      setPage(1);
      return;
    }
    setExtraCodes(prev => (prev.includes(code) ? prev : [...prev, code]));
    setPickedClient(null);
    setPickerKey(k => k + 1);
    setSearchTerm('');
    setPage(1);
    toast.success(`Đã thêm ${code} — ${pickedClient.name} vào bảng (dòng được ghim lên đầu).`);
  };

  const handleSubmit = async () => {
    // CHỈ những dòng Sale thật sự đã sửa và chưa lưu — đọc thẳng từ draftMap,
    // KHÔNG lọc qua danh sách đang hiện trên bảng.
    //
    // Bản trước lấy `filteredClients.filter(c => draftMap[...])`, nghĩa là ai
    // nhập số cho một khách rồi gõ tiếp vào ô tìm kiếm (hoặc đổi bộ lọc SALE,
    // hoặc sang trang khác của một bộ lọc khác) là mất đúng những dòng vừa nhập
    // khỏi lượt gửi — im lặng, không báo gì. Lọc theo draftMap giữ nguyên ý ban
    // đầu (không gửi dòng chưa ai chạm tới, tránh đẩy cả tháng ĐÃ DUYỆT về "Chờ
    // duyệt") mà không phụ thuộc vào bảng đang lọc thế nào.
    const codes = pendingCodes;
    if (!codes.length) {
      toast.info('Không có thay đổi nào cần lưu — mọi số đã nhập đều đã lưu xong.');
      return;
    }

    const rows = codes.map(code => {
      const row = rowByCode[code] || {};
      const c = clientByCode[code];
      const d = draftMap[code];
      return {
        searchCode: code,
        clientName: row.name || (c && c.name) || code,
        sale: row.sale || (c && c.sale) || activeUser.saleId || '',
        planKpi: planKpiForCode(code),
        w1: d.w1, w2: d.w2, w3: d.w3, w4: d.w4, w5: d.w5,
        note: d.note
      };
    });

    setIsSaving(true);
    try {
      const result = await api.submitSalesPlan(token, month, rows);
      // Ghi nhận "đã lưu" chứ KHÔNG xoá bản nhập — xem effect "settled".
      setSavedMap(prev => {
        const next = { ...prev };
        codes.forEach(code => { next[code] = draftSignature(draftMap[code]); });
        return next;
      });
      toast.success(`Đã lưu kế hoạch cho ${result.savedCount} khách hàng (${month}), chờ Admin duyệt.`);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      toast.error('Không lưu được kế hoạch: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ----- Excel mẫu: xuất + nhập -----------------------------------------------
  // Mẫu = các khách Sale SỬA ĐƯỢC trong phạm vi đang chọn (kèm số hiện có, kể cả nháp chưa lưu). Nhập lại: ô trống giữ nguyên số,
  // 0 đặt về 0; chỉ dòng thật sự đổi mới vào nháp (dòng y hệt số đã lưu không bị đẩy lại về "Chờ duyệt").
  const handleXuatMau = async () => {
    if (dangXuat) return;
    const ds = [...scopedRows].filter(canEditRow).sort((a, b) => planKpiForCode(b.codeSearch) - planKpiForCode(a.codeSearch));
    if (!ds.length) { toast.info('Không có khách hàng nào bạn sửa được trong phạm vi đang chọn để xuất mẫu.'); return; }
    setDangXuat(true);
    try {
      const XLSX = await import('xlsx');
      const rows = ds.map(r => {
        const d = getDraft(r.codeSearch);
        return { code: r.codeSearch, name: r.name, sale: r.sale, planKpi: planKpiForCode(r.codeSearch), w: [d.w1, d.w2, d.w3, d.w4, d.w5], note: d.note, done: doneCua(r).value };
      });
      const mau = dungBangMau({ month, rows, nguoiXuat: activeUser.name, ngayXuat: vnTimestamp() });
      const ws = XLSX.utils.aoa_to_sheet(mau.aoa);
      ws['!cols'] = mau.cot.map(wch => ({ wch }));
      for (let r = mau.dongDau; r < mau.aoa.length; r++) {
        for (let c = 3; c <= 10; c++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell) cell.z = '#,##0'; }
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, mau.tenSheet);
      const ten = String(selectedSale === 'ALL' ? 'tat-ca' : selectedSale).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mau';
      XLSX.writeFile(wb, `Ke-hoach-kinh-doanh_${month}_${ten}.xlsx`);
      toast.success(`Đã xuất mẫu ${month} cho ${ds.length.toLocaleString('vi-VN')} khách. Điền Tuần 1–5 / Note rồi bấm "Nhập từ Excel".`);
    } catch (err) {
      toast.error('Không xuất được file Excel: ' + (err.message || err));
    } finally {
      setDangXuat(false);
    }
  };

  const handleNhapExcel = async (file) => {
    if (!file || dangDoc) return;
    setDangDoc(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      let dk = null;
      for (const name of wb.SheetNames) {
        const r = docBangKeHoach(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }));
        if (!r.loiCauTruc) { dk = r; break; }
        if (!dk) dk = r;
      }
      if (!dk || dk.loiCauTruc) { toast.error((dk && dk.loiCauTruc) || 'File không có dữ liệu.'); return; }
      if (dk.thang && dk.thang !== month) {
        toast.error(`File này là kế hoạch ${dk.thang}, còn bạn đang lập ${month}. Bấm "Đổi tháng" cho đúng, hoặc xuất lại mẫu đúng tháng.`);
        return;
      }
      if (!dk.dong.length) { toast.info('File không có dòng khách hàng nào.'); return; }
      const gh = ghepVaoNhap({ dong: dk.dong, rowByCode, clientByCode, getDraft, canEditRow, canEditClient: (c) => !c.sale || ownsSaleRow(activeUser, c.sale) });
      setDlgNhap({ ten: file.name, thang: dk.thang, gh, loi: dk.loi, trung: dk.trung });
    } catch (err) {
      toast.error('Không đọc được file Excel: ' + (err.message || err));
    } finally {
      setDangDoc(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const apDungNhap = () => {
    if (!dlgNhap) return;
    const { gh } = dlgNhap;
    const moi = {};
    gh.apply.forEach(a => { moi[a.code] = a.draft; });
    setDraftMap(prev => ({ ...prev, ...moi }));
    if (gh.themKhach.length) setExtraCodes(prev => [...prev, ...gh.themKhach.filter(c => !prev.includes(c))]);
    setSearchTerm('');
    setPage(1);
    setDlgNhap(null);
    toast.success(`Đã nạp ${gh.apply.length.toLocaleString('vi-VN')} khách từ Excel vào bảng — kiểm tra rồi bấm "Lưu Kế Hoạch, Gửi Duyệt".`);
  };

  // Nháp gắn theo mã khách của THÁNG đang lập (draftMap khoá theo searchCode, không theo tháng) — giữ lại khi sang
  // tháng khác là ghi số của tháng này vào tháng kia. Nên đổi tháng = bỏ nháp (đã hỏi nếu còn dòng chưa lưu) và
  // quay về bước chọn tháng; dữ liệu ĐÃ lưu nằm trên server nên không mất gì.
  const doiThang = () => {
    setChiCanSua(false);
    setDraftMap({});
    setSavedMap({});
    setExtraCodes([]);
    setPickedClient(null);
    setPickerKey(k => k + 1);
    setSearchTerm('');
    setPage(1);
    setHoiDoiThang(false);
    setPeriodConfirmed(false);
  };
  const yeuCauDoiThang = () => { if (pendingCodes.length) setHoiDoiThang(true); else doiThang(); };

  const handleReloadKpi = async () => {
    if (!onReloadPlanKpi) return;
    setIsReloadingKpi(true);
    try {
      await onReloadPlanKpi();
    } catch (err) {
      toast.error('Vẫn chưa tải được KPI năm: ' + (err.message || err));
    } finally {
      setIsReloadingKpi(false);
    }
  };

  // Khối nhắc "Admin yêu cầu sửa lại" — dùng ở màn chọn tháng và ở đầu bảng. `moThang` (chỉ ở màn chọn tháng) mở thẳng tháng đó.
  const khoiCanSua = (moThang) => {
    const cacThang = Object.keys(canSuaTheoThang).sort().reverse();
    if (!cacThang.length) return null;
    return (
      <div role="alert" className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderColor: 'rgba(220, 38, 38, 0.45)', textAlign: 'left', width: '100%', maxWidth: '680px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: 'var(--danger)', fontSize: '0.9rem' }}>
          <AlertTriangle size={16} aria-hidden="true" /> Admin yêu cầu bạn sửa lại kế hoạch
        </div>
        {cacThang.map(m => (
          <div key={m} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
            <span>
              <strong>{m}</strong>: {canSuaTheoThang[m].length.toLocaleString('vi-VN')} khách
              {lyDoRiengBiet(canSuaTheoThang[m]).length ? ` — “${lyDoRiengBiet(canSuaTheoThang[m]).join('”, “')}”` : ''}
            </span>
            {moThang && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => moThang(m)}>Mở tháng {m}</button>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!periodConfirmed) {
    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center', padding: '32px 20px' }}>
        {khoiCanSua((m) => { setMonth(m); setPeriodConfirmed(true); })}
        <ShieldCheck size={32} color="var(--karofi-cyan)" />
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Chọn tháng lập kế hoạch</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '440px' }}>
            Mặc định: tháng hiện tại nếu hôm nay là ngày 1-24, tháng kế tiếp nếu là ngày 25-31. Có thể đổi tháng trước khi bắt đầu nhập.
          </p>
        </div>
        <input
          type="month"
          className="input-field"
          style={{ width: '180px', textAlign: 'center' }}
          value={monthKeyToInputValue(month)}
          onChange={(e) => setMonth(inputValueToMonthKey(e.target.value))}
        />
        <button onClick={() => setPeriodConfirmed(true)} disabled={!month} className="btn btn-primary">
          <CheckCircle2 size={16} /> Xác nhận {month}, bắt đầu lập kế hoạch
        </button>
      </div>
    );
  }

  // Nội dung hộp xem trước (JSX) dựng sẵn để phần props của ConfirmDialog không chứa thẻ tự đóng (test khung dot2 soát props bằng regex).
  const ghN = dlgNhap && dlgNhap.gh;
  const blk = { display: 'block', marginTop: '4px' };
  const msgNhap = dlgNhap && (
    <>
      File <strong>{dlgNhap.ten}</strong>{dlgNhap.thang ? ` (tháng ${dlgNhap.thang})` : ` — file không ghi tháng, hãy chắc đây là kế hoạch ${month}`}: đọc được <strong>{ghN.tong.toLocaleString('vi-VN')}</strong> dòng khách.
      <span style={blk}>• <strong>{ghN.apply.length.toLocaleString('vi-VN')}</strong> khách có số mới sẽ được nạp vào bảng{ghN.themKhach.length ? ` (${ghN.themKhach.length} khách chưa có trên bảng sẽ được thêm)` : ''}.</span>
      <span style={blk}>• {ghN.khongDoi.toLocaleString('vi-VN')} khách không đổi (ô trống hoặc đúng số hiện có) — giữ nguyên.</span>
      {(ghN.boQua.length > 0 || dlgNhap.loi.length > 0) && (
        <span style={{ ...blk, color: 'var(--warning-text)' }}>
          • Bỏ qua {(ghN.boQua.length + dlgNhap.loi.length).toLocaleString('vi-VN')} dòng:{' '}
          {[...dlgNhap.loi.map(l => `dòng ${l.dongExcel} (${l.code}): ${l.lyDo}`), ...ghN.boQua.map(b => `dòng ${b.dongExcel} (${b.code}): ${b.lyDo}`)].slice(0, 6).join('; ')}
          {ghN.boQua.length + dlgNhap.loi.length > 6 ? ` …và ${ghN.boQua.length + dlgNhap.loi.length - 6} dòng khác` : ''}.
        </span>
      )}
      {dlgNhap.trung.length > 0 && <span style={blk}>• Mã lặp nhiều dòng (lấy dòng cuối): {dlgNhap.trung.slice(0, 5).join(', ')}.</span>}
      <span style={blk}>Chưa gửi gì lên hệ thống — số chỉ vào bảng dưới dạng nháp (CHƯA LƯU) để bạn kiểm tra rồi bấm Lưu.</span>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {canSuaThangNay.length > 0 && (
        <div role="alert" className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', borderColor: 'rgba(220, 38, 38, 0.45)' }}>
          <AlertTriangle size={18} color="var(--danger)" aria-hidden="true" />
          <span style={{ fontSize: '0.84rem', flex: 1, minWidth: '260px', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--danger)' }}>Admin yêu cầu sửa lại {canSuaThangNay.length.toLocaleString('vi-VN')} khách của tháng {month}</strong>
            {lyDoRiengBiet(canSuaThangNay).length ? <> — “{lyDoRiengBiet(canSuaThangNay).join('”, “')}”</> : null}.
            {' '}Sửa số các dòng có nhãn <strong>CẦN SỬA</strong> rồi bấm “Lưu Kế Hoạch, Gửi Duyệt” (hoặc “Giữ nguyên số, gửi lại” nếu số đã đúng).
          </span>
          <button type="button" className={'btn btn-sm ' + (chiCanSua ? 'btn-primary' : 'btn-secondary')} onClick={() => { setChiCanSua(v => !v); setPage(1); }}>
            {chiCanSua ? 'Hiện tất cả khách' : 'Chỉ hiện khách cần sửa'}
          </button>
        </div>
      )}
      {thangKhacCanSua.length > 0 && (
        <div className="glass-card" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
          <AlertTriangle size={14} color="var(--warning-text)" style={{ verticalAlign: '-2px', marginRight: '6px' }} aria-hidden="true" />
          Tháng {thangKhacCanSua.sort().join(', ')} còn khách Admin yêu cầu sửa lại — bấm “Đổi tháng” để mở.
        </div>
      )}
      {!kpiLoaded && (
        <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
          <AlertTriangle size={18} color="var(--warning-text)" />
          <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', flex: 1, minWidth: '260px' }}>
            Chưa tải được KPI năm — bảng đang hiện theo danh sách Khách hàng và cột Plan KPI để trống.
            Vẫn nhập và lưu được bình thường.
          </span>
          <button onClick={handleReloadKpi} disabled={isReloadingKpi} className="btn btn-secondary">
            <RefreshCw size={15} /> {isReloadingKpi ? 'Đang tải...' : 'Tải lại KPI năm'}
          </button>
        </div>
      )}

      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" className="input-field" style={{ paddingLeft: '36px' }}
            placeholder="Tìm tên hoặc mã KH trong bảng..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>

        {canFilterAllSales && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={15} color="var(--text-muted)" />
            <select className="input-field" style={{ width: '190px' }} value={selectedSale} onChange={(e) => { setSelectedSale(e.target.value); setPage(1); }}>
              <option value="ALL">Tất cả SALE</option>
              {/* Giá trị lọc là saleId (vd "Đình Hoan"), không phải tên đầy đủ trên
                  Sheet (vd "KH Đình Hoan") — bộ lọc so theo kiểu "chứa" nên vẫn
                  đúng, nhưng phải có option này thì ô select mới hiện được chữ. */}
              {isSale && activeUser.saleId && (
                <option value={activeUser.saleId}>⭐ Khách của tôi</option>
              )}
              {salesList.filter(s => s !== activeUser.saleId).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={12} /> {filteredRows.length.toLocaleString('vi-VN')} khách hàng
        </span>

        <button type="button" onClick={yeuCauDoiThang} className="btn btn-secondary btn-sm" title="Chọn lại tháng lập kế hoạch">
          <CalendarRange size={14} /> Tháng {month} · Đổi tháng
        </button>

        <button type="button" onClick={handleXuatMau} disabled={dangXuat} className="btn btn-secondary btn-sm" title="Tải file Excel mẫu của tháng này: danh sách khách bạn sửa được kèm số hiện có">
          <Download size={14} aria-hidden="true" /> {dangXuat ? 'Đang xuất...' : 'Xuất Excel mẫu'}
        </button>
        <button type="button" onClick={() => fileRef.current && fileRef.current.click()} disabled={dangDoc} className="btn btn-secondary btn-sm" title="Nhập file Excel mẫu đã điền: số vào bảng dưới dạng nháp, chưa gửi duyệt">
          <Upload size={14} aria-hidden="true" /> {dangDoc ? 'Đang đọc...' : 'Nhập từ Excel'}
        </button>
        <input
          ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} aria-label="Chọn file Excel kế hoạch"
          onChange={(e) => handleNhapExcel(e.target.files && e.target.files[0])}
        />
      </div>

      {/* Bổ sung khách chưa có trong bảng — tra trong tab Clients. */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
          <UserPlus size={16} color="var(--karofi-cyan)" /> Bổ sung khách hàng
        </span>
        <div style={{ flex: 1, minWidth: '260px' }}>
          <Combobox
            key={pickerKey}
            options={pickableClients}
            filterFn={(c, q) => {
              const qq = normalizeForSearch(q.trim());
              if (!qq) return true;
              return normalizeForSearch(c.name).includes(qq)
                || normalizeForSearch(c.codeSearch).includes(qq)
                || normalizeForSearch(c.code).includes(qq)
                || normalizeForSearch(c.alias).includes(qq);
            }}
            toText={(c) => `${c.codeSearch} — ${c.name}`}
            getKey={(c) => c.codeSearch}
            renderOption={(c) => (
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                  <span className="code-font" style={{ color: 'var(--cyan-text)' }}>{c.codeSearch}</span>
                  {c.status && c.status !== 'Active' && (
                    <span style={{ marginLeft: '6px', fontSize: '0.68rem', color: 'var(--danger-strong)' }}>({trangThai(c.status).label})</span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.name}{c.sale ? ` · ${c.sale}` : ''}</div>
              </div>
            )}
            onSelect={setPickedClient}
            placeholder="Tìm khách trong danh sách Khách hàng (tên, mã KH, alias)..."
            ariaLabel="Chọn khách hàng để bổ sung vào kế hoạch"
          />
        </div>
        <button onClick={handleAddClientToPlan} disabled={!pickedClient} className="btn btn-secondary">
          <Plus size={16} /> {pickedClient ? `Thêm ${pickedClient.codeSearch} vào kế hoạch` : 'Thêm KH vào kế hoạch'}
        </button>
      </div>

      <TableState isEmpty={filteredRows.length === 0} emptyText="Không có khách hàng nào khớp bộ lọc." emptyHint="Dùng ô &quot;Bổ sung khách hàng&quot; ở trên để thêm khách vào kế hoạch.">
      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <SortableTh col="codeSearch" sort={sort} onSort={onSort} style={{ minWidth: '130px' }}>Mã KH</SortableTh>
              <SortableTh col="name" sort={sort} onSort={onSort} style={{ minWidth: '200px' }}>Tên khách hàng</SortableTh>
              <SortableTh col="planKpi" sort={sort} onSort={onSort} align="right" style={{ width: '150px' }}>Plan KPI</SortableTh>
              <th style={{ textAlign: 'right', width: '140px' }}>Tuần 1</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Tuần 2</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Tuần 3</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Tuần 4</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Tuần 5</th>
              <th style={{ textAlign: 'right', width: '150px' }}>Plan update</th>
              <SortableTh col="done" sort={sort} onSort={onSort} align="right" style={{ width: '150px' }}>Doanh thu done</SortableTh>
              <th style={{ minWidth: '150px' }}>Note</th>
            </tr>
          </thead>
          <tbody>
            <tr className="top-summary-row">
              <td style={{ color: 'var(--karofi-navy)', fontWeight: 900 }}>Σ TỔNG CỘNG</td>
              <td style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{filteredRows.length.toLocaleString('vi-VN')} khách đang hiện</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.planKpi)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w1)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w2)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w3)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w4)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w5)}</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totalPlanUpdate)}</td>
              <td style={{ textAlign: 'right', color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.done)}</td>
              <td style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Tổng kế hoạch đang nhập</td>
            </tr>
            {pagedRows.map(r => {
              const code = r.codeSearch;
              const d = getDraft(code);
              const sum = (d.w1 || 0) + (d.w2 || 0) + (d.w3 || 0) + (d.w4 || 0) + (d.w5 || 0);
              const isDirty = !!draftMap[code] && draftSignature(draftMap[code]) !== savedMap[code];
              const isJustSaved = !!draftMap[code] && draftSignature(draftMap[code]) === savedMap[code];
              const editable = canEditRow(r);
              const done = doneCua(r);
              return (
                <tr key={code}>
                  <td className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)', fontSize: '0.8rem' }}>
                    {code}
                    {r.isAdded && (
                      <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-emerald-text)' }}>MỚI THÊM</span>
                    )}
                    {isJustSaved && (
                      <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 800, color: 'var(--success-text)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        <Check size={11} /> ĐÃ LƯU
                      </span>
                    )}
                    {isDirty && (
                      <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 800, color: 'var(--warning-text)' }}>CHƯA LƯU</span>
                    )}
                    {r.plan && r.plan.status === TT_SUA && !isDirty && !isJustSaved && (
                      <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 800, color: 'var(--danger)' }}>CẦN SỬA</span>
                    )}
                    {!editable && (
                      <span title={`Khách của ${r.sale} — chỉ xem`} style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        <Lock size={11} /> CHỈ XEM
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    {r.plan && r.plan.status === TT_SUA && !isDirty && !isJustSaved && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--danger)', margin: '2px 0', lineHeight: 1.4 }}>
                        Admin yêu cầu sửa{r.plan.revisionNote ? `: ${r.plan.revisionNote}` : ''}
                        {r.plan.revisionBy || r.plan.revisionAt ? <span style={{ color: 'var(--text-dim)' }}> ({[r.plan.revisionBy, r.plan.revisionAt].filter(Boolean).join(' · ')})</span> : null}
                        {editable && <> <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => guiLaiKhongDoi(code)}>Giữ nguyên số, gửi lại</button></>}
                      </div>
                    )}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                      {canFilterAllSales && r.sale ? r.sale : ''}
                      {r.plan ? `${canFilterAllSales && r.sale ? ' · ' : ''}${trangThai(r.plan.status || 'Chờ duyệt').label}` : ''}
                      {!r.inClientList ? `${(canFilterAllSales && r.sale) || r.plan ? ' · ' : ''}chưa có trong tab Khách hàng` : ''}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {planKpiForCode(code).toLocaleString('vi-VN')}
                  </td>
                  {['w1', 'w2', 'w3', 'w4', 'w5'].map(field => (
                    <td key={field} style={editable ? undefined : { textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {editable ? (
                        <input
                          type="text" inputMode="numeric" className="input-field"
                          style={{ textAlign: 'right', padding: '6px 8px', fontFamily: "'JetBrains Mono', monospace" }}
                          value={formatDigits(d[field])}
                          placeholder="0"
                          onChange={(e) => setCell(code, field, parseDigits(e.target.value))}
                        />
                      ) : (
                        (d[field] || 0).toLocaleString('vi-VN')
                      )}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{sum.toLocaleString('vi-VN')}</td>
                  <td
                    style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-emerald-text)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}
                    title={done.tuGiaoDich ? 'Tính thẳng từ doanh thu thực tế tháng này (nguồn chính)' : 'Chưa có doanh thu nào trong tháng — số cũ lưu từ trước, có thể đã cũ'}
                  >
                    {done.value.toLocaleString('vi-VN')}
                  </td>
                  <td style={editable ? undefined : { fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {editable ? (
                      <input
                        type="text" className="input-field" style={{ padding: '6px 8px' }}
                        value={d.note} placeholder="Ghi chú..."
                        onChange={(e) => setCell(code, 'note', e.target.value)}
                      />
                    ) : (d.note || '')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={filteredRows.length} onPageChange={setPage} itemLabel="khách hàng" />
      </TableState>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: pendingCodes.length ? 'var(--warning-text)' : 'var(--text-dim)' }}>
          {pendingCodes.length
            ? `${pendingCodes.length} khách chưa lưu`
            : (Object.keys(savedMap).length ? 'Đã lưu xong, không còn thay đổi nào chờ lưu.' : 'Nhập số vào bảng để bật nút Lưu.')}
        </span>
        <button
          onClick={handleSubmit}
          disabled={isSaving || pendingCodes.length === 0}
          className="btn btn-primary"
          title={pendingCodes.length === 0 ? 'Chưa có thay đổi nào cần lưu' : `Gửi ${pendingCodes.length} dòng lên duyệt`}
        >
          <Save size={16} /> {isSaving ? 'Đang lưu...' : `Lưu Kế Hoạch ${month}, Gửi Duyệt${pendingCodes.length ? ` (${pendingCodes.length})` : ''}`}
        </button>
      </div>

      {dlgNhap && (
        <ConfirmDialog
          title={ghN.apply.length ? `Nạp ${ghN.apply.length.toLocaleString('vi-VN')} khách từ Excel?` : 'Không có số mới để nạp'}
          message={msgNhap}
          confirmLabel={ghN.apply.length ? 'Áp vào bảng' : 'Đóng'}
          cancelLabel={ghN.apply.length ? 'Huỷ' : 'Quay lại'}
          onConfirm={ghN.apply.length ? apDungNhap : () => setDlgNhap(null)}
          onCancel={() => setDlgNhap(null)}
        />
      )}

      {hoiDoiThang && (
        <ConfirmDialog
          title={`Đổi khỏi tháng ${month}?`}
          message={`Còn ${pendingCodes.length.toLocaleString('vi-VN')} khách đã nhập nhưng CHƯA lưu. Đổi tháng sẽ bỏ các số này (số đã lưu trước đó vẫn còn nguyên). Bấm "Ở lại" để lưu trước.`}
          confirmLabel="Bỏ nháp và đổi tháng"
          cancelLabel="Ở lại"
          destructive
          onConfirm={doiThang}
          onCancel={() => setHoiDoiThang(false)}
        />
      )}
    </div>
  );
}
