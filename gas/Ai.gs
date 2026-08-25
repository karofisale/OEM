/** Real LLM-backed order parsing (Google Gemini API) — replaces the old
 * client-side heuristic string-matcher + Tesseract OCR (see audit
 * 2026-08-24: neither was ever an "AI" in the language-model sense, just
 * substring/regex matching).
 *
 * The API key never reaches the browser — this app has no server except
 * Apps Script, so the call has to happen here. Set it once via the Apps
 * Script editor: Project Settings (gear icon) -> Script Properties ->
 * Add script property -> "GEMINI_API_KEY" = <key>. Never commit it, never
 * pass it through clasp/git — Script Properties live only on the deployed
 * project, untouched by push/pull.
 */

// Shared by Ai.gs and AiChat.gs. HTTP 429 ("You exceeded your current
// quota") from Gemini is the SAME message for a transient per-minute rate
// limit and a fully exhausted daily/plan quota — there's no way to tell
// which from the response alone, so retry a couple of times with backoff
// (handles the transient case) and just surface the same error if it still
// 429s after that (a real exhausted quota needs the account/plan fixed, not
// more retries).
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

// Overridable via Script Property "GEMINI_MODEL" — default set per the user's
// own trial key/tier (2026-08-24: Gemini 3.6 Flash).
function oemAppAiModel_() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || 'gemini-3.6-flash';
}

// Gemini's structured-output schema is a restricted OpenAPI subset (upper-case
// type names, "nullable" instead of a type union) — not the same shape as a
// JSON-Schema tool definition.
var OEMAPP_AI_RESPONSE_SCHEMA_ = {
  type: 'OBJECT',
  properties: {
    client: {
      type: 'OBJECT',
      nullable: true,
      description: 'Khách hàng nhắc tới trong lệnh, hoặc null nếu không xác định được.',
      properties: {
        code: { type: 'STRING', description: 'Đúng giá trị "code" của khách hàng này trong danh sách khách hàng được cung cấp - không tự bịa.' },
        confidence: { type: 'NUMBER', description: 'Độ tin cậy 0 đến 1.' },
        reason: { type: 'STRING', description: 'Vì sao chọn khách này (từ khoá nào trong câu lệnh khớp).' }
      },
      required: ['code', 'confidence']
    },
    items: {
      type: 'ARRAY',
      description: 'Từng dòng sản phẩm nhận diện được.',
      items: {
        type: 'OBJECT',
        properties: {
          sku: { type: 'STRING', description: 'Đúng giá trị "sku" trong danh mục sản phẩm được cung cấp - không tự bịa mã.' },
          qty: { type: 'NUMBER', description: 'Số lượng đặt hàng của dòng này.' },
          confidence: { type: 'NUMBER', description: 'Độ tin cậy 0 đến 1 - thấp nếu chỉ đoán mò hoặc câu mơ hồ.' },
          sourceText: { type: 'STRING', description: 'Đoạn văn bản gốc tương ứng với dòng này.' }
        },
        required: ['sku', 'qty', 'confidence']
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
    'Bạn đọc hiểu lệnh đặt hàng (văn bản tự nhiên tiếng Việt, hoặc ảnh chụp đơn/tin nhắn) của nhân viên Sale công ty OEM Karofi, ',
    'và trả về đúng 1 đối tượng JSON theo schema đã cho.',
    '\n\nQUY TẮC BẮT BUỘC:',
    '- Trường "sku" trong mỗi item PHẢI là một giá trị "sku" có thật, lấy nguyên văn từ danh mục sản phẩm được cung cấp trong tin nhắn. Không được tự tạo mã mới, không được đoán mã gần giống.',
    '- Nếu không tìm được sản phẩm nào đủ khớp với một cụm từ trong lệnh, BỎ QUA dòng đó và ghi rõ lý do vào "warnings" thay vì chọn đại 1 sản phẩm không liên quan.',
    '- Trường "client.code" (nếu có) PHẢI lấy nguyên văn từ danh sách khách hàng được cung cấp. Nếu không chắc là khách nào, để client = null và ghi vào warnings.',
    '- "confidence" phải phản ánh đúng mức độ chắc chắn thực tế - thấp (dưới 0.5) khi câu mơ hồ, viết tắt lạ, hoặc chữ viết tay khó đọc trong ảnh; không mặc định cao cho mọi dòng.',
    '- Một dòng lệnh có thể nhắc nhiều sản phẩm cùng lúc (nối bằng "+", hoặc liệt kê), hoặc dùng số lượng viết bằng chữ ("năm trăm", "một nghìn") - vẫn phải trích đúng.',
    '- Nếu lệnh đề cập ý phủ định ("không lấy X", "bỏ X ra") thì KHÔNG đưa X vào items.',
    '- Chỉ trả về đúng đối tượng JSON theo schema, không kèm giải thích bằng lời.'
  ];

  if (hasKits) {
    rules.push(
      '- "CÔNG THỨC BỘ SẢN PHẨM" bên dưới định nghĩa các "Bộ"/combo đã biết: mỗi Bộ gồm nhiều thành phần (mỗi thành phần là 1 hoặc nhiều dòng SKU cùng "Vai trò" - nếu 1 Vai trò có nhiều dòng SKU khác nhau, đó là các LỰA CHỌN THEO BIẾN THỂ (màu/loại...), chỉ chọn ĐÚNG 1 SKU khớp biến thể được nhắc trong lệnh cho vai trò đó).',
      '- Khi lệnh nhắc "Bộ <tên>" hoặc tên trùng với 1 Công thức Bộ Sản phẩm, PHẢI tách thành NHIỀU dòng item riêng - mỗi thành phần 1 dòng - với SL = (SL trong 1 Bộ của thành phần đó) x (số Bộ được đặt). VÍ DỤ: nếu "Bộ cốc" gồm thành phần "Cốc trong" SL/Bộ=1, "Cốc màu" SL/Bộ=2 (2 lựa chọn theo màu), "Nắp cốc" SL/Bộ=3, và lệnh ghi "2 bộ cốc màu xanh" thì phải trả về 3 dòng: 2 Cốc trong, 4 Cốc màu xanh (đúng SKU biến thể xanh), 6 Nắp cốc - KHÔNG trả về 1 dòng duy nhất cho "Bộ".',
      '- Nếu 1 thành phần có nhiều biến thể mà lệnh không nói rõ biến thể nào, BỎ QUA thành phần đó và ghi rõ vào "warnings" thay vì đoán đại 1 biến thể.',
      '- Nếu "bộ"/"combo" được nhắc nhưng KHÔNG khớp Công thức Bộ Sản phẩm nào, xử lý như 1 sản phẩm đơn lẻ bình thường (tìm SKU khớp gần nhất trong danh mục), không tự suy diễn công thức.'
    );
  } else {
    rules.push('- "bộ"/"combo" trong câu thường nghĩa là một tập hợp linh kiện liên quan - nếu danh mục không cho biết công thức cụ thể, xử lý cụm từ đó như 1 sản phẩm đơn lẻ (tìm SKU khớp gần nhất), không tự suy diễn nhiều SKU.');
  }

  return rules.join('\n');
}

// Tab "Kits" (tuỳ chọn — không bắt buộc phải có) định nghĩa công thức "Bộ sản
// phẩm": mỗi Bộ = nhiều thành phần, mỗi thành phần có thể có nhiều dòng SKU
// (biến thể theo màu/loại — Gemini chọn đúng 1 theo ngữ cảnh đơn hàng).
// Cột: Tên gọi Bộ | Mã SKU thành phần | Vai trò | SL trong 1 Bộ | Ghi chú.
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

// No-login structural diagnostic (same tier as ping/sopDiag) — checks the
// real "Kits" tab content directly (oemAppLoadKits_ reads the Sheet live, no
// cache), for telling apart "tab/rows wrong" from "frontend served a stale
// getBootstrap cached before this field existed".
function oemAppKitsDiag_() {
  var kits = oemAppLoadKits_();
  var byName = {};
  kits.forEach(function (k) {
    if (!byName[k.kitName]) byName[k.kitName] = [];
    byName[k.kitName].push({ sku: k.sku, role: k.role, qtyPerKit: k.qtyPerKit, note: k.note });
  });
  return { rowCount: kits.length, kitNames: Object.keys(byName), components: byName };
}

// DORMANT since 2026-08-25: AIOrderAgent.jsx rolled back to the local
// heuristic parser (src/services/aiAgent.js) after repeated API quota/auth
// issues, so nothing currently calls this — still routed in Code.gs, kept
// working (see the unit test) in case order parsing switches back to Gemini.
//
// input = { text, imageBase64 (không kèm prefix data:), imageMimeType, materials: [{sku,name,alias,group}], clients: [{code,name,alias}] }
function oemAppAiParseOrder_(token, input) {
  oemAppRequireSession_(token);
  input = input || {};
  if (!input.text && !input.imageBase64) {
    throw new Error('Không có nội dung để đọc - nhập lệnh văn bản hoặc gửi kèm ảnh.');
  }

  var kits = oemAppLoadKits_();

  var parts = [];
  var contextParts = [];
  contextParts.push('DANH MỤC SẢN PHẨM (chỉ được chọn "sku" từ đây):\n' + JSON.stringify(input.materials || []));
  contextParts.push('DANH SÁCH KHÁCH HÀNG (chỉ được chọn "client.code" từ đây):\n' + JSON.stringify(input.clients || []));
  if (kits.length) contextParts.push('CÔNG THỨC BỘ SẢN PHẨM:\n' + JSON.stringify(kits));
  if (input.text) contextParts.push('LỆNH ĐẶT HÀNG (văn bản):\n' + input.text);

  parts.push({ text: contextParts.join('\n\n') });

  if (input.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: input.imageMimeType || 'image/jpeg',
        data: input.imageBase64
      }
    });
    parts.push({ text: 'Ảnh trên là ảnh chụp/tin nhắn đơn hàng - đọc chữ trong ảnh (kể cả chữ viết tay) rồi áp dụng đúng các quy tắc.' });
  }

  var body = {
    system_instruction: { parts: [{ text: oemAppAiBuildSystemPrompt_(kits.length > 0) }] },
    contents: [{ role: 'user', parts: parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: OEMAPP_AI_RESPONSE_SCHEMA_
    }
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + oemAppAiModel_() + ':generateContent?key=' + encodeURIComponent(oemAppAiApiKey_());

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
  var textPart = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
  if (!textPart || !textPart.text) {
    // finishReason of SAFETY/RECITATION/MAX_TOKENS etc lands here with no
    // usable text — surface whatever Gemini gave instead of a bare crash.
    var reason = candidate && candidate.finishReason;
    throw new Error('Gemini không trả về kết quả có cấu trúc như mong đợi' + (reason ? ' (finishReason: ' + reason + ')' : '') + ' - thử lại hoặc diễn đạt lại lệnh.');
  }

  try {
    return JSON.parse(textPart.text);
  } catch (e) {
    throw new Error('Gemini trả về nội dung không phải JSON hợp lệ: ' + e.message);
  }
}
