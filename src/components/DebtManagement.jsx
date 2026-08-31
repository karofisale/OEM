import React, { useState } from 'react';
import { FileSpreadsheet, Table2, Upload } from 'lucide-react';
import KeepAliveTab from './KeepAliveTab';
import DebtViewPanel from './debt/DebtViewPanel';
import DebtImportPanel from './debt/DebtImportPanel';

// "Nhập công nợ Excel" menu — consolidated (2026-08-25) into a real read table
// over tab "Debt" plus the Excel import, instead of import-preview-only.
export default function DebtManagement({ token, activeUser, clients }) {
  const [subView, setSubView] = useState('view'); // 'view' | 'import'
  const [refreshTick, setRefreshTick] = useState(0);
  const canImport = ['admin', 'creator', 'account'].includes(activeUser.role);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={24} color="var(--karofi-cyan)" /> Công Nợ Khách Hàng
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Bảng công nợ đọc trực tiếp từ tab "Debt" — nhập Excel để cập nhật Hạn mức và Số dư công nợ.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setSubView('view')} className={`btn ${subView === 'view' ? 'btn-primary' : 'btn-secondary'}`}>
            <Table2 size={16} /> Bảng Công Nợ
          </button>
          {canImport && (
            <button onClick={() => setSubView('import')} className={`btn ${subView === 'import' ? 'btn-primary' : 'btn-secondary'}`}>
              <Upload size={16} /> Nhập Excel
            </button>
          )}
        </div>
      </div>

      {/* Perf (2026-08-27): bảng công nợ giữ nguyên khi chuyển sang tab Nhập
          Excel rồi quay lại, thay vì unmount và gọi lại backend một lượt nữa
          (~400 dòng, và đường mạng ~50% lượt gọi bị lỗi phải retry — xem đầu
          src/services/api.js). Sau khi nhập xong, refreshTick đã lo việc tải
          lại số mới, nên không có nguy cơ hiển thị số cũ. */}
      <KeepAliveTab isActive={subView === 'view'}>
        <DebtViewPanel token={token} refreshTick={refreshTick} />
      </KeepAliveTab>

      {/* Nhập Excel vẫn unmount khi rời đi: panel giữ file đã chọn trong state,
          unmount là cách reset ô chọn file sạch nhất. */}
      {subView === 'import' && canImport && (
        <DebtImportPanel
          token={token}
          activeUser={activeUser}
          clients={clients}
          onImported={() => { setRefreshTick((t) => t + 1); setSubView('view'); }}
        />
      )}
    </div>
  );
}
