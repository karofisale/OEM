import React, { useState } from 'react';
import { Package, DollarSign, ClipboardCheck } from 'lucide-react';
import ProductManagement from './ProductManagement';
import PriceProposePanel from './pricing/PriceProposePanel';
import PriceApprovePanel from './pricing/PriceApprovePanel';

// "Sản phẩm & Bảng giá" — 3 sub-tab giống khuôn Kế hoạch SOP: Danh mục (đọc,
// đã có từ trước), Đề xuất giá (Sale gửi hàng loạt giá lẻ/KM), Chờ duyệt
// (Admin/Creator duyệt, ghi thẳng vào Products hoặc Gia_KhachHang).
export default function ProductPricing({ token, materials, clients, activeUser, onAddMaterial, onEditMaterial, onDataChanged }) {
  const [subView, setSubView] = useState('catalog'); // 'catalog' | 'propose' | 'approve'

  const canPropose = ['sale', 'admin', 'creator'].includes(activeUser.role);
  const canApprove = ['admin', 'creator'].includes(activeUser.role);

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
          onApproved={() => { if (onDataChanged) onDataChanged(); setSubView('catalog'); }}
        />
      )}
    </div>
  );
}
