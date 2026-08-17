import React, { useState } from 'react';
import { 
  Bot, 
  Sparkles, 
  Upload, 
  Copy, 
  Check, 
  FileText, 
  RefreshCw, 
  AlertCircle, 
  ShoppingCart, 
  DollarSign, 
  Building2, 
  Layers,
  ArrowRight
} from 'lucide-react';
import { 
  parseOrderTextToSAP, 
  generateSAPCopyString, 
  extractTextFromImage 
} from '../services/aiAgent';

export default function AIOrderAgent({ clients, materials, transactions }) {
  const [promptText, setPromptText] = useState(
    'Lên đơn cho Makxim 300 cái Block Qiangsheng QD25H và 200 phin lọc 2 đầu giá đợt trước'
  );
  const [selectedClient, setSelectedClient] = useState(clients[0]?.name || '');
  const [imageFile, setImageFile] = useState(null);
  const [ocrStatus, setOcrStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Processed order state
  const [orderResult, setOrderResult] = useState(() => {
    return parseOrderTextToSAP({
      textInput: 'Lên đơn cho Makxim 300 cái Block Qiangsheng QD25H và 200 phin lọc 2 đầu giá đợt trước',
      clientList: clients,
      materialsCatalog: materials,
      transactions: transactions
    });
  });

  // Handle Text Prompt Submission
  const handleGenerateOrder = () => {
    setIsProcessing(true);
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
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setIsProcessing(true);
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
        updated.total = updated.qty * updated.price;
        return updated;
      }
      return item;
    });

    const newGrandTotal = updatedItems.reduce((sum, i) => sum + i.total, 0);
    setOrderResult({
      ...orderResult,
      items: updatedItems,
      grandTotal: newGrandTotal
    });
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '24px' }}>
        
        {/* Left Column: Input Prompt & OCR */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="#3b82f6" /> 1. Lệnh Đặt Hàng từ Sale
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Text / Ảnh viết tay</span>
          </div>

          {/* Quick Preset Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setPromptText('Lên đơn cho Makxim 300 cái Block Qiangsheng QD25H và 200 phin lọc 2 đầu giá đợt trước')}
            >
              📝 Đơn Makxim (Block & Phin)
            </button>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setPromptText('Khách Tecom cần gấp 100 màng RO 100 GPD Karofi OEM và 500 phin lọc')}
            >
              📝 Đơn Tecom (Màng RO)
            </button>
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
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
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

            <button 
              onClick={handleCopySAP}
              className="btn btn-emerald btn-sm"
              title="Sao chép toàn bộ dòng định dạng Tab-Separated dán thẳng vào SAP"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Đã Sao Chép SAP!' : 'Copy Dán Về SAP'}
            </button>
          </div>

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
              <div style={{ fontWeight: 700, color: '#fff' }}>{orderResult.client.name}</div>
              <span style={{ fontSize: '0.725rem', color: 'var(--accent-cyan)' }}>Mã KH: {orderResult.client.code}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-dim)' }}>Mã tham chiếu SAP SO:</span>
              <div className="code-font" style={{ fontWeight: 700, color: 'var(--accent-purple)' }}>{orderResult.orderNo}</div>
              <span style={{ fontSize: '0.725rem', color: 'var(--text-dim)' }}>{orderResult.timestamp}</span>
            </div>
          </div>

          {/* Order Items Table */}
          <div className="table-container" style={{ maxHeight: '320px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Mã VT (SAP SKU)</th>
                  <th>Tên Vật Tư</th>
                  <th style={{ width: '80px' }}>Số Lượng</th>
                  <th style={{ width: '110px' }}>Đơn Giá (VND)</th>
                  <th>Thành Tiền (VND)</th>
                </tr>
              </thead>
              <tbody>
                {orderResult.items.map((item) => (
                  <tr key={item.id}>
                    <td className="code-font" style={{ fontWeight: 600, color: '#60a5fa' }}>
                      {item.sku}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>{item.confidence}</span>
                    </td>
                    <td>
                      <input 
                        type="number" 
                        value={item.qty}
                        onChange={(e) => handleUpdateItem(item.id, 'qty', e.target.value)}
                        className="input-field"
                        style={{ padding: '4px 8px', fontSize: '0.8rem', textAlign: 'center' }}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        value={item.price}
                        onChange={(e) => handleUpdateItem(item.id, 'price', e.target.value)}
                        className="input-field"
                        style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                      />
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
                      {item.total.toLocaleString('vi-VN')} ₫
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
              Tổng Giá Trị Đơn Hàng (Trước VAT):
            </span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399' }}>
              {orderResult.grandTotal.toLocaleString('vi-VN')} ₫
            </span>
          </div>

          {/* Admin SAP Copy Note */}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', background: 'rgba(59, 130, 246, 0.08)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
            💡 <strong>Hướng dẫn dán vào SAP:</strong> Bấm <strong>"Copy Dán Về SAP"</strong> ở trên, mở màn hình tạo Sales Order trong SAP GUI (VA01) hoặc SAP Web Client, click chuột vào ô đầu tiên của bảng vật tư và bấm <code>Ctrl + V</code>.
          </div>
        </div>

      </div>
    </div>
  );
}
