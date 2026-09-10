import React, { useState, useMemo, useEffect } from 'react';
import { Search, Filter, CheckCircle2, Save, ShieldCheck, User, UserPlus, Plus, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import * as api from '../../services/api';
import Combobox from '../Combobox';
import Pagination, { usePagedSlice } from '../Pagination';
import { useToast } from '../ToastProvider';
import { parseMonthKey, formatMonthKey } from '../../utils/period';

const PAGE_SIZE = 25;

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
export default function SalesPlanProposePanel({ token, clients, plans, plan2026, planDefaultMonth, activeUser, onSubmitted, onReloadPlanKpi }) {
  const toast = useToast();
  const canFilterAllSales = ['creator', 'admin', 'leader'].includes(activeUser.role);

  const [month, setMonth] = useState(planDefaultMonth || '');
  const [periodConfirmed, setPeriodConfirmed] = useState(false);
  const [selectedSale, setSelectedSale] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloadingKpi, setIsReloadingKpi] = useState(false);

  const [draftMap, setDraftMap] = useState({});   // searchCode -> { w1..w5, note }
  const [savedMap, setSavedMap] = useState({});   // searchCode -> draftSignature đã lưu THÀNH CÔNG
  const [extraCodes, setExtraCodes] = useState([]); // Sale tự bổ sung vào bảng
  const [pickedClient, setPickedClient] = useState(null);
  const [pickerKey, setPickerKey] = useState(0);  // đổi để Combobox tự xoá chữ đã gõ

  const kpiLoaded = useMemo(() => Object.keys(plan2026 || {}).length > 0, [plan2026]);

  // Existing plan row for (month, client), if any — used to pre-fill, to show
  // the current approval status, and to decide when a saved draft can be
  // dropped again (xem effect "settled" bên dưới).
  const existingByCode = useMemo(() => {
    const map = {};
    plans.forEach(p => { if (p.month === month) map[p.searchCode] = p; });
    return map;
  }, [plans, month]);

  // Danh bạ khách, tra theo Mã KH chữ. Tab Clients có thể có NHIỀU dòng cho
  // cùng một khách thật (khác địa chỉ/liên hệ) — giữ dòng đầu tiên.
  const clientByCode = useMemo(() => {
    const map = {};
    clients.forEach(c => { if (c.codeSearch && !map[c.codeSearch]) map[c.codeSearch] = c; });
    return map;
  }, [clients]);

  // Khách mà Sale này được phép nhìn thấy trong ô bổ sung. `plans` và `plan2026`
  // đã được backend ép phạm vi rồi, nhưng `clients` thì KHÔNG (getBootstrap trả
  // toàn bộ danh bạ), nên chỗ này phải tự ép.
  //
  // Fail CLOSED khi saleId trống, giống oemAppScopeOf_ bên backend: `includes('')`
  // đúng với mọi dòng, tức một Sale thiếu saleId sẽ thấy TOÀN BỘ danh bạ.
  const pickableClients = useMemo(() => {
    const saleId = normalizeForSearch(activeUser.saleId || '').trim();
    const seen = new Set();
    const out = [];
    clients.forEach(c => {
      if (!c.codeSearch || seen.has(c.codeSearch)) return;
      if (!canFilterAllSales) {
        if (!saleId) return;
        if (!normalizeForSearch(c.sale).includes(saleId)) return;
      }
      seen.add(c.codeSearch);
      out.push(c);
    });
    return out;
  }, [clients, canFilterAllSales, activeUser.saleId]);

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
    const base = !q ? scopedRows : scopedRows.filter(r =>
      normalizeForSearch(r.name).includes(q) ||
      normalizeForSearch(r.codeSearch).includes(q)
    );
    return [...base].sort((a, b) => {
      if (!!b.isAdded !== !!a.isAdded) return b.isAdded ? 1 : -1;
      return planKpiForCode(b.codeSearch) - planKpiForCode(a.codeSearch);
    });
  }, [scopedRows, searchTerm, month, plan2026]); // eslint-disable-line react-hooks/exhaustive-deps

  const { safePage, pageItems: pagedRows } = usePagedSlice(filteredRows, page, PAGE_SIZE);

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
      return acc;
    }, { planKpi: 0, w1: 0, w2: 0, w3: 0, w4: 0, w5: 0 });
  }, [filteredRows, draftMap, existingByCode, month, plan2026]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPlanUpdate = totals.w1 + totals.w2 + totals.w3 + totals.w4 + totals.w5;
  const fmt = (v) => (v || 0).toLocaleString('vi-VN');

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

  if (!periodConfirmed) {
    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center', padding: '32px 20px' }}>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {!kpiLoaded && (
        <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
          <AlertTriangle size={18} color="var(--warning-text)" />
          <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', flex: 1, minWidth: '260px' }}>
            Chưa tải được KPI năm (tab Plan2026) — bảng đang hiện theo danh sách Khách hàng và cột Plan KPI để trống.
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
            <select className="input-field" style={{ width: '160px' }} value={selectedSale} onChange={(e) => { setSelectedSale(e.target.value); setPage(1); }}>
              <option value="ALL">Tất cả SALE</option>
              {salesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={12} /> {filteredRows.length.toLocaleString('vi-VN')} khách hàng
        </span>
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
                  <span className="code-font" style={{ color: 'var(--karofi-cyan)' }}>{c.codeSearch}</span>
                  {c.status && c.status !== 'Active' && (
                    <span style={{ marginLeft: '6px', fontSize: '0.68rem', color: 'var(--danger-strong)' }}>({c.status})</span>
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

      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ minWidth: '130px' }}>Mã KH</th>
              <th style={{ minWidth: '200px' }}>Tên khách hàng</th>
              <th style={{ textAlign: 'right', width: '150px' }}>Plan KPI</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Tuần 1</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Tuần 2</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Tuần 3</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Tuần 4</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Tuần 5</th>
              <th style={{ textAlign: 'right', width: '150px' }}>Plan_Update</th>
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
              <td style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Tổng kế hoạch đang nhập</td>
            </tr>
            {pagedRows.map(r => {
              const code = r.codeSearch;
              const d = getDraft(code);
              const sum = (d.w1 || 0) + (d.w2 || 0) + (d.w3 || 0) + (d.w4 || 0) + (d.w5 || 0);
              const isDirty = !!draftMap[code] && draftSignature(draftMap[code]) !== savedMap[code];
              const isJustSaved = !!draftMap[code] && draftSignature(draftMap[code]) === savedMap[code];
              return (
                <tr key={code}>
                  <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>
                    {code}
                    {r.isAdded && (
                      <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>MỚI THÊM</span>
                    )}
                    {isJustSaved && (
                      <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 800, color: 'var(--success-text)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        <Check size={11} /> ĐÃ LƯU
                      </span>
                    )}
                    {isDirty && (
                      <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 800, color: 'var(--warning-text)' }}>CHƯA LƯU</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                      {canFilterAllSales && r.sale ? r.sale : ''}
                      {r.plan ? `${canFilterAllSales && r.sale ? ' · ' : ''}${r.plan.status || 'Chờ duyệt'}` : ''}
                      {!r.inClientList ? `${(canFilterAllSales && r.sale) || r.plan ? ' · ' : ''}chưa có trong tab Khách hàng` : ''}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {planKpiForCode(code).toLocaleString('vi-VN')}
                  </td>
                  {['w1', 'w2', 'w3', 'w4', 'w5'].map(field => (
                    <td key={field}>
                      <input
                        type="text" inputMode="numeric" className="input-field"
                        style={{ textAlign: 'right', padding: '6px 8px', fontFamily: "'JetBrains Mono', monospace" }}
                        value={formatDigits(d[field])}
                        placeholder="0"
                        onChange={(e) => setCell(code, field, parseDigits(e.target.value))}
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{sum.toLocaleString('vi-VN')}</td>
                  <td>
                    <input
                      type="text" className="input-field" style={{ padding: '6px 8px' }}
                      value={d.note} placeholder="Ghi chú..."
                      onChange={(e) => setCell(code, 'note', e.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredRows.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '28px 16px' }}>
          Không có khách hàng nào khớp bộ lọc. Dùng ô "Bổ sung khách hàng" ở trên để thêm khách vào kế hoạch.
        </div>
      ) : (
        <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={filteredRows.length} onPageChange={setPage} itemLabel="khách hàng" />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: pendingCodes.length ? 'var(--warning-text)' : 'var(--text-dim)' }}>
          {pendingCodes.length
            ? `${pendingCodes.length} khách chưa lưu`
            : (Object.keys(savedMap).length ? 'Đã lưu xong, không còn thay đổi nào chờ lưu.' : 'Nhập số vào bảng để bật nút Lưu.')}
        </span>
        <button
          onClick={handleSubmit}
          disabled={isSaving || pendingCodes.length === 0}
          className="btn btn-emerald"
          title={pendingCodes.length === 0 ? 'Chưa có thay đổi nào cần lưu' : `Gửi ${pendingCodes.length} dòng lên duyệt`}
        >
          <Save size={16} /> {isSaving ? 'Đang lưu...' : `Lưu Kế Hoạch ${month}, Gửi Duyệt${pendingCodes.length ? ` (${pendingCodes.length})` : ''}`}
        </button>
      </div>
    </div>
  );
}
