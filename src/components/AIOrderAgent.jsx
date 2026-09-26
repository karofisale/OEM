import React, { useState, useRef } from 'react';
import {
  Bot,
  Sparkles,
  Paperclip,
  Copy,
  Check,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  RefreshCw,
  ShoppingCart,
  Save,
  Loader2,
  PlusCircle,
  X,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertTriangle,
  ArrowRightLeft
} from 'lucide-react';
import {
  findMatchingMaterial,
  generateSAPCopyString,
  getClientOrderedSkus,
  getHistoricalUnitPrice,
  isNewAliasWorthLearning,
  parseOrderTextToSAP,
  VAT_RATE
} from '../services/aiAgent';
import { chuanBiDinhKem, moTaKichThuoc } from '../utils/orderInput';
import * as api from '../services/api';
import { useToast } from './ToastProvider';
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
  matchedAlias: '',
  doiChieu: null
});

const KHACH_CHUA_RO = {
  name: '⚠️ Chưa xác định khách hàng — vui lòng chọn khách',
  code: '',
  codeSearch: '',
  alias: '',
  status: 'Active'
};

function ConfidenceBadge({ confidence }) {
  if (typeof confidence !== 'number') {
    return <span className="badge badge-purple" style={{ fontSize: '0.625rem' }}>{confidence}</span>;
  }
  const pct = Math.round(confidence * 100);
  const cls = confidence >= 0.8 ? 'badge-emerald' : confidence >= 0.5 ? 'badge-amber' : 'badge-rose';
  return <span className={`badge ${cls}`} style={{ fontSize: '0.625rem' }}>{pct}% tin cậy</span>;
}

// Kết quả đối chiếu chéo: AI (Gemini, ở backend) và bộ dò danh mục cục bộ
// (services/aiAgent.js) chạy độc lập trên CÙNG đoạn chữ gốc của dòng đó.
// Trùng nhau = tín hiệu mạnh hơn nhiều so với điểm model tự chấm cho mình.
function DoiChieuBadge({ doiChieu, onDoiSang }) {
  if (!doiChieu) return null;
  if (doiChieu.trangThai === 'khop') {
    return (
      <span className="badge badge-emerald" style={{ fontSize: '0.625rem' }} title="Bộ dò danh mục cục bộ cũng ra đúng mã này">
        <ShieldCheck size={11} /> Đã đối chiếu
      </span>
    );
  }
  if (doiChieu.trangThai === 'lech') {
    return (
      <button
        type="button"
        onClick={onDoiSang}
        className="badge badge-amber"
        style={{ fontSize: '0.625rem', cursor: 'pointer', border: 'none' }}
        title={`Bộ dò danh mục lại khớp "${doiChieu.sku} — ${doiChieu.name}". Bấm để đổi sang mã này.`}
      >
        <ArrowRightLeft size={11} /> Khác: {doiChieu.sku}
      </button>
    );
  }
  return (
    <span className="badge badge-purple" style={{ fontSize: '0.625rem' }} title="Bộ dò cục bộ không tìm được mã nào cho đoạn chữ này — chỉ AI nhận ra">
      Chỉ AI nhận ra
    </span>
  );
}

function IconDinhKem({ loai }) {
  if (loai === 'bang') return <FileSpreadsheet size={13} />;
  if (loai === 'pdf') return <FileText size={13} />;
  return <ImageIcon size={13} />;
}

export default function AIOrderAgent({ clients, materials, transactions, kits, token, onOrderSaved }) {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [promptText, setPromptText] = useState('');
  const [dinhKem, setDinhKem] = useState({ files: [], tables: [] });
  const [khachChon, setKhachChon] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [trangThai, setTrangThai] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hienDocText, setHienDocText] = useState(false);
  const [bangLui, setBangLui] = useState('');

  const [orderResult, setOrderResult] = useState(null);

  const tongDinhKem = dinhKem.files.length + dinhKem.tables.length;

  // ---------- Đính kèm ----------

  const themFile = async (fileList) => {
    if (!fileList || !fileList.length) return;
    setTrangThai('Đang xử lý file đính kèm...');
    try {
      const { files, tables, loi } = await chuanBiDinhKem(fileList);
      if (loi.length) loi.forEach((m) => toast.error(m));
      if (!files.length && !tables.length) return;
      setDinhKem((cu) => ({ files: [...cu.files, ...files], tables: [...cu.tables, ...tables] }));
      setSaved(false);
    } finally {
      setTrangThai('');
    }
  };

  const xoaDinhKem = (loai, idx) => {
    setDinhKem((cu) => ({
      ...cu,
      [loai]: cu[loai].filter((_, i) => i !== idx)
    }));
  };

  // Ctrl+V ảnh thẳng vào ô lệnh (ảnh chụp màn hình, hoặc copy từ Zalo/Messenger)
  // — cùng một đường với nút đính kèm. Clipboard không có ảnh thì để dán chữ
  // như bình thường.
  const handlePaste = (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const anh = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) anh.push(f);
      }
    }
    if (!anh.length) return;
    e.preventDefault();
    themFile(anh);
  };

  // ---------- Dựng bảng đơn từ kết quả ----------

  // Giá lấy theo lịch sử mua của chính khách đó (Đơn Giá là giá riêng từng
  // khách), không phải giá niêm yết — giữ nguyên cách cũ.
  const dungDong = (sku, name, unit, qty, confidence, sourceText, khach, doiChieu, note) => {
    const mat = materials.find((m) => m.sku === sku);
    const price = getHistoricalUnitPrice(khach.name || '', sku, transactions, (mat && mat.avgPrice) || 0);
    return {
      id: 'ITEM-' + Math.random().toString(36).substr(2, 6),
      sku,
      name: name || (mat && mat.name) || '',
      unit: unit || (mat && mat.unit) || 'PC',
      qty,
      price,
      total: qty * price * VAT_RATE,
      confidence,
      sourceQuery: sourceText || '',
      matchedAlias: mat && isNewAliasWorthLearning(sourceText, mat) ? sourceText : '',
      doiChieu,
      note: note || ''
    };
  };

  // Lớp chống sai thứ ba (hai lớp kia nằm ở backend: rút gọn danh mục trước
  // khi hỏi, và chặn mã bịa sau khi hỏi). Chạy lại bộ dò cục bộ trên chính
  // đoạn chữ gốc của từng dòng rồi so với mã AI chọn.
  const doiChieuDong = (sku, sourceText, skuDaMua) => {
    if (!sourceText || !sourceText.trim()) return null;
    const hit = findMatchingMaterial(sourceText, materials, skuDaMua, transactions);
    if (!hit) return { trangThai: 'khong-ro' };
    if (hit.material.sku === sku) return { trangThai: 'khop' };
    return { trangThai: 'lech', sku: hit.material.sku, name: hit.material.name };
  };

  const tinhTong = (items) => items.reduce((s, i) => s + i.total, 0);

  // ---------- Phân tích ----------

  const handleGenerateOrder = async () => {
    if (isProcessing) return;
    if (!promptText.trim() && !tongDinhKem) {
      toast.error('Chưa có gì để đọc — gõ lệnh, dán ảnh, hoặc đính kèm file Excel.');
      return;
    }

    setIsProcessing(true);
    setSaved(false);
    setBangLui('');
    setTrangThai(dinhKem.files.length ? 'AI đang đọc ảnh/PDF rồi ghép mã hàng...' : 'AI đang bóc tách đơn hàng...');

    try {
      const kq = await api.aiParseOrder(token, {
        text: promptText,
        files: dinhKem.files.map((f) => ({ data: f.data, mimeType: f.mimeType })),
        tables: dinhKem.tables.map((t) => ({ name: t.name, tsv: t.tsv })),
        clientCode: (khachChon && khachChon.code) || ''
      });

      const khach = kq.client || khachChon || KHACH_CHUA_RO;
      // Một lượt quét lịch sử cho cả bảng, không phải mỗi dòng một lượt —
      // getClientOrderedSkus duyệt toàn bộ tab Data.
      const skuDaMua = getClientOrderedSkus(khach, transactions);
      const items = (kq.items || []).map((it) =>
        dungDong(
          it.sku, it.name, it.unit, it.qty, it.confidence, it.sourceText,
          khach, doiChieuDong(it.sku, it.sourceText, skuDaMua), it.note
        )
      );

      setOrderResult({
        client: khach,
        orderNo: 'SAP-SO-' + Math.floor(100000 + Math.random() * 900000),
        items,
        grandTotal: tinhTong(items),
        timestamp: new Date().toLocaleString('vi-VN'),
        warnings: kq.warnings || [],
        docText: kq.docText || '',
        nguon: 'ai',
        catalogSize: kq.catalogSize
      });
    } catch (err) {
      // Đường lùi: hết hạn mức Gemini / chưa cấu hình khoá / mạng chập. Sale
      // vẫn lên được đơn từ phần chữ đã gõ + bảng Excel đã đọc, chỉ kém chính
      // xác hơn — và băng báo nói thẳng là đang chạy đường nào.
      const chuLui = [promptText, ...dinhKem.tables.map((t) => t.tsv)].filter(Boolean).join('\n');
      if (!chuLui.trim()) {
        toast.error(err.message || 'AI không đọc được đơn này.');
        setIsProcessing(false);
        setTrangThai('');
        return;
      }

      setBangLui(err.message || 'Không gọi được AI.');
      const local = parseOrderTextToSAP({
        textInput: chuLui,
        clientList: clients,
        materialsCatalog: materials,
        transactions,
        kits
      });
      const khach = khachChon || local.client;
      setOrderResult({
        ...local,
        client: khach,
        items: local.items.map((i) => ({ ...i, doiChieu: null, note: '' })),
        docText: chuLui,
        nguon: 'cuc-bo'
      });
    } finally {
      setIsProcessing(false);
      setTrangThai('');
    }
  };

  // ---------- Sửa tay trên bảng ----------

  const capNhatItems = (updatedItems) => {
    setOrderResult((cu) => ({ ...cu, items: updatedItems, grandTotal: tinhTong(updatedItems) }));
    setSaved(false);
  };

  const handleUpdateItem = (id, field, value) => {
    capNhatItems(orderResult.items.map((item) => {
      if (item.id !== id) return item;
      const val = parseFloat(value) || 0;
      const updated = { ...item, [field]: val };
      updated.total = updated.qty * updated.price * VAT_RATE;
      return updated;
    }));
  };

  // Đổi khách thì phải định giá lại cả bảng: Đơn Giá là giá riêng từng khách.
  const handleClientChange = (client) => {
    setKhachChon(client);
    if (!orderResult) return;
    const updatedItems = orderResult.items.map((item) => {
      const price = getHistoricalUnitPrice(client.name, item.sku, transactions, item.price);
      return { ...item, price, total: item.qty * price * VAT_RATE };
    });
    setOrderResult((cu) => ({ ...cu, client, items: updatedItems, grandTotal: tinhTong(updatedItems) }));
    setSaved(false);
  };

  // Sửa mã tay cũng là tín hiệu học: cụm chữ gốc (item.sourceQuery) được gắn
  // với mã người thật đã chọn, ghi vào cột "Update alias" của tab Orders để
  // lần sau khớp đúng ngay từ đầu (xem oemAppLoadOrderAliasHints_).
  const handleSkuChange = (itemId, material) => {
    capNhatItems(orderResult.items.map((item) => {
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
        matchedAlias: isNewAliasWorthLearning(item.sourceQuery, material) ? item.sourceQuery : '',
        doiChieu: null
      };
    }));
  };

  const handleInsertItem = (targetId, position) => {
    const idx = orderResult.items.findIndex((i) => i.id === targetId);
    const insertAt = position === 'above' ? idx : idx + 1;
    const newItems = [...orderResult.items];
    newItems.splice(insertAt, 0, createBlankItem());
    capNhatItems(newItems);
  };

  const handleAppendItem = () => capNhatItems([...orderResult.items, createBlankItem()]);

  const handleDeleteItem = (id) => capNhatItems(orderResult.items.filter((i) => i.id !== id));

  const handleCopySAP = () => {
    navigator.clipboard.writeText(generateSAPCopyString(orderResult));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveOrder = async () => {
    if (!orderResult || !orderResult.items.length || isSaving) return;
    if (!orderResult.client || !orderResult.client.code) {
      toast.error('Chưa xác định khách hàng — chọn Mã KH trước khi lưu.');
      return;
    }
    setIsSaving(true);
    try {
      await api.saveOrder(token, orderResult);
      setSaved(true);
      if (onOrderSaved) onOrderSaved();
    } catch (err) {
      toast.error('Không lưu được đơn hàng: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ---------- Giao diện ----------

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="glass-card" style={{
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(139, 92, 246, 0.15))',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #2563eb, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)'
          }}>
            <Bot size={28} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>AI nhận đơn</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Văn bản, ảnh chụp / viết tay, PDF, file Excel — AI đọc rồi khớp về mã SAP
            </p>
          </div>
        </div>

        <span className="badge badge-purple" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
          <Sparkles size={14} /> Gemini + đối chiếu danh mục
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* 1. Nguồn đơn hàng */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="#3b82f6" /> 1. Nội dung đơn hàng
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              Gõ lệnh, dán ảnh (Ctrl+V), hoặc đính kèm ảnh / PDF / Excel
            </span>
          </div>

          <div className="ai-order-input-row" style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
            <div className="form-group" style={{ margin: 0, flex: 1 }}>
              <label className="form-label">Lệnh đặt hàng hoặc ghi chú kèm theo:</label>
              <textarea
                rows={5}
                className="input-field ai-order-textarea"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onPaste={handlePaste}
                placeholder="VD: Lên đơn cho khách Tecom 500 cái màng RO 100G và 100 phin lọc 2 đầu... (hoặc dán ảnh trực tiếp bằng Ctrl+V)"
                style={{ resize: 'vertical', fontFamily: 'inherit', border: '1.5px solid var(--text-dim)' }}
              />
            </div>

            <div className="ai-order-input-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '170px', justifyContent: 'flex-end' }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.xlsx,.xls,.csv"
                onChange={(e) => { themFile(e.target.files); e.target.value = ''; }}
                id="don-dinh-kem"
                style={{ display: 'none' }}
              />
              <label
                htmlFor="don-dinh-kem"
                className="btn btn-secondary btn-sm"
                style={{ cursor: 'pointer', justifyContent: 'center' }}
                title="Đính kèm ảnh chụp đơn, PDF, hoặc file Excel/CSV"
              >
                <Paperclip size={14} /> Đính kèm
              </label>

              <button
                onClick={handleGenerateOrder}
                disabled={isProcessing || (!promptText.trim() && !tongDinhKem)}
                className="btn btn-accent btn-sm"
                style={{ justifyContent: 'center' }}
              >
                {isProcessing ? (
                  <><RefreshCw size={14} className="animate-spin" /> Đang đọc...</>
                ) : (
                  <><Sparkles size={14} /> Phân tích đơn</>
                )}
              </button>
            </div>
          </div>

          {/* Khách chọn sẵn: không bắt buộc, nhưng chọn trước thì backend ưu
              tiên đúng những mã khách này từng mua — cùng một cách gọi tắt
              trỏ về mã khác nhau tuỳ khách. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Khách hàng (chọn trước cho chính xác hơn):</span>
            <ClientPickerCell
              code={(khachChon && khachChon.code) || ''}
              name={(khachChon && khachChon.name) || ''}
              clients={clients}
              onSelect={handleClientChange}
            />
            {khachChon && (
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{khachChon.name}</span>
            )}
          </div>

          {tongDinhKem > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {dinhKem.files.map((f, i) => (
                <span key={`f${i}`} className="badge badge-purple" style={{ fontSize: '0.7rem', gap: '6px' }}>
                  <IconDinhKem loai={f.loai} /> {f.name} ({moTaKichThuoc(f.size)})
                  <button type="button" onClick={() => xoaDinhKem('files', i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }} title="Bỏ file này">
                    <X size={12} />
                  </button>
                </span>
              ))}
              {dinhKem.tables.map((t, i) => (
                <span key={`t${i}`} className="badge badge-emerald" style={{ fontSize: '0.7rem', gap: '6px' }}>
                  <IconDinhKem loai="bang" /> {t.name} ({t.soDong} dòng{t.catBot ? ', đã cắt bớt' : ''})
                  <button type="button" onClick={() => xoaDinhKem('tables', i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }} title="Bỏ bảng này">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {trangThai && (
            <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={14} className="animate-spin" /> {trangThai}
            </div>
          )}
        </div>

        {/* 2. Bảng đơn */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingCart size={18} color="var(--accent-emerald)" /> 2. Đơn hàng chuẩn SAP
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kiểm tra & chỉnh sửa trước khi lưu hoặc copy vào SAP</p>
            </div>

            {orderResult && (
              <button onClick={handleCopySAP} className="btn btn-emerald btn-sm" title="Sao chép toàn bộ dòng định dạng Tab-Separated dán thẳng vào SAP">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Đã sao chép!' : 'Copy dán về SAP'}
              </button>
            )}
          </div>

          {bangLui && (
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'flex-start',
              padding: '10px 14px', borderRadius: 'var(--radius-md)',
              background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '0.8rem'
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                <strong>Không gọi được AI, đang dùng bộ dò danh mục cục bộ.</strong> Kết quả kém chính xác hơn
                và KHÔNG đọc được ảnh/PDF — hãy soát kỹ từng dòng. Lý do: {bangLui}
              </span>
            </div>
          )}

          {!orderResult ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Nhập nội dung đơn ở trên rồi bấm "Phân tích đơn".
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
                background: 'var(--bg-input)', padding: '12px 16px',
                borderRadius: 'var(--radius-md)', fontSize: '0.825rem'
              }}>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Khách hàng OEM (Mã KH):</span>
                  <ClientPickerCell
                    code={orderResult.client.code}
                    name={orderResult.client.name}
                    clients={clients}
                    onSelect={handleClientChange}
                  />
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                    {orderResult.client.name}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Mã tham chiếu SAP SO:</span>
                  <div className="code-font" style={{ fontWeight: 700, color: 'var(--accent-purple)' }}>{orderResult.orderNo}</div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-dim)' }}>{orderResult.timestamp}</span>
                </div>
              </div>

              {/* Chữ AI thật sự đọc được. Mở ra là thấy ngay vì sao nó hiểu
                  sai — sửa lại rồi chạy lại, thay vì ngồi đoán. */}
              {orderResult.docText && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setHienDocText((v) => !v)}
                    className="btn btn-secondary btn-sm"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {hienDocText ? <EyeOff size={14} /> : <Eye size={14} />}
                    {hienDocText ? 'Ẩn nội dung AI đã đọc' : 'Xem nội dung AI đã đọc'}
                  </button>
                  {hienDocText && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <pre style={{
                        margin: 0, padding: '12px 14px', maxHeight: '220px', overflow: 'auto',
                        background: 'var(--bg-input)', borderRadius: 'var(--radius-md)',
                        fontSize: '0.75rem', whiteSpace: 'pre-wrap', fontFamily: 'inherit'
                      }}>{orderResult.docText}</pre>
                      <button
                        type="button"
                        onClick={() => { setPromptText(orderResult.docText); setDinhKem({ files: [], tables: [] }); }}
                        className="btn btn-secondary btn-sm"
                        style={{ alignSelf: 'flex-start' }}
                        title="Chép đoạn này vào ô lệnh để sửa lại chỗ đọc sai rồi phân tích lại"
                      >
                        <RefreshCw size={14} /> Sửa lại đoạn này rồi phân tích lại
                      </button>
                    </div>
                  )}
                </div>
              )}

              {orderResult.warnings && orderResult.warnings.length > 0 && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '6px',
                  padding: '10px 14px', borderRadius: 'var(--radius-md)',
                  background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '0.8rem'
                }}>
                  {orderResult.warnings.map((w, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px' }}>
                      <span>⚠️</span><span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="custom-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '190px' }}>Mã VT (SAP SKU)</th>
                      <th>Tên vật tư / đối chiếu</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Số lượng</th>
                      <th style={{ width: '130px', textAlign: 'right' }}>Đơn giá (VND)</th>
                      <th style={{ width: '140px', textAlign: 'right' }}>Thành tiền (VND)</th>
                      <th style={{ width: '110px' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderResult.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {/* key theo mã: Combobox chỉ đọc initialText lúc dựng,
                              nên khi mã bị đổi từ BÊN NGOÀI ô (bấm huy hiệu
                              "Khác: ..." để lấy gợi ý đối chiếu) thì phải dựng
                              lại, không thì ô vẫn hiện mã cũ trong khi tên sản
                              phẩm bên cạnh đã đổi. */}
                          <SkuPickerCell key={item.sku} sku={item.sku} name={item.name} materials={materials} onSelect={(m) => handleSkuChange(item.id, m)} />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>{item.name}</div>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                            <ConfidenceBadge confidence={item.confidence} />
                            <DoiChieuBadge
                              doiChieu={item.doiChieu}
                              onDoiSang={() => {
                                const m = materials.find((x) => x.sku === item.doiChieu.sku);
                                if (m) handleSkuChange(item.id, m);
                              }}
                            />
                          </div>
                          {item.sourceQuery && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }} title="Đoạn chữ gốc trong đơn sinh ra dòng này">
                              “{item.sourceQuery}”
                            </div>
                          )}
                          {item.note && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--warning-text)', marginTop: '2px' }}>{item.note}</div>
                          )}
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
                <PlusCircle size={14} /> Thêm dòng
              </button>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', background: 'var(--bg-card-hover)',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)'
              }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Tổng giá trị đơn hàng (đã gồm VAT 8%):
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-emerald-text)' }}>
                  {Math.round(orderResult.grandTotal).toLocaleString('vi-VN')} ₫
                </span>
              </div>

              <button onClick={handleSaveOrder} disabled={isSaving} className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : (saved ? <Check size={18} /> : <Save size={18} />)}
                {isSaving ? 'Đang lưu...' : (saved ? 'Đã lưu đơn!' : 'Lưu đơn')}
              </button>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', background: 'rgba(59, 130, 246, 0.08)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
                💡 <strong>Dán vào SAP:</strong> bấm <strong>"Copy dán về SAP"</strong>, mở màn hình tạo Sales Order trong SAP GUI (VA01),
                click vào ô đầu tiên của bảng vật tư rồi <code>Ctrl + V</code>. Sau khi lưu, vào mục "Đơn hàng chờ duyệt" để rà soát lại.
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
