import React, { useState } from 'react';
import { Settings, Database, CheckCircle2, ExternalLink, Code2, AlertTriangle, Loader2 } from 'lucide-react';
import { SHEET_ID } from '../services/sheetService';
import * as api from '../services/api';

export default function GoogleSheetSettings() {
  const [testState, setTestState] = useState(null); // null | 'loading' | 'success' | 'error'
  const [testMessage, setTestMessage] = useState('');

  const handleTestConnection = async () => {
    setTestState('loading');
    setTestMessage('');
    try {
      const res = await api.ping();
      setTestState('success');
      setTestMessage(`Backend phản hồi OK lúc ${new Date(res.time).toLocaleTimeString('vi-VN')}.`);
    } catch (err) {
      setTestState('error');
      setTestMessage(`Không kết nối được backend: ${err.message}. Xem gas/SETUP.md để deploy/kiểm tra API_URL trong src/services/api.js.`);
    } finally {
      setTimeout(() => setTestState(null), 5000);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Banner */}
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={22} color="#3b82f6" /> Cấu Hình Backend & Cơ Sở Dữ Liệu
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Toàn bộ dữ liệu giờ đọc/ghi qua backend (Google Apps Script), không còn gọi thẳng Google Sheet công khai từ trình duyệt.
          </p>
        </div>
      </div>

      {/* Main Form */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={18} color="#06b6d4" /> 1. Kết Nối Backend API
        </h3>

        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
          Backend là một Google Apps Script Web App (mã nguồn tại <code>gas/Code.gs</code>, hướng dẫn deploy tại <code>gas/SETUP.md</code>). URL được cấu hình trong <code>src/services/api.js</code> (hằng số <code>API_URL</code>).
        </p>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleTestConnection} disabled={testState === 'loading'} className="btn btn-primary">
            {testState === 'loading' ? <Loader2 size={16} className="animate-spin" /> : null}
            {testState === 'loading' ? 'Đang kiểm tra...' : 'Kiểm Tra Kết Nối Backend'}
          </button>

          <a
            href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            <ExternalLink size={16} /> Mở Google Sheet Gốc
          </a>
        </div>

        {testState === 'success' && (
          <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} /> {testMessage}
          </div>
        )}

        {testState === 'error' && (
          <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220, 38, 38, 0.12)', color: '#dc2626', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} /> {testMessage}
          </div>
        )}
      </div>

      {/* Python & SAP Solution Guide */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Code2 size={18} color="#8b5cf6" /> 2. Hướng Dẫn Tự Động Hóa Python Script Với SAP
        </h3>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Để tự động hóa việc đẩy dữ liệu từ SAP vào Google Sheet mà không cần mở máy tính cá nhân, bạn có thể triển khai mẫu script Python sau làm Cronjob (Server/Windows Task Scheduler):
        </p>

        <pre className="code-font" style={{
          background: 'rgba(0,0,0,0.3)',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.8rem',
          color: '#93c5fd',
          overflowX: 'auto',
          lineHeight: 1.4
        }}>
{`import gspread
from google.oauth2.service_account import Credentials

# 1. Khởi tạo kết nối Google Sheet Service Account
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
creds = Credentials.from_service_account_file('credentials.json', scopes=SCOPES)
client = gspread.authorize(creds)

# 2. Mở file Google Sheet OEM Database
sheet = client.open_by_key('1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk')
worksheet = sheet.worksheet('Transactions')

# 3. Đọc dữ liệu mới từ SAP API / Database và append
new_sap_records = get_sap_latest_invoices() # Hàm lấy dữ liệu SAP
for row in new_sap_records:
    worksheet.append_row(row)`}
        </pre>
      </div>

    </div>
  );
}
