import React, { useState, useMemo, useEffect } from 'react';
import { CalendarRange, Plus, Clock, Filter, User } from 'lucide-react';

export default function SalesPlan({ plans, clients, transactions, activeUser, onAddPlan }) {
  const [selectedSale, setSelectedSale] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [planStateList, setPlanStateList] = useState(plans);
  const [onlyShowActivePlan, setOnlyShowActivePlan] = useState(true);

  const canFilterAllSales = ['creator', 'admin', 'leader'].includes(activeUser.role);

  // Form states
  const [selectedClient, setSelectedClient] = useState(clients[0]?.name || '');
  const [clientQuery, setClientQuery] = useState(() => {
    const c = clients[0];
    return c ? `${c.codeSearch} - ${c.name}` : '';
  });
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [planKpiInput, setPlanKpiInput] = useState('');
  const [planUpdateInput, setPlanUpdateInput] = useState('');
  const [w1Input, setW1Input] = useState('');
  const [w2Input, setW2Input] = useState('');
  const [w3Input, setW3Input] = useState('');
  const [w4Input, setW4Input] = useState('');
  const [w5Input, setW5Input] = useState('');
  const [noteInput, setNoteInput] = useState('');

  // Re-sync with fresh data from the Sheet on every reload (e.g. "Đồng bộ Sheet"),
  // but keep locally-added proposals that haven't made it back into `plans` yet.
  useEffect(() => {
    setPlanStateList(prev => {
      const remoteCodes = new Set(plans.map(p => p.searchCode));
      const localOnly = prev.filter(p => !remoteCodes.has(p.searchCode));
      return [...localOnly, ...plans];
    });
  }, [plans]);

  // Use plans from props or local state
  const activePlanList = planStateList.length > 0 ? planStateList : plans;

  // Extract unique sales list
  const salesList = useMemo(() => {
    const set = new Set(activePlanList.map(p => p.sale).filter(Boolean));
    return Array.from(set);
  }, [activePlanList]);

  // Free-type search over client name / codeSearch / mã KH số for the proposal form
  const clientMatches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.codeSearch || '').toLowerCase().includes(q) ||
      String(c.code || '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [clients, clientQuery]);

  const handleSelectClient = (c) => {
    setSelectedClient(c.name);
    setClientQuery(`${c.codeSearch} - ${c.name}`);
    setShowClientDropdown(false);
  };

  // Filtered plans (By Sale + Default Plan_Update > 0)
  const filteredPlans = useMemo(() => {
    return activePlanList.filter(p => {
      // Sale filter
      if (canFilterAllSales) {
        if (selectedSale !== 'ALL' && !p.sale.toLowerCase().includes(selectedSale.toLowerCase())) {
          return false;
        }
      } else {
        // Sale role sees assigned client plans
        if (!p.sale.toLowerCase().includes((activeUser.saleId || '').toLowerCase())) {
          return false;
        }
      }

      // Active plan filter (Plan_Update > 0)
      if (onlyShowActivePlan) {
        return p.planUpdate > 0;
      }

      return true;
    });
  }, [activePlanList, selectedSale, onlyShowActivePlan, activeUser, canFilterAllSales]);

  // Top Totals Calculation (EXACT FORMULA: Chênh = Done - Plan Update)
  const planTotals = useMemo(() => {
    return filteredPlans.reduce((acc, p) => {
      const chenh = (p.done || 0) - (p.planUpdate || 0);
      acc.planKpi += p.planKpi || 0;
      acc.planUpdate += p.planUpdate || 0;
      acc.done += p.done || 0;
      acc.chenh += chenh;
      acc.w1 += p.w1 || 0;
      acc.w2 += p.w2 || 0;
      acc.w3 += p.w3 || 0;
      acc.w4 += p.w4 || 0;
      acc.w5 += p.w5 || 0;
      return acc;
    }, { planKpi: 0, planUpdate: 0, done: 0, chenh: 0, w1: 0, w2: 0, w3: 0, w4: 0, w5: 0 });
  }, [filteredPlans]);

  // Removed: handleApprovePlan only flipped local state to 'Đã duyệt', which the
  // next "Đồng bộ Sheet" wiped (the useEffect above re-merges from `plans`, and
  // Plan_Thang has no approval column to persist into). It looked like an action
  // and was purely cosmetic. Reinstate together with a real status column.

  const handleCreateProposal = (e) => {
    e.preventDefault();
    const clientObj = clients.find(c => c.name === selectedClient) || clients[0];
    const planKpiVal = parseFloat(planKpiInput) || parseFloat(planUpdateInput) || 0;
    const planUpVal = parseFloat(planUpdateInput) || 0;

    const newPlan = {
      searchCode: clientObj.codeSearch || 'OEM-CLIENT',
      clientName: clientObj.name,
      sale: activeUser.saleId || clientObj.sale || 'KH Đình Hoan',
      planKpi: planKpiVal,
      planUpdate: planUpVal,
      done: 0,
      w1: parseFloat(w1Input) || 0,
      w2: parseFloat(w2Input) || 0,
      w3: parseFloat(w3Input) || 0,
      w4: parseFloat(w4Input) || 0,
      w5: parseFloat(w5Input) || 0,
      note: noteInput,
      status: 'Chờ duyệt'
    };

    setPlanStateList([newPlan, ...planStateList]);
    onAddPlan(newPlan);
    setShowModal(false);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Banner */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarRange size={24} color="#10b981" /> Kế hoạch kinh doanh
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Quản lý kế hoạch doanh số tháng/tuần (`Plan_thang`). Chênh = Done - Plan Update.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          {/* SALE FILTER */}
          {canFilterAllSales && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={15} color="var(--text-muted)" />
              <select 
                className="input-field" 
                style={{ width: '150px' }}
                value={selectedSale}
                onChange={(e) => setSelectedSale(e.target.value)}
              >
                <option value="ALL">Tất cả SALE</option>
                {salesList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={onlyShowActivePlan}
              onChange={(e) => setOnlyShowActivePlan(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#00a0e9' }}
            />
            Chỉ hiển thị Khách có Plan Update &gt; 0
          </label>

          {/* A "Tháng 8/2026 / Tháng 9/2026" dropdown used to sit here. It was
              never referenced by filteredPlans, and could not have been: rows
              from tab Plan_Thang carry no month at all (searchCode, clientName,
              sale, planKpi, planUpdate, done, w1..w5, note). Switching it
              changed nothing, which invited the reading that every month held
              identical figures. The tab shows whatever Plan_Thang currently
              contains, so say that instead of offering a choice that isn't real. */}
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            Nguồn: tab <strong>Plan_Thang</strong> (kế hoạch tháng hiện hành)
          </span>

          <button onClick={() => setShowModal(true)} className="btn btn-emerald">
            <Plus size={16} /> Đề Xuất Kế Hoạch Tháng
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="table-container animate-fade-in" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ width: '130px' }}>Search Code</th>
              <th style={{ width: '130px' }}>SALE</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Plan KPI</th>
              <th style={{ textAlign: 'right', width: '130px' }}>Plan_Update</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Done (Thực tế)</th>
              <th style={{ textAlign: 'right', width: '130px' }}>Chênh</th>
              <th style={{ textAlign: 'right', width: '110px' }}>Tuần 1</th>
              <th style={{ textAlign: 'right', width: '110px' }}>Tuần 2</th>
              <th style={{ textAlign: 'right', width: '110px' }}>Tuần 3</th>
              <th style={{ textAlign: 'right', width: '110px' }}>Tuần 4</th>
              <th style={{ textAlign: 'right', width: '110px' }}>Tuần 5</th>
              <th style={{ minWidth: '150px' }}>Note</th>
              <th style={{ width: '120px' }}>Trạng Thái</th>
            </tr>
          </thead>
          <tbody>
            {/* STICKY TOP SUMMARY ROW */}
            <tr className="top-summary-row">
              <td style={{ color: '#004e89', fontWeight: 900 }}>Σ TỔNG CỘNG</td>
              <td style={{ color: '#004e89', whiteSpace: 'nowrap' }}>{selectedSale === 'ALL' ? 'All SALE' : selectedSale}</td>
              
              <td style={{ textAlign: 'right', color: '#004e89', fontFamily: 'JetBrains Mono', fontWeight: 900 }}>
                {planTotals.planKpi.toLocaleString('vi-VN')}
              </td>

              <td style={{ textAlign: 'right', color: '#005fa7', fontFamily: 'JetBrains Mono', fontWeight: 900, fontSize: '0.875rem' }}>
                {planTotals.planUpdate.toLocaleString('vi-VN')}
              </td>

              <td style={{ textAlign: 'right', color: '#059669', fontFamily: 'JetBrains Mono', fontWeight: 900 }}>
                {planTotals.done.toLocaleString('vi-VN')}
              </td>

              <td style={{ textAlign: 'right', color: planTotals.chenh >= 0 ? '#059669' : '#dc2626', fontFamily: 'JetBrains Mono', fontWeight: 900 }}>
                {planTotals.chenh.toLocaleString('vi-VN')}
              </td>

              <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>{planTotals.w1.toLocaleString('vi-VN')}</td>
              <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>{planTotals.w2.toLocaleString('vi-VN')}</td>
              <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>{planTotals.w3.toLocaleString('vi-VN')}</td>
              <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>{planTotals.w4.toLocaleString('vi-VN')}</td>
              <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>{planTotals.w5.toLocaleString('vi-VN')}</td>

              <td style={{ color: '#004e89', fontSize: '0.75rem' }}>Tổng kế hoạch</td>
              <td><span className="badge badge-blue">Duyệt hệ thống</span></td>
            </tr>

            {/* DATA ROWS */}
            {filteredPlans.map((plan, idx) => {
              const chenh = (plan.done || 0) - (plan.planUpdate || 0);

              return (
                <tr key={`${plan.searchCode}_${plan.sale}_${idx}`} style={{ height: '42px' }}>
                  <td className="code-font" style={{ fontWeight: 800, color: '#00a0e9', fontSize: '0.85rem' }}>
                    {plan.searchCode}
                  </td>
                  <td style={{ fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {plan.sale}
                  </td>

                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {plan.planKpi ? plan.planKpi.toLocaleString('vi-VN') : '0'}
                  </td>

                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#004e89', fontFamily: 'JetBrains Mono', fontSize: '0.825rem' }}>
                    {plan.planUpdate ? plan.planUpdate.toLocaleString('vi-VN') : '0'}
                  </td>

                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'JetBrains Mono', fontSize: '0.825rem' }}>
                    {plan.done ? plan.done.toLocaleString('vi-VN') : '0'}
                  </td>

                  <td style={{ textAlign: 'right', fontWeight: 800, color: chenh >= 0 ? '#059669' : '#ef4444', fontFamily: 'JetBrains Mono', fontSize: '0.825rem' }}>
                    {chenh.toLocaleString('vi-VN')}
                  </td>

                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>
                    {plan.w1 ? plan.w1.toLocaleString('vi-VN') : '0'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>
                    {plan.w2 ? plan.w2.toLocaleString('vi-VN') : '0'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>
                    {plan.w3 ? plan.w3.toLocaleString('vi-VN') : '0'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>
                    {plan.w4 ? plan.w4.toLocaleString('vi-VN') : '0'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.775rem' }}>
                    {plan.w5 ? plan.w5.toLocaleString('vi-VN') : '0'}
                  </td>

                  <td style={{ fontSize: '0.775rem', color: 'var(--text-muted)', minWidth: '150px' }}>
                    {plan.note || '-'}
                  </td>

                  <td>
                    {/* `status` only exists on a proposal created in this session and
                        not yet reloaded from the Sheet. Rows coming back from
                        Plan_Thang carry no status at all, because the tab has no
                        approval column — so there is nothing truthful to show for
                        them beyond "not tracked". */}
                    {plan.status === 'Chờ duyệt' ? (
                      <span className="badge badge-amber" title="Vừa tạo trong phiên này, đã ghi xuống Sheet">
                        <Clock size={12} /> Vừa tạo
                      </span>
                    ) : (
                      <span
                        className="badge"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-dim)' }}
                        title="Tab Plan_Thang chưa có cột trạng thái duyệt nên app không theo dõi được trạng thái kế hoạch"
                      >
                        — Chưa theo dõi duyệt
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card animate-fade-in" style={{ width: '520px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Đề Xuất Kế Hoạch Kinh Doanh Tháng & Tuần</h3>

            <form onSubmit={handleCreateProposal} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0, position: 'relative' }}>
                <label className="form-label">Client:</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Gõ tên, mã KH chữ (TECOM...) hoặc mã KH số..."
                  value={clientQuery}
                  onChange={(e) => { setClientQuery(e.target.value); setShowClientDropdown(true); }}
                  onFocus={() => setShowClientDropdown(true)}
                  onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
                />
                {showClientDropdown && clientMatches.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
                    maxHeight: '220px', overflowY: 'auto', background: '#fff',
                    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)', zIndex: 10
                  }}>
                    {clientMatches.map(c => (
                      <div
                        key={c.code || c.name}
                        onMouseDown={() => handleSelectClient(c)}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)' }}
                      >
                        <span className="code-font" style={{ color: '#00a0e9', fontWeight: 700 }}>{c.codeSearch}</span> — {c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Plan KPI (Cột E):</label>
                  <input type="number" className="input-field" placeholder="VD: 2500000000" value={planKpiInput} onChange={(e) => setPlanKpiInput(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Plan_Update (Cột F):</label>
                  <input type="number" required className="input-field" placeholder="VD: 2300000000" value={planUpdateInput} onChange={(e) => setPlanUpdateInput(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tuần 1:</label>
                  <input type="number" className="input-field" placeholder="500M" value={w1Input} onChange={(e) => setW1Input(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tuần 2:</label>
                  <input type="number" className="input-field" placeholder="500M" value={w2Input} onChange={(e) => setW2Input(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tuần 3:</label>
                  <input type="number" className="input-field" placeholder="500M" value={w3Input} onChange={(e) => setW3Input(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tuần 4:</label>
                  <input type="number" className="input-field" placeholder="500M" value={w4Input} onChange={(e) => setW4Input(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tuần 5:</label>
                  <input type="number" className="input-field" placeholder="0" value={w5Input} onChange={(e) => setW5Input(e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Ghi Chú (Note):</label>
                <input type="text" className="input-field" placeholder="Ghi chú chi tiết..." value={noteInput} onChange={(e) => setNoteInput(e.target.value)} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Hủy</button>
                <button type="submit" className="btn btn-emerald">Gửi Đề Xuất Phê Duyệt</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
