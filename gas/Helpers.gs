/** Generic helpers shared across the other files — Sheet access, number/date parsing. */

// ---------- Sheet helpers ----------

// Both caches are per-execution: Apps Script starts a fresh V8 context for every
// doPost, so these reset between requests on their own — they only ever dedupe
// work WITHIN one request, never serve stale sheet handles across requests.
//
// Why this matters (measured 2026-08-20): a `ping` that touches no Sheet answers
// in ~1.1s, while `getUserList` (one small tab) takes ~1.8s — so each
// openById + getSheets cycle costs roughly 0.7s. getBootstrap used to run six of
// them (Data, Orders, Products, Clients, Plan_Thang, Sales_Revenue), four of
// which also re-enumerated every tab in the workbook. That was ~3-5s of pure
// duplicated overhead on every single app load.
var OEMAPP_SS_CACHE_ = null;
var OEMAPP_GID_MAP_ = null;

function oemAppSS_() {
  if (!OEMAPP_SS_CACHE_) OEMAPP_SS_CACHE_ = SpreadsheetApp.openById(OEMAPP_SHEET_ID);
  return OEMAPP_SS_CACHE_;
}


function oemAppGetSheetByGid_(gid) {
  if (!OEMAPP_GID_MAP_) {
    OEMAPP_GID_MAP_ = {};
    var sheets = oemAppSS_().getSheets();
    for (var i = 0; i < sheets.length; i++) {
      OEMAPP_GID_MAP_[sheets[i].getSheetId()] = sheets[i];
    }
  }
  var sheet = OEMAPP_GID_MAP_[gid];
  if (!sheet) throw new Error('Không tìm thấy tab với gid ' + gid);
  return sheet;
}


function oemAppGetRows_(gid) {
  return oemAppGetSheetByGid_(gid).getDataRange().getValues();
}


// ---------- Chunked CacheService helpers ----------
// CacheService caps a single value at 100KB, and the bootstrap payload is far
// bigger than that (~590KB measured), so it has to be split.
//
// Chunk size is in CHARACTERS, and the limit is in BYTES — the gap matters here.
// Most Vietnamese letters carrying diacritics (ạ ấ ầ ệ ộ ...) live in Latin
// Extended Additional and cost 3 bytes each in UTF-8. So the true worst case is
// 3 bytes/char: 30k chars = 90KB, safely under the cap even for an all-Vietnamese
// string. A real payload is mostly ASCII structure and measures ~31KB per chunk.
var OEMAPP_CACHE_CHUNK_CHARS_ = 30000;

function oemAppCachePutBig_(key, str, ttlSeconds) {
  var payload = {};
  var count = Math.ceil(str.length / OEMAPP_CACHE_CHUNK_CHARS_);
  for (var i = 0; i < count; i++) {
    payload[key + '_' + i] = str.substr(i * OEMAPP_CACHE_CHUNK_CHARS_, OEMAPP_CACHE_CHUNK_CHARS_);
  }
  payload[key + '_n'] = String(count);
  CacheService.getScriptCache().putAll(payload, ttlSeconds);
}


function oemAppCacheGetBig_(key) {
  var cache = CacheService.getScriptCache();
  var count = parseInt(cache.get(key + '_n'), 10);
  if (!count) return null;

  var keys = [];
  for (var i = 0; i < count; i++) keys.push(key + '_' + i);
  var parts = cache.getAll(keys);

  // Chunks can be evicted individually under cache pressure. A partial read
  // would silently corrupt the JSON, so any missing piece = full cache miss.
  var out = '';
  for (var j = 0; j < count; j++) {
    var piece = parts[key + '_' + j];
    if (piece === null || piece === undefined) return null;
    out += piece;
  }
  return out;
}


function oemAppCacheDropBig_(key) {
  var cache = CacheService.getScriptCache();
  var count = parseInt(cache.get(key + '_n'), 10) || 0;
  var keys = [key + '_n'];
  for (var i = 0; i < count; i++) keys.push(key + '_' + i);
  cache.removeAll(keys);
}


function oemAppParseNum_(val) {
  if (val === '' || val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  var clean = String(val).replace(/,/g, '').replace(/\s/g, '').replace(/-/g, '0');
  return parseFloat(clean) || 0;
}

// Cột "Thuế suất" (BG) có thể đọc về dạng number thuần (0.08), number phần trăm
// Sheet đã tự quy đổi (0.08 luôn, KHÔNG phải 8) hoặc text "8%" tuỳ định dạng ô —
// chuẩn hoá về dạng phân số (0.08) cho mọi trường hợp, mặc định 8% nếu ô trống.

// Cột "Thuế suất" (BG) có thể đọc về dạng number thuần (0.08), number phần trăm
// Sheet đã tự quy đổi (0.08 luôn, KHÔNG phải 8) hoặc text "8%" tuỳ định dạng ô —
// chuẩn hoá về dạng phân số (0.08) cho mọi trường hợp, mặc định 8% nếu ô trống.
function oemAppParseTaxRate_(val) {
  if (val === '' || val === null || val === undefined) return 0.08;
  if (typeof val === 'number') return val > 1 ? val / 100 : val;
  var s = String(val).trim();
  var n = parseFloat(s.replace('%', '').replace(',', '.'));
  if (isNaN(n)) return 0.08;
  return n > 1 ? n / 100 : n;
}

// dd/MM/yyyy -> số nguyên có thể so sánh (yyyymmdd), dùng để tìm giao dịch gần
// nhất theo SKU khi tính "Giá mới nhất" (thay vì trung bình mọi lần bán).

// dd/MM/yyyy -> số nguyên có thể so sánh (yyyymmdd), dùng để tìm giao dịch gần
// nhất theo SKU khi tính "Giá mới nhất" (thay vì trung bình mọi lần bán).
function oemAppDateSortValue_(dateStr) {
  if (!dateStr) return -1;
  var parts = String(dateStr).split(/[\/.\-]/);
  if (parts.length < 3) return -1;
  var d = parseInt(parts[0], 10), m = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
  if (!d || !m || !y) return -1;
  return y * 10000 + m * 100 + d;
}

// Sheet cells formatted as dates come back from getValues() as JS Date
// objects, not "dd/MM/yyyy" strings like the old CSV export gave us — normalize
// so downstream logic (and the React app, unchanged) keeps working.

// Sheet cells formatted as dates come back from getValues() as JS Date
// objects, not "dd/MM/yyyy" strings like the old CSV export gave us — normalize
// so downstream logic (and the React app, unchanged) keeps working.
function oemAppNormalizeDateStr_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'GMT+7', 'dd/MM/yyyy');
  }
  return val ? String(val) : '';
}


function oemAppGetClientTextCode_(clientName, clientCode, rawCodeSearch) {
  if (rawCodeSearch && String(rawCodeSearch).length > 1 && !/^\d+$/.test(String(rawCodeSearch))) {
    return String(rawCodeSearch);
  }
  var nameUpper = String(clientName || '').toUpperCase();
  if (nameUpper.includes('TECOM')) return 'TECOM';
  if (nameUpper.includes('MAKXIM')) return 'CTMAXIMVN';
  if (nameUpper.includes('VIỆT TOÀN CẦU') || nameUpper.includes('VIETTOANCAU')) return 'CTVIETTOANCAU';
  if (nameUpper.includes('THÀNH ĐẠT')) return 'CTTHANHDAT';
  if (nameUpper.includes('SƠN HÀ') || nameUpper.includes('SONHA')) return 'CTQTSONHA';
  if (nameUpper.includes('THIÊN SƠN')) return 'CHTUANDP';
  if (nameUpper.includes('A BẮC')) return 'CHABACHN';
  return String(clientCode || rawCodeSearch || 'OEM-CLIENT');
}

// NOTE (2026-08-18): rawWeekNum (cột "Tuần" tính công thức, row[42]) là số TUẦN
// TRONG NĂM (ISO week, 1-52+) chứ KHÔNG PHẢI tuần-trong-tháng (1-5) như tên biến
// gợi ý — xác nhận qua dữ liệu thật (giá trị thấy được lên tới W34). Báo cáo DT
// Ngày/DT Sale chỉ có 5 lựa chọn Tuần 1-5 nên PHẢI luôn tính tuần-trong-tháng từ
// ngày chứng từ, không được dùng trực tiếp giá trị cột này.

// NOTE (2026-08-18): rawWeekNum (cột "Tuần" tính công thức, row[42]) là số TUẦN
// TRONG NĂM (ISO week, 1-52+) chứ KHÔNG PHẢI tuần-trong-tháng (1-5) như tên biến
// gợi ý — xác nhận qua dữ liệu thật (giá trị thấy được lên tới W34). Báo cáo DT
// Ngày/DT Sale chỉ có 5 lựa chọn Tuần 1-5 nên PHẢI luôn tính tuần-trong-tháng từ
// ngày chứng từ, không được dùng trực tiếp giá trị cột này.
function oemAppComputeWeekFromDate_(dateStr, rawWeekNum) {
  if (!dateStr) return 'W1';
  var parts = String(dateStr).split(/[\/.\-]/);
  if (parts.length >= 1) {
    var day = parseInt(parts[0], 10);
    if (day >= 1 && day <= 7) return 'W1';
    if (day >= 8 && day <= 14) return 'W2';
    if (day >= 15 && day <= 21) return 'W3';
    if (day >= 22 && day <= 28) return 'W4';
    if (day >= 29) return 'W5';
  }
  return 'W1';
}

// ---------- Auth ----------
