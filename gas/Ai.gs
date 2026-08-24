/** Real LLM-backed order parsing (Claude API) — replaces the old client-side
 * heuristic string-matcher + Tesseract OCR (see audit 2026-08-24: neither was
 * ever an "AI" in the language-model sense, just substring/regex matching).
 *
 * The API key never reaches the browser — this app has no server except
 * Apps Script, so the call has to happen here. Set it once via the Apps
 * Script editor: Project Settings (gear icon) -> Script Properties ->
 * Add script property -> "ANTHROPIC_API_KEY" = <key>. Never commit it, never
 * pass it through clasp/git — Script Properties live only on the deployed
 * project, untouched by push/pull.
 */

function oemAppAiApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) {
    throw new Error('Chưa cấu hình ANTHROPIC_API_KEY trong Script Properties của project Apps Script (Project Settings -> Script Properties).');
  }
  return key;
}

// Overridable via Script Property "ANTHROPIC_MODEL" (eg to try claude-sonnet-5
// for harder cases) - Haiku is the default for a cost/latency-sensitive,
// mostly-structured-extraction task like this one.
function oemAppAiModel_() {
  return PropertiesService.getScriptProperties().getProperty('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001';
}

var OEMAPP_AI_RECORD_ORDER_TOOL_ = {
  name: 'record_order',
  description: 'Ghi lại kết quả đọc hiểu một lệnh đặt hàng: khách hàng và danh sách sản phẩm/số lượng.',
  input_schema: {
    type: 'object',
    properties: {
      client: {
        type: ['object', 'null'],
        description: 'Khách hàng nhắc tới trong lệnh, hoặc null nếu không xác định được.',
        properties: {
          code: { type: 'string', description: 'Đúng giá trị "code" của khách hàng này trong danh sách khách hàng được cung cấp - không tự bịa.' },
          confidence: { type: 'number', description: 'Độ tin cậy 0 đến 1.' },
          reason: { type: 'string', description: 'Vì sao chọn khách này (từ khoá nào trong câu lệnh khớp).' }
        },
        required: ['code', 'confidence']
      },
      items: {
        type: 'array',
        description: 'Từng dòng sản phẩm nhận diện được.',
        items: {
          type: 'object',
          properties: {
            sku: { type: 'string', description: 'Đúng giá trị "sku" trong danh mục sản phẩm được cung cấp - không tự bịa mã.' },
            qty: { type: 'number', description: 'Số lượng đặt hàng của dòng này.' },
            confidence: { type: 'number', description: 'Độ tin cậy 0 đến 1 - thấp nếu chỉ đoán mò hoặc câu mơ hồ.' },
            sourceText: { type: 'string', description: 'Đoạn văn bản gốc tương ứng với dòng này.' }
          },
          required: ['sku', 'qty', 'confidence']
        }
      },
      warnings: {
        type: 'array',
        description: 'Bất cứ điều gì không chắc chắn, mơ hồ, hoặc không tìm được sản phẩm/khách hàng phù hợp - ghi rõ bằng tiếng Việt để Sale biết chỗ nào cần tự kiểm tra lại.',
        items: { type: 'string' }
      }
    },
    required: ['items', 'warnings']
  }
};

function oemAppAiBuildSystemPrompt_() {
  return [
    'Bạn đọc hiểu lệnh đặt hàng (văn bản tự nhiên tiếng Việt, hoặc ảnh chụp đơn/tin nhắn) của nhân viên Sale công ty OEM Karofi, ',
    'và ghi lại thành dữ liệu có cấu trúc bằng công cụ record_order.',
    '\n\nQUY TẮC BẮT BUỘC:',
    '- Trường "sku" trong mỗi item PHẢI là một giá trị "sku" có thật, lấy nguyên văn từ danh mục sản phẩm được cung cấp trong tin nhắn. Không được tự tạo mã mới, không được đoán mã gần giống.',
    '- Nếu không tìm được sản phẩm nào đủ khớp với một cụm từ trong lệnh, BỎ QUA dòng đó và ghi rõ lý do vào "warnings" thay vì chọn đại 1 sản phẩm không liên quan.',
    '- Trường "client.code" (nếu có) PHẢI lấy nguyên văn từ danh sách khách hàng được cung cấp. Nếu không chắc là khách nào, để client = null và ghi vào warnings.',
    '- "confidence" phải phản ánh đúng mức độ chắc chắn thực tế - thấp (dưới 0.5) khi câu mơ hồ, viết tắt lạ, hoặc chữ viết tay khó đọc trong ảnh; không mặc định cao cho mọi dòng.',
    '- Một dòng lệnh có thể nhắc nhiều sản phẩm cùng lúc (nối bằng "+", hoặc liệt kê), hoặc dùng số lượng viết bằng chữ ("năm trăm", "một nghìn") - vẫn phải trích đúng.',
    '- "bộ"/"combo" trong câu thường nghĩa là một tập hợp linh kiện liên quan (vd lõi lọc + vỏ lọc) - cân nhắc ghi nhận đủ các sản phẩm liên quan nếu danh mục cho thấy chúng thường đi cùng nhau (cùng nhóm/alias), nhưng không suy diễn quá xa nếu không có căn cứ.',
    '- Nếu lệnh đề cập ý phủ định ("không lấy X", "bỏ X ra") thì KHÔNG đưa X vào items.',
    '- Chỉ trả lời bằng cách gọi công cụ record_order, không giải thích thêm bằng lời.'
  ].join('\n');
}

// input = { text, imageBase64 (không kèm prefix data:), imageMimeType, materials: [{sku,name,alias,group}], clients: [{code,name,alias}], clientOrderedSkus: [sku,...] (optional hint) }
function oemAppAiParseOrder_(token, input) {
  oemAppRequireSession_(token);
  input = input || {};
  if (!input.text && !input.imageBase64) {
    throw new Error('Không có nội dung để đọc - nhập lệnh văn bản hoặc gửi kèm ảnh.');
  }

  var content = [];
  var contextParts = [];
  contextParts.push('DANH MỤC SẢN PHẨM (chỉ được chọn "sku" từ đây):\n' + JSON.stringify(input.materials || []));
  contextParts.push('DANH SÁCH KHÁCH HÀNG (chỉ được chọn "client.code" từ đây):\n' + JSON.stringify(input.clients || []));
  if (input.clientOrderedSkus && input.clientOrderedSkus.length) {
    contextParts.push('GỢI Ý: các mã SKU khách này từng mua trước đây (ưu tiên nếu câu lệnh mơ hồ giữa nhiều lựa chọn): ' + JSON.stringify(input.clientOrderedSkus));
  }
  if (input.text) contextParts.push('LỆNH ĐẶT HÀNG (văn bản):\n' + input.text);

  content.push({ type: 'text', text: contextParts.join('\n\n') });

  if (input.imageBase64) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: input.imageMimeType || 'image/jpeg',
        data: input.imageBase64
      }
    });
    content.push({ type: 'text', text: 'Ảnh trên là ảnh chụp/tin nhắn đơn hàng - đọc chữ trong ảnh (kể cả chữ viết tay) rồi áp dụng đúng các quy tắc.' });
  }

  var body = {
    model: oemAppAiModel_(),
    max_tokens: 2048,
    system: oemAppAiBuildSystemPrompt_(),
    messages: [{ role: 'user', content: content }],
    tools: [OEMAPP_AI_RECORD_ORDER_TOOL_],
    tool_choice: { type: 'tool', name: 'record_order' }
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': oemAppAiApiKey_(),
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var raw = response.getContentText();

  if (status !== 200) {
    var errMsg = raw;
    try { errMsg = JSON.parse(raw).error.message; } catch (e) {}
    throw new Error('Lỗi gọi Claude API (HTTP ' + status + '): ' + errMsg);
  }

  var parsed = JSON.parse(raw);
  var toolUse = (parsed.content || []).find(function (c) { return c.type === 'tool_use'; });
  if (!toolUse) {
    throw new Error('Claude không trả về kết quả có cấu trúc như mong đợi - thử lại hoặc diễn đạt lại lệnh.');
  }

  return toolUse.input;
}
