// AI Order Agent — local heuristic parser (no external API call).
//
// 2026-08-24: briefly replaced with a real Gemini call (see the audit +
// follow-up commits), rolled back 2026-08-25 — API quota/auth issues made it
// unreliable for what needs to work every time Sale places an order. Kept
// from that detour: real numeric confidence per item (was a hardcoded
// "High (Mapped)" label before), and deterministic "Bộ sản phẩm" (kit)
// expansion driven by the optional "Kits" tab (gas/Ai.gs's
// oemAppLoadKits_, now also exposed via getBootstrap) instead of only ever
// guessing from same-alias grouping.

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
    // when OCR is actually used.
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('vie+eng');
    if (onProgress) {
      onProgress('Đang quét OCR nhận diện chữ trên hình ảnh...');
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

// Free-type search for the "sửa mã khách" comboboxes (AI Order Agent's client field,
// Orders Chờ Duyệt page's Mã KH column) — same unordered-token rule as
// materialMatchesQuery, applied to code/codeSearch/name/alias instead of sku/name/alias.
export function clientMatchesQuery(client, query) {
  const tokens = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = `${client.code || ''} ${client.codeSearch || ''} ${client.name || ''} ${client.alias || ''}`.toLowerCase();
  return tokens.every(t => haystack.includes(t));
}

// Match material from catalog. clientOrderedSkus (optional Set<sku>) boosts the
// score of SKUs this specific client has ordered before — the same free-text
// wording ("phin lọc", "block"...) often maps to a different SKU per client's
// product line, so prior purchase history is a strong tiebreaker.
// Returns { material, confidence } (confidence 0-1, exact SKU hits = 1) or null.
export function findMatchingMaterial(queryText, materialsCatalog, clientOrderedSkus) {
  if (!queryText || !materialsCatalog.length) return null;
  const q = queryText.toLowerCase().trim();

  // 1. Direct SKU match
  const skuMatch = materialsCatalog.find(m => m.sku.toLowerCase() === q);
  if (skuMatch) return { material: skuMatch, confidence: 1 };

  // 2. Direct SKU inside text
  const skuInText = materialsCatalog.find(m => q.includes(m.sku.toLowerCase()));
  if (skuInText) return { material: skuInText, confidence: 1 };

  // 3. Name or Alias match with highest score
  const HISTORY_BOOST = 0.15;
  let bestMatch = null;
  let highestScore = 0;

  materialsCatalog.forEach(mat => {
    const nameScore = similarityScore(q, mat.name);
    const aliasScore = mat.alias ? similarityScore(q, mat.alias) : 0;
    // learnedAliases: free-text terms Sale/Admin previously used that got mapped to this
    // SKU (see isNewAliasWorthLearning below) — lets the matcher improve from real
    // corrections instead of only ever knowing the auto-derived alias.
    const learnedScore = (mat.learnedAliases || []).reduce(
      (best, term) => Math.max(best, similarityScore(q, term)), 0
    );
    let maxScore = Math.max(nameScore, aliasScore, learnedScore);
    if (clientOrderedSkus && clientOrderedSkus.has(mat.sku)) maxScore += HISTORY_BOOST;

    if (maxScore > highestScore && maxScore >= 0.25) {
      highestScore = maxScore;
      bestMatch = mat;
    }
  });

  return bestMatch ? { material: bestMatch, confidence: Math.min(highestScore, 1) } : null;
}

// SKUs a given client has ordered before, per the Data tab's transaction history —
// matched by Code/Code_search first (stable identifier), falling back to a fuzzy
// name match for clients whose transactions predate a code being assigned.
export function getClientOrderedSkus(client, transactions) {
  const skus = new Set();
  if (!client || !transactions || !transactions.length) return skus;
  const codeKey = String(client.codeSearch || client.code || '').toLowerCase().trim();
  const nameKey = String(client.name || '').toLowerCase().trim();

  transactions.forEach(t => {
    const tCode = String(t.clientCode || '').toLowerCase().trim();
    const matchByCode = codeKey && tCode === codeKey;
    const matchByName = !matchByCode && nameKey && t.clientName &&
      (t.clientName.toLowerCase().includes(nameKey) || nameKey.includes(t.clientName.toLowerCase()));
    if ((matchByCode || matchByName) && t.sku) skus.add(t.sku);
  });

  return skus;
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
// guess) when nothing reasonably matches.
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

// Last word of a note like "Biến thể xanh" -> "xanh" — the keyword checked
// against the order line to pick the right variant among several SKUs
// sharing the same "Vai trò" in a kit recipe (see expandKit_ below and the
// "Kits" tab schema in gas/SETUP.md).
function noteKeyword_(note) {
  const words = String(note || '').trim().split(/\s+/).filter(Boolean);
  return words[words.length - 1] || '';
}

// If `line` mentions a known kit ("Bộ <tên>" matching kits[].kitName),
// deterministically expand it into its component SKUs x qty (qty = SL/Bộ x
// số Bộ đặt), picking the one variant row per "Vai trò" whose note keyword
// appears in the line. Returns null if no kit name matches (caller falls
// back to the old same-alias grouping guess) — never invents a recipe.
function expandKit_(line, qty, materialsCatalog, kits, warnings) {
  if (!kits || !kits.length) return null;
  const lower = line.toLowerCase();
  const kitNames = [...new Set(kits.map(k => k.kitName))];
  const matchedName = kitNames.find(name => name && lower.includes(name.toLowerCase()));
  if (!matchedName) return null;

  const components = kits.filter(k => k.kitName === matchedName);
  const byRole = new Map();
  components.forEach(c => {
    if (!byRole.has(c.role)) byRole.set(c.role, []);
    byRole.get(c.role).push(c);
  });

  const resolved = [];
  byRole.forEach((options, role) => {
    let chosen = options[0];
    if (options.length > 1) {
      chosen = options.find(o => {
        const kw = noteKeyword_(o.note);
        return kw && lower.includes(kw.toLowerCase());
      });
      if (!chosen) {
        warnings.push(`"${matchedName}" có nhiều biến thể cho thành phần "${role}" nhưng lệnh không nói rõ biến thể nào — đã bỏ qua, vui lòng thêm dòng thủ công.`);
        return;
      }
    }
    const material = materialsCatalog.find(m => m.sku === chosen.sku);
    if (!material) {
      warnings.push(`Công thức "${matchedName}" tham chiếu mã "${chosen.sku}" nhưng mã này không có trong danh mục sản phẩm.`);
      return;
    }
    resolved.push({ material, qty: qty * (chosen.qtyPerKit || 0), confidence: 0.9, sourceQuery: line });
  });

  return resolved;
}

// Process Order Prompt or OCR text into SAP-structured Order Lines.
// `kits` (optional, from getBootstrap) enables deterministic "Bộ sản phẩm"
// expansion — see expandKit_. Without it, "bộ" falls back to the older,
// weaker same-alias grouping guess.
export function parseOrderTextToSAP({ textInput, clientList, materialsCatalog, transactions, kits }) {
  const lines = textInput.split(/\n|,|;/).map(l => l.trim()).filter(Boolean);
  const warnings = [];

  // 1. Identify Client — Active only; never silently default to the first client
  // in the Clients sheet.
  const matchedClient = findMatchingClient(textInput, clientList) || {
    name: '⚠️ Chưa xác định khách hàng — vui lòng ghi rõ tên/alias KH trong lệnh',
    code: '',
    codeSearch: '',
    alias: '',
    status: 'Active'
  };

  // 2. Identify Product items & Quantities — boost matching against this client's
  // own order history.
  const clientOrderedSkus = getClientOrderedSkus(matchedClient, transactions);
  const orderItems = [];

  const pushOrAccumulate = (matchedMaterial, qty, sourceQuery, confidence) => {
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
        confidence: confidence,
        sourceQuery: sourceQuery,
        matchedAlias: isNewAliasWorthLearning(sourceQuery, matchedMaterial) ? sourceQuery : ''
      });
    }
  };

  const UNIT_WORDS_RE = /(cái|bộ|chiếc|bao|cuộn|cây|hộp|thùng|chai|lọ|đôi|cặp|pcs?)/i;

  lines.forEach((line) => {
    const numMatches = line.match(/\d+[\d,.]*/g);
    if (!numMatches) return;

    // Prefer a number immediately followed by a unit word ("300 cái") over
    // just the first number in the line — a line can easily contain other
    // numbers (a price, a reference code) before the actual quantity.
    let qty = 0;
    const nearUnit = line.match(/(\d+[\d,.]*)\s*(?:cái|bộ|chiếc|bao|cuộn|cây|hộp|thùng|chai|lọ|đôi|cặp|pcs?)\b/i);
    if (nearUnit) {
      qty = parseInt(nearUnit[1].replace(/[,.]/g, ''), 10) || 0;
    }
    if (qty <= 0) {
      for (const numStr of numMatches) {
        const parsed = parseInt(numStr.replace(/[,.]/g, ''), 10);
        if (parsed > 0 && parsed < 1000000 && parsed !== parseInt(matchedClient.code)) {
          qty = parsed;
          break;
        }
      }
    }
    if (qty <= 0) qty = 100; // default estimate

    // Known kit recipe ("Kits" tab, gas/Ai.gs) — deterministic, takes priority
    // over the generic same-alias guess below.
    const kitResolved = expandKit_(line, qty, materialsCatalog, kits, warnings);
    if (kitResolved) {
      if (!kitResolved.length) {
        warnings.push(`Không tách được thành phần nào từ "${line}".`);
      }
      kitResolved.forEach(r => pushOrAccumulate(r.material, r.qty, r.sourceQuery, r.confidence));
      return;
    }

    // "bộ" without a matching Kits recipe: same weaker guess as before — pull
    // in every material sharing the best match's alias, since a "bộ" order
    // line usually means several related SKUs but there's no recipe to
    // follow exactly.
    const isProductSet = /(^|\s)bộ(\s|$)/i.test(line);

    const productQuery = line.replace(/\d+[\d,.]*/g, '').replace(UNIT_WORDS_RE, '').replace(/chủ|khái|đơn|giá|cho|lấy|cần/gi, '').trim();
    const sourceQuery = productQuery || line;

    // "+" joins accompanying products requested together on the same line.
    const segments = sourceQuery.split('+').map(s => s.trim()).filter(Boolean);
    if (!segments.length) segments.push(sourceQuery);

    segments.forEach((segment) => {
      const match = findMatchingMaterial(segment, materialsCatalog, clientOrderedSkus);
      if (!match) {
        warnings.push(`Không tìm thấy sản phẩm nào khớp với "${segment}" — vui lòng thêm dòng thủ công.`);
        return;
      }
      const { material: primaryMatch, confidence } = match;
      const matchedMaterials = (isProductSet && primaryMatch.alias)
        ? materialsCatalog.filter(m => m.alias && m.alias === primaryMatch.alias)
        : [primaryMatch];

      matchedMaterials.forEach(mat => {
        // Members pulled in only because they share the primary match's alias
        // (not a real text match) get a visibly lower confidence than the
        // actual match, since that grouping is a guess, not a lookup.
        const matConfidence = mat === primaryMatch ? confidence : confidence * 0.6;
        pushOrAccumulate(mat, qty, segment, matConfidence);
      });
    });
  });

  if (orderItems.length === 0) {
    warnings.push('Không nhận diện được sản phẩm nào từ lệnh — vui lòng diễn đạt rõ hơn hoặc thêm dòng thủ công.');
  }

  const grandTotal = orderItems.reduce((sum, item) => sum + item.total, 0);

  return {
    client: matchedClient,
    orderNo: 'SAP-SO-' + Math.floor(100000 + Math.random() * 900000),
    items: orderItems,
    grandTotal: grandTotal,
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
