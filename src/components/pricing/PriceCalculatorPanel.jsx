import React, { useState, useMemo } from 'react';
import { Search, Calculator, AlertTriangle } from 'lucide-react';
import * as api from '../../services/api';
import { useToast } from '../ToastProvider';

const fmt = (v) => (v || 0).toLocaleString('vi-VN');

// Admin/Creator dùng giúp Sale: chọn 1 SKU + % LNG mong muốn -> giá bán gợi ý
// (đã gồm VAT). KHÔNG hiện số giá vốn thật ở đây (kể cả với Admin) — chỉ
// Creator mới xem giá vốn thật, ở màn Chờ Duyệt bảng giá.
export default function PriceCalculatorPanel({ token, materials }) {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [marginPct, setMarginPct] = useState('20');
  const [result, setResult] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const matches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return materials
      .filter((m) => m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q) || (m.alias || '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [materials, searchTerm]);

  const selectedMaterial = materials.find((m) => m.sku === selectedSku);

  const handleCalculate = async () => {
    if (!selectedSku) return;
    setIsCalculating(true);
    setResult(null);
    try {
      const res = await api.calculateSuggestedPrice(token, selectedSku, Number(marginPct));
      setResult(res);
    } catch (err) {
      toast.error('Không tính được: ' + err.message);
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '560px' }}>
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Calculator size={18} color="var(--karofi-cyan)" /> Công Cụ Tính Giá Gợi Ý
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
          Chọn 1 SKU + % LNG mong muốn để ra giá bán đề xuất (đã gồm VAT) — dùng để báo giá giúp Sale, không hiện số giá vốn thật.
        </p>

        <div style={{ position: 'relative' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" className="input-field" style={{ paddingLeft: '36px' }}
            placeholder="Tìm mã SKU, tên, alias..."
            value={selectedMaterial ? `${selectedMaterial.sku} — ${selectedMaterial.name}` : searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setSelectedSku(''); setResult(null); }}
          />
        </div>

        {!selectedSku && matches.length > 0 && (
          <div className="table-container" style={{ maxHeight: '220px', overflowY: 'auto' }}>
            <table className="custom-table">
              <tbody>
                {matches.map((m) => (
                  <tr key={m.sku} style={{ cursor: 'pointer' }} onClick={() => { setSelectedSku(m.sku); setSearchTerm(''); setResult(null); }}>
                    <td className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.8rem' }}>{m.sku}</td>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">% LNG mong muốn:</label>
          <input type="number" className="input-field" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} />
        </div>

        <button onClick={handleCalculate} disabled={!selectedSku || isCalculating} className="btn btn-primary">
          <Calculator size={16} /> {isCalculating ? 'Đang tính...' : 'Tính Giá Gợi Ý'}
        </button>
      </div>

      {result && (
        <div className="glass-card animate-fade-in">
          {!result.hasCost ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: 'var(--warning-text)' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>SKU này chưa có giá vốn nào trong tab "Cost" — Creator cần nhập tay giá vốn trước khi dùng công cụ này cho mã này.</span>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Giá bán gợi ý (đã gồm VAT)</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--karofi-navy)', fontFamily: "'JetBrains Mono', monospace" }}>
                {fmt(result.suggestedPriceWithVat)} đ
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Theo giá vốn tháng {result.monthLabel} + {marginPct}% LNG
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
