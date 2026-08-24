/** AI lookup chat — a SEPARATE feature from Ai.gs's order parser (per the
 * 2026-08-24 audit follow-up: "navigation" inside the app wasn't worth
 * building — clicking the sidebar is already faster than typing a command
 * for it — but grounded Q&A over data this app already holds is).
 *
 * Gemini never sees raw transaction/client tables. It gets a small set of
 * TOOLS (function declarations below) that return bounded, aggregated
 * answers computed here — so a growing Data tab never grows the prompt, and
 * every tool enforces the exact same per-Sale scoping as getBootstrap
 * (oemAppScopeOf_/oemAppMatchesSale_), not a separate, easy-to-drift ruleset.
 *
 * Does NOT cover Debt/công nợ — that tab is not read by this app at all (see
 * SETUP.md), so the system prompt tells the model to say so rather than
 * silently refuse or, worse, guess.
 */

function oemAppAiChatSystemPrompt_() {
  return [
    'Bạn là trợ lý tra cứu dữ liệu nội bộ cho nhân viên OEM Karofi (Sale/Admin/Creator/Leader).',
    'Trả lời NGẮN GỌN, bằng tiếng Việt, dựa HOÀN TOÀN vào kết quả các công cụ tra cứu được cung cấp - không tự bịa số liệu.',
    'Nếu công cụ trả về "error" hoặc không có kết quả, nói rõ là không tìm thấy thay vì đoán hay bịa số.',
    'Nếu câu hỏi cần nhiều bước (vd vừa tìm khách hàng vừa tra doanh thu của khách đó), gọi lần lượt các công cụ cần thiết trước khi trả lời, không hỏi lại người dùng những gì công cụ có thể tự tra ra.',
    'Bạn KHÔNG có quyền truy cập dữ liệu công nợ (Debt/công nợ) - nếu được hỏi, nói rõ tính năng này chưa hỗ trợ tra cứu công nợ, không suy diễn.',
    'Chỉ trả lời trong phạm vi dữ liệu kinh doanh OEM (khách hàng, doanh thu, sản phẩm, kế hoạch kinh doanh, kế hoạch SOP) - từ chối lịch sự nếu được hỏi ngoài phạm vi này.'
  ].join('\n');
}

var OEMAPP_AI_CHAT_TOOLS_ = [
  {
    name: 'find_client',
    description: 'Tìm khách hàng OEM theo tên, alias, hoặc mã khách hàng. Trả về danh sách khớp trong phạm vi bạn được xem.',
    parameters: {
      type: 'OBJECT',
      properties: { query: { type: 'STRING', description: 'Từ khoá tìm kiếm (tên, alias, hoặc mã KH).' } },
      required: ['query']
    }
  },
  {
    name: 'client_revenue',
    description: 'Tổng doanh thu và số lượng bán cho 1 khách hàng, chia theo tháng, tuỳ chọn giới hạn khoảng thời gian.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clientQuery: { type: 'STRING', description: 'Tên hoặc mã khách hàng.' },
        fromMonth: { type: 'STRING', description: 'Tháng bắt đầu, định dạng "T08-2026". Bỏ trống nếu không giới hạn.' },
        toMonth: { type: 'STRING', description: 'Tháng kết thúc, định dạng "T08-2026". Bỏ trống nếu không giới hạn.' }
      },
      required: ['clientQuery']
    }
  },
  {
    name: 'sku_info',
    description: 'Tra cứu 1 sản phẩm: giá bán niêm yết, các giao dịch gần nhất (giá/khách/số lượng), và số lượng kế hoạch SOP đã duyệt hiện hành nếu có.',
    parameters: {
      type: 'OBJECT',
      properties: { query: { type: 'STRING', description: 'Mã SKU, tên, hoặc alias sản phẩm.' } },
      required: ['query']
    }
  },
  {
    name: 'sales_plan_overview',
    description: 'Tổng quan Kế hoạch kinh doanh hiện tại (tab Plan_Thang): tổng Plan/Done/Chênh trong phạm vi bạn được xem, và danh sách khách hàng có kế hoạch lớn nhất.',
    parameters: { type: 'OBJECT', properties: {} }
  }
];

// "T08-2026" -> 202608 (sortable/comparable int), or null if not parseable.
// Same format as src/utils/period.js's month keys — a DIFFERENT format from
// Sop.gs's internal "yyyy-MM" period keys, so this is its own small parser
// rather than reusing oemAppSopParseYM_.
function oemAppTMonthSortValue_(key) {
  var m = /^T(\d{1,2})-(\d{4})$/.exec(String(key || '').trim());
  if (!m) return null;
  return parseInt(m[2], 10) * 100 + parseInt(m[1], 10);
}

function oemAppAiToolFindClient_(args, scope) {
  var q = String((args && args.query) || '').toLowerCase().trim();
  if (!q) return { error: 'Thiếu từ khoá tìm kiếm.' };
  var matches = oemAppLoadClients_()
    .filter(function (c) { return oemAppMatchesSale_(c.sale, scope); })
    .filter(function (c) {
      return (c.name || '').toLowerCase().indexOf(q) !== -1 ||
        (c.alias || '').toLowerCase().indexOf(q) !== -1 ||
        (c.code || '').toLowerCase().indexOf(q) !== -1 ||
        (c.codeSearch || '').toLowerCase().indexOf(q) !== -1;
    })
    .slice(0, 8)
    .map(function (c) { return { code: c.code, name: c.name, alias: c.alias, sale: c.sale, status: c.status }; });
  return matches.length ? { matches: matches } : { error: 'Không tìm thấy khách hàng nào khớp "' + q + '" trong phạm vi bạn được xem.' };
}

function oemAppAiToolClientRevenue_(args, scope) {
  var found = oemAppAiToolFindClient_({ query: (args && args.clientQuery) || '' }, scope);
  if (found.error) return found;
  var client = found.matches[0];

  var fromVal = args && args.fromMonth ? oemAppTMonthSortValue_(args.fromMonth) : null;
  var toVal = args && args.toMonth ? oemAppTMonthSortValue_(args.toMonth) : null;

  var clientTx = oemAppLoadTransactions_().filter(function (t) {
    if (!oemAppMatchesSale_(t.sale, scope)) return false;
    var matchesClient = t.clientCode === client.code ||
      (t.clientName || '').toLowerCase().indexOf((client.name || '').toLowerCase()) !== -1;
    if (!matchesClient) return false;
    var mv = oemAppTMonthSortValue_(t.month);
    if (fromVal && (!mv || mv < fromVal)) return false;
    if (toVal && (!mv || mv > toVal)) return false;
    return true;
  });

  var byMonth = {};
  clientTx.forEach(function (t) {
    if (!byMonth[t.month]) byMonth[t.month] = { month: t.month, qty: 0, revenue: 0 };
    byMonth[t.month].qty += t.qty;
    byMonth[t.month].revenue += t.netRevenue;
  });
  var months = Object.keys(byMonth).map(function (k) { return byMonth[k]; })
    .sort(function (a, b) { return oemAppTMonthSortValue_(a.month) - oemAppTMonthSortValue_(b.month); });

  return {
    client: { code: client.code, name: client.name },
    months: months,
    totalQty: months.reduce(function (s, m) { return s + m.qty; }, 0),
    totalRevenue: months.reduce(function (s, m) { return s + m.revenue; }, 0)
  };
}

function oemAppAiToolSkuInfo_(args, scope) {
  var q = String((args && args.query) || '').toLowerCase().trim();
  if (!q) return { error: 'Thiếu từ khoá tìm kiếm sản phẩm.' };

  var catalog = oemAppLoadMaterialCatalog_().bySku;
  var matchSku = null;
  Object.keys(catalog).some(function (sku) {
    var m = catalog[sku];
    var hit = sku.toLowerCase().indexOf(q) !== -1 ||
      (m.name || '').toLowerCase().indexOf(q) !== -1 ||
      (m.alias || '').toLowerCase().indexOf(q) !== -1;
    if (hit) matchSku = sku;
    return hit;
  });
  if (!matchSku) return { error: 'Không tìm thấy sản phẩm nào khớp "' + q + '".' };
  var m = catalog[matchSku];

  var recentTx = oemAppLoadTransactions_()
    .filter(function (t) { return t.sku === matchSku && oemAppMatchesSale_(t.sale, scope); })
    .sort(function (a, b) { return oemAppTMonthSortValue_(b.month) - oemAppTMonthSortValue_(a.month); })
    .slice(0, 5)
    .map(function (t) { return { month: t.month, price: t.price, clientName: t.clientName, qty: t.qty }; });

  var sopRow = null;
  try {
    var sopView = oemAppReadSopView_();
    var found = sopView.rows.find(function (r) { return r.sku === matchSku; });
    if (found) sopRow = { monthLabels: sopView.monthLabels, sl: found.sl };
  } catch (e) {
    // Tab "SOP" might not exist yet — sku_info still works without it.
  }

  return {
    sku: matchSku,
    name: m.name,
    group: m.group,
    listedPrice: m.suggestedPrice,
    exclusiveTo: m.exclusiveTo || null,
    recentTransactions: recentTx,
    sopForecast: sopRow
  };
}

function oemAppAiToolSalesPlanOverview_(scope) {
  var plans = oemAppLoadSalesPlans_().filter(function (p) { return oemAppMatchesSale_(p.sale, scope); });
  var totals = plans.reduce(function (acc, p) {
    acc.planKpi += p.planKpi;
    acc.planUpdate += p.planUpdate;
    acc.done += p.done;
    return acc;
  }, { planKpi: 0, planUpdate: 0, done: 0 });
  totals.chenh = totals.done - totals.planUpdate;

  var topClients = plans.slice()
    .sort(function (a, b) { return b.planUpdate - a.planUpdate; })
    .slice(0, 10)
    .map(function (p) { return { clientName: p.clientName, sale: p.sale, planUpdate: p.planUpdate, done: p.done }; });

  return { totals: totals, topClients: topClients, totalClientCount: plans.length };
}

function oemAppAiExecTool_(name, args, scope) {
  if (name === 'find_client') return oemAppAiToolFindClient_(args, scope);
  if (name === 'client_revenue') return oemAppAiToolClientRevenue_(args, scope);
  if (name === 'sku_info') return oemAppAiToolSkuInfo_(args, scope);
  if (name === 'sales_plan_overview') return oemAppAiToolSalesPlanOverview_(scope);
  return { error: 'Không có công cụ tên "' + name + '".' };
}

// One user question -> a bounded loop of (Gemini call -> maybe a tool call ->
// feed the tool's result back) until Gemini answers in plain text. `history`
// is the prior CLEAN user/model text turns (no tool-call plumbing) as
// returned by a previous call — the frontend just stores and resends it, no
// server-side session state needed for the conversation itself.
function oemAppAiChat_(token, message, history) {
  var user = oemAppRequireSession_(token);
  var scope = oemAppScopeOf_(user);
  if (!message || !String(message).trim()) throw new Error('Chưa nhập câu hỏi.');

  var userTurn = { role: 'user', parts: [{ text: String(message) }] };
  var contents = (history || []).slice();
  contents.push(userTurn);

  var MAX_ROUNDS = 4;
  for (var round = 0; round < MAX_ROUNDS; round++) {
    var body = {
      system_instruction: { parts: [{ text: oemAppAiChatSystemPrompt_() }] },
      contents: contents,
      tools: [{ functionDeclarations: OEMAPP_AI_CHAT_TOOLS_ }]
    };
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + oemAppAiModel_() + ':generateContent?key=' + encodeURIComponent(oemAppAiApiKey_());
    var response = UrlFetchApp.fetch(url, {
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
      throw new Error('Lỗi gọi Gemini API (HTTP ' + status + '): ' + errMsg);
    }

    var parsed = JSON.parse(raw);
    var candidate = parsed.candidates && parsed.candidates[0];
    var modelParts = candidate && candidate.content && candidate.content.parts;
    if (!modelParts || !modelParts.length) {
      var reason = candidate && candidate.finishReason;
      throw new Error('Gemini không trả về nội dung' + (reason ? ' (finishReason: ' + reason + ')' : '') + '.');
    }

    var functionCallPart = modelParts.filter(function (p) { return p.functionCall; })[0];
    if (functionCallPart) {
      // Push the WHOLE part object back exactly as Gemini returned it, not a
      // rebuilt {functionCall:...} — "thinking" models attach a
      // thought_signature alongside functionCall in that same part, which
      // the API requires to see again on the next call. Reconstructing the
      // part from just .functionCall silently dropped it (live error: HTTP
      // 400 "Function call is missing a thought_signature").
      contents.push({ role: 'model', parts: [functionCallPart] });
      var toolResult;
      try {
        toolResult = oemAppAiExecTool_(functionCallPart.functionCall.name, functionCallPart.functionCall.args || {}, scope);
      } catch (e) {
        toolResult = { error: e.message };
      }
      // The live API rejects role "function" ("Role 'function' is not
      // supported... valid role: ... USER ... MODEL ...") despite that being
      // the commonly-documented convention — a functionResponse part goes
      // under role "user" instead.
      contents.push({ role: 'user', parts: [{ functionResponse: { name: functionCallPart.functionCall.name, response: toolResult } }] });
      continue;
    }

    var textPart = modelParts.filter(function (p) { return p.text; })[0];
    if (textPart) {
      var modelTurn = { role: 'model', parts: [{ text: textPart.text }] };
      return { reply: textPart.text, history: (history || []).concat([userTurn, modelTurn]) };
    }

    throw new Error('Gemini trả về nội dung không xử lý được.');
  }

  throw new Error('Gemini gọi quá nhiều bước tra cứu liên tiếp mà chưa có câu trả lời — thử hỏi cụ thể/ngắn gọn hơn.');
}
