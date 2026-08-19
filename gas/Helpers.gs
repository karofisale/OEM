/** Generic helpers shared across the other files — Sheet access, number/date parsing. */

// ---------- Sheet helpers ----------

function oemAppGetSheetByGid_(gid) {
  var sheets = SpreadsheetApp.openById(OEMAPP_SHEET_ID).getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  throw new Error('Không tìm thấy tab với gid ' + gid);
}


function oemAppGetRows_(gid) {
  return oemAppGetSheetByGid_(gid).getDataRange().getValues();
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
