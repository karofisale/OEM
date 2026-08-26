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

// "2026-08" (input type=month) -> "T08.2026" (đúng định dạng tab Cost).
function monthInputToLabel(value) {
  const [y, m] = String(value || '').split('-');
  if (!y || !m) return '';
  return `T${m}.${y}`;
}

// Creator-only — tải file Excel kế toán gửi (giá vốn chưa VAT theo tháng),
// chọn đúng tháng áp dụng rồi đồng bộ vào tab "Cost". Upsert theo (SKU,
// Tháng) ở backend — tải lại đúng tháng đó lần 2 sẽ ghi đè, không nhân đôi.
export default function CostImportPanel({ token, activeUser, onImported }) {
  const toast = useToast();
  const [monthValue, setMonthValue] = useState('');
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const canImport = activeUser.role === 'creator';
  const monthLabel = monthInputToLabel(monthValue);

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
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);

        const parsed = data
          .map((row) => ({
            sku: String(pick(row, ['Mã', 'Mã SKU', 'Ma', 'Ma SKU', 'Mã LK']) || '').trim(),
            name: String(pick(row, ['Tên', 'Tên SP', 'Ten']) || '').trim(),
            cost: parseNum(pick(row, ['Giá vốn', 'Giá ưu tiên', 'Gia von', 'Cost']))
          }))
          .filter((r) => r.sku);

        setRows(parsed);
        if (!parsed.length) toast.error('Không đọc được dòng nào — kiểm tra file có đúng cột "Mã" không.');
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
      const result = await api.importCostExcel(token, monthLabel, rows);
      toast.success(`Đã cập nhật ${result.updatedCount} mã, thêm mới ${result.addedCount} mã cho tháng ${result.monthLabel}.`);
      setConfirming(false);
      setRows([]);
      setFileName('');
      if (onImported) onImported();
    } catch (err) {
      toast.error('Không nhập được giá vốn: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  if (!canImport) {
    return (
      <div className="glass-card" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: 'var(--warning-text)', background: 'var(--warning-bg)' }}>
        <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>Chỉ Creator mới có quyền nhập giá vốn.</span>
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
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Tải file Excel Giá Vốn</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            File kế toán gửi, chứa cột <strong>Mã</strong>, <strong>Tên</strong>, <strong>Giá vốn</strong> (chưa VAT).
          </p>
        </div>

        <div className="form-group" style={{ margin: 0, width: '220px' }}>
          <label className="form-label">Tháng áp dụng:</label>
          <input type="month" className="input-field" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
        </div>

        <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} id="cost-excel-input" style={{ display: 'none' }} disabled={!monthValue} />
        <label htmlFor="cost-excel-input" className={`btn btn-primary ${monthValue ? '' : 'btn-disabled'}`} style={{ cursor: monthValue ? 'pointer' : 'not-allowed', opacity: monthValue ? 1 : 0.5 }}>
          {isParsing ? 'Đang đọc file...' : 'Chọn File Excel Từ Máy Tính'}
        </label>
        {!monthValue && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Chọn tháng áp dụng trước khi tải file.</span>}
        {fileName && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{fileName}</span>}
      </div>

      {rows.length > 0 && (
        <div className="glass-card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Xem trước ({rows.length.toLocaleString('vi-VN')} mã) — Tháng {monthLabel}</h3>
            <button onClick={() => setConfirming(true)} className="btn btn-emerald">
              <ArrowRight size={16} /> Đồng Bộ Lên Google Sheet
            </button>
          </div>

          <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Tên</th>
                  <th style={{ textAlign: 'right' }}>Giá vốn (chưa VAT)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={`${r.sku}_${idx}`}>
                    <td className="code-font" style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{r.sku}</td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{fmt(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Đồng bộ giá vốn tháng ${monthLabel}?`}
          message={`Sẽ cập nhật/thêm mới ${rows.length} mã vào tab "Cost" cho tháng ${monthLabel}. Nếu mã nào đã có dữ liệu đúng tháng này thì bị ghi đè; các tháng khác không đổi.`}
          confirmLabel={isImporting ? 'Đang đồng bộ...' : 'Đồng bộ'}
          onConfirm={handleImport}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
