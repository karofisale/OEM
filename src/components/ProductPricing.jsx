import React, { useState } from 'react';
import { Package, DollarSign, ClipboardCheck, Calculator, Upload } from 'lucide-react';
import KeepAliveTab from './KeepAliveTab';
import ProductManagement from './ProductManagement';
import PriceProposePanel from './pricing/PriceProposePanel';
import PriceApprovePanel from './pricing/PriceApprovePanel';
import PriceCalculatorPanel from './pricing/PriceCalculatorPanel';
import CostImportPanel from './pricing/CostImportPanel';

// "Sản phẩm & Bảng giá" — sub-tab giống khuôn Kế hoạch SOP: Danh mục (đọc,
// đã có từ trước), Đề xuất giá (Sale gửi hàng loạt giá lẻ/KM), Chờ duyệt
// (Admin/Creator duyệt, ghi thẳng vào Products hoặc Gia_KhachHang), Tính Giá
// (Admin/Creator, công cụ gợi ý giá theo % LNG — không lộ giá vốn thật), Giá
// Vốn (chỉ Creator, nhập Excel giá vốn hàng tháng).
export default function ProductPricing({ token, materials, clients, activeUser, onAddMaterial, onEditMaterial, onDataChanged }) {
  const [subView, setSubView] = useState('catalog'); // catalog | propose | approve | calculator | cost

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

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button onClick={() => setSubView('catalog')} className={`btn ${subView === 'catalog' ? 'btn-primary' : 'btn-secondary'}`}>
          <Package size={16} /> Danh Mục
        </button>
        {canPropose && (
          <button onClick={() => setSubView('propose')} className={`btn ${subView === 'propose' ? 'btn-primary' : 'btn-secondary'}`}>
            <DollarSign size={16} /> Đề Xuất Giá
          </button>
        )}
        {canApprove && (
          <button onClick={() => setSubView('approve')} className={`btn ${subView === 'approve' ? 'btn-primary' : 'btn-secondary'}`}>
            <ClipboardCheck size={16} /> Chờ Duyệt
          </button>
        )}
        {canCalculate && (
          <button onClick={() => setSubView('calculator')} className={`btn ${subView === 'calculator' ? 'btn-primary' : 'btn-secondary'}`}>
            <Calculator size={16} /> Tính Giá
          </button>
        )}
        {canImportCost && (
          <button onClick={() => setSubView('cost')} className={`btn ${subView === 'cost' ? 'btn-primary' : 'btn-secondary'}`}>
            <Upload size={16} /> Giá Vốn
          </button>
        )}
      </div>

      <KeepAliveTab isActive={subView === 'catalog'}>
        <ProductManagement
          materials={materials}
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
            onApproved={() => { if (onDataChanged) onDataChanged(); setSubView('catalog'); }}
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
    </div>
  );
}
