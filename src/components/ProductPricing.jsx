import React, { useState } from 'react';
import KeepAliveTab from './KeepAliveTab';
import SubTabs from './SubTabs';
import { SUBTABS } from '../utils/navMeta';
import { usePersistentState } from '../hooks/usePersistentState';
import ProductManagement from './ProductManagement';
import PriceProposePanel from './pricing/PriceProposePanel';
import PriceApprovePanel from './pricing/PriceApprovePanel';
import PriceCalculatorPanel from './pricing/PriceCalculatorPanel';
import CostImportPanel from './pricing/CostImportPanel';
import KitsPanel from './pricing/KitsPanel';

// "Sản phẩm & Bảng giá" — sub-tab giống khuôn Kế hoạch SOP: Danh mục (đọc,
// đã có từ trước), Đề xuất giá (Sale gửi hàng loạt giá lẻ/KM), Chờ duyệt
// (Admin/Creator duyệt, ghi thẳng vào Products hoặc Gia_KhachHang), Tính Giá
// (Admin/Creator, công cụ gợi ý giá theo % LNG — không lộ giá vốn thật), Giá
// Vốn (chỉ Creator, nhập Excel giá vốn hàng tháng).
export default function ProductPricing({ token, materials, clients, kits, activeUser, onAddMaterial, onEditMaterial, onDataChanged }) {

  // Perf (2026-08-27): sub-tab giờ giữ nguyên (KeepAliveTab) thay vì unmount
  // khi chuyển — mỗi lần unmount là mất luôn dữ liệu đã tải, và mở lại phải
  // gọi backend một lượt nữa trên đường mạng ~50% lượt gọi bị lỗi phải retry
  // (xem đầu src/services/api.js). Đổi lại, panel đọc dữ liệu không còn tự
  // refetch nhờ remount, nên phải báo cho nó biết khi sub-tab KHÁC vừa ghi:
  // gửi đề xuất mới, hoặc nhập giá vốn mới, đều làm danh sách chờ duyệt cũ đi.
  const [refreshTick, setRefreshTick] = useState(0);
  const bumpRefresh = () => setRefreshTick((t) => t + 1);

  const canPropose = ['sale', 'admin', 'creator'].includes(activeUser.role);
  const canApprove = ['admin', 'creator'].includes(activeUser.role);
  const canCalculate = ['admin', 'creator'].includes(activeUser.role);
  const canImportCost = activeUser.role === 'creator';

  // Tab con: icon riêng từng tab (utils/navMeta.js), nhớ tab cuối qua F5 (Đợt 2 / mục 9).
  const hien = { catalog: true, propose: canPropose, approve: canApprove, calculator: canCalculate, cost: canImportCost, kits: canApprove };
  const tabs = SUBTABS.products.filter((t) => hien[t.id]);
  const [subSaved, setSubView] = usePersistentState('sub.products', 'catalog'); // catalog | propose | approve | calculator | cost | kits
  const subView = tabs.some((t) => t.id === subSaved) ? subSaved : 'catalog';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <SubTabs tabs={tabs} active={subView} onChange={setSubView} ariaLabel="Sản phẩm và bảng giá" />

      <KeepAliveTab isActive={subView === 'catalog'}>
        <ProductManagement
          materials={materials}
          token={token}
          activeUser={activeUser}
          onAddMaterial={onAddMaterial}
          onEditMaterial={onEditMaterial}
        />
      </KeepAliveTab>

      {canPropose && (
        <KeepAliveTab isActive={subView === 'propose'}>
          <PriceProposePanel
            token={token}
            materials={materials}
            clients={clients}
            activeUser={activeUser}
            onSubmitted={bumpRefresh}
          />
        </KeepAliveTab>
      )}

      {canApprove && (
        <KeepAliveTab isActive={subView === 'approve'}>
          <PriceApprovePanel
            token={token}
            activeUser={activeUser}
            refreshTick={refreshTick}
            // Ở LẠI tab Chờ duyệt (Đợt 3): duyệt xong thường còn đợt khác trong hàng đợi; trước đây bị đẩy về Danh Mục.
            // Vẫn nạp lại dữ liệu nền để giá mới hiện ở Danh Mục khi người duyệt sang xem.
            onApproved={() => { if (onDataChanged) onDataChanged(); }}
          />
        </KeepAliveTab>
      )}

      {canCalculate && (
        <KeepAliveTab isActive={subView === 'calculator'}>
          <PriceCalculatorPanel token={token} materials={materials} />
        </KeepAliveTab>
      )}

      {/* Giá Vốn giữ nguyên kiểu unmount: panel này không gọi backend lúc mở,
          nhưng có giữ file Excel đã chọn trong state — unmount khi rời đi là
          cách reset ô chọn file sạch sẽ nhất, tránh việc quay lại thấy file
          của lần nhập trước còn nằm đó rồi gửi lại lần hai. */}
      {subView === 'cost' && canImportCost && (
        <CostImportPanel
          token={token}
          activeUser={activeUser}
          onImported={() => { bumpRefresh(); setSubView('catalog'); }}
        />
      )}

      {canApprove && (
        <KeepAliveTab isActive={subView === 'kits'}>
          <KitsPanel token={token} kits={kits} materials={materials} onSaved={onDataChanged} />
        </KeepAliveTab>
      )}
    </div>
  );
}
