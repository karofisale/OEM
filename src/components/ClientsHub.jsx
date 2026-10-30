import React from 'react';
import KeepAliveTab from './KeepAliveTab';
import SubTabs from './SubTabs';
import ClientManagement from './ClientManagement';
import { SUBTABS } from '../utils/navMeta';
import { usePersistentState } from '../hooks/usePersistentState';
import { useJump } from '../hooks/useJump';

// Mục "Khách hàng OEM" (30/10/2026): danh sách khách + Công nợ — trước đây Công nợ là mục menu riêng. Công nợ tải lười (chỉ khi mở
// tab đó); cả hai tab giữ nguyên khi chuyển qua lại (KeepAliveTab). Kế toán (account) vào được cả hai như trước.
const DebtManagement = React.lazy(() => import('./DebtManagement'));

export default function ClientsHub({ token, activeUser, clients, onAddClient, onEditClient, jump }) {
  const tabs = SUBTABS.clients;
  const [subSaved, setSubView] = usePersistentState('sub.clients', 'list', (v) => tabs.some((t) => t.id === v));
  const subView = tabs.some((t) => t.id === subSaved) ? subSaved : 'list';
  useJump(jump, tabs, setSubView);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <SubTabs tabs={tabs} active={subView} onChange={setSubView} ariaLabel="Khách hàng OEM" />

      <KeepAliveTab isActive={subView === 'list'}>
        <ClientManagement clients={clients} activeUser={activeUser} onAddClient={onAddClient} onEditClient={onEditClient} />
      </KeepAliveTab>

      <KeepAliveTab isActive={subView === 'debt'}>
        <DebtManagement token={token} activeUser={activeUser} clients={clients} embedded />
      </KeepAliveTab>
    </div>
  );
}
