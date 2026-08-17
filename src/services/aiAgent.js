// AI Agent Order Processing Engine & SAP Generator
import { createWorker } from 'tesseract.js';

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
    const maxScore = Math.max(nameScore, aliasScore);

    if (maxScore > highestScore && maxScore >= 0.25) {
      highestScore = maxScore;
      bestMatch = mat;
    }
  });

  return bestMatch;
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
  
  // 1. Identify Client
  let matchedClient = clientList[0] || { name: 'CT CP TM VÀ XNK MAKXIM VIỆT NAM', code: '1000512' };
  const lowerInput = textInput.toLowerCase();
  
  for (const client of clientList) {
    if (
      lowerInput.includes(client.name.toLowerCase()) || 
      (client.alias && lowerInput.includes(client.alias.toLowerCase())) ||
      (client.codeSearch && lowerInput.includes(client.codeSearch.toLowerCase()))
    ) {
      matchedClient = client;
      break;
    }
  }

  // 2. Identify Product items & Quantities
  const orderItems = [];

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

    // Clean line from quantity numbers to match product
    const productQuery = line.replace(/\d+[\d,.]*/g, '').replace(/cái|bộ|chiếc|bao|cuộn|chủ|khái|pc|pcs|đơn|giá|cho|lấy|cần/gi, '').trim();
    
    const matchedMaterial = findMatchingMaterial(productQuery || line, materialsCatalog);
    
    if (matchedMaterial) {
      const price = getHistoricalUnitPrice(matchedClient.name, matchedMaterial.sku, transactions, matchedMaterial.avgPrice);
      
      // Check if already added
      const existing = orderItems.find(item => item.sku === matchedMaterial.sku);
      if (existing) {
        existing.qty += qty;
        existing.total = existing.qty * existing.price;
      } else {
        orderItems.push({
          id: 'ITEM-' + Math.random().toString(36).substr(2, 6),
          sku: matchedMaterial.sku,
          name: matchedMaterial.name,
          unit: matchedMaterial.unit || 'PC',
          qty: qty,
          price: price,
          total: qty * price,
          confidence: 'High (Mapped)'
        });
      }
    }
  });

  // Fallback demo order items if prompt was vague
  if (orderItems.length === 0) {
    const m1 = materialsCatalog[0] || { sku: '2013070081', name: 'Block Qiangsheng QD25H (MD-2)', unit: 'PC', avgPrice: 305556 };
    const m2 = materialsCatalog[1] || { sku: '3004090173', name: 'Phin lọc 2 đầu', unit: 'PC', avgPrice: 11111 };

    orderItems.push({
      id: 'ITEM-1',
      sku: m1.sku,
      name: m1.name,
      unit: m1.unit,
      qty: 300,
      price: getHistoricalUnitPrice(matchedClient.name, m1.sku, transactions, m1.avgPrice),
      total: 300 * (m1.avgPrice || 305556),
      confidence: 'Gợi ý từ AI'
    });

    orderItems.push({
      id: 'ITEM-2',
      sku: m2.sku,
      name: m2.name,
      unit: m2.unit,
      qty: 200,
      price: getHistoricalUnitPrice(matchedClient.name, m2.sku, transactions, m2.avgPrice),
      total: 200 * (m2.avgPrice || 11111),
      confidence: 'Gợi ý từ AI'
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
