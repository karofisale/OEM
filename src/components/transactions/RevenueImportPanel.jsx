import React, { useState } from 'react';
import { Upload, ArrowRight, AlertTriangle } from 'lucide-react';
import * as api from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { docLuoi } from '../../utils/zsd450';

/**
 * Nhập doanh thu từ file ZSD450 (xuất từ SAP) thẳng vào tab Data.
 *
 * Phần đọc và ánh xạ cột nằm ở `src/utils/zsd450.js` — logic thuần, không
 * React, để bộ test gọi thẳng được. File này chỉ lo giao diện và lượt gọi mạng.
 *
 * VÌ SAO KHÔNG GỬI CẢ FILE LÊN CHO MÁY CHỦ TỰ ĐỌC: Apps Script không đọc được
 * .xlsx nếu không đổ vào Drive trước, mà `xlsx` (SheetJS) vốn đã nằm trong gói
 * của app này cho màn Công nợ. Đọc ở trình duyệt còn cho XEM TRƯỚC trước khi
 * ghi — mà thao tác này XOÁ SẠCH một tháng, nên xem trước là bắt buộc.
 */

const fmt = (v) => (Number(v) || 0).toLocaleString('vi-VN');

export default function RevenueImportPanel({ token, activeUser, onImported }) {
  const toast = useToast();
  const [kq, setKq] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Không mở cho `account` như bên Công nợ: đây là bảng doanh thu gốc mà mọi
  // báo cáo và số tổng quan trên cổng đứng lên. Backend kiểm lại lần nữa —
  // ẩn nút chỉ là cho gọn màn hình, không phải phân quyền.
  const canImport = ['admin', 'creator'].includes(activeUser?.role);

  const chon = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setKq(null);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        // cellDates BẮT BUỘC — xem chú thích trong docLuoi.
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const luoi = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
        const r = docLuoi(luoi);
        setKq(r);

        if (r.thieuCot.length) {
          toast.error(`File thiếu ${r.thieuCot.length} cột so với tab Data — SAP có thể đã đổi layout.`);
        } else if (r.nhieuThang.length) {
          toast.error(`File chứa ${r.nhieuThang.length} tháng — chỉ nhận file của đúng một tháng.`);
        } else if (!r.rows.length) {
          toast.error('Không đọc được dòng dữ liệu nào.');
        }
      } catch (err) {
        toast.error('Lỗi đọc file Excel: ' + err.message);
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const nhap = async () => {
    setIsImporting(true);
    try {
      const r = await api.importRevenueExcel(token, kq.thang, kq.rows);
      toast.success(
        `Tháng ${kq.thang}: xoá ${fmt(r.rowsRemoved)} dòng cũ, ghi ${fmt(r.rowsAdded)} dòng mới vào tab Data.`
      );
      (r.warnings || []).forEach((w) => toast.error(w));
      setConfirming(false);
      setKq(null);
      setFileName('');
      if (onImported) onImported();
    } catch (err) {
      toast.error('Không nhập được doanh thu: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  if (!canImport) return null;

  const sanSang = kq && kq.rows.length > 0 && !kq.thieuCot.length && !kq.nhieuThang.length;
  const tongDt = kq ? kq.rows.reduce((s, r) => s + (Number(r[22]) || 0), 0) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Upload size={24} color="var(--accent-cyan)" />
        </div>
        <div style={{ flex: '1', minWidth: '260px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Nhập doanh thu từ file ZSD450</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Chọn file Excel vừa xuất từ SAP (T-code <strong>ZSD450</strong>, Sales Org 0400 / Distribution Channel 01)
            cho <strong>đúng một tháng</strong>. Tháng được lấy từ chính dữ liệu trong file, không phải chọn tay.
          </p>
        </div>
        <input type="file" accept=".xlsx,.xls" onChange={chon} id="zsd450-input" style={{ display: 'none' }} />
        <label htmlFor="zsd450-input" className="btn btn-primary" style={{ cursor: 'pointer' }}>
          {isParsing ? 'Đang đọc file...' : 'Chọn file ZSD450'}
        </label>
        {fileName && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{fileName}</span>}
      </div>

      {kq && kq.thieuCot.length > 0 && (
        <div className="glass-card" style={{ display: 'flex', gap: '10px', color: 'var(--critical-text, #DC2626)' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.85rem' }}>
            <strong>Thiếu {kq.thieuCot.length} cột so với tab Data</strong> — SAP có thể đã đổi layout của ZSD450.
            <div style={{ marginTop: '6px', color: 'var(--text-muted)' }}>{kq.thieuCot.join(' · ')}</div>
          </div>
        </div>
      )}

      {kq && kq.nhieuThang.length > 0 && (
        <div className="glass-card" style={{ display: 'flex', gap: '10px', color: 'var(--critical-text, #DC2626)' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.85rem' }}>
            <strong>File chứa nhiều tháng: {kq.nhieuThang.join(', ')}</strong>
            <div style={{ marginTop: '6px', color: 'var(--text-muted)' }}>
              Mỗi lượt nhập chỉ thay được đúng một tháng. Nhận cả file này thì dòng của tháng
              không được thay sẽ nằm cạnh dòng cũ của chính nó — thành nhân đôi. Xuất lại từ SAP theo từng tháng.
            </div>
          </div>
        </div>
      )}

      {sanSang && (
        <div className="glass-card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
                Xem trước — tháng {kq.thang}, {fmt(kq.rows.length)} dòng
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Tổng doanh thu thuần VND: <strong>{fmt(tongDt)}</strong>
                {kq.boQuaKhongPhaiNgay > 0 && ` · bỏ qua ${kq.boQuaKhongPhaiNgay} dòng không phải ngày`}
                {kq.boQuaKhachNoiBo > 0 && ` · bỏ qua ${kq.boQuaKhachNoiBo} dòng khách nội bộ`}
              </p>
            </div>
            <button onClick={() => setConfirming(true)} className="btn btn-emerald">
              <ArrowRight size={16} /> Ghi vào tab Data
            </button>
          </div>

          <div className="table-container" style={{ maxHeight: '380px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Mã khách</th>
                  <th>Tên khách</th>
                  <th>Mã vật tư</th>
                  <th>Tên vật tư</th>
                  <th style={{ textAlign: 'right' }}>SL xuất</th>
                  <th style={{ textAlign: 'right' }}>DT thuần VND</th>
                </tr>
              </thead>
              <tbody>
                {kq.xemTruoc.map((r, i) => (
                  <tr key={i}>
                    <td className="code-font">{r.ngay}</td>
                    <td className="code-font" style={{ color: 'var(--accent-purple)' }}>{r.maKhach}</td>
                    <td style={{ fontWeight: 600 }}>{r.tenKhach}</td>
                    <td className="code-font">{r.maVatTu}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.tenVatTu}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(r.sl)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{fmt(r.dtThuan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Hiện {Math.min(50, kq.rows.length)} dòng đầu. Bảy cột <strong>Tuần</strong>, <strong>DT thuần sau VAT</strong>,
            {' '}<strong>Mã KH chữ</strong>, <strong>Sale</strong>, <strong>Nhóm hàng hoá</strong>, <strong>Quý</strong>, <strong>PK</strong>
            {' '}do chính Sheet tính hoặc điền tay — lượt nhập này không đụng vào.
          </p>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Thay toàn bộ doanh thu tháng ${kq.thang}?`}
          message={
            `Toàn bộ dòng của tháng ${kq.thang} đang có trên tab "Data" sẽ bị XOÁ, ` +
            `rồi ghi vào ${fmt(kq.rows.length)} dòng từ file "${fileName}". ` +
            `Các tháng khác không bị ảnh hưởng. ` +
            `Chạy lại cùng file cho ra đúng cùng kết quả, nên nếu không chắc thì cứ chạy lại — ` +
            `nhưng hãy chắc file là bản xuất mới nhất từ SAP cho tháng này.`
          }
          confirmLabel={isImporting ? 'Đang ghi...' : 'Xoá và ghi lại tháng ' + kq.thang}
          destructive
          onConfirm={nhap}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
