import React, { useState } from 'react';
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
  Loader2,
  PlusCircle
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
import SkuPickerCell from './SkuPickerCell';
import ClientPickerCell from './ClientPickerCell';
import RowActionButtons from './RowActionButtons';

const createBlankItem = () => ({
  id: 'ITEM-' + Math.random().toString(36).substr(2, 6),
  sku: '',
  name: '',
  unit: 'PC',
  qty: 1,
  price: 0,
  total: 0,
  confidence: 'Thêm thủ công',
  sourceQuery: '',
  matchedAlias: ''
});

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

  // Handle Image Upload & OCR — shared by the file-picker button and pasting
  // an image directly into the textarea (Ctrl+V), so both paths run the same
  // size check + OCR + parse flow.
  const MAX_OCR_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — larger images can hang the tab during OCR

  const processImageFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_OCR_IMAGE_BYTES) {
      alert(`Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Vui lòng chọn ảnh dưới 8MB để tránh treo trình duyệt khi quét OCR.`);
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

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_OCR_IMAGE_BYTES) e.target.value = '';
    processImageFile(file);
  };

  // Ctrl+V into the textarea with an image on the clipboard (screenshot, or
  // copied straight from Zalo/Messenger) skips the file-picker entirely —
  // same OCR pipeline as "Tải Ảnh". Falls through to normal text paste when
  // the clipboard holds no image.
  const handlePasteImage = (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.startsWith('image/')) {
        e.preventDefault();
        processImageFile(items[i].getAsFile());
        return;
      }
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

  // Manual client correction — mirrors the "chưa xác định khách hàng" placeholder
  // findMatchingClient can leave behind; re-prices every item against the newly
  // picked client's history since Đơn Giá is client-specific (see handleSkuChange).
  const handleClientChange = (client) => {
    const updatedItems = orderResult.items.map(item => {
      const price = getHistoricalUnitPrice(client.name, item.sku, transactions, item.price);
      return { ...item, price, total: item.qty * price * VAT_RATE };
    });
    const newGrandTotal = updatedItems.reduce((sum, i) => sum + i.total, 0);
    setOrderResult({ ...orderResult, client, items: updatedItems, grandTotal: newGrandTotal });
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

  // Insert an empty line (Sale fills it via SkuPickerCell) above/below a given item —
  // covers the "bộ sản phẩm kèm theo" case where AI only caught the main SKU.
  const handleInsertItem = (targetId, position) => {
    const idx = orderResult.items.findIndex(i => i.id === targetId);
    const insertAt = position === 'above' ? idx : idx + 1;
    const newItems = [...orderResult.items];
    newItems.splice(insertAt, 0, createBlankItem());
    setOrderResult({ ...orderResult, items: newItems });
    setSaved(false);
  };

  const handleAppendItem = () => {
    setOrderResult({ ...orderResult, items: [...orderResult.items, createBlankItem()] });
    setSaved(false);
  };

  const handleDeleteItem = (id) => {
    const newItems = orderResult.items.filter(i => i.id !== id);
    const newGrandTotal = newItems.reduce((sum, i) => sum + i.total, 0);
    setOrderResult({ ...orderResult, items: newItems, grandTotal: newGrandTotal });
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
              Nhập lệnh văn bản tự nhiên, tải ảnh chụp chữ viết tay, hoặc dán ảnh trực tiếp (Ctrl+V) ➔ AI tự tra cứu Mã SP, Alias & Giá lịch sử ➔ Tạo bảng đơn hàng SAP.
            </p>
          </div>
        </div>

        <span className="badge badge-purple" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
          <Sparkles size={14} /> AI Powered v2.4
        </span>
      </div>

      {/* Stacked layout: input command up top (full width), SAP order table below
          gets full width too so Số Lượng/Đơn Giá/Thành Tiền have room to breathe. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Input Prompt & OCR */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="#3b82f6" /> 1. Lệnh Đặt Hàng từ Sale
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Text / Ảnh viết tay (dán Ctrl+V hoặc tải lên)</span>
          </div>

          {/* Prompt textarea + compact tải ảnh/phân tích actions side by side —
              saves the vertical height the old full-size OCR dropzone + full-width
              button used to take. */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
            <div className="form-group" style={{ margin: 0, flex: 1 }}>
              <label className="form-label">Nội dung câu lệnh hoặc ghi chú đơn hàng:</label>
              <textarea
                rows={5}
                className="input-field"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onPaste={handlePasteImage}
                placeholder="VD: Lên đơn cho khách hàng Tecom 500 cái màng RO 100G và 100 phin lọc 2 đầu... (hoặc dán ảnh trực tiếp bằng Ctrl+V)"
                style={{ resize: 'vertical', fontFamily: 'inherit', border: '1.5px solid #94a3b8' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '150px', justifyContent: 'flex-end' }}>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                id="ocr-upload"
                style={{ display: 'none' }}
              />
              <label
                htmlFor="ocr-upload"
                className="btn btn-secondary btn-sm"
                style={{ cursor: 'pointer', justifyContent: 'center' }}
                title="Tải ảnh chụp đơn hàng / chữ viết tay (OCR)"
              >
                <Upload size={14} /> Tải Ảnh
              </label>

              <button
                onClick={handleGenerateOrder}
                disabled={isProcessing || !promptText.trim()}
                className="btn btn-accent btn-sm"
                style={{ justifyContent: 'center' }}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Đang xử lý...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> Phân Tích
                  </>
                )}
              </button>
            </div>
          </div>

          {ocrStatus && (
            <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={14} className="animate-spin" /> {ocrStatus}
            </div>
          )}
        </div>

        {/* Generated SAP Order Preview & Review — full width */}
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
                  <ClientPickerCell
                    code={orderResult.client.code}
                    name={orderResult.client.name}
                    clients={clients}
                    onSelect={handleClientChange}
                  />
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
                      <th style={{ width: '110px' }}>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderResult.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <SkuPickerCell sku={item.sku} name={item.name} materials={materials} onSelect={(m) => handleSkuChange(item.id, m)} />
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
                        <td>
                          <RowActionButtons
                            onInsertAbove={() => handleInsertItem(item.id, 'above')}
                            onInsertBelow={() => handleInsertItem(item.id, 'below')}
                            onDelete={() => handleDeleteItem(item.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button onClick={handleAppendItem} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
                <PlusCircle size={14} /> Thêm Dòng
              </button>

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
