// AI Agent Order Processing Engine & SAP Generator

// Thành Tiền / Tổng Giá Trị are shown VAT-inclusive per request; Đơn Giá stays pre-VAT.
export const VAT_RATE = 1.08;

// Fuzzy text matching helper
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

// Perform Optical Character Recognition on image file
export async function extractTextFromImage(imageFile, onProgress) {
  try {
    // Lazy-loaded: tesseract.js is a large dependency, only worth the download
    // when OCR is actually used (see review item 10 — bundle size).
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('vie+eng');
    if (onProgress) {
      onProgress('Reading image text via OCR...');
    }
    const ret = await worker.recognize(imageFile);
    await worker.terminate();
    return ret.data.text;
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Không thể đọc chữ từ hình ảnh này. Xin thử lại với file ảnh rõ nét hơn.');
  }
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

// Match material from catalog
export function findMatchingMaterial(queryText, materialsCatalog) {
  if (!queryText || !materialsCatalog.length) return null;
  const q = queryText.toLowerCase().trim();

  // 1. Direct SKU match
  const skuMatch = materialsCatalog.find(m => m.sku.toLowerCase() === q);
  if (skuMatch) return skuMatch;

  // 2. Direct SKU inside text
  const skuInText = materialsCatalog.find(m => q.includes(m.sku.toLowerCase()));
  if (skuInText) return skuInText;

  // 3. Name or Alias match with highest score
  let bestMatch = null;
  let highestScore = 0;

  materialsCatalog.forEach(mat => {
    const nameScore = similarityScore(q, mat.name);
    const aliasScore = mat.alias ? similarityScore(q, mat.alias) : 0;
    // learnedAliases: free-text terms Sale/Admin previously used that got mapped to this
    // SKU (see AI_ALIAS_LEARN below) — lets the matcher improve from real corrections
    // instead of only ever knowing the auto-derived alias.
    const learnedScore = (mat.learnedAliases || []).reduce(
      (best, term) => Math.max(best, similarityScore(q, term)), 0
    );
    const maxScore = Math.max(nameScore, aliasScore, learnedScore);

    if (maxScore > highestScore && maxScore >= 0.25) {
      highestScore = maxScore;
      bestMatch = mat;
    }
  });

  return bestMatch;
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

// Locate the client mentioned in free text. Only ever considers Status = Active
// clients, and besides exact name/alias/code substring matches, also looks for
// mentions introduced by a common Vietnamese addressing prefix ("anh Long",
// "nhà Minh Anh", "cty ABC"...) since Sale rarely types a client's full formal
// registered name. Returns null (never a silent "first client in the list"
// guess) when nothing reasonably matches — that guess was the reported bug.
function findMatchingClient(textInput, clientList) {
  const activeClients = (clientList || []).filter(
    c => String(c.status || 'Active').toLowerCase().trim() === 'active'
  );
  const lowerInput = String(textInput || '').toLowerCase();

  // 1. Direct substring match on full name / alias / codeSearch — prefer the longest hit
  let best = null;
  let bestLen = 0;
  activeClients.forEach(client => {
    [client.name, client.alias, client.codeSearch].filter(Boolean).forEach(candidate => {
      const c = candidate.toLowerCase().trim();
      if (c.length >= 2 && lowerInput.includes(c) && c.length > bestLen) {
        bestLen = c.length;
        best = client;
      }
    });
  });
  if (best) return best;

  // 2. Vietnamese addressing-prefix snippets: "nhà X", "anh X", "chị X", "cty X", "công ty X"
  const PREFIX_RE = /(?:nhà|anh|chị|cty|công ty|doanh nghiệp)\s+([^\d,;.\n+]{2,40})/gi;
  const snippets = [];
  let m;
  while ((m = PREFIX_RE.exec(lowerInput)) !== null) {
    snippets.push(m[1].trim());
  }

  let bestScore = 0;
  snippets.forEach(snippet => {
    activeClients.forEach(client => {
      [client.name, client.alias].filter(Boolean).forEach(candidate => {
        const score = similarityScore(snippet, candidate);
        if (score > bestScore && score >= 0.4) {
          bestScore = score;
          best = client;
        }
      });
    });
  });

  return best;
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

// Process Order Prompt or OCR text into SAP-structured Order Lines
export function parseOrderTextToSAP({ textInput, clientList, materialsCatalog, transactions }) {
  const lines = textInput.split(/\n|,|;/).map(l => l.trim()).filter(Boolean);

  // 1. Identify Client — Active only; never silently default to the first client
  // in the Clients sheet (that was the reported bug: an order for one client
  // could land under whichever client happened to be row 1).
  const matchedClient = findMatchingClient(textInput, clientList) || {
    name: '⚠️ Chưa xác định khách hàng — vui lòng ghi rõ tên/alias KH trong lệnh',
    code: '',
    codeSearch: '',
    alias: '',
    status: 'Active'
  };

  // 2. Identify Product items & Quantities
  const orderItems = [];

  const pushOrAccumulate = (matchedMaterial, qty, sourceQuery) => {
    const price = getHistoricalUnitPrice(matchedClient.name, matchedMaterial.sku, transactions, matchedMaterial.avgPrice);
    const existing = orderItems.find(item => item.sku === matchedMaterial.sku);
    if (existing) {
      existing.qty += qty;
      existing.total = existing.qty * existing.price * VAT_RATE;
    } else {
      orderItems.push({
        id: 'ITEM-' + Math.random().toString(36).substr(2, 6),
        sku: matchedMaterial.sku,
        name: matchedMaterial.name,
        unit: matchedMaterial.unit || 'PC',
        qty: qty,
        price: price,
        total: qty * price * VAT_RATE,
        confidence: 'High (Mapped)',
        sourceQuery: sourceQuery,
        matchedAlias: isNewAliasWorthLearning(sourceQuery, matchedMaterial) ? sourceQuery : ''
      });
    }
  };

  // Patterns for number/quantity extraction (e.g. "300 cái", "300 bộ", "x300", "300")
  lines.forEach((line) => {
    // Look for numbers in line
    const numMatches = line.match(/\d+[\d,.]*/g);
    if (!numMatches) return;

    // Estimate quantity (usually numbers like 10, 50, 100, 300, 1000)
    let qty = 0;
    for (const numStr of numMatches) {
      const parsed = parseInt(numStr.replace(/[,.]/g, ''), 10);
      if (parsed > 0 && parsed < 1000000 && parsed !== parseInt(matchedClient.code)) {
        qty = parsed;
        break;
      }
    }

    if (qty <= 0) qty = 100; // default estimate

    // "bộ" = a product set: pull in every material sharing the same alias as the
    // best match, not just the single closest one (a "bộ" order line usually means
    // several related SKUs, e.g. a filter + housing sold as one kit).
    // Note: JS's \b treats accented letters as non-word chars, so \bbộ\b would
    // silently fail to match Vietnamese text — anchor on whitespace/string edges instead.
    const isProductSet = /(^|\s)bộ(\s|$)/i.test(line);

    // Clean line from quantity numbers to match product
    const productQuery = line.replace(/\d+[\d,.]*/g, '').replace(/cái|bộ|chiếc|bao|cuộn|chủ|khái|pc|pcs|đơn|giá|cho|lấy|cần/gi, '').trim();

    const sourceQuery = productQuery || line;

    // "+" joins accompanying products requested together on the same line
    // (e.g. "van xả + phin lọc") — each side needs its own lookup, not just
    // whichever one scores highest for the whole line.
    const segments = sourceQuery.split('+').map(s => s.trim()).filter(Boolean);
    if (!segments.length) segments.push(sourceQuery);

    segments.forEach((segment) => {
      const primaryMatch = findMatchingMaterial(segment, materialsCatalog);
      if (!primaryMatch) return;

      const matchedMaterials = (isProductSet && primaryMatch.alias)
        ? materialsCatalog.filter(m => m.alias && m.alias === primaryMatch.alias)
        : [primaryMatch];

      matchedMaterials.forEach(mat => pushOrAccumulate(mat, qty, segment));
    });
  });

  // Fallback demo order items if prompt was vague
  if (orderItems.length === 0) {
    const m1 = materialsCatalog[0] || { sku: '2013070081', name: 'Block Qiangsheng QD25H (MD-2)', unit: 'PC', avgPrice: 305556 };
    const m2 = materialsCatalog[1] || { sku: '3004090173', name: 'Phin lọc 2 đầu', unit: 'PC', avgPrice: 11111 };

    const p1 = getHistoricalUnitPrice(matchedClient.name, m1.sku, transactions, m1.avgPrice) || m1.avgPrice || 305556;
    const p2 = getHistoricalUnitPrice(matchedClient.name, m2.sku, transactions, m2.avgPrice) || m2.avgPrice || 11111;

    orderItems.push({
      id: 'ITEM-1',
      sku: m1.sku,
      name: m1.name,
      unit: m1.unit,
      qty: 300,
      price: p1,
      total: 300 * p1 * VAT_RATE,
      confidence: 'Gợi ý từ AI',
      sourceQuery: '',
      matchedAlias: ''
    });

    orderItems.push({
      id: 'ITEM-2',
      sku: m2.sku,
      name: m2.name,
      unit: m2.unit,
      qty: 200,
      price: p2,
      total: 200 * p2 * VAT_RATE,
      confidence: 'Gợi ý từ AI',
      sourceQuery: '',
      matchedAlias: ''
    });
  }

  const grandTotal = orderItems.reduce((sum, item) => sum + item.total, 0);

  return {
    client: matchedClient,
    orderNo: 'SAP-SO-' + Math.floor(100000 + Math.random() * 900000),
    items: orderItems,
    grandTotal: grandTotal,
    timestamp: new Date().toLocaleString('vi-VN')
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
