/** Đọc đơn đặt hàng bằng Gemini — đường CHÍNH của màn "AI nhận đơn".
 *
 * Khoá API không bao giờ chạm tới trình duyệt: app này không có máy chủ nào
 * ngoài Apps Script, nên lượt gọi phải nằm ở đây. Đặt một lần trong trình soạn
 * thảo Apps Script: Project Settings (bánh răng) -> Script Properties ->
 * "GEMINI_API_KEY" = <khoá>. Không commit, không đẩy qua clasp/git — Script
 * Properties chỉ sống trên project đã deploy, push/pull không đụng tới.
 *
 * 2026-09-16: gỡ hẳn tính năng "AI hỏi đáp" (AiChat.gs) và dồn toàn bộ hạn mức
 * Gemini sang đây. Đơn đặt hàng là việc phải đúng từng mã, từng số lượng; hỏi
 * đáp tra cứu thì bấm vào sidebar cũng ra. Cùng lượt đó, đường đọc đơn đổi từ
 * "bộ dò chuỗi cục bộ" (services/aiAgent.js, quay về dùng 25/08/2026) sang
 * Gemini thật, với ba lớp chống sai:
 *
 *   1. RÚT GỌN DANH MỤC TRƯỚC KHI HỎI. Trước đây trình duyệt tự gửi lên toàn
 *      bộ 400+ SKU và toàn bộ khách hàng trong payload. Giờ backend tự đọc
 *      danh mục (nó vốn đã có sẵn trong cache) rồi CHỈ đưa vào prompt những mã
 *      có dính dáng tới chữ trong đơn. Prompt ngắn đi thì tỉ lệ chọn nhầm mã
 *      giảm hẳn — và lượt gửi từ trình duyệt cũng nhẹ đi vài trăm KB trên một
 *      đường mạng hỏng chừng một nửa số lượt.
 *
 *   2. HAI LƯỢT VỚI ẢNH/PDF. Lượt 1 chỉ chép lại nguyên văn nội dung tài liệu
 *      (Gemini đọc chữ, kể cả chữ viết tay, tốt hơn hẳn Tesseract OCR cũ).
 *      Lượt 2 mới ghép danh mục đã rút gọn theo chữ vừa chép được. Nếu chỉ có
 *      văn bản gõ tay thì bỏ lượt 1.
 *
 *   3. KIỂM LẠI Ở SERVER. Mọi "sku" và "client.code" model trả về đều phải có
 *      thật trong danh mục/danh sách khách; không có thì BỎ dòng đó và ghi rõ
 *      vào warnings. Trước đây chỉ có câu dặn trong prompt, không ai ép.
 */

// HTTP 429 ("You exceeded your current quota") của Gemini dùng CHUNG một câu
// cho giới hạn theo phút (tạm thời) và hạn mức ngày đã cạn — nhìn phản hồi
// không phân biệt được. Thử lại vài lượt có giãn cách (chữa được ca tạm thời),
// còn cạn hạn mức thật thì trả nguyên câu lỗi ra ngoài.
function oemAppAiFetchWithRetry_(url, options) {
  var delaysMs = [1500, 4000];
  var response;
  for (var attempt = 0; attempt <= delaysMs.length; attempt++) {
    response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 429 || attempt === delaysMs.length) return response;
    Utilities.sleep(delaysMs[attempt]);
  }
  return response;
}

function oemAppAiApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trong Script Properties của project Apps Script (Project Settings -> Script Properties).');
  }
  return key;
}

// Đổi được qua Script Property "GEMINI_MODEL".
function oemAppAiModel_() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || 'gemini-3.6-flash';
}

function oemAppAiGoiGemini_(body) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    oemAppAiModel_() + ':generateContent?key=' + encodeURIComponent(oemAppAiApiKey_());

  var response = oemAppAiFetchWithRetry_(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var raw = response.getContentText();

  if (status !== 200) {
    var errMsg = raw;
    try { errMsg = JSON.parse(raw).error.message; } catch (e) {}
    if (status === 429) {
      throw new Error('Đã hết hạn mức gọi Gemini API (HTTP 429) - có thể do giới hạn số lệnh/phút hoặc hạn mức miễn phí trong ngày của API key này đã dùng hết. Kiểm tra lại quota trong Google AI Studio / Cloud Console, hoặc thử lại sau ít phút. Chi tiết: ' + errMsg);
    }
    throw new Error('Lỗi gọi Gemini API (HTTP ' + status + '): ' + errMsg);
  }

  var parsed = JSON.parse(raw);
  var candidate = parsed.candidates && parsed.candidates[0];
  var parts = candidate && candidate.content && candidate.content.parts;
  var textPart = parts && parts.filter(function (p) { return p.text; })[0];
  if (!textPart) {
    // finishReason SAFETY/RECITATION/MAX_TOKENS rơi vào đây mà không có chữ
    // nào — nói rõ lý do Gemini đưa ra thay vì đổ một lỗi trống.
    var reason = candidate && candidate.finishReason;
    throw new Error('Gemini không trả về nội dung' + (reason ? ' (finishReason: ' + reason + ')' : '') + ' - thử lại hoặc diễn đạt lại lệnh.');
  }
  return textPart.text;
}


// ---------- Chuẩn hoá & rút gọn danh mục ----------

// "Màng RO 100G" -> "mang ro 100g". Bỏ dấu tiếng Việt vì đơn hàng gõ vội rất
// hay mất dấu ("mang ro", "phin loc"), mà so chuỗi có dấu với chuỗi không dấu
// thì trượt sạch.
function oemAppAiChuanHoa_(s) {
  var t = String(s == null ? '' : s).toLowerCase();
  try {
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    // Runtime không có normalize thì vẫn chạy tiếp, chỉ kém khớp hơn.
  }
  t = t.replace(/đ/g, 'd');
  t = t.replace(/[^a-z0-9]+/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function oemAppAiTuKhoa_(docNorm) {
  var seen = {};
  var out = [];
  docNorm.split(' ').forEach(function (w) {
    if (w.length < 2 || seen[w]) return;
    seen[w] = 1;
    out.push(w);
  });
  return out;
}

// Điểm khớp giữa một mã vật tư và chữ trong đơn. Mã SKU xuất hiện nguyên văn
// thì ăn đứt mọi tín hiệu khác — người gõ đúng mã là người biết mình cần gì.
function oemAppAiDiemVatTu_(mat, tokens, docNorm) {
  var hay = oemAppAiChuanHoa_([
    mat.sku, mat.name, mat.alias, mat.group, (mat.learnedAliases || []).join(' ')
  ].join(' '));
  var hayPad = ' ' + hay + ' ';
  var diem = 0;

  var skuNorm = oemAppAiChuanHoa_(mat.sku);
  if (skuNorm.length >= 4 && docNorm.indexOf(skuNorm) !== -1) diem += 50;

  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (hayPad.indexOf(' ' + t + ' ') !== -1) diem += (t.length >= 4 ? 2 : 1);
    else if (t.length >= 4 && hay.indexOf(t) !== -1) diem += 0.5;
  }
  return diem;
}

// Bao nhiêu mã thì vừa: đủ rộng để không cắt mất mã đúng, đủ hẹp để model
// không phải lội qua cả danh mục. 160 mã ~ 12KB prompt.
var OEMAPP_AI_SHORTLIST_SKU_ = 160;
var OEMAPP_AI_SHORTLIST_TOI_THIEU_ = 60;
var OEMAPP_AI_SHORTLIST_KH_ = 40;

function oemAppAiRutGonVatTu_(materials, docNorm, skuUuTien) {
  var tokens = oemAppAiTuKhoa_(docNorm);
  var uuTien = skuUuTien || {};

  var chamDiem = materials.map(function (m) {
    var d = oemAppAiDiemVatTu_(m, tokens, docNorm);
    // Mã khách này từng mua: cùng một cách gọi tắt hay trỏ về SKU khác nhau
    // tuỳ khách, nên lịch sử mua là tín hiệu tách hoà tốt — nhưng chỉ là cú
    // hích, không đủ để tự chen vào khi chữ trong đơn chẳng dính gì.
    if (uuTien[m.sku] && d > 0) d += 3;
    return { mat: m, diem: d };
  });

  chamDiem.sort(function (a, b) {
    if (b.diem !== a.diem) return b.diem - a.diem;
    return (b.mat.totalQty || 0) - (a.mat.totalQty || 0);
  });

  var chon = chamDiem.filter(function (x) { return x.diem > 0; }).slice(0, OEMAPP_AI_SHORTLIST_SKU_);

  // Đơn quá ngắn / chữ trong ảnh đọc ra lèo tèo thì gần như không mã nào ăn
  // điểm. Bù bằng các mã bán chạy nhất để model vẫn có cái mà chọn, thay vì
  // nhận một danh mục rỗng rồi bịa.
  if (chon.length < OEMAPP_AI_SHORTLIST_TOI_THIEU_) {
    var daCo = {};
    chon.forEach(function (x) { daCo[x.mat.sku] = 1; });
    for (var i = 0; i < chamDiem.length && chon.length < OEMAPP_AI_SHORTLIST_TOI_THIEU_; i++) {
      if (daCo[chamDiem[i].mat.sku]) continue;
      daCo[chamDiem[i].mat.sku] = 1;
      chon.push(chamDiem[i]);
    }
  }

  return chon.map(function (x) {
    return {
      sku: x.mat.sku,
      ten: x.mat.name,
      goiTat: x.mat.alias || '',
      nhom: x.mat.group || '',
      tungMua: uuTien[x.mat.sku] ? 1 : 0
    };
  });
}

function oemAppAiRutGonKhachHang_(clients, docNorm, saleCuaToi) {
  var tokens = oemAppAiTuKhoa_(docNorm);

  var chamDiem = clients.filter(function (c) {
    return String(c.status || 'Active').toLowerCase().trim() === 'active';
  }).map(function (c) {
    var hay = oemAppAiChuanHoa_([c.code, c.codeSearch, c.name, c.alias].join(' '));
    var hayPad = ' ' + hay + ' ';
    var diem = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (hayPad.indexOf(' ' + t + ' ') !== -1) diem += (t.length >= 4 ? 2 : 1);
      else if (t.length >= 4 && hay.indexOf(t) !== -1) diem += 0.5;
    }
    if (diem > 0 && saleCuaToi && oemAppAiChuanHoa_(c.sale).indexOf(saleCuaToi) !== -1) diem += 3;
    return { c: c, diem: diem };
  });

  chamDiem.sort(function (a, b) { return b.diem - a.diem; });
  return chamDiem.filter(function (x) { return x.diem > 0; })
    .slice(0, OEMAPP_AI_SHORTLIST_KH_)
    .map(function (x) {
      return { code: x.c.code, ten: x.c.name, goiTat: x.c.alias || '', sale: x.c.sale || '' };
    });
}

// SKU khách này từng mua, tra theo mã khách. Chỉ chạy khi đã đoán/chọn được
// khách — nên gọi sau khi có clientHint, hoặc bỏ qua.
function oemAppAiSkuTungMua_(transactions, clientCode) {
  var out = {};
  var key = oemAppAiChuanHoa_(clientCode);
  if (!key) return out;
  transactions.forEach(function (t) {
    if (!t.sku) return;
    if (oemAppAiChuanHoa_(t.clientCode) === key) out[t.sku] = 1;
  });
  return out;
}


// ---------- Tab "Kits" (công thức Bộ sản phẩm) ----------

// Tuỳ chọn — không bắt buộc phải có. Mỗi Bộ = nhiều thành phần, mỗi thành phần
// có thể có nhiều dòng SKU (biến thể theo màu/loại — model chọn đúng 1 theo
// ngữ cảnh đơn). Cột: Tên gọi Bộ | Mã SKU thành phần | Vai trò | SL trong 1 Bộ | Ghi chú.
function oemAppLoadKits_() {
  var sheet;
  try {
    sheet = oemAppSS_().getSheetByName('Kits');
  } catch (e) {
    return [];
  }
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0] || !r[1]) continue; // cần ít nhất Tên gọi Bộ + Mã SKU
    out.push({
      kitName: String(r[0]),
      sku: String(r[1]),
      role: String(r[2] || ''),
      qtyPerKit: oemAppParseNum_(r[3]),
      note: String(r[4] || '')
    });
  }
  return out;
}

// Chẩn đoán cấu trúc, chạy tay từ trình soạn thảo (KHÔNG nằm trong bảng định
// tuyến — xem ghi chú "Đã gỡ 2026-09-04" trong Code.gs).
function oemAppKitsDiag_() {
  var kits = oemAppLoadKits_();
  var byName = {};
  kits.forEach(function (k) {
    if (!byName[k.kitName]) byName[k.kitName] = [];
    byName[k.kitName].push({ sku: k.sku, role: k.role, qtyPerKit: k.qtyPerKit, note: k.note });
  });
  return { rowCount: kits.length, kitNames: Object.keys(byName), components: byName };
}


// ---------- Lượt 1: chép lại nội dung tài liệu ----------

var OEMAPP_AI_MAX_FILE_ = 4;

function oemAppAiChepTaiLieu_(files, textGoY) {
  var parts = [];
  parts.push({
    text: [
      'Đây là ảnh chụp / tệp PDF của một đơn đặt hàng, tin nhắn đặt hàng, hoặc bảng kê hàng.',
      'Hãy CHÉP LẠI NGUYÊN VĂN toàn bộ nội dung đọc được, kể cả chữ viết tay.',
      'Quy tắc:',
      '- Mỗi dòng hàng trên tài liệu là MỘT dòng trong kết quả, giữ nguyên thứ tự.',
      '- Giữ nguyên chính xác con số (số lượng, đơn giá, mã hàng) — KHÔNG làm tròn, KHÔNG suy diễn.',
      '- Giữ nguyên cách viết tắt của người viết, không "dịch" sang tên chuẩn.',
      '- Nếu có tên khách hàng / người đặt / ngày, chép lên đầu.',
      '- Chỗ nào không đọc được, ghi [không đọc được] tại đúng vị trí đó thay vì đoán.',
      '- Chỉ trả về nội dung đã chép, không thêm lời bình.'
    ].join('\n')
  });

  if (textGoY) {
    parts.push({ text: 'Ghi chú kèm theo của người gửi (dùng để hiểu ngữ cảnh, đừng chép lại):\n' + textGoY });
  }

  files.slice(0, OEMAPP_AI_MAX_FILE_).forEach(function (f) {
    parts.push({
      inlineData: {
        mimeType: f.mimeType || 'image/jpeg',
        data: f.data
      }
    });
  });

  return oemAppAiGoiGemini_({
    contents: [{ role: 'user', parts: parts }],
    generationConfig: { temperature: 0 }
  });
}


// ---------- Lượt 2: ghép chữ -> mã hàng ----------

// Schema đầu ra của Gemini là một tập con OpenAPI có giới hạn (tên kiểu viết
// hoa, dùng "nullable" thay cho union) — không phải JSON-Schema như định nghĩa
// tool thông thường.
var OEMAPP_AI_RESPONSE_SCHEMA_ = {
  type: 'OBJECT',
  properties: {
    client: {
      type: 'OBJECT',
      nullable: true,
      description: 'Khách hàng nhắc tới trong đơn, hoặc null nếu không xác định được.',
      properties: {
        code: { type: 'STRING', description: 'Đúng giá trị "code" của khách hàng này trong danh sách được cung cấp - không tự bịa.' },
        confidence: { type: 'NUMBER', description: 'Độ tin cậy 0 đến 1.' },
        reason: { type: 'STRING', description: 'Vì sao chọn khách này (từ khoá nào trong đơn khớp).' }
      },
      required: ['code', 'confidence']
    },
    items: {
      type: 'ARRAY',
      description: 'Từng dòng sản phẩm nhận diện được.',
      items: {
        type: 'OBJECT',
        properties: {
          sku: { type: 'STRING', description: 'Đúng giá trị "sku" trong danh mục được cung cấp - không tự bịa mã.' },
          qty: { type: 'NUMBER', description: 'Số lượng đặt hàng của dòng này.' },
          confidence: { type: 'NUMBER', description: 'Độ tin cậy 0 đến 1 - thấp nếu chỉ đoán mò hoặc câu mơ hồ.' },
          sourceText: { type: 'STRING', description: 'Đoạn văn bản gốc tương ứng với dòng này, chép nguyên văn.' },
          note: { type: 'STRING', description: 'Điều cần người duyệt để ý ở dòng này (nếu có).' }
        },
        required: ['sku', 'qty', 'confidence', 'sourceText']
      }
    },
    warnings: {
      type: 'ARRAY',
      description: 'Bất cứ điều gì không chắc chắn, mơ hồ, hoặc không tìm được sản phẩm/khách hàng phù hợp - ghi rõ bằng tiếng Việt để Sale biết chỗ nào cần tự kiểm tra lại.',
      items: { type: 'STRING' }
    }
  },
  required: ['items', 'warnings']
};

function oemAppAiBuildSystemPrompt_(hasKits) {
  var rules = [
    'Bạn đọc đơn đặt hàng của nhân viên Sale công ty OEM Karofi và trả về đúng 1 đối tượng JSON theo schema đã cho.',
    '',
    'QUY TẮC BẮT BUỘC:',
    '- Trường "sku" trong mỗi item PHẢI là một giá trị "sku" có thật, chép nguyên văn từ DANH MỤC SẢN PHẨM trong tin nhắn. Không tự tạo mã mới, không sửa vài ký tự cho giống.',
    '- Nếu không tìm được sản phẩm nào đủ khớp với một dòng trong đơn, BỎ QUA dòng đó và ghi rõ nguyên văn dòng đó vào "warnings" thay vì chọn đại 1 mã không liên quan. Bỏ sót một dòng thì người duyệt thêm tay được; chọn nhầm mã thì đơn sai mà không ai nhìn ra.',
    '- Trường "client.code" (nếu có) PHẢI chép nguyên văn từ DANH SÁCH KHÁCH HÀNG. Không chắc là khách nào thì để client = null và ghi vào warnings.',
    '- "confidence" phải phản ánh đúng mức chắc chắn thật: dưới 0.5 khi câu mơ hồ, viết tắt lạ, hoặc chữ viết tay khó đọc; đừng mặc định cao cho mọi dòng.',
    '- "sourceText" phải chép NGUYÊN VĂN đoạn trong đơn sinh ra dòng này — người duyệt dựa vào đó để đối chiếu.',
    '- Một dòng có thể nhắc nhiều sản phẩm (nối bằng "+", hoặc liệt kê), hoặc viết số lượng bằng chữ ("năm trăm", "một nghìn") - vẫn phải tách đúng thành nhiều item.',
    '- Nếu đơn nói phủ định ("không lấy X", "bỏ X ra", "huỷ dòng X") thì KHÔNG đưa X vào items.',
    '- Nếu cùng một mã xuất hiện nhiều lần với số lượng khác nhau mà không rõ là cộng dồn hay sửa lại, giữ dòng SAU CÙNG và ghi vào warnings.',
    '- Số lượng phải là số thật đọc được trong đơn. KHÔNG bịa số lượng mặc định: dòng nào không thấy số lượng thì bỏ qua và ghi vào warnings.',
    '- Bỏ qua mọi dòng không phải hàng hoá: tiêu đề bảng, tổng cộng, VAT, tiền cọc, số điện thoại, địa chỉ.',
    '- Chỉ trả về đúng đối tượng JSON theo schema, không kèm giải thích bằng lời.'
  ];

  if (hasKits) {
    rules.push(
      '- "CÔNG THỨC BỘ SẢN PHẨM" bên dưới định nghĩa các "Bộ"/combo đã biết: mỗi Bộ gồm nhiều thành phần (mỗi thành phần là 1 hoặc nhiều dòng SKU cùng "Vai trò" - nếu 1 Vai trò có nhiều dòng SKU khác nhau, đó là các LỰA CHỌN THEO BIẾN THỂ (màu/loại...), chỉ chọn ĐÚNG 1 SKU khớp biến thể được nhắc trong đơn cho vai trò đó).',
      '- Khi đơn nhắc "Bộ <tên>" hoặc tên trùng với 1 Công thức Bộ Sản phẩm, PHẢI tách thành NHIỀU item riêng - mỗi thành phần 1 item - với SL = (SL trong 1 Bộ của thành phần đó) x (số Bộ được đặt). VÍ DỤ: "Bộ cốc" gồm "Cốc trong" SL/Bộ=1, "Cốc màu" SL/Bộ=2, "Nắp cốc" SL/Bộ=3, đơn ghi "2 bộ cốc màu xanh" thì trả về 3 item: 2 Cốc trong, 4 Cốc màu xanh (đúng SKU biến thể xanh), 6 Nắp cốc - KHÔNG trả về 1 item duy nhất cho "Bộ".',
      '- Nếu 1 thành phần có nhiều biến thể mà đơn không nói rõ biến thể nào, BỎ QUA thành phần đó và ghi rõ vào "warnings" thay vì đoán đại 1 biến thể.',
      '- Nếu "bộ"/"combo" được nhắc nhưng KHÔNG khớp Công thức Bộ Sản phẩm nào, xử lý như 1 sản phẩm đơn lẻ bình thường (tìm SKU khớp gần nhất trong danh mục), không tự suy diễn công thức.'
    );
  } else {
    rules.push('- "bộ"/"combo" trong câu thường chỉ là cách gọi một sản phẩm - danh mục không có công thức cụ thể thì xử lý cụm đó như 1 sản phẩm đơn lẻ, không tự suy diễn nhiều SKU.');
  }

  return rules.join('\n');
}


// ---------- Kiểm lại đầu ra ----------

// Mọi mã model trả về phải có thật. Đây là chốt chặn duy nhất thực sự ép được
// điều đó — câu dặn trong prompt chỉ là lời khuyên.
function oemAppAiKiemKetQua_(ketQua, materialsBySku, clientsByCode) {
  var warnings = (ketQua.warnings || []).map(function (w) { return String(w); });
  var items = [];
  var theoSku = {};

  (ketQua.items || []).forEach(function (it) {
    var sku = String((it && it.sku) || '').trim();
    var mat = materialsBySku[sku];
    if (!mat) {
      warnings.push('Bỏ dòng "' + String((it && it.sourceText) || sku || '?') +
        '": AI trả về mã "' + sku + '" không có trong danh mục sản phẩm.');
      return;
    }
    var qty = Number(it.qty);
    if (!isFinite(qty) || qty <= 0) {
      warnings.push('Bỏ dòng "' + String(it.sourceText || sku) + '": số lượng không đọc được.');
      return;
    }

    // Cùng mã xuất hiện hai lần thì CỘNG DỒN — đơn thật hay có "thêm 50 cái X"
    // ở dòng dưới. Câu dặn trong prompt đã bảo model tự xử ca "sửa lại"; tới
    // đây thì hai dòng còn sót nghĩa là hai lần đặt.
    if (theoSku[sku]) {
      theoSku[sku].qty += qty;
      theoSku[sku].sourceText += ' | ' + String(it.sourceText || '');
      theoSku[sku].confidence = Math.min(theoSku[sku].confidence, Number(it.confidence) || 0);
      return;
    }

    var dong = {
      sku: sku,
      name: mat.name,
      unit: mat.unit || 'PC',
      qty: qty,
      confidence: Math.max(0, Math.min(1, Number(it.confidence) || 0)),
      sourceText: String(it.sourceText || ''),
      note: String(it.note || '')
    };
    theoSku[sku] = dong;
    items.push(dong);
  });

  var client = null;
  if (ketQua.client && ketQua.client.code) {
    var code = String(ketQua.client.code).trim();
    var c = clientsByCode[code];
    if (c) {
      client = {
        code: c.code,
        codeSearch: c.codeSearch,
        name: c.name,
        alias: c.alias,
        sale: c.sale,
        status: c.status,
        confidence: Math.max(0, Math.min(1, Number(ketQua.client.confidence) || 0)),
        reason: String(ketQua.client.reason || '')
      };
    } else {
      warnings.push('AI trả về mã khách "' + code + '" không có trong danh sách khách hàng — vui lòng tự chọn khách.');
    }
  }

  return { client: client, items: items, warnings: warnings };
}


// ---------- Điểm vào ----------

/**
 * input = {
 *   text:        string   — lệnh/ghi chú Sale gõ tay (có thể rỗng nếu có tệp)
 *   files:       [{ data (base64 KHÔNG kèm tiền tố data:), mimeType }] — ảnh/PDF
 *   tables:      [{ name, tsv }] — các sheet Excel/CSV đã đọc sẵn ở trình duyệt
 *   clientCode:  string   — mã khách Sale đã chọn sẵn (nếu có); dùng để ưu tiên
 *                           các SKU khách này từng mua
 * }
 *
 * Trả về { client, items, warnings, docText, usedFiles, usedTables, catalogSize }.
 * `docText` là đúng phần chữ mà AI đã đọc — trả ra để màn hình cho Sale xem lại
 * và sửa rồi chạy lại, thay vì phải đoán vì sao nó hiểu sai.
 */
function oemAppAiParseOrder_(token, input) {
  var user = oemAppRequireSession_(token);
  input = input || {};

  var text = String(input.text || '').trim();
  var files = (input.files || []).filter(function (f) { return f && f.data; });
  var tables = (input.tables || []).filter(function (t) { return t && t.tsv; });

  if (!text && !files.length && !tables.length) {
    throw new Error('Không có nội dung để đọc — gõ lệnh, dán ảnh, hoặc đính kèm file Excel.');
  }

  // --- Lượt 1: ảnh/PDF -> chữ ---
  var chepDuoc = '';
  if (files.length) {
    chepDuoc = oemAppAiChepTaiLieu_(files, text);
  }

  var khoiChu = [];
  if (text) khoiChu.push('GHI CHÚ / LỆNH SALE GÕ:\n' + text);
  tables.forEach(function (t) {
    khoiChu.push('BẢNG ĐÍNH KÈM "' + String(t.name || 'Sheet') + '" (mỗi cột cách nhau bằng Tab):\n' + String(t.tsv));
  });
  if (chepDuoc) khoiChu.push('NỘI DUNG ĐỌC ĐƯỢC TỪ ẢNH/PDF ĐÍNH KÈM:\n' + chepDuoc);

  var docText = khoiChu.join('\n\n');
  var docNorm = oemAppAiChuanHoa_(docText);

  // --- Rút gọn danh mục theo đúng chữ trong đơn ---
  var catalogBlock = oemAppLoadCatalogBlock_();
  var materials = catalogBlock.materials;
  var clients = oemAppLoadClients_();

  var materialsBySku = {};
  materials.forEach(function (m) { materialsBySku[m.sku] = m; });
  var clientsByCode = {};
  clients.forEach(function (c) { clientsByCode[c.code] = c; });

  var skuUuTien = input.clientCode
    ? oemAppAiSkuTungMua_(catalogBlock.allTransactions, input.clientCode)
    : {};

  var dmSanPham = oemAppAiRutGonVatTu_(materials, docNorm, skuUuTien);
  var dsKhach = oemAppAiRutGonKhachHang_(clients, docNorm, oemAppAiChuanHoa_(user.name || user.saleId || ''));

  var kits = oemAppLoadKits_();

  // --- Lượt 2: ghép chữ -> mã ---
  var contextParts = [];
  contextParts.push('DANH MỤC SẢN PHẨM (CHỈ được chọn "sku" từ danh sách này; "tungMua"=1 nghĩa là khách này từng mua mã đó):\n' + JSON.stringify(dmSanPham));
  if (dsKhach.length) {
    contextParts.push('DANH SÁCH KHÁCH HÀNG (CHỈ được chọn "client.code" từ danh sách này):\n' + JSON.stringify(dsKhach));
  } else {
    contextParts.push('DANH SÁCH KHÁCH HÀNG: không có khách nào khớp với chữ trong đơn — để client = null và ghi vào warnings.');
  }
  if (input.clientCode && clientsByCode[input.clientCode]) {
    contextParts.push('SALE ĐÃ CHỌN SẴN KHÁCH: ' + input.clientCode + ' (' + clientsByCode[input.clientCode].name + '). Dùng đúng mã này trừ khi trong đơn ghi rõ một khách khác.');
  }
  if (kits.length) contextParts.push('CÔNG THỨC BỘ SẢN PHẨM:\n' + JSON.stringify(kits));
  contextParts.push('NỘI DUNG ĐƠN HÀNG CẦN BÓC TÁCH:\n' + docText);

  var raw = oemAppAiGoiGemini_({
    system_instruction: { parts: [{ text: oemAppAiBuildSystemPrompt_(kits.length > 0) }] },
    contents: [{ role: 'user', parts: [{ text: contextParts.join('\n\n') }] }],
    generationConfig: {
      // Bóc tách đơn hàng là việc trích xuất, không phải việc sáng tác: cùng
      // một đơn phải cho ra cùng một kết quả.
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: OEMAPP_AI_RESPONSE_SCHEMA_
    }
  });

  var ketQua;
  try {
    ketQua = JSON.parse(raw);
  } catch (e) {
    throw new Error('Gemini trả về nội dung không phải JSON hợp lệ: ' + e.message);
  }

  var sach = oemAppAiKiemKetQua_(ketQua, materialsBySku, clientsByCode);

  if (!sach.items.length && !sach.warnings.length) {
    sach.warnings.push('Không nhận diện được dòng hàng nào từ nội dung này.');
  }

  return {
    client: sach.client,
    items: sach.items,
    warnings: sach.warnings,
    docText: docText,
    usedFiles: files.length,
    usedTables: tables.length,
    catalogSize: dmSanPham.length
  };
}
