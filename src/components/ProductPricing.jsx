import React, { useState } from 'react';
import { Package, DollarSign, ClipboardCheck, Calculator, Upload } from 'lucide-react';
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

      {subView === 'catalog' && (
        <ProductManagement
          materials={materials}
          activeUser={activeUser}
          onAddMaterial={onAddMaterial}
          onEditMaterial={onEditMaterial}
        />
      )}

      {subView === 'propose' && canPropose && (
        <PriceProposePanel
          token={token}
          materials={materials}
          clients={clients}
          activeUser={activeUser}
        />
      )}

      {subView === 'approve' && canApprove && (
        <PriceApprovePanel
          token={token}
          activeUser={activeUser}
          onApproved={() => { if (onDataChanged) onDataChanged(); setSubView('catalog'); }}
        />
      )}

      {subView === 'calculator' && canCalculate && (
        <PriceCalculatorPanel token={token} materials={materials} />
      )}

      {subView === 'cost' && canImportCost && (
        <CostImportPanel token={token} activeUser={activeUser} onImported={() => setSubView('catalog')} />
      )}
    </div>
  );
}
