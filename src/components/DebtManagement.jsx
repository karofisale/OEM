import React, { useState } from 'react';
import { FileSpreadsheet, Table2, Upload } from 'lucide-react';
import DebtViewPanel from './debt/DebtViewPanel';
import DebtImportPanel from './debt/DebtImportPanel';

// "Nhập công nợ Excel" menu — consolidated (2026-08-25) into a real read table
// over tab "Debt" plus the Excel import, instead of import-preview-only.
export default function DebtManagement({ token, activeUser }) {
  const [subView, setSubView] = useState('view'); // 'view' | 'import'
  const [refreshTick, setRefreshTick] = useState(0);
  const canImport = ['admin', 'creator'].includes(activeUser.role);

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

      {subView === 'view' && <DebtViewPanel token={token} refreshTick={refreshTick} />}
      {subView === 'import' && canImport && (
        <DebtImportPanel
          token={token}
          activeUser={activeUser}
          onImported={() => { setRefreshTick((t) => t + 1); setSubView('view'); }}
        />
      )}
    </div>
  );
}
