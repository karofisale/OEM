import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Gauge, Filter, RefreshCw, Target, Wallet, ClipboardList, TrendingUp, Award, UserX, CalendarRange, User, Users
} from 'lucide-react';
import * as api from '../services/api';
import { usePersistentState } from '../hooks/usePersistentState';
import { useEnsureYears } from '../hooks/useEnsureYears';
import TableState from './TableState';
import StatusBadge from './StatusBadge';
import { monthSortValue, parseMonthKey, yearsFromTransactions } from '../utils/period';
import { vnYear, vnMonthKey, hienNgay } from '../utils/vnDate';
import { donCuaToi } from '../utils/roles';
import {
  dungPhamVi, dinhDangTienGon, phanTramDat, tongThang, bangKeHoachThang, bang12Thang, topKhach,
  khachLauChuaMua, congNoTheoPhamVi, donChoNhapSap
} from '../utils/saleDashboard';

const fmt = (v) => (Number(v) || 0).toLocaleString('vi-VN');
const MONO = { fontFamily: "'JetBrains Mono', monospace" };
const NUM = { textAlign: 'right', ...MONO, fontSize: '0.8rem' };
// Dữ liệu công nợ + đơn chờ không nằm trong bootstrap: mở lại tab sau từng này giây thì tải lại (tab được giữ sống nên không tự tải).
const CU_SAU_GIAY = 120;

function pctMau(p) {
  if (p == null) return 'var(--text-dim)';
  return p >= 100 ? 'var(--accent-emerald-text)' : p >= 70 ? 'var(--warning-text)' : 'var(--danger-strong)';
}
const pctText = (p) => (p == null ? '—' : p + '%');

function The({ icon: Icon, mau, nen, nhan, giaTri, phu, phuMau }) {
  return (
    <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: nen, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={22} color={mau} />
      </div>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{nhan}</span>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>{giaTri}</div>
        {phu && <span style={{ fontSize: '0.72rem', fontWeight: 600, color: phuMau || 'var(--text-muted)' }}>{phu}</span>}
      </div>
    </div>
  );
}

function Khung({ icon: Icon, mau = 'var(--karofi-cyan)', tieuDe, ghiChu, children }) {
  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
          <Icon size={18} color={mau} /> {tieuDe}
        </h3>
        {ghiChu && <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>{ghiChu}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * Dashboard Sale (30/10/2026): bảng số riêng của mình hoặc chung của cả nhóm, người xem tự chuyển.
 *
 *  - "Riêng" = phần mình phụ trách (saleId); "Chung" = toàn bộ, thu hẹp được theo một Sale. Chỉ là bộ lọc XEM — mọi vai trò đã đọc
 *    được số của mọi Sale từ 14/09/2026 (utils/roles.js) — nên không có số nào ở đây nằm ngoài quyền đọc sẵn có.
 *  - Giao dịch / kế hoạch / khách / KPI năm lấy từ dữ liệu App đã tải; công nợ và đơn chờ nhập SAP gọi riêng (getDebtView, getOrders)
 *    và lỗi một phần chỉ làm hỏng đúng khung đó.
 *  - Doanh thu = DT thuần chưa VAT; Done của kế hoạch tính từ giao dịch (salesPlan.js), cùng số với màn Xem kế hoạch.
 */
export default function SaleDashboard({ token, activeUser, transactions = [], txYears, plans = [], plan2026 = {}, isActive }) {
  const coSaleId = !!String((activeUser && activeUser.saleId) || '').trim();
  // Mặc định: Sale có saleId vào "Riêng"; vai khác (admin/creator/leader) vào "Chung". Lựa chọn nhớ qua F5.
  const macDinh = activeUser && String(activeUser.role).toLowerCase() === 'sale' && coSaleId ? 'mine' : 'all';
  const [scopeSaved, setScope] = usePersistentState('saledash.scope', macDinh);
  const scope = scopeSaved === 'mine' && !coSaleId ? 'all' : (scopeSaved === 'mine' || scopeSaved === 'all' ? scopeSaved : macDinh);
  const [saleFilter, setSaleFilter] = usePersistentState('saledash.sale', 'ALL');

  const namHienTai = vnYear();
  const thangHienTaiKey = vnMonthKey();
  const [nam, setNam] = useState(namHienTai);
  const [thang, setThang] = useState(thangHienTaiKey);

  // Cần giao dịch của năm đang xem VÀ năm trước (cột cùng kỳ); năm cũ tải theo nhu cầu, thiếu thì không hiện số.
  const carga = useEnsureYears(txYears, [nam, nam - 1]);
  const chuaDu = carga.dangTai || !!carga.loi;

  const salesList = useMemo(() => {
    const set = new Set();
    transactions.forEach((t) => { if (t && t.sale) set.add(t.sale); });
    plans.forEach((p) => { if (p && p.sale) set.add(p.sale); });
    return Array.from(set).sort();
  }, [transactions, plans]);
  const saleHieuLuc = saleFilter === 'ALL' || salesList.includes(saleFilter) ? saleFilter : 'ALL';
  const trongPhamVi = useMemo(
    () => dungPhamVi({ scope, saleFilter: saleHieuLuc, user: activeUser }),
    [scope, saleHieuLuc, activeUser]
  );

  const yearsList = useMemo(() => {
    const ys = yearsFromTransactions(transactions);
    ((txYears && txYears.olderYears) || []).forEach((y) => { if (!ys.includes(String(y))) ys.push(String(y)); });
    if (!ys.includes(String(namHienTai))) ys.push(String(namHienTai));
    return ys.map(Number).sort((a, b) => b - a);
  }, [transactions, txYears, namHienTai]);
  const monthsList = useMemo(() => {
    const set = new Set();
    for (let m = 1; m <= 12; m++) set.add(`T${String(m).padStart(2, '0')}-${nam}`);
    return Array.from(set).sort((a, b) => monthSortValue(b) - monthSortValue(a));
  }, [nam]);
  // Đổi năm thì tháng đang chọn phải thuộc năm đó (giữ nguyên số tháng; năm hiện tại thì không vượt tháng này).
  const doiNam = (y) => {
    setNam(y);
    const p = parseMonthKey(thang);
    const m = p ? p.month : 1;
    setThang(`T${String(m).padStart(2, '0')}-${y}`);
  };

  // ----- Công nợ + đơn chờ nhập SAP (gọi riêng) -----
  const [debt, setDebt] = useState({ rows: [], loading: true, error: '' });
  const [orders, setOrders] = useState({ lines: [], loading: true, error: '' });
  const lastFetch = useRef(0);
  const taiNgoai = useCallback(async (ep) => {
    if (!token) return;
    lastFetch.current = Date.now();
    setDebt((d) => ({ ...d, loading: true, error: '' }));
    setOrders((o) => ({ ...o, loading: true, error: '' }));
    const [d, o] = await Promise.allSettled([api.getDebtView(token, ep === true), api.getOrders(token)]);
    setDebt(d.status === 'fulfilled'
      ? { rows: (d.value && d.value.rows) || [], loading: false, error: '' }
      : { rows: [], loading: false, error: (d.reason && d.reason.message) || String(d.reason) });
    setOrders(o.status === 'fulfilled'
      ? { lines: Array.isArray(o.value) ? o.value : (o.value && o.value.rows) || [], loading: false, error: '' }
      : { lines: [], loading: false, error: (o.reason && o.reason.message) || String(o.reason) });
  }, [token]);
  useEffect(() => {
    if (!isActive) return;
    if (!lastFetch.current || Date.now() - lastFetch.current > CU_SAU_GIAY * 1000) taiNgoai(false);
  }, [isActive, taiNgoai]);

  // ----- Số liệu -----
  const soThang = useMemo(() => tongThang(transactions, thang, trongPhamVi), [transactions, thang, trongPhamVi]);
  const keHoach = useMemo(() => bangKeHoachThang(plans, transactions, thang, trongPhamVi), [plans, transactions, thang, trongPhamVi]);
  const nam12 = useMemo(() => bang12Thang(transactions, nam, plan2026, trongPhamVi), [transactions, nam, plan2026, trongPhamVi]);
  const top = useMemo(() => topKhach(transactions, nam, trongPhamVi, 10), [transactions, nam, trongPhamVi]);
  const lauChua = useMemo(
    () => khachLauChuaMua(transactions, trongPhamVi, thangHienTaiKey, 3, 10),
    [transactions, trongPhamVi, thangHienTaiKey]
  );
  const congNo = useMemo(() => congNoTheoPhamVi(debt.rows, trongPhamVi), [debt.rows, trongPhamVi]);
  // Đơn chỉ có PIC = TÊN ĐĂNG NHẬP, không có cột Sale: "Riêng" lọc theo tên mình; "Chung" luôn là mọi đơn (ô chọn Sale không áp được).
  const donChoNhap = useMemo(
    () => donChoNhapSap(orders.lines, scope === 'mine' ? (pic) => donCuaToi(activeUser, pic) : () => true),
    [orders.lines, scope, activeUser]
  );
  const kpiNamCoSo = Object.keys(plan2026 || {}).length > 0;
  // Lũy kế đến hết tháng hiện tại (năm cũ: cả năm; năm sau: chưa có tháng nào).
  const daLuyKe = nam12.rows.filter((r) => monthSortValue(r.key) <= monthSortValue(thangHienTaiKey));
  const luyKeDt = daLuyKe.reduce((a, r) => a + r.dt, 0);
  const luyKeKpi = daLuyKe.reduce((a, r) => a + r.kpi, 0);
  const tenPhamVi = scope === 'mine' ? 'của tôi' : (saleHieuLuc === 'ALL' ? 'chung (tất cả Sale)' : 'của ' + saleHieuLuc);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Gauge size={24} color="var(--karofi-cyan)" /> Dashboard Sale
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Số liệu <strong style={{ color: 'var(--cyan-text)' }}>{tenPhamVi}</strong> — chuyển giữa phần riêng của bạn và số chung của cả nhóm.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => taiNgoai(true)} disabled={debt.loading || orders.loading}
          title="Tải lại công nợ và đơn chờ nhập SAP">
          <RefreshCw size={14} /> Tải lại công nợ &amp; đơn
        </button>
      </div>

      {/* Bộ lọc: phạm vi Riêng/Chung, Sale (chỉ ở Chung), Năm, Tháng */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', padding: '14px 20px' }}>
        <Filter size={15} color="var(--karofi-cyan)" />
        <div role="group" aria-label="Phạm vi số liệu" style={{ display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <button type="button" aria-pressed={scope === 'mine'} disabled={!coSaleId}
            title={coSaleId ? 'Chỉ phần bạn phụ trách' : 'Tài khoản chưa có mã Sale nên chưa có phần riêng'}
            onClick={() => setScope('mine')} className={'btn btn-sm ' + (scope === 'mine' ? 'btn-primary' : 'btn-secondary')} style={{ borderRadius: 0, border: 0 }}>
            <User size={14} /> Riêng của tôi
          </button>
          <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}
            className={'btn btn-sm ' + (scope === 'all' ? 'btn-primary' : 'btn-secondary')} style={{ borderRadius: 0, border: 0 }}>
            <Users size={14} /> Chung
          </button>
        </div>
        {scope === 'all' && (
          <select className="input-field" style={{ width: '190px' }} value={saleHieuLuc} onChange={(e) => setSaleFilter(e.target.value)} aria-label="Lọc theo Sale">
            <option value="ALL">Tất cả SALE</option>
            {salesList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Năm:</span>
        <select className="input-field" style={{ width: '110px' }} value={nam} onChange={(e) => doiNam(Number(e.target.value))} aria-label="Năm">
          {yearsList.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Tháng:</span>
        <select className="input-field" style={{ width: '130px' }} value={thang} onChange={(e) => setThang(e.target.value)} aria-label="Tháng">
          {monthsList.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {!coSaleId && (
          <span style={{ fontSize: '0.76rem', color: 'var(--warning-text)' }}>Tài khoản chưa có mã Sale nên chưa có phần "Riêng".</span>
        )}
      </div>

      {chuaDu ? (
        <TableState loading={carga.dangTai} error={carga.loi} onRetry={carga.retry} loadingLabel={carga.nhan}
          errorPrefix="Không tải được doanh thu năm cũ" compact={false}><span /></TableState>
      ) : (<>
        {/* Thẻ tổng */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
          <The icon={TrendingUp} mau="var(--karofi-cyan)" nen="rgba(0, 160, 233, 0.12)" nhan={`Doanh thu thuần ${thang}`}
            giaTri={dinhDangTienGon(soThang.dt) + ' ₫'}
            phu={keHoach.rows.length ? `Kế hoạch ${dinhDangTienGon(keHoach.tong.planUpdate)} · khách có kế hoạch đạt ${pctText(keHoach.tong.pct)}` : `${fmt(soThang.dong)} dòng giao dịch · chưa có kế hoạch tháng`}
            phuMau={keHoach.rows.length ? pctMau(keHoach.tong.pct) : undefined} />
          <The icon={Target} mau="var(--accent-purple)" nen="rgba(139, 92, 246, 0.12)" nhan={`KPI năm ${nam} (lũy kế đến ${nam === namHienTai ? 'tháng này' : 'cuối năm'})`}
            giaTri={kpiNamCoSo ? pctText(phanTramDat(luyKeDt, luyKeKpi)) : '—'}
            phu={kpiNamCoSo ? `${dinhDangTienGon(luyKeDt)} / ${dinhDangTienGon(luyKeKpi)} ₫` : 'Chưa tải được KPI năm'}
            phuMau={kpiNamCoSo ? pctMau(phanTramDat(luyKeDt, luyKeKpi)) : undefined} />
          <The icon={Wallet} mau="var(--accent-amber)" nen="rgba(245, 158, 11, 0.12)" nhan="Công nợ khách"
            giaTri={debt.loading ? '…' : debt.error ? '—' : dinhDangTienGon(congNo.tong.balance) + ' ₫'}
            phu={debt.loading ? 'Đang tải…' : debt.error ? 'Không tải được' : `${congNo.rows.length} khách còn nợ · ${congNo.tong.vuot} vượt hạn mức`}
            phuMau={!debt.loading && !debt.error && congNo.tong.vuot ? 'var(--danger-strong)' : undefined} />
          <The icon={ClipboardList} mau="var(--accent-emerald)" nen="rgba(16, 185, 129, 0.12)" nhan="Đơn chờ nhập SAP"
            giaTri={orders.loading ? '…' : orders.error ? '—' : `${donChoNhap.rows.length} đơn`}
            phu={orders.loading ? 'Đang tải…' : orders.error ? 'Không tải được' : `${dinhDangTienGon(donChoNhap.tong)} ₫ (chưa tính VAT)`} />
        </div>

        {/* Kế hoạch tháng theo khách */}
        <Khung icon={CalendarRange} tieuDe={`Kế hoạch ${thang} theo khách`}
          ghiChu="Done = doanh thu thuần thực tế của khách trong tháng (từ giao dịch SAP); % đạt = Done / Plan update.">
          <TableState isEmpty={keHoach.rows.length === 0} emptyText={`Chưa có kế hoạch ${thang} nào trong phạm vi đang xem.`}>
            <div className="table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead><tr>
                  <th>Khách hàng</th>{scope === 'all' && <th>SALE</th>}
                  <th style={{ textAlign: 'right' }}>Plan KPI</th><th style={{ textAlign: 'right' }}>Plan update</th>
                  <th style={{ textAlign: 'right' }}>Done</th><th style={{ textAlign: 'right' }}>Chênh</th>
                  <th style={{ textAlign: 'right' }}>% đạt</th><th>Trạng thái</th>
                </tr></thead>
                <tbody>
                  <tr className="top-summary-row">
                    <td colSpan={scope === 'all' ? 2 : 1} style={{ fontWeight: 900 }}>Σ TỔNG CỘNG ({keHoach.rows.length} khách)</td>
                    <td style={NUM}>{fmt(keHoach.tong.planKpi)}</td><td style={NUM}>{fmt(keHoach.tong.planUpdate)}</td>
                    <td style={{ ...NUM, color: 'var(--accent-emerald-text)', fontWeight: 900 }}>{fmt(keHoach.tong.done)}</td>
                    <td style={{ ...NUM, color: keHoach.tong.chenh >= 0 ? 'var(--accent-emerald-text)' : 'var(--danger-strong)', fontWeight: 900 }}>{fmt(keHoach.tong.chenh)}</td>
                    <td style={{ ...NUM, color: pctMau(keHoach.tong.pct), fontWeight: 900 }}>{pctText(keHoach.tong.pct)}</td><td />
                  </tr>
                  {keHoach.rows.map((r) => (
                    <tr key={r.code + '|' + r.sale} style={{ height: '40px' }}>
                      <td><span className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)', fontSize: '0.82rem' }}>{r.code}</span>
                        {r.name && r.name.toUpperCase() !== r.code && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.name}</div>}</td>
                      {scope === 'all' && <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.sale}</td>}
                      <td style={{ ...NUM, color: 'var(--text-muted)' }}>{fmt(r.planKpi)}</td>
                      <td style={{ ...NUM, fontWeight: 800 }}>{fmt(r.planUpdate)}</td>
                      <td style={{ ...NUM, fontWeight: 800, color: 'var(--accent-emerald-text)' }}>{fmt(r.done)}</td>
                      <td style={{ ...NUM, fontWeight: 800, color: r.chenh >= 0 ? 'var(--accent-emerald-text)' : 'var(--danger-strong)' }}>{fmt(r.chenh)}</td>
                      <td style={{ ...NUM, fontWeight: 800, color: pctMau(r.pct) }}>{pctText(r.pct)}</td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableState>
        </Khung>

        {/* 12 tháng */}
        <Khung icon={TrendingUp} tieuDe={`Doanh thu ${nam} theo tháng`}
          ghiChu={nam12.daCoNamTruoc ? `So với cùng kỳ ${nam - 1}; KPI năm lấy theo khách thuộc phạm vi đang xem.` : `Chưa có doanh thu ${nam - 1} trong dữ liệu nên không tính % tăng.`}>
          <div className="table-container">
            <table className="custom-table">
              <thead><tr>
                <th>Tháng</th><th style={{ textAlign: 'right' }}>Doanh thu thuần</th><th style={{ textAlign: 'right' }}>Cùng kỳ {nam - 1}</th>
                <th style={{ textAlign: 'right' }}>% tăng</th><th style={{ textAlign: 'right' }}>KPI năm</th><th style={{ textAlign: 'right' }}>% đạt KPI</th>
              </tr></thead>
              <tbody>
                <tr className="top-summary-row">
                  <td style={{ fontWeight: 900 }}>Σ CẢ NĂM</td>
                  <td style={{ ...NUM, fontWeight: 900, color: 'var(--accent-emerald-text)' }}>{fmt(nam12.tong.dt)}</td>
                  <td style={NUM}>{fmt(nam12.tong.dtTruoc)}</td>
                  <td style={{ ...NUM, fontWeight: 900, color: nam12.tong.tangTruong == null ? 'var(--text-dim)' : nam12.tong.tangTruong >= 0 ? 'var(--accent-emerald-text)' : 'var(--danger-strong)' }}>{nam12.tong.tangTruong == null ? '—' : (nam12.tong.tangTruong > 0 ? '+' : '') + nam12.tong.tangTruong + '%'}</td>
                  <td style={NUM}>{kpiNamCoSo ? fmt(nam12.tong.kpi) : '—'}</td>
                  <td style={{ ...NUM, fontWeight: 900, color: pctMau(nam12.tong.pctKpi) }}>{kpiNamCoSo ? pctText(nam12.tong.pctKpi) : '—'}</td>
                </tr>
                {nam12.rows.map((r) => (
                  <tr key={r.key} style={{ height: '36px', background: r.key === thang ? 'var(--bg-card-hover)' : undefined }}>
                    <td style={{ fontWeight: 700, color: 'var(--cyan-text)' }}>{r.key}</td>
                    <td style={{ ...NUM, fontWeight: 700 }}>{fmt(r.dt)}</td>
                    <td style={{ ...NUM, color: 'var(--text-muted)' }}>{fmt(r.dtTruoc)}</td>
                    <td style={{ ...NUM, color: r.tangTruong == null ? 'var(--text-dim)' : r.tangTruong >= 0 ? 'var(--accent-emerald-text)' : 'var(--danger-strong)' }}>{r.tangTruong == null ? '—' : (r.tangTruong > 0 ? '+' : '') + r.tangTruong + '%'}</td>
                    <td style={{ ...NUM, color: 'var(--text-muted)' }}>{kpiNamCoSo ? fmt(r.kpi) : '—'}</td>
                    <td style={{ ...NUM, fontWeight: 700, color: pctMau(r.pctKpi) }}>{kpiNamCoSo ? pctText(r.pctKpi) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Khung>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: '20px' }}>
          {/* Top khách */}
          <Khung icon={Award} mau="var(--accent-amber)" tieuDe={`Top 10 khách ${nam}`} ghiChu="Theo doanh thu thuần, gộp theo Search Code.">
            <TableState isEmpty={top.rows.length === 0} emptyText="Chưa có doanh thu trong phạm vi đang xem.">
              <div className="table-container">
                <table className="custom-table">
                  <thead><tr><th>#</th><th>Khách</th><th style={{ textAlign: 'right' }}>Doanh thu</th><th style={{ textAlign: 'right' }}>Tỷ trọng</th></tr></thead>
                  <tbody>
                    {top.rows.map((r, i) => (
                      <tr key={r.code}>
                        <td style={{ fontWeight: 800 }}>{i + 1}</td>
                        <td><span className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)', fontSize: '0.82rem' }}>{r.code}</span>
                          {r.alias && r.alias.toUpperCase() !== r.code && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.alias}</div>}</td>
                        <td style={{ ...NUM, fontWeight: 700 }}>{fmt(r.rev)}</td>
                        <td style={NUM}>{r.share == null ? '—' : r.share + '%'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableState>
          </Khung>

          {/* Lâu chưa mua */}
          <Khung icon={UserX} mau="var(--danger-strong)" tieuDe="Khách lâu chưa mua (≥ 3 tháng)"
            ghiChu="Có mua trong 2 năm gần nhất nhưng không phát sinh doanh thu từ 3 tháng trở lên — khách lớn đứng trước. Tính đến tháng hiện tại.">
            <TableState isEmpty={lauChua.length === 0} emptyText="Không có khách nào lâu chưa mua trong phạm vi đang xem.">
              <div className="table-container">
                <table className="custom-table">
                  <thead><tr><th>Khách</th><th>Mua gần nhất</th><th style={{ textAlign: 'right' }}>Chưa mua</th><th style={{ textAlign: 'right' }}>DT đã mua</th></tr></thead>
                  <tbody>
                    {lauChua.map((r) => (
                      <tr key={r.code}>
                        <td><span className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)', fontSize: '0.82rem' }}>{r.code}</span>
                          {r.alias && r.alias.toUpperCase() !== r.code && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.alias}</div>}</td>
                        <td style={{ fontWeight: 600 }}>{r.thangCuoi}</td>
                        <td style={{ ...NUM, color: 'var(--danger-strong)', fontWeight: 700 }}>{r.soThangChua} tháng</td>
                        <td style={NUM}>{fmt(r.rev)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableState>
          </Khung>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: '20px' }}>
          {/* Công nợ */}
          <Khung icon={Wallet} mau="var(--accent-amber)" tieuDe="Công nợ khách hàng"
            ghiChu="Top 10 theo số dư; PIC công nợ lấy từ danh bạ khách. Bỏ khách số dư 0.">
            <TableState loading={debt.loading} error={debt.error} onRetry={() => taiNgoai(true)} errorPrefix="Không tải được công nợ"
              isEmpty={congNo.rows.length === 0} emptyText="Không có công nợ trong phạm vi đang xem." loadingLabel="Đang tải công nợ...">
              <div className="table-container">
                <table className="custom-table">
                  <thead><tr><th>Khách</th>{scope === 'all' && <th>PIC</th>}<th style={{ textAlign: 'right' }}>Hạn mức</th><th style={{ textAlign: 'right' }}>Số dư</th><th style={{ textAlign: 'right' }}>Vượt HM</th></tr></thead>
                  <tbody>
                    {congNo.rows.slice(0, 10).map((r) => (
                      <tr key={r.code}>
                        <td><span className="code-font" style={{ fontWeight: 800, color: 'var(--cyan-text)', fontSize: '0.82rem' }}>{r.code}</span>
                          {r.name && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.name}</div>}</td>
                        {scope === 'all' && <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.pic}</td>}
                        <td style={{ ...NUM, color: 'var(--text-muted)' }}>{fmt(r.creditLimit)}</td>
                        <td style={{ ...NUM, fontWeight: 700 }}>{fmt(r.balance)}</td>
                        <td style={{ ...NUM, fontWeight: 700, color: (r.overLimit || 0) > 0 ? 'var(--danger-strong)' : 'var(--text-dim)' }}>{(r.overLimit || 0) > 0 ? fmt(r.overLimit) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {congNo.rows.length > 10 && <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Còn {congNo.rows.length - 10} khách khác — xem đủ ở Khách hàng OEM → Công nợ.</p>}
            </TableState>
          </Khung>

          {/* Đơn chờ nhập SAP */}
          <Khung icon={ClipboardList} mau="var(--accent-emerald)" tieuDe="Đơn hàng chờ nhập SAP"
            ghiChu={scope === 'mine' ? 'Các đơn do bạn lập (chưa bị Admin xoá sau khi nhập SAP).' : 'Mọi đơn đang chờ — đơn chỉ lưu tên người lập nên ô chọn Sale không áp dụng cho bảng này.'}>
            <TableState loading={orders.loading} error={orders.error} onRetry={() => taiNgoai(true)} errorPrefix="Không tải được đơn chờ"
              isEmpty={donChoNhap.rows.length === 0} emptyText="Không có đơn nào đang chờ trong phạm vi đang xem." loadingLabel="Đang tải đơn chờ...">
              <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                <table className="custom-table">
                  <thead><tr><th>Mã đơn</th><th>Khách</th>{scope === 'all' && <th>Người lập</th>}<th>Ngày tạo</th><th style={{ textAlign: 'right' }}>Dòng</th><th style={{ textAlign: 'right' }}>Thành tiền</th></tr></thead>
                  <tbody>
                    {donChoNhap.rows.map((r) => (
                      <tr key={r.orderNo}>
                        <td className="code-font" style={{ fontWeight: 700, fontSize: '0.8rem' }}>{r.orderNo}{r.thanhLy && <span className="badge badge-neutral" style={{ marginLeft: '6px' }}>Thanh lý</span>}</td>
                        <td style={{ fontWeight: 600 }}>{r.khach || '—'}</td>
                        {scope === 'all' && <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.pic}</td>}
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{hienNgay(r.createdAt)}</td>
                        <td style={NUM}>{r.soDong}</td>
                        <td style={{ ...NUM, fontWeight: 700 }}>{fmt(r.tong)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableState>
          </Khung>
        </div>
      </>)}
    </div>
  );
}
