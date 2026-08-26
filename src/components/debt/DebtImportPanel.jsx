import React, { useState } from 'react';
import { Upload, ArrowRight, ShieldAlert } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';

const fmt = (v) => (v || 0).toLocaleString('vi-VN');

const pick = (row, keys) => {
  for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; }
  return undefined;
};

const parseNum = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  const clean = String(v).replace(/[,.\s₫đ]/g, '');
  return parseFloat(clean) || 0;
};

// The real weekly file ("BÁO CÁO KẾ HOẠCH -THỰC THU CÔNG NỢ OEM...xlsx", tab
// "TỔNG HỢP" — checked directly 2026-08-25) is NOT a plain 5-column sheet:
// rows 0-6 are a title/pivot block (per-Sale + grand-total rows, weekly plan
// columns stretching to column EH), and only row 7 carries "Mã KH" in column
// A — everything from row 8 down is the real per-customer table, laid out by
// FIXED POSITION exactly like the Google Sheet "Debt" tab itself: Mã KH | Mã
// Số Cũ | Tên Khách hàng | PIC | Hạn mức | Vượt hạn mức | Số dư công nợ. So
// this scans column A for the "Mã KH" header cell (wherever it lands — the
// pivot block above it isn't a fixed size) and reads by position from there,
// the same convention as every sheet this app touches.
function parseDebtSheetByPosition_(ws, XLSX) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const headerRowIndex = raw.findIndex((r) => String(r[0] || '').trim().toLowerCase() === 'mã kh');
  if (headerRowIndex === -1) return [];

  const out = [];
  for (let i = headerRowIndex + 1; i < raw.length; i++) {
    const r = raw[i];
    const code = String(r[0] || '').trim();
    if (!code) continue;
    out.push({
      code,
      oldCode: String(r[1] || '').trim(),
      name: String(r[2] || '').trim(),
      pic: String(r[3] || '').trim(),
      creditLimit: parseNum(r[4]),
      overLimitFromFile: parseNum(r[5]),
      balance: parseNum(r[6])
    });
  }
  return out;
}

// Fallback for a simplified export that really is just named columns in row
// 1 (no pivot block) — tries common header spellings.
function parseDebtSheetByHeaderName_(ws, XLSX) {
  const data = XLSX.utils.sheet_to_json(ws);
  return data
    .map((row) => ({
      code: String(pick(row, ['Mã KH', 'Ma KH', 'Code']) || '').trim(),
      oldCode: String(pick(row, ['MÃ SỐ CŨ', 'Mã Số Cũ']) || '').trim(),
      name: String(pick(row, ['Tên khách hàng', 'Tên Khách hàng', 'Tên KH', 'Client Name']) || '').trim(),
      pic: String(pick(row, ['PIC', 'Sale', 'KINH DOANH QL']) || '').trim(),
      creditLimit: parseNum(pick(row, ['HM công nợ', 'Hạn mức', 'Hạn Mức'])),
      overLimitFromFile: parseNum(pick(row, ['Công nợ vượt HM', 'Vượt hạn mức'])),
      balance: parseNum(pick(row, ['Số dư công nợ', 'Số dư', 'Công Nợ Cuối Kỳ']))
    }))
    .filter((r) => r.code);
}

// Upload Excel -> upsert into tab "Debt" by Mã KH. "Công nợ vượt HM" is shown
// in the preview for reference only — the sheet computes it itself (a single
// ARRAYFORMULA over Hạn mức/Số dư), so this app never writes that column;
// see gas/Debt.gs.
export default function DebtImportPanel({ token, activeUser, onImported }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const canImport = ['admin', 'creator'].includes(activeUser.role);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        // "TỔNG HỢP" is the real consolidated tab in the weekly report (same
        // convention the cong-no-oem skill uses) — the file also carries a
        // dozen other working tabs (ZFI402, FAGLL03, ...) that aren't data.
        const ws = wb.Sheets['TỔNG HỢP'] || wb.Sheets[wb.SheetNames[0]];

        let parsed = parseDebtSheetByPosition_(ws, XLSX);
        if (!parsed.length) parsed = parseDebtSheetByHeaderName_(ws, XLSX);

        setRows(parsed);
        if (!parsed.length) toast.error('Không đọc được dòng nào — kiểm tra file có đúng cột "Mã KH" không.');
      } catch (err) {
        toast.error('Lỗi đọc file Excel: ' + err.message);
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const payload = rows.map((r) => ({ code: r.code, oldCode: r.oldCode, name: r.name, pic: r.pic, creditLimit: r.creditLimit, balance: r.balance }));
      const result = await api.importDebtExcel(token, payload);
      toast.success(`Đã cập nhật ${result.updatedCount} khách hàng, thêm mới ${result.addedCount} khách hàng vào tab Debt.`);
      setConfirming(false);
      setRows([]);
      setFileName('');
      if (onImported) onImported();
    } catch (err) {
      toast.error('Không nhập được công nợ: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  if (!canImport) {
    return (
      <div className="glass-card" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: 'var(--warning-text)', background: 'var(--warning-bg)' }}>
        <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>Chỉ Admin/Creator mới có quyền nhập công nợ từ Excel.</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '36px', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Upload size={32} color="var(--accent-cyan)" />
        </div>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Tải file Excel Công Nợ</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Nhận đúng file báo cáo tuần "BÁO CÁO KẾ HOẠCH -THỰC THU CÔNG NỢ OEM..." (tab "TỔNG HỢP"), hoặc file đơn giản có cột <strong>Mã KH</strong>, <strong>Tên khách hàng</strong>, <strong>HM công nợ</strong>, <strong>Công nợ vượt HM</strong>, <strong>Số dư công nợ</strong>.
          </p>
        </div>
        <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} id="debt-excel-input" style={{ display: 'none' }} />
        <label htmlFor="debt-excel-input" className="btn btn-primary" style={{ cursor: 'pointer' }}>
          {isParsing ? 'Đang đọc file...' : 'Chọn File Excel Từ Máy Tính'}
        </label>
        {fileName && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{fileName}</span>}
      </div>

      {rows.length > 0 && (
        <div className="glass-card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Xem trước ({rows.length.toLocaleString('vi-VN')} khách hàng)</h3>
            <button onClick={() => setConfirming(true)} className="btn btn-emerald">
              <ArrowRight size={16} /> Đồng Bộ Lên Google Sheet
            </button>
          </div>

          <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Mã KH</th>
                  <th>Tên khách hàng</th>
                  <th>PIC</th>
                  <th style={{ textAlign: 'right' }}>Hạn mức</th>
                  <th style={{ textAlign: 'right' }}>Vượt hạn mức (trong file)</th>
                  <th style={{ textAlign: 'right' }}>Số dư công nợ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={`${r.code}_${idx}`}>
                    <td className="code-font" style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{r.code}</td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.pic}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(r.creditLimit)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-dim)' }}>{fmt(r.overLimitFromFile)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{fmt(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Cột "Vượt hạn mức" trong tab Debt do Sheet tự tính (Số dư − Hạn mức) — giá trị trong file chỉ để đối chiếu, không được ghi đè.
          </p>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Đồng bộ công nợ lên Google Sheet?"
          message={`Sẽ cập nhật/thêm mới ${rows.length} khách hàng vào tab "Debt" — ghi đè Hạn mức và Số dư công nợ theo file vừa tải lên. Tab này cũng được cập nhật bởi quy trình đối chiếu công nợ riêng (skill cong-no-oem); hãy chắc chắn dữ liệu trong file là bản mới nhất trước khi đồng bộ.`}
          confirmLabel={isImporting ? 'Đang đồng bộ...' : 'Đồng bộ'}
          onConfirm={handleImport}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
