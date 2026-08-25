import React, { useState, useMemo } from 'react';
import { Search, Filter, CheckCircle2, Save, ShieldCheck, User } from 'lucide-react';
import * as api from '../../services/api';
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

// Sale's bulk-entry screen for the business plan: pick + confirm a month, fill
// in a searchable table of their own clients (Plan KPI auto-pulled from
// Plan2026, Plan_Update auto-summed from the 5 weeks), save once. Existing
// rows for that month pre-fill for editing — resubmitting re-queues for
// approval (see oemAppSubmitSalesPlan_).
export default function SalesPlanProposePanel({ token, clients, plans, plan2026, planDefaultMonth, activeUser, onSubmitted }) {
  const toast = useToast();
  const canFilterAllSales = ['creator', 'admin', 'leader'].includes(activeUser.role);

  const [month, setMonth] = useState(planDefaultMonth || '');
  const [periodConfirmed, setPeriodConfirmed] = useState(false);
  const [selectedSale, setSelectedSale] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const salesList = useMemo(() => {
    const set = new Set(clients.map(c => c.sale).filter(Boolean));
    return Array.from(set);
  }, [clients]);

  const scopedClients = useMemo(() => {
    const filtered = clients.filter(c => {
      if (c.status && c.status !== 'Active') return false;
      if (canFilterAllSales) {
        return selectedSale === 'ALL' || (c.sale || '').toLowerCase().includes(selectedSale.toLowerCase());
      }
      return (c.sale || '').toLowerCase().includes((activeUser.saleId || '').toLowerCase());
    });
    // Unique by Mã KH chữ (codeSearch) — the Clients tab can carry more than
    // one row per real client (different addresses/contacts), which used to
    // show as duplicate rows in this table for the same Plan_Thang key.
    const seen = new Set();
    const unique = [];
    filtered.forEach(c => {
      if (!c.codeSearch || seen.has(c.codeSearch)) return;
      seen.add(c.codeSearch);
      unique.push(c);
    });
    return unique;
  }, [clients, canFilterAllSales, selectedSale, activeUser]);

  const planKpiFor = (client) => {
    const p = parseMonthKey(month);
    const months = plan2026[client.codeSearch];
    if (!p || !months) return 0;
    return months[p.month - 1] || 0;
  };

  // Cao -> thấp theo Plan KPI của đúng tháng đang chọn, để những khách trọng
  // tâm (KPI lớn) luôn nổi lên đầu bảng thay vì lẫn theo thứ tự tab Clients.
  // Diacritics-insensitive + case-insensitive substring match. Sheet-sourced
  // Vietnamese text (copy/pasted into Google Sheets from all sorts of places)
  // can land as NFD (decomposed accents) while a query typed straight into
  // the browser is NFC — visually identical, but plain .includes() on the two
  // different Unicode forms silently never matches. Mã KH/mã code are ASCII,
  // so they never hit this; tên khách hàng, being Vietnamese, did.
  const normalizeForSearch = (s) => String(s || '').normalize('NFC').toLowerCase();

  const filteredClients = useMemo(() => {
    const q = normalizeForSearch(searchTerm.trim());
    const base = !q ? scopedClients : scopedClients.filter(c =>
      normalizeForSearch(c.name).includes(q) ||
      normalizeForSearch(c.codeSearch).includes(q) ||
      normalizeForSearch(c.code).includes(q)
    );
    return [...base].sort((a, b) => planKpiFor(b) - planKpiFor(a));
  }, [scopedClients, searchTerm, month, plan2026]); // eslint-disable-line react-hooks/exhaustive-deps

  const { safePage, pageItems: pagedClients } = usePagedSlice(filteredClients, page, PAGE_SIZE);

  // Existing plan row for (month, client), if any — used to pre-fill and to
  // decide whether an all-zero row still needs saving (an edit that zeroes an
  // already-tracked plan is a real, intentional change; a client nobody has
  // touched yet with nothing typed is not worth writing a blank row for).
  const existingByCode = useMemo(() => {
    const map = {};
    plans.forEach(p => { if (p.month === month) map[p.searchCode] = p; });
    return map;
  }, [plans, month]);

  const [draftMap, setDraftMap] = useState({}); // searchCode -> { w1..w5, note }

  const getDraft = (client) => {
    if (draftMap[client.codeSearch]) return draftMap[client.codeSearch];
    const existing = existingByCode[client.codeSearch];
    return existing
      ? { w1: existing.w1 || 0, w2: existing.w2 || 0, w3: existing.w3 || 0, w4: existing.w4 || 0, w5: existing.w5 || 0, note: existing.note || '' }
      : { w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, note: '' };
  };

  const setCell = (client, field, value) => {
    setDraftMap(prev => {
      const current = prev[client.codeSearch] || getDraft(client);
      const next = { ...current };
      if (field === 'note') next.note = value;
      else next[field] = typeof value === 'number' ? value : (value === '' ? 0 : (parseFloat(value) || 0));
      return { ...prev, [client.codeSearch]: next };
    });
  };

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
    return filteredClients.reduce((acc, c) => {
      const d = getDraft(c);
      acc.planKpi += planKpiFor(c);
      acc.w1 += d.w1 || 0; acc.w2 += d.w2 || 0; acc.w3 += d.w3 || 0; acc.w4 += d.w4 || 0; acc.w5 += d.w5 || 0;
      return acc;
    }, { planKpi: 0, w1: 0, w2: 0, w3: 0, w4: 0, w5: 0 });
  }, [filteredClients, draftMap, existingByCode, month, plan2026]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPlanUpdate = totals.w1 + totals.w2 + totals.w3 + totals.w4 + totals.w5;
  const fmt = (v) => (v || 0).toLocaleString('vi-VN');

  const handleSubmit = async () => {
    // Only rows the Sale actually EDITED this session (present in draftMap) —
    // never the whole filtered/paged client list. Plan_Thang can hold months
    // that were already approved, and re-submitting the whole table would
    // silently revert every untouched-but-visible client back to 'Chờ duyệt'
    // (oemAppSubmitSalesPlan_ unconditionally re-queues whatever it upserts),
    // undoing an approval nobody meant to touch.
    const rows = filteredClients
      .filter(c => draftMap[c.codeSearch])
      .map(c => {
        const d = draftMap[c.codeSearch];
        const sum = (d.w1 || 0) + (d.w2 || 0) + (d.w3 || 0) + (d.w4 || 0) + (d.w5 || 0);
        return { client: c, draft: d, sum };
      })
      .map(r => ({
        searchCode: r.client.codeSearch,
        clientName: r.client.name,
        sale: r.client.sale || activeUser.saleId || '',
        planKpi: planKpiFor(r.client),
        w1: r.draft.w1, w2: r.draft.w2, w3: r.draft.w3, w4: r.draft.w4, w5: r.draft.w5,
        note: r.draft.note
      }));

    if (!rows.length) {
      toast.error('Chưa nhập kế hoạch cho khách hàng nào.');
      return;
    }

    setIsSaving(true);
    try {
      const result = await api.submitSalesPlan(token, month, rows);
      toast.success(`Đã lưu kế hoạch cho ${result.savedCount} khách hàng (${month}), chờ Admin duyệt.`);
      setDraftMap({});
      if (onSubmitted) onSubmitted();
    } catch (err) {
      toast.error('Không lưu được kế hoạch: ' + err.message);
    } finally {
      setIsSaving(false);
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
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" className="input-field" style={{ paddingLeft: '36px' }}
            placeholder="Tìm tên, mã KH chữ, mã KH số..."
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
          <Filter size={12} /> {filteredClients.length.toLocaleString('vi-VN')} khách hàng
        </span>
      </div>

      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Mã KH</th>
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
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.planKpi)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w1)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w2)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w3)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w4)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totals.w5)}</td>
              <td style={{ textAlign: 'right', color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{fmt(totalPlanUpdate)}</td>
              <td style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Tổng kế hoạch đang nhập</td>
            </tr>
            {pagedClients.map(c => {
              const d = getDraft(c);
              const sum = (d.w1 || 0) + (d.w2 || 0) + (d.w3 || 0) + (d.w4 || 0) + (d.w5 || 0);
              return (
                <tr key={c.codeSearch || c.code}>
                  <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{c.codeSearch}</td>
                  <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {planKpiFor(c).toLocaleString('vi-VN')}
                  </td>
                  {['w1', 'w2', 'w3', 'w4', 'w5'].map(field => (
                    <td key={field}>
                      <input
                        type="text" inputMode="numeric" className="input-field"
                        style={{ textAlign: 'right', padding: '6px 8px', fontFamily: "'JetBrains Mono', monospace" }}
                        value={formatDigits(d[field])}
                        placeholder="0"
                        onChange={(e) => setCell(c, field, parseDigits(e.target.value))}
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.825rem' }}>{sum.toLocaleString('vi-VN')}</td>
                  <td>
                    <input
                      type="text" className="input-field" style={{ padding: '6px 8px' }}
                      value={d.note} placeholder="Ghi chú..."
                      onChange={(e) => setCell(c, 'note', e.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredClients.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '28px 16px' }}>
          Không có khách hàng nào khớp bộ lọc.
        </div>
      ) : (
        <Pagination page={safePage} pageSize={PAGE_SIZE} totalItems={filteredClients.length} onPageChange={setPage} itemLabel="khách hàng" />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSubmit} disabled={isSaving} className="btn btn-emerald">
          <Save size={16} /> Lưu Kế Hoạch {month}, Gửi Duyệt
        </button>
      </div>
    </div>
  );
}
