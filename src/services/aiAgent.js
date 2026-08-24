// Order-building helpers around the Claude-backed parser (gas/Ai.gs).
//
// 2026-08-24: the free-text/OCR matching that used to live here (substring +
// word-overlap scoring, a hand-rolled client/product matcher, Tesseract.js
// OCR) was never actually "AI" in the language-model sense — see the audit.
// It's replaced by a real Claude call (gas/Ai.gs's record_order tool) that
// handles both text and images. What stays here is deterministic and doesn't
// belong in a prompt: historical pricing lookup, VAT math, and turning the
// model's structured result into the shape the review table expects.

// Thành Tiền / Tổng Giá Trị are shown VAT-inclusive per request; Đơn Giá stays pre-VAT.
export const VAT_RATE = 1.08;

// Fuzzy text matching helper — still used by the free-type "sửa mã" comboboxes
// below, which are plain client-side search widgets, not order parsing.
function similarityScore(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const common = words1.filter(w => w.length > 1 && s2.includes(w));
  return common.length / Math.max(words1.length, words2.length);
}

// Free-type search for the "sửa mã vật tư" comboboxes (AI Order Agent review table,
// Orders Chờ Duyệt page) — every typed word must appear SOMEWHERE in the SKU/name/
// alias, in any order, so "qiangsheng block" matches "Block Qiangsheng QD25H" just
// as well as "block qiangsheng" does.
export function materialMatchesQuery(material, query) {
  const tokens = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = `${material.sku} ${material.name} ${material.alias || ''}`.toLowerCase();
  return tokens.every(t => haystack.includes(t));
}

// Free-type search for the "sửa mã khách" comboboxes (AI Order Agent's client field,
// Orders Chờ Duyệt page's Mã KH column) — same unordered-token rule as
// materialMatchesQuery, applied to code/codeSearch/name/alias instead of sku/name/alias.
export function clientMatchesQuery(client, query) {
  const tokens = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = `${client.code || ''} ${client.codeSearch || ''} ${client.name || ''} ${client.alias || ''}`.toLowerCase();
  return tokens.every(t => haystack.includes(t));
}

// Whether queryText is different/specific enough from what the matcher already knows
// about this material to be worth surfacing for review in the Orders sheet's "Update
// alias" column — avoids writing back near-duplicates of the SKU name/alias every time.
export function isNewAliasWorthLearning(queryText, material) {
  if (!queryText || !material) return false;
  const q = queryText.trim();
  if (q.length < 2) return false;
  const known = [material.alias, material.name, ...(material.learnedAliases || [])].filter(Boolean);
  return !known.some(term => similarityScore(q, term) >= 0.6);
}

// Find historical price for client and material
export function getHistoricalUnitPrice(clientName, sku, transactions, fallbackPrice = 0) {
  if (!transactions || !transactions.length) return fallbackPrice;

  // Search transactions for this client and SKU
  const clientTx = transactions.filter(t =>
    t.sku === sku &&
    (t.clientName.toLowerCase().includes(clientName.toLowerCase()) || clientName.toLowerCase().includes(t.clientName.toLowerCase()))
  );

  if (clientTx.length > 0) {
    // Get latest non-zero price
    const validPrice = clientTx.find(t => t.price > 0);
    if (validPrice) return validPrice.price;
  }

  // Fallback to general SKU price
  const generalTx = transactions.find(t => t.sku === sku && t.price > 0);
  if (generalTx) return generalTx.price;

  return fallbackPrice;
}

// File -> raw base64 (no "data:...;base64," prefix — gas/Ai.gs sends it to
// Claude's image content block as-is).
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
    reader.readAsDataURL(file);
  });
}

// Compact context sent alongside the prompt (gas/Ai.gs) — only what Claude
// needs to pick a real sku/client code, not the full bootstrap objects.
export function buildAiPromptContext(clientList, materialsCatalog) {
  return {
    materials: (materialsCatalog || []).map(m => ({ sku: m.sku, name: m.name, alias: m.alias || '', group: m.group || '' })),
    clients: (clientList || [])
      .filter(c => String(c.status || 'Active').toLowerCase().trim() === 'active')
      .map(c => ({ code: c.code, name: c.name, alias: c.alias || '' }))
  };
}

// Turns Claude's structured record_order result (gas/Ai.gs) into the same
// orderResult shape the review table has always used. Pricing/VAT stay a
// deterministic lookup here rather than something the model computes —
// the model only ever needs to say WHICH client/sku/qty, never do arithmetic.
export function buildOrderFromAiResult(aiResult, clientList, materialsCatalog, transactions) {
  const activeClients = (clientList || []).filter(
    c => String(c.status || 'Active').toLowerCase().trim() === 'active'
  );
  const materialBySku = new Map((materialsCatalog || []).map(m => [m.sku, m]));
  const warnings = Array.isArray(aiResult.warnings) ? [...aiResult.warnings] : [];

  let matchedClient = null;
  if (aiResult.client && aiResult.client.code) {
    matchedClient = activeClients.find(c => c.code === aiResult.client.code) || null;
    if (!matchedClient) {
      warnings.push(`Claude trả về mã KH "${aiResult.client.code}" nhưng không khớp khách hàng Active nào — vui lòng chọn tay.`);
    }
  }
  if (!matchedClient) {
    matchedClient = {
      name: '⚠️ Chưa xác định khách hàng — vui lòng ghi rõ tên/alias KH trong lệnh',
      code: '',
      codeSearch: '',
      alias: '',
      status: 'Active'
    };
  }

  const items = [];
  (aiResult.items || []).forEach(raw => {
    const material = materialBySku.get(raw.sku);
    if (!material) {
      warnings.push(`Claude trả về mã SKU "${raw.sku}" không có trong danh mục — đã bỏ qua dòng "${raw.sourceText || ''}".`);
      return;
    }
    const qty = Number(raw.qty) || 0;
    if (qty <= 0) {
      warnings.push(`Dòng "${raw.sourceText || material.name}" không có số lượng hợp lệ — đã bỏ qua.`);
      return;
    }
    const price = getHistoricalUnitPrice(matchedClient.name, material.sku, transactions, material.avgPrice);
    items.push({
      id: 'ITEM-' + Math.random().toString(36).substr(2, 6),
      sku: material.sku,
      name: material.name,
      unit: material.unit || 'PC',
      qty,
      price,
      total: qty * price * VAT_RATE,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
      sourceQuery: raw.sourceText || '',
      matchedAlias: isNewAliasWorthLearning(raw.sourceText, material) ? raw.sourceText : ''
    });
  });

  const grandTotal = items.reduce((sum, i) => sum + i.total, 0);

  return {
    client: matchedClient,
    orderNo: 'SAP-SO-' + Math.floor(100000 + Math.random() * 900000),
    items,
    grandTotal,
    timestamp: new Date().toLocaleString('vi-VN'),
    warnings
  };
}

// Generate TSV string for copy-pasting directly into SAP GUI / SAP Web
export function generateSAPCopyString(orderData) {
  if (!orderData || !orderData.items) return '';

  // Headers tab-separated
  let tsv = `Mã vật tư\tTên vật tư\tSố lượng\tĐVT\tĐơn giá VND\tThành tiền VND\tMã KH\tTên KH\n`;

  orderData.items.forEach(item => {
    tsv += `${item.sku}\t${item.name}\t${item.qty}\t${item.unit}\t${item.price}\t${item.total}\t${orderData.client.code || ''}\t${orderData.client.name || ''}\n`;
  });

  return tsv;
}
