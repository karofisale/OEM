import React, { useState } from 'react';
import { Upload, ArrowRight, ShieldAlert } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';

const fmt = (v) => (v || 0).toLocaleString('vi-VN');

// "T7.26" hoặc "T07.26" -> { month, year, sortValue } (year quy về 20xx).
// Không match các tab khác trong file (vd "ZSD405_2022", "CK", "Thẻ Z"...).
function parseTabMonth(name) {
  const m = /^T\s*(\d{1,2})\.(\d{2})$/.exec(String(name).trim());
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const year = 2000 + parseInt(m[2], 10);
  return { month, year, sortValue: year * 12 + month };
}

// -> "T07.2026", đúng định dạng tab "Cost" (luôn 2 chữ số tháng + 4 chữ số năm,
// dù tên tab nguồn có thể là "T7.26" thiếu số 0).
function formatCostMonthLabel(parsed) {
  return `T${String(parsed.month).padStart(2, '0')}.${parsed.year}`;
}

// File LNG KDNĐ thật (kiểm tra trực tiếp 2026-08-26) có 1 tab RIÊNG cho mỗi
// tháng (tên dạng "T07.26"), lẫn với vài tab khác không phải dữ liệu tháng
// ("ZSD405_2022", "CK", "Ghi chú", "Thẻ Z"...). Mỗi tab tháng có vài dòng tiêu
// đề/tổng cộng phía trên, rồi mới đến dòng tiêu đề thật (tìm ô "Mã"), và cột
// chứa giá vốn ĐỔI VỊ TRÍ giữa các tháng (tháng có "Giá ưu tiên", tháng khác
// chỉ có "Giá vốn" ở cột khác hẳn) — nên đọc theo TÊN cột trong đúng dòng
// tiêu đề của THÁNG ĐÓ, không cố định theo vị trí B/C/H.
function parseLatestMonthSheet(wb, XLSX) {
  const candidates = wb.SheetNames
    .map((name) => ({ name, parsed: parseTabMonth(name) }))
    .filter((c) => c.parsed);
  if (!candidates.length) return { monthLabel: '', rows: [] };

  candidates.sort((a, b) => b.parsed.sortValue - a.parsed.sortValue);
  const latest = candidates[0];
  const monthLabel = formatCostMonthLabel(latest.parsed);

  const raw = XLSX.utils.sheet_to_json(wb.Sheets[latest.name], { header: 1, raw: true, defval: '' });

  let headerRowIdx = -1, colSku = -1, colName = -1, colCost = -1;
  for (let i = 0; i < raw.length; i++) {
    const idx = raw[i].findIndex((c) => String(c).trim() === 'Mã');
    if (idx !== -1) {
      headerRowIdx = i;
      colSku = idx;
      colName = raw[i].findIndex((c) => String(c).trim() === 'Tên');
      colCost = raw[i].findIndex((c) => String(c).trim() === 'Giá ưu tiên');
      if (colCost === -1) colCost = raw[i].findIndex((c) => String(c).trim() === 'Giá vốn');
      break;
    }
  }
  if (headerRowIdx === -1 || colCost === -1) return { monthLabel, rows: [] };

  const rows = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    const sku = r[colSku];
    const name = r[colName];
    // Dòng "TỔNG CỘNG"/"Ck"/"Chiết khấu" xen giữa header và dữ liệu thật có
    // Mã không phải số nguyên SKU thật (vd tổng dạng thập phân "6.001628",
    // hoặc chữ "Ck") — SKU thật trong file này luôn là số nguyên lớn.
    if (typeof sku !== 'number' || sku < 1000) continue;
    if (!name || String(name).trim().toUpperCase() === 'TỔNG CỘNG') continue;
    rows.push({ sku, name: String(name).trim(), cost: Number(r[colCost]) || 0 });
  }
  return { monthLabel, rows };
}

// Creator-only — tải file Excel kế toán gửi (nhiều tab, 1 tab/tháng), TỰ TÌM
// tab tháng mới nhất trong file rồi đồng bộ vào tab "Cost" cho đúng tháng đó.
// Upsert theo (SKU, Tháng) ở backend — tải lại đúng tháng đó lần 2 sẽ ghi đè,
// không nhân đôi.
export default function CostImportPanel({ token, activeUser, onImported }) {
  const toast = useToast();
  const [monthLabel, setMonthLabel] = useState('');
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const canImport = activeUser.role === 'creator';

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setIsParsing(true);
    setRows([]);
    setMonthLabel('');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const result = parseLatestMonthSheet(wb, XLSX);

        setMonthLabel(result.monthLabel);
        setRows(result.rows);
        if (!result.monthLabel) toast.error('Không tìm thấy tab tháng nào trong file (tên tab phải dạng "T07.26").');
        else if (!result.rows.length) toast.error(`Tìm thấy tab tháng ${result.monthLabel} nhưng không đọc được dòng nào — kiểm tra lại cột "Mã"/"Giá ưu tiên".`);
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
      setMonthLabel('');
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
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Tải file Excel Giá Vốn (LNG KDNĐ)</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            File nhiều tab, mỗi tab 1 tháng (vd "T07.26") — tự động lấy đúng tab THÁNG MỚI NHẤT trong file, không cần chọn tay.
          </p>
        </div>

        <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} id="cost-excel-input" style={{ display: 'none' }} />
        <label htmlFor="cost-excel-input" className="btn btn-primary" style={{ cursor: 'pointer' }}>
          {isParsing ? 'Đang đọc file...' : 'Chọn File Excel Từ Máy Tính'}
        </label>
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
