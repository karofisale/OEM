import React, { useState } from 'react';
import { FileSpreadsheet, Upload, CheckCircle2, ArrowRight, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function DebtImporter({ onSyncDebt }) {
  const [file, setFile] = useState(null);
  const [debtData, setDebtData] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        // Parse rows
        const parsed = data.map((row, idx) => ({
          clientCode: row['Mã KH'] || row['Code'] || `KH-${100 + idx}`,
          clientName: row['Tên Khách Hàng'] || row['Client Name'] || row['Tên KH'] || 'Khách Hàng OEM',
          openingDebt: parseFloat(row['Công Nợ Đầu Kỳ'] || row['Đầu kỳ'] || 0),
          closingDebt: parseFloat(row['Công Nợ Cuối Kỳ'] || row['Cuối kỳ'] || 0),
          salesRep: row['PIC'] || row['Sale'] || 'KH Đình Hoan'
        }));

        setDebtData(parsed);
      } catch (err) {
        alert('Lỗi đọc file Excel. Xin kiểm tra định dạng file.');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(uploadedFile);
  };

  // NOTE: There is currently no backend/API that can write to the Google Sheet
  // from this static site, so this cannot actually push data to Debt_Tracking.
  // Be honest with the user instead of faking a success toast.
  const handleSyncToSheet = () => {
    setSyncStatus('warning');
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Banner */}
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={22} color="#06b6d4" /> Cập Nhật Công Nợ Khách Hàng Từ File Excel
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Giải pháp thay thế thao tác sửa tay thủ công: Thả file Excel công nợ ➔ Tự động đọc & Cập nhật tab `Debt_Tracking` trên Google Sheet.
          </p>
        </div>
      </div>

      {/* Upload Dropzone */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '36px', textAlign: 'center' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Upload size={32} color="#06b6d4" />
        </div>

        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Kéo & Thả file Excel Công Nợ vào đây</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Chấp nhận định dạng file <code>.xlsx</code> hoặc <code>.xls</code> chứa cột Mã KH, Tên Khách Hàng, Công Nợ Đầu Kỳ, Công Nợ Cuối Kỳ.
          </p>
        </div>

        <input 
          type="file" 
          accept=".xlsx, .xls" 
          onChange={handleFileUpload}
          id="debt-excel-input"
          style={{ display: 'none' }}
        />
        <label htmlFor="debt-excel-input" className="btn btn-primary" style={{ cursor: 'pointer' }}>
          Chọn File Excel Từ Máy Tính
        </label>
      </div>

      {/* Parsed Data Preview */}
      {debtData.length > 0 && (
        <div className="glass-card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Bảng Xem Trước Dữ Liệu Công Nợ ({debtData.length} Khách Hàng)</h3>

            <button onClick={handleSyncToSheet} className="btn btn-emerald">
              <ArrowRight size={16} /> Đồng Bộ Lên Google Sheet
            </button>
          </div>

          {syncStatus === 'warning' && (
            <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(245, 158, 11, 0.15)', color: '#b45309', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              Chức năng ghi trực tiếp lên Google Sheet chưa được kết nối (cần API/backend, ví dụ Google Apps Script). Vui lòng dùng bảng xem trước bên dưới để cập nhật thủ công vào tab <strong>Debt_Tracking</strong>, hoặc liên hệ IT để triển khai API ghi dữ liệu.
            </div>
          )}

          <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Mã KH</th>
                  <th>Tên Khách Hàng OEM</th>
                  <th style={{ textAlign: 'right' }}>Công Nợ Đầu Kỳ (VND)</th>
                  <th style={{ textAlign: 'right' }}>Công Nợ Cuối Kỳ (VND)</th>
                  <th>PIC Sale</th>
                </tr>
              </thead>
              <tbody>
                {debtData.map((d, idx) => (
                  <tr key={idx}>
                    <td className="code-font" style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{d.clientCode}</td>
                    <td style={{ fontWeight: 600 }}>{d.clientName}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono' }}>{d.openingDebt.toLocaleString('vi-VN')} ₫</td>
                    <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                      {d.closingDebt.toLocaleString('vi-VN')} ₫
                    </td>
                    <td><span className="badge badge-amber">{d.salesRep}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
