import React, { useState } from 'react';
import { CalendarClock, ClipboardList, ClipboardCheck } from 'lucide-react';
import SopViewPanel from './sop/SopViewPanel';
import SopPlanPanel from './sop/SopPlanPanel';
import SopApprovePanel from './sop/SopApprovePanel';
import SopMyPlanPanel from './sop/SopMyPlanPanel';

export default function SopPlan({ token, activeUser, materials }) {
  const [subView, setSubView] = useState('view'); // 'view' | 'plan' | 'approve'
  // Bumped every time a plan is submitted or approved, so the "Xem SOP" panel
  // (and the approve panel's pending count) refetch instead of showing what
  // was true before the write.
  const [refreshTick, setRefreshTick] = useState(0);
  const bumpRefresh = () => setRefreshTick(t => t + 1);

  const canPlan = ['sale', 'admin', 'creator'].includes(activeUser.role);
  const canApprove = ['admin', 'creator'].includes(activeUser.role);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header Banner */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarClock size={24} color="var(--karofi-cyan)" /> Kế hoạch SOP
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Kế hoạch sản lượng theo mã SKU cho 4 tháng tiếp theo — tổng hợp từ mọi Sale sau khi được duyệt.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setSubView('view')} className={`btn ${subView === 'view' ? 'btn-primary' : 'btn-secondary'}`}>
            <CalendarClock size={16} /> Xem SOP
          </button>
          {canPlan && (
            <button onClick={() => setSubView('plan')} className={`btn ${subView === 'plan' ? 'btn-primary' : 'btn-secondary'}`}>
              <ClipboardList size={16} /> Lập Kế Hoạch
            </button>
          )}
          {canApprove && (
            <button onClick={() => setSubView('approve')} className={`btn ${subView === 'approve' ? 'btn-primary' : 'btn-secondary'}`}>
              <ClipboardCheck size={16} /> Chờ Duyệt
            </button>
          )}
        </div>
      </div>

      {subView === 'view' && (
        <>
          {canPlan && (
            <SopMyPlanPanel
              token={token}
              refreshTick={refreshTick}
              onEditCurrentPeriod={() => setSubView('plan')}
            />
          )}
          <SopViewPanel token={token} refreshTick={refreshTick} />
        </>
      )}

      {subView === 'plan' && canPlan && (
        <SopPlanPanel token={token} materials={materials} onSubmitted={bumpRefresh} />
      )}

      {subView === 'approve' && canApprove && (
        <SopApprovePanel token={token} onApproved={() => { bumpRefresh(); setSubView('view'); }} />
      )}
    </div>
  );
}
