import React from 'react';
import KeepAliveTab from './KeepAliveTab';
import SubTabs from './SubTabs';
import { SUBTABS } from '../utils/navMeta';
import { usePersistentState } from '../hooks/usePersistentState';
import { useJump } from '../hooks/useJump';

// Mục "Đơn hàng" (30/10/2026): gộp "AI Nhận Đơn Hàng" và "Đơn Hàng Chờ Duyệt" — trước đây hai mục menu riêng.
// Hai tab con: Nhận đơn (AI) / Chờ duyệt. Cả hai giữ nguyên khi chuyển qua lại (KeepAliveTab): đơn AI đang soạn dở
// không mất, danh sách chờ duyệt không phải tải lại.
const AIOrderAgent = React.lazy(() => import('./AIOrderAgent'));
const OrdersReview = React.lazy(() => import('./OrdersReview'));

export default function OrdersHub({
  token, activeUser, clients, materials, transactions, kits,
  isActive, isStale, onOrderSaved, onLoaded, jump
}) {
  const tabs = SUBTABS.orders;
  const [subSaved, setSubView] = usePersistentState('sub.orders', 'receive', (v) => tabs.some((t) => t.id === v));
  const subView = tabs.some((t) => t.id === subSaved) ? subSaved : 'receive';
  useJump(jump, tabs, setSubView);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <SubTabs tabs={tabs} active={subView} onChange={setSubView} ariaLabel="Đơn hàng" />

      <KeepAliveTab isActive={subView === 'receive'}>
        <AIOrderAgent
          clients={clients}
          materials={materials}
          transactions={transactions}
          kits={kits}
          token={token}
          onOrderSaved={onOrderSaved}
          onOpenReview={() => setSubView('review')}
        />
      </KeepAliveTab>

      <KeepAliveTab isActive={subView === 'review'}>
        <OrdersReview
          token={token}
          activeUser={activeUser}
          materials={materials}
          clients={clients}
          isActive={isActive && subView === 'review'}
          isStale={isStale}
          onLoaded={onLoaded}
        />
      </KeepAliveTab>
    </div>
  );
}
