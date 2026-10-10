import React, { useMemo } from 'react';
import { CalendarRange } from 'lucide-react';
import KeepAliveTab from './KeepAliveTab';
import SubTabs from './SubTabs';
import { SUBTABS } from '../utils/navMeta';
import { usePersistentState } from '../hooks/usePersistentState';
import SalesPlanViewPanel from './salesplan/SalesPlanViewPanel';
import SalesPlanProposePanel from './salesplan/SalesPlanProposePanel';
import SalesPlanApprovePanel from './salesplan/SalesPlanApprovePanel';
import PlanNamPanel from './salesplan/PlanNamPanel';
import TableState from './TableState';
import { useEnsureYears } from '../hooks/useEnsureYears';
import { namCuaCacThang } from '../utils/txYears';

export default function SalesPlan({ token, plans, clients, transactions, txYears, plan2026, planDefaultMonth, activeUser, onDataChanged, onReloadPlanKpi }) {
  const canPropose = ['sale', 'admin', 'creator'].includes(activeUser.role);
  const canApprove = ['admin', 'creator'].includes(activeUser.role);

  // Tab con: icon riêng, nhớ tab cuối qua F5 (Đợt 2 / mục 7, 9).
  const hien = { view: true, propose: canPropose, approve: canApprove, kpi: canApprove };
  const tabs = SUBTABS['sales-plan'].filter((t) => hien[t.id]);
  const [subSaved, setSubView] = usePersistentState('sub.sales-plan', 'view'); // 'view' | 'propose' | 'approve' | 'kpi'
  const subView = tabs.some((t) => t.id === subSaved) ? subSaved : 'view';

  // Done của từng tháng kế hoạch tính từ giao dịch (Đợt 4: bootstrap chỉ gửi năm nay + năm trước). Kế hoạch của tháng thuộc năm CŨ
  // hơn thì phải tải năm đó trước — nếu không Done rơi về số cũ đông cứng trong plan_thang. Thường không có tháng nào như vậy
  // (khi đó màn này không chờ gì cả).
  const cacNamKeHoach = useMemo(() => namCuaCacThang((plans || []).map((p) => p.month)), [plans]);
  const carga = useEnsureYears(txYears, cacNamKeHoach);
  const chuaDu = carga.dangTai || !!carga.loi;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarRange size={24} color="var(--accent-emerald)" /> Kế hoạch kinh doanh
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Kế hoạch doanh số theo tháng/tuần, mỗi khách hàng — nhiều tháng cùng tồn tại song song.
          </p>
        </div>

      </div>

      <SubTabs tabs={tabs} active={subView} onChange={setSubView} ariaLabel="Kế hoạch kinh doanh" />

      {/* Perf (2026-08-27): giữ nguyên sub-tab (KeepAliveTab) thay vì unmount.
          Cả 3 panel ở đây đọc `plans` từ prop (không tự gọi backend), nên cái
          tiết kiệm được là toàn bộ useMemo đã tính (Đề Xuất gộp kế hoạch theo
          khách/tuần trên cả danh sách) cùng bộ lọc tháng/sale và trang đang xem
          — trước đây mất hết mỗi lần bấm sang tab khác rồi quay lại. */}
      {chuaDu ? (
        <TableState loading={carga.dangTai} error={carga.loi} onRetry={carga.retry} loadingLabel={carga.nhan}
          errorPrefix="Không tải được doanh thu năm cũ (cần để tính Done)"><span /></TableState>
      ) : (<>
      <KeepAliveTab isActive={subView === 'view'}>
        <SalesPlanViewPanel plans={plans} transactions={transactions} activeUser={activeUser} />
      </KeepAliveTab>

      {canPropose && (
        <KeepAliveTab isActive={subView === 'propose'}>
          <SalesPlanProposePanel
            token={token}
            clients={clients}
            plans={plans}
            transactions={transactions}
            plan2026={plan2026}
            planDefaultMonth={planDefaultMonth}
            activeUser={activeUser}
            onSubmitted={() => onDataChanged && onDataChanged(['plans'])}
            onReloadPlanKpi={onReloadPlanKpi}
          />
        </KeepAliveTab>
      )}

      {canApprove && (
        <KeepAliveTab isActive={subView === 'approve'}>
          <SalesPlanApprovePanel
            token={token}
            plans={plans}
            transactions={transactions}
            onApproved={() => { if (onDataChanged) onDataChanged(['plans']); setSubView('view'); }}
          />
        </KeepAliveTab>
      )}
      </>)}

      {/* Unmount khi rời đi (không KeepAlive): bảng sửa dở KPI năm mà giữ lại
          ngầm thì lần quay lại dễ bấm Lưu đè lên số người khác vừa sửa. */}
      {canApprove && subView === 'kpi' && (
        <PlanNamPanel token={token} onSaved={onReloadPlanKpi} />
      )}
    </div>
  );
}
