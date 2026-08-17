// Google Sheet Database Service for OEM App (Karofi Edition)
// Sheet ID: 1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk

export const SHEET_ID = '1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk';

export const GIDS = {
  USERS: '276721346',
  CLIENTS: '385229237',
  TRANSACTIONS: '1448176667',
  MATERIALS: '1400253526',
  MONTHLY_REVENUE: '999111',       // DT_theo_thang
  DEBT_TRACKING: '499671926',
  PLAN_THANG: '1302921161',
  SALES_REVENUE: '965378295',      // DT_sale & Plan2026
  DAILY_REVENUE: '1308466195'      // KH_Date
};

// Simple CSV parser supporting quoted strings
export function parseCSV(csvText) {
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentLine.push(currentField.trim());
      if (currentLine.some(f => f !== '')) {
        lines.push(currentLine);
      }
      currentLine = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField !== '' || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some(f => f !== '')) {
      lines.push(currentLine);
    }
  }

  return lines;
}

// Fetch CSV for a given GID
export async function fetchGidData(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    const text = await response.text();
    return parseCSV(text);
  } catch (error) {
    console.warn(`Could not fetch live GID ${gid}, using fallback:`, error.message);
    return null;
  }
}

// Compute week string (W1..W5) from date DD/MM/YYYY
export function computeWeekFromDate(dateStr, rawWeekNum) {
  if (rawWeekNum && parseInt(rawWeekNum) > 0) {
    return `W${parseInt(rawWeekNum)}`;
  }
  if (!dateStr) return 'W1';
  
  const parts = dateStr.split(/[\/\.-]/);
  if (parts.length >= 1) {
    const day = parseInt(parts[0], 10);
    if (day >= 1 && day <= 7) return 'W1';
    if (day >= 8 && day <= 14) return 'W2';
    if (day >= 15 && day <= 21) return 'W3';
    if (day >= 22 && day <= 28) return 'W4';
    if (day >= 29) return 'W5';
  }
  return 'W1';
}

// Map client code text
export function getClientTextCode(clientName, clientCode, rawCodeSearch) {
  if (rawCodeSearch && rawCodeSearch.length > 1 && !rawCodeSearch.match(/^\d+$/)) {
    return rawCodeSearch;
  }
  const nameUpper = (clientName || '').toUpperCase();
  if (nameUpper.includes('TECOM')) return 'TECOM';
  if (nameUpper.includes('MAKXIM')) return 'CTMAXIMVN';
  if (nameUpper.includes('VIỆT TOÀN CẦU') || nameUpper.includes('VIETTOANCAU')) return 'CTVIETTOANCAU';
  if (nameUpper.includes('THÀNH ĐẠT')) return 'CTTHANHDAT';
  if (nameUpper.includes('SƠN HÀ') || nameUpper.includes('SONHA')) return 'CTQTSONHA';
  if (nameUpper.includes('THIÊN SƠN')) return 'CHTUANDP';
  if (nameUpper.includes('A BẮC')) return 'CHABACHN';
  return clientCode || rawCodeSearch || 'OEM-CLIENT';
}

// 2025 Revenue Baseline Lookup from Plan2026 tab
export async function load2025Baselines() {
  const rows = await fetchGidData(GIDS.SALES_REVENUE);
  const map = new Map([
    ['TECOM', 30323700000],
    ['CTMAXIMVN', 23500000000],
    ['CTQTSONHA', 9546500000],
    ['CTVIETTOANCAU', 8598500000],
    ['CHTUANDP', 7546800000],
    ['CHABACHN', 4000000000]
  ]);

  if (rows && rows.length > 5) {
    rows.slice(5).forEach(row => {
      const code = row[0] || getClientTextCode(row[1], '', row[0]);
      const rev2025 = parseFloat((row[3] || '0').replace(/,/g, '')) || 0;
      if (code && rev2025 > 0) {
        map.set(code, rev2025);
      }
    });
  }

  return map;
}

// Load Users
export async function loadUsers() {
  const rows = await fetchGidData(GIDS.USERS);
  const fallbackUsers = [
    { name: 'hai.cao@karofi.com', pin: '123456', role: 'creator', saleId: '' },
    { name: 'admin@karofi.vn', pin: '123456', role: 'admin', saleId: '' },
    { name: 'leader.sales@karofi.vn', pin: '123456', role: 'leader', saleId: '' },
    { name: 'hoancd@karofi.vn', pin: '123456', role: 'sale', saleId: 'KH Đình Hoan' },
    { name: 'linhtn@karofi.vn', pin: '123456', role: 'sale', saleId: 'KH Linh' }
  ];

  if (!rows || rows.length < 2) return fallbackUsers;

  return rows.slice(1).map(row => ({
    name: row[0] || '',
    pin: row[1] || '123456',
    role: (row[2] || 'sale').toLowerCase(),
    saleId: row[4] || row[3] || ''
  }));
}

// Load Clients
export async function loadClients() {
  const rows = await fetchGidData(GIDS.CLIENTS);
  if (!rows || rows.length < 2) {
    return [
      { code: '1001718', codeSearch: 'CHABACHN', name: 'CH A Bắc - Thanh Liệt', alias: 'a Bắc Thanh Liệt', type: 'Cá nhân', sale: 'KH Đình Hoan', address: 'Thanh Liệt, Hà Nội', status: 'Active' },
      { code: '1008944', codeSearch: 'TECOM', name: 'Công ty CP Công nghệ & Môi trường Tecom', alias: 'Tecom', type: 'Doanh nghiệp', sale: 'KH Linh', address: 'Hà Nội', status: 'Active' },
      { code: '1000512', codeSearch: 'CTMAXIMVN', name: 'CT CP TM VÀ XNK MAKXIM VIỆT NAM', alias: 'Makxim', type: 'Doanh nghiệp', sale: 'KH Đình Hoan', address: 'Hà Nội', status: 'Active' },
      { code: '1008999', codeSearch: 'CTVIETTOANCAU', name: 'Công ty CP Việt Toàn Cầu', alias: 'Việt Toàn Cầu', type: 'Doanh nghiệp', sale: 'KH Linh', address: 'Hà Nội', status: 'Active' }
    ];
  }

  return rows.slice(1).map((row, idx) => ({
    code: row[1] || `CLI-${1000 + idx}`,
    codeSearch: getClientTextCode(row[3] || row[2], row[1], row[2]),
    name: row[3] || row[2] || 'Khách hàng OEM',
    alias: row[4] || '',
    type: row[5] || 'Doanh nghiệp',
    sale: row[6] || 'KH Đình Hoan',
    address: row[7] || '',
    status: (row[8] || 'Active').trim()
  })).filter(c => c.name && c.name !== 'Client name');
}

// Load Transactions (1,890+ rows)
export async function loadTransactions() {
  const rows = await fetchGidData(GIDS.TRANSACTIONS);
  if (!rows || rows.length < 2) {
    return [
      {
        date: '06/01/2026', billingNo: '9000470039', clientCode: 'CTMAXIMVN', clientName: 'CT CP TM VÀ XNK MAKXIM VIỆT NAM',
        sku: '2013070081', skuName: 'Block Qiangsheng QD25H (MD-2)', qty: 280, unit: 'PC', price: 305556,
        revenue: 85555680, netRevenue: 85555680, netVat: 92400134, orderNo: '1000330012', sale: 'KH Đình Hoan', month: 'T01-2026', week: 'W1', group: 'LK nóng lạnh'
      },
      {
        date: '06/01/2026', billingNo: '9000470039', clientCode: 'CTMAXIMVN', clientName: 'CT CP TM VÀ XNK MAKXIM VIỆT NAM',
        sku: '3004090173', skuName: 'Phin lọc 2 đầu', qty: 200, unit: 'PC', price: 11111,
        revenue: 2222200, netRevenue: 2222200, netVat: 2399976, orderNo: '1000330012', sale: 'KH Đình Hoan', month: 'T01-2026', week: 'W1', group: 'LK nóng lạnh'
      },
      {
        date: '10/08/2026', billingNo: '9000470120', clientCode: 'TECOM', clientName: 'Công ty CP Công nghệ & Môi trường Tecom',
        sku: '1001030190', skuName: 'Màng RO 100 GPD Karofi OEM', qty: 500, unit: 'PC', price: 185000,
        revenue: 92500000, netRevenue: 92500000, netVat: 99900000, orderNo: '1000330199', sale: 'KH Linh', month: 'T08-2026', week: 'W2', group: 'Màng lọc'
      }
    ];
  }

  return rows.slice(1).map((row) => {
    const parseNum = (val) => {
      if (!val) return 0;
      const clean = val.replace(/,/g, '').replace(/\s/g, '').replace(/-/g, '0');
      return parseFloat(clean) || 0;
    };

    const dateStr = row[0] || row[1] || '';
    const clientName = row[6] || '';
    const rawCode = row[60] || row[5] || '';
    const codeSearch = getClientTextCode(clientName, rawCode, row[60]);
    const month = row[40] || 'T08-2026';
    const week = computeWeekFromDate(dateStr, row[42]);

    return {
      date: dateStr,
      billingNo: row[2] || '',
      docType: row[4] || '',
      clientCode: codeSearch,
      clientName: clientName,
      sku: row[8] || '',
      skuName: row[9] || '',
      qty: parseNum(row[11] || row[10]),
      unit: row[12] || 'PC',
      price: parseNum(row[14]),
      revenue: parseNum(row[17]),
      netRevenue: parseNum(row[22]),
      orderNo: row[24] || row[2] || 'SO-10002',
      month: month,
      week: week,
      sale: row[61] || row[36] || 'KH Đình Hoan',
      group: row[62] || row[27] || 'Linh kiện OEM',
      netVat: parseNum(row[59])
    };
  }).filter(t => t.clientName && t.skuName);
}

// Load Materials Catalogue
export async function loadMaterials() {
  const txs = await loadTransactions();
  const materialMap = new Map();

  txs.forEach(t => {
    if (!t.sku) return;
    if (!materialMap.has(t.sku)) {
      materialMap.set(t.sku, {
        sku: t.sku,
        name: t.skuName,
        alias: t.skuName.split(' ')[0] + ' ' + (t.skuName.split(' ')[1] || ''),
        unit: t.unit || 'PC',
        group: t.group || 'Linh kiện OEM',
        totalQty: 0,
        totalRevenue: 0,
        prices: []
      });
    }
    const mat = materialMap.get(t.sku);
    mat.totalQty += t.qty;
    mat.totalRevenue += t.netRevenue;
    if (t.price > 0) mat.prices.push(t.price);
  });

  return Array.from(materialMap.values()).map(m => {
    const minPrice = m.prices.length ? Math.min(...m.prices) : 0;
    const maxPrice = m.prices.length ? Math.max(...m.prices) : 0;
    const avgPrice = m.prices.length ? Math.round(m.prices.reduce((a, b) => a + b, 0) / m.prices.length) : 0;
    return {
      sku: m.sku,
      name: m.name,
      alias: m.alias,
      unit: m.unit,
      group: m.group,
      totalQty: m.totalQty,
      avgPrice: avgPrice,
      minPrice: minPrice,
      maxPrice: maxPrice
    };
  });
}

// Load Sales Plans (Plan_thang) - EXPLICIT COLUMN MAPPING BASED ON GOOGLE SHEET RAW STRUCTURE
export async function loadSalesPlans() {
  const rows = await fetchGidData(GIDS.PLAN_THANG);
  if (!rows || rows.length < 2) {
    return [
      {
        searchCode: 'TECOM', clientName: 'CT CP CN và môi trường Tecom', sale: 'KH Linh',
        planKpi: 2314777500, planUpdate: 850000000, done: 91187949,
        w1: 100000000, w2: 500000000, w3: 100000000, w4: 300000000, w5: 300000000,
        note: '', status: 'Đã duyệt'
      },
      {
        searchCode: 'CTVIETTOANCAU', clientName: 'Trịnh Ngọc Hoàn', sale: 'KH Linh',
        planKpi: 644887500, planUpdate: 750000000, done: 136663372,
        w1: 500000000, w2: 100000000, w3: 200000000, w4: 200000000, w5: 200000000,
        note: '', status: 'Đã duyệt'
      },
      {
        searchCode: 'CTMAXIMVN', clientName: 'CT CP TM VÀ XNK MAKXIM VIỆT NAM', sale: 'KH Đình Hoan',
        planKpi: 1855000000, planUpdate: 1855000000, done: 1350000000,
        w1: 500000000, w2: 450000000, w3: 400000000, w4: 505000000, w5: 0,
        note: 'Giao đợt 2 Block', status: 'Đã duyệt'
      }
    ];
  }

  // Row 0 is header text, Row 1 is column names ("","Search_code","Client name","Sale","","","","","","","","","","Note")
  // Row 2+ is actual data
  const dataRows = rows.slice(2);

  return dataRows.map(r => {
    const parseNum = (val) => {
      if (!val) return 0;
      const clean = val.replace(/,/g, '').replace(/\s/g, '').replace(/-/g, '0');
      return parseFloat(clean) || 0;
    };

    const clientName = r[2] || 'Khách hàng OEM';
    const searchCode = r[1] ? r[1].trim() : getClientTextCode(clientName, r[0], r[1]);
    const planKpi = parseNum(r[4]);      // Column E (Plan KPI)
    const planUpdate = parseNum(r[5]);   // Column F (Plan_Update)
    const done = parseNum(r[6]);         // Column G (Done)
    const w1 = parseNum(r[8]);           // Column I (Tuần 1)
    const w2 = parseNum(r[9]);           // Column J (Tuần 2)
    const w3 = parseNum(r[10]);          // Column K (Tuần 3)
    const w4 = parseNum(r[11]);          // Column L (Tuần 4)
    const w5 = parseNum(r[12]);          // Column M (Tuần 5)
    const note = r[13] || '';            // Column N (Note)

    return {
      searchCode: searchCode,
      clientName: clientName,
      sale: r[3] || 'KH Đình Hoan',
      planKpi: planKpi,
      planUpdate: planUpdate,
      done: done,
      w1: w1,
      w2: w2,
      w3: w3,
      w4: w4,
      w5: w5,
      note: note,
      status: 'Đã duyệt'
    };
  }).filter(p => p.searchCode && p.searchCode !== 'Search_code');
}
