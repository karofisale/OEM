import React, { useState } from 'react';
import { CalendarRange, ClipboardList, ClipboardCheck } from 'lucide-react';
import KeepAliveTab from './KeepAliveTab';
import SalesPlanViewPanel from './salesplan/SalesPlanViewPanel';
import SalesPlanProposePanel from './salesplan/SalesPlanProposePanel';
import SalesPlanApprovePanel from './salesplan/SalesPlanApprovePanel';

export default function SalesPlan({ token, plans, clients, plan2026, planDefaultMonth, activeUser, onDataChanged }) {
  const [subView, setSubView] = useState('view'); // 'view' | 'propose' | 'approve'

  const canPropose = ['sale', 'admin', 'creator'].includes(activeUser.role);
  const canApprove = ['admin', 'creator'].includes(activeUser.role);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarRange size={24} color="var(--accent-emerald)" /> Kế hoạch kinh doanh
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Kế hoạch doanh số theo tháng/tuần, mỗi khách hàng — nhiều tháng cùng tồn tại song song (tab Plan_Thang).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setSubView('view')} className={`btn ${subView === 'view' ? 'btn-primary' : 'btn-secondary'}`}>
            <CalendarRange size={16} /> Xem Kế Hoạch
          </button>
          {canPropose && (
            <button onClick={() => setSubView('propose')} className={`btn ${subView === 'propose' ? 'btn-primary' : 'btn-secondary'}`}>
              <ClipboardList size={16} /> Đề Xuất
            </button>
          )}
          {canApprove && (
            <button onClick={() => setSubView('approve')} className={`btn ${subView === 'approve' ? 'btn-primary' : 'btn-secondary'}`}>
              <ClipboardCheck size={16} /> Chờ Duyệt
            </button>
          )}
        </div>
      </div>

      {/* Perf (2026-08-27): giữ nguyên sub-tab (KeepAliveTab) thay vì unmount.
          Cả 3 panel ở đây đọc `plans` từ prop (không tự gọi backend), nên cái
          tiết kiệm được là toàn bộ useMemo đã tính (Đề Xuất gộp kế hoạch theo
          khách/tuần trên cả danh sách) cùng bộ lọc tháng/sale và trang đang xem
          — trước đây mất hết mỗi lần bấm sang tab khác rồi quay lại. */}
      <KeepAliveTab isActive={subView === 'view'}>
        <SalesPlanViewPanel plans={plans} activeUser={activeUser} />
      </KeepAliveTab>

      {canPropose && (
        <KeepAliveTab isActive={subView === 'propose'}>
          <SalesPlanProposePanel
            token={token}
            clients={clients}
            plans={plans}
            plan2026={plan2026}
            planDefaultMonth={planDefaultMonth}
            activeUser={activeUser}
            onSubmitted={onDataChanged}
          />
        </KeepAliveTab>
      )}

      {canApprove && (
        <KeepAliveTab isActive={subView === 'approve'}>
          <SalesPlanApprovePanel
            token={token}
            plans={plans}
            onApproved={() => { onDataChanged(); setSubView('view'); }}
          />
        </KeepAliveTab>
      )}
    </div>
  );
}
