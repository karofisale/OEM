import React, { useState, useMemo } from 'react';
import {
  Bot,
  Sparkles,
  Upload,
  Copy,
  Check,
  FileText,
  RefreshCw,
  ShoppingCart,
  Save,
  Loader2
} from 'lucide-react';
import {
  parseOrderTextToSAP,
  generateSAPCopyString,
  extractTextFromImage,
  getHistoricalUnitPrice,
  isNewAliasWorthLearning,
  VAT_RATE
} from '../services/aiAgent';
import * as api from '../services/api';

// Searchable Mã VT cell — free-type by code, name, or alias, so a wrong AI match
// can be corrected without hunting through the full 440+ SKU catalogue.
function SkuPickerCell({ item, materials, onSelect }) {
  const [query, setQuery] = useState(`${item.sku} - ${item.name}`);
  const [showDropdown, setShowDropdown] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = !q ? materials : materials.filter(m =>
      m.sku.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      (m.alias || '').toLowerCase().includes(q)
    );
    return pool.slice(0, 30);
  }, [materials, query]);

  const handleSelect = (m) => {
    setQuery(`${m.sku} - ${m.name}`);
    setShowDropdown(false);
    onSelect(m);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input-field code-font"
        style={{ padding: '4px 8px', fontSize: '0.775rem', fontWeight: 700, color: '#0369a1' }}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
        onFocus={(e) => { e.target.select(); setShowDropdown(true); }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="Tìm theo mã hoặc tên..."
      />
      {showDropdown && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: '280px', zIndex: 30,
          background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)', maxHeight: '240px', overflowY: 'auto'
        }}>
          {matches.map(m => (
            <div
              key={m.sku}
              onMouseDown={() => handleSelect(m)}
              style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
            >
              <div className="code-font" style={{ fontWeight: 700, color: '#00a0e9', fontSize: '0.775rem' }}>{m.sku}</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                {m.name}{m.alias ? ` (${m.alias})` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AIOrderAgent({ clients, materials, transactions, token }) {
  const [promptText, setPromptText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [ocrStatus, setOcrStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Processed order state — starts empty until Sale actually enters a command.
  const [orderResult, setOrderResult] = useState(null);

  // Handle Text Prompt Submission
  const handleGenerateOrder = () => {
    setIsProcessing(true);
    setSaved(false);
    setTimeout(() => {
      const result = parseOrderTextToSAP({
        textInput: promptText,
        clientList: clients,
        materialsCatalog: materials,
        transactions: transactions
      });
      setOrderResult(result);
      setIsProcessing(false);
    }, 400);
  };

  // Handle Image Upload & OCR
  const MAX_OCR_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — larger images can hang the tab during OCR

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_OCR_IMAGE_BYTES) {
      alert(`Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Vui lòng chọn ảnh dưới 8MB để tránh treo trình duyệt khi quét OCR.`);
      e.target.value = '';
      return;
    }
    setImageFile(file);
    setIsProcessing(true);
    setSaved(false);
    setOcrStatus('Đang quét OCR nhận diện chữ trên hình ảnh...');

    try {
      const extractedText = await extractTextFromImage(file, (msg) => setOcrStatus(msg));
      setPromptText(extractedText || 'Đơn hàng từ ảnh chụp');

      const result = parseOrderTextToSAP({
        textInput: extractedText,
        clientList: clients,
        materialsCatalog: materials,
        transactions: transactions
      });
      setOrderResult(result);
    } catch (err) {
      alert(err.message || 'Lỗi đọc ảnh.');
    } finally {
      setIsProcessing(false);
      setOcrStatus('');
    }
  };

  // Handle Copy TSV for SAP
  const handleCopySAP = () => {
    const tsv = generateSAPCopyString(orderResult);
    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Item quantity or price update in Review
  const handleUpdateItem = (id, field, value) => {
    const updatedItems = orderResult.items.map(item => {
      if (item.id === id) {
        const val = parseFloat(value) || 0;
        const updated = { ...item, [field]: val };
        updated.total = updated.qty * updated.price * VAT_RATE;
        return updated;
      }
      return item;
    });

    const newGrandTotal = updatedItems.reduce((sum, i) => sum + i.total, 0);
    setOrderResult({ ...orderResult, items: updatedItems, grandTotal: newGrandTotal });
    setSaved(false);
  };

  // Manual SKU correction — this is also the AI's learning signal: the original
  // free-text term (item.sourceQuery) gets tied to the SKU the human actually picked,
  // so a future order using the same wording matches correctly on the first try
  // (see aiAgent.js isNewAliasWorthLearning + findMatchingMaterial's learnedAliases check).
  const handleSkuChange = (itemId, material) => {
    const updatedItems = orderResult.items.map(item => {
      if (item.id !== itemId) return item;
      const price = getHistoricalUnitPrice(orderResult.client.name, material.sku, transactions, material.avgPrice);
      return {
        ...item,
        sku: material.sku,
        name: material.name,
        unit: material.unit || 'PC',
        price,
        total: item.qty * price * VAT_RATE,
        confidence: 'Đã sửa thủ công',
        matchedAlias: isNewAliasWorthLearning(item.sourceQuery, material) ? item.sourceQuery : ''
      };
    });

    const newGrandTotal = updatedItems.reduce((sum, i) => sum + i.total, 0);
    setOrderResult({ ...orderResult, items: updatedItems, grandTotal: newGrandTotal });
    setSaved(false);
  };

  const handleSaveOrder = async () => {
    if (!orderResult || !orderResult.items.length || isSaving) return;
    setIsSaving(true);
    try {
      await api.saveOrder(token, orderResult);
      setSaved(true);
    } catch (err) {
      alert('Không lưu được đơn hàng lên Google Sheet (tab Orders): ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div className="glass-card" style={{
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(139, 92, 246, 0.15))',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #2563eb, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)'
          }}>
            <Bot size={28} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>AI Agent Đặt Hàng Thông Minh (SAP Order Builder)</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Nhập lệnh văn bản tự nhiên hoặc tải ảnh chụp chữ viết tay ➔ AI tự tra cứu Mã SP, Alias & Giá lịch sử ➔ Tạo bảng đơn hàng SAP.
            </p>
          </div>
        </div>

        <span className="badge badge-purple" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
          <Sparkles size={14} /> AI Powered v2.4
        </span>
      </div>

      {/* Main 2-Column Grid */}
      <div className="ai-agent-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '24px' }}>

        {/* Left Column: Input Prompt & OCR */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="#3b82f6" /> 1. Lệnh Đặt Hàng từ Sale
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Text / Ảnh viết tay</span>
          </div>

          {/* Prompt Textarea */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nội dung câu lệnh hoặc ghi chú đơn hàng:</label>
            <textarea
              rows={5}
              className="input-field"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="VD: Lên đơn cho khách hàng Tecom 500 cái màng RO 100G và 100 phin lọc 2 đầu..."
              style={{ resize: 'vertical', fontFamily: 'inherit', border: '1.5px solid #94a3b8' }}
            />
          </div>

          {/* OCR Image Dropzone */}
          <div style={{
            border: '2px dashed var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            textAlign: 'center',
            background: 'rgba(0,0,0,0.15)',
            cursor: 'pointer'
          }}>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              id="ocr-upload"
              style={{ display: 'none' }}
            />
            <label htmlFor="ocr-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <Upload size={24} color="#06b6d4" />
              <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Tải ảnh chụp đơn hàng / Chữ viết tay (OCR)
              </span>
              <span style={{ fontSize: '0.725rem', color: 'var(--text-dim)' }}>
                Tự động nhận diện chữ tiếng Việt và tạo danh mục đơn
              </span>
            </label>
          </div>

          {ocrStatus && (
            <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={14} className="animate-spin" /> {ocrStatus}
            </div>
          )}

          {/* Process Button */}
          <button
            onClick={handleGenerateOrder}
            disabled={isProcessing || !promptText.trim()}
            className="btn btn-accent"
            style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}
          >
            {isProcessing ? (
              <>
                <RefreshCw size={18} className="animate-spin" /> AI Đang Tra Cứu & Tính Giá...
              </>
            ) : (
              <>
                <Sparkles size={18} /> Phân Tích & Phân Hạng Đơn SAP
              </>
            )}
          </button>
        </div>

        {/* Right Column: Generated SAP Order Preview & Review */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingCart size={18} color="#10b981" /> 2. Danh Sách Đơn Hàng Chuẩn SAP
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Admin kiểm tra & chỉnh sửa trước khi copy vào SAP</p>
            </div>

            {orderResult && (
              <button
                onClick={handleCopySAP}
                className="btn btn-emerald btn-sm"
                title="Sao chép toàn bộ dòng định dạng Tab-Separated dán thẳng vào SAP"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Đã Sao Chép SAP!' : 'Copy Dán Về SAP'}
              </button>
            )}
          </div>

          {!orderResult ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Nhập lệnh đặt hàng bên trái rồi bấm "Phân Tích & Phân Hạng Đơn SAP" để tạo bảng đơn hàng.
            </div>
          ) : (
            <>
              {/* Client & Meta Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                background: 'var(--bg-input)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.825rem'
              }}>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Khách hàng OEM:</span>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{orderResult.client.name}</div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--accent-cyan)' }}>Mã KH: {orderResult.client.code}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Mã tham chiếu SAP SO:</span>
                  <div className="code-font" style={{ fontWeight: 700, color: 'var(--accent-purple)' }}>{orderResult.orderNo}</div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-dim)' }}>{orderResult.timestamp}</span>
                </div>
              </div>

              {/* Order Items Table */}
              <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                <table className="custom-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '190px' }}>Mã VT (SAP SKU)</th>
                      <th>Tên Vật Tư</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Số Lượng</th>
                      <th style={{ width: '130px', textAlign: 'right' }}>Đơn Giá (VND)</th>
                      <th style={{ width: '140px', textAlign: 'right' }}>Thành Tiền (VND)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderResult.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <SkuPickerCell item={item} materials={materials} onSelect={(m) => handleSkuChange(item.id, m)} />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>{item.name}</div>
                          <span className="badge badge-purple" style={{ fontSize: '0.625rem' }}>{item.confidence}</span>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={item.qty}
                            onChange={(e) => handleUpdateItem(item.id, 'qty', e.target.value)}
                            className="input-field"
                            style={{ padding: '4px 6px', fontSize: '0.78rem', textAlign: 'right' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={item.price}
                            onChange={(e) => handleUpdateItem(item.id, 'price', e.target.value)}
                            className="input-field"
                            style={{ padding: '4px 6px', fontSize: '0.78rem', textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-emerald)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {Math.round(item.total).toLocaleString('vi-VN')} ₫
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Grand Total Footer */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--bg-card-hover)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)'
              }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Tổng Giá Trị Đơn Hàng (Đã gồm VAT 8%):
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399' }}>
                  {Math.round(orderResult.grandTotal).toLocaleString('vi-VN')} ₫
                </span>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveOrder}
                disabled={isSaving}
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px' }}
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : (saved ? <Check size={18} /> : <Save size={18} />)}
                {isSaving ? 'Đang lưu...' : (saved ? 'Đã Lưu Vào Google Sheet!' : 'Lưu Đơn Về Tab Orders')}
              </button>

              {/* Admin SAP Copy Note */}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', background: 'rgba(59, 130, 246, 0.08)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
                💡 <strong>Hướng dẫn dán vào SAP:</strong> Bấm <strong>"Copy Dán Về SAP"</strong> ở trên, mở màn hình tạo Sales Order trong SAP GUI (VA01) hoặc SAP Web Client, click chuột vào ô đầu tiên của bảng vật tư và bấm <code>Ctrl + V</code>. Sau khi lưu, Sale/Admin có thể vào mục "Đơn Hàng Chờ Duyệt" để rà soát lại và copy từ đó.
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
