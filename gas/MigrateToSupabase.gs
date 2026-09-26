/**
 * MigrateToSupabase.gs — nạp toàn bộ Sheet OEM vào Postgres (schema `oem`) và
 * đối chiếu kết quả, qua Edge Function `oem-api`.
 *
 * VIỆC Ở ĐÂY CHỈ LÀ ĐỌC TAB RỒI GỬI ĐI. Mọi quyết định ánh xạ cột, khử trùng,
 * cảnh báo nằm ở phía nhận (Karofi-ID/supabase/functions/oem-api/migrate.js),
 * nơi có bộ test chạy trên Postgres thật — không nhân đôi logic sang đây.
 *
 * Ô kiểu Date đổi thành chuỗi 'D:yyyy-MM-dd HH:mm:ss' theo GMT+7 (đúng múi
 * giờ app vẫn dùng để hiển thị) vì JSON không chở được Date; phía nhận tự đổi
 * sang định dạng từng tab cần.
 *
 * Chạy qua Run.gs, theo thứ tự:
 *   run_supabase_1_taoSecret()   tạo Script Property OEM_MIGRATE_SECRET
 *   run_supabase_2_napDuLieu()   xoá sạch và nạp lại MỌI bảng trong schema oem
 *   run_supabase_3_doiChieu()    dựng payload CŨ từ Sheet (đúng hàm app đang
 *                                dùng) rồi nhờ oem-api so với payload MỚI
 * Nạp lại bao nhiêu lần cũng được — trước lúc cắt luồng không ai đọc schema oem.
 *
 * URL oem-api không phải bí mật nên để hằng số.
 */

var MIG_OEM_API_URL_ = 'https://zzbnxyvjpiuhxauagbgh.supabase.co/functions/v1/oem-api';
var MIG_KHUC_DATA_ = 2000;

/**
 * Tab Sheet -> tên tab phía nhận. Đọc theo gid hoặc theo tên, như code app.
 * Là HÀM chứ không phải biến toàn cục: OEMAPP_GIDS nằm ở Code.gs, và một biến
 * toàn cục tham chiếu nó sẽ nổ lúc NẠP script nếu file này được nạp trước —
 * kéo đổ luôn doPost của app đang chạy thật.
 */
function migTabs_() {
  return [
    { tab: 'users', gid: OEMAPP_GIDS.USERS },
    { tab: 'clients', gid: OEMAPP_GIDS.CLIENTS },
    { tab: 'products', ten: 'Products' },
    { tab: 'plan_thang', gid: OEMAPP_GIDS.PLAN_THANG },
    { tab: 'plan_nam', ten: 'Plan2026' },
    { tab: 'orders', ten: 'Orders' },
    { tab: 'sop_plan', ten: 'SOP_Plan' },
    { tab: 'sop_published', ten: 'SOP' },
    { tab: 'debt', ten: 'Debt' },
    { tab: 'price_proposals', ten: 'Gia_DeXuat' },
    { tab: 'client_prices', ten: 'Gia_KhachHang', tuyChon: true },
    { tab: 'cost', ten: 'Cost' },
    { tab: 'bom', ten: 'BOM' },
    { tab: 'kits', ten: 'Kits', tuyChon: true },
    { tab: 'heartbeat', ten: 'JobHeartbeat', tuyChon: true }
  ];
}

function migSecret_() {
  var s = PropertiesService.getScriptProperties().getProperty('OEM_MIGRATE_SECRET');
  if (!s) throw new Error('Chưa đặt Script Property OEM_MIGRATE_SECRET (phải khớp secret cùng tên của oem-api).');
  return s;
}

function migGoi_(fn, args) {
  var res = UrlFetchApp.fetch(MIG_OEM_API_URL_, {
    method: 'post',
    contentType: 'text/plain',
    payload: JSON.stringify({ fn: fn, args: args }),
    muteHttpExceptions: true
  });
  var body = res.getContentText();
  var out;
  try { out = JSON.parse(body); } catch (e) {
    throw new Error('oem-api trả về không phải JSON (HTTP ' + res.getResponseCode() + '): ' + body.slice(0, 200));
  }
  if (out.error) throw new Error(out.error);
  return out.result;
}

function migGanNhanNgay_(rows) {
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    for (var j = 0; j < r.length; j++) {
      if (r[j] instanceof Date) r[j] = 'D:' + Utilities.formatDate(r[j], 'GMT+7', 'yyyy-MM-dd HH:mm:ss');
    }
  }
  return rows;
}

function migDocTab_(t) {
  var sheet = t.gid ? oemAppGetSheetByGid_(t.gid) : oemAppSS_().getSheetByName(t.ten);
  if (!sheet) {
    if (t.tuyChon) return null;
    throw new Error('Không thấy tab "' + (t.ten || t.gid) + '".');
  }
  return migGanNhanNgay_(sheet.getDataRange().getValues());
}

function migDongBaoCao_(kq) {
  var s = kq.tab + ': nhận ' + kq.nhan + ' · chèn ' + kq.chen + ' · bỏ ' + kq.boQua;
  if (kq.trung) s += ' · TRÙNG ' + kq.trung + ' (' + kq.mauTrung.join(', ') + ')';
  (kq.canhBao || []).forEach(function (c) { s += '\n    ! ' + c; });
  return s;
}

/** Xoá sạch rồi nạp lại mọi bảng. In báo cáo ra Nhật ký thực thi. */
function migNapDuLieu_() {
  var secret = migSecret_();
  var out = ['=== NẠP SHEET OEM -> POSTGRES (schema oem) ==='];

  migTabs_().forEach(function (t) {
    var rows = migDocTab_(t);
    if (!rows) { out.push(t.tab + ': (không có tab, bỏ qua)'); return; }
    out.push(migDongBaoCao_(migGoi_('adminMigrate', [secret, t.tab, rows, { reset: true }])));
  });

  // Tab Data lớn nhất -> gửi từng khúc, không kèm dòng tiêu đề, khúc đầu reset
  // (kể cả khi tab rỗng: vẫn gửi một khúc rỗng để bảng được xoá sạch).
  var data = migGanNhanNgay_(oemAppGetRows_(OEMAPP_GIDS.TRANSACTIONS)).slice(1);
  var khuc = [];
  for (var i = 0; i < data.length; i += MIG_KHUC_DATA_) khuc.push(data.slice(i, i + MIG_KHUC_DATA_));
  if (!khuc.length) khuc.push([]);
  var tong = { tab: 'transactions', nhan: 0, chen: 0, boQua: 0, trung: 0, mauTrung: [], canhBao: [] };
  khuc.forEach(function (rows, k) {
    var kq = migGoi_('adminMigrate', [secret, 'transactions', rows, { reset: k === 0 }]);
    tong.nhan += kq.nhan; tong.chen += kq.chen; tong.boQua += kq.boQua;
    tong.canhBao = tong.canhBao.concat(kq.canhBao || []);
  });
  out.push(migDongBaoCao_(tong));

  var bao = out.join('\n');
  Logger.log(bao);
  return bao;
}

/**
 * Đối chiếu: dựng payload bằng CHÍNH các hàm app đang dùng (đọc Sheet, không
 * qua cache) rồi gửi sang oem-api so với bản dựng từ Postgres.
 *
 * `rowIndex` bỏ qua: bản cũ là số dòng Sheet, bản mới là id — khác có chủ ý.
 */
function migDoiChieu_() {
  var secret = migSecret_();
  oemAppInvalidateBootstrap_();
  oemAppInvalidateCatalog_();

  var boQua = ['rowIndex', 'planDefaultMonth'];
  var planFull = oemAppLoadPlan2026_();
  var plan2026 = {};
  Object.keys(planFull).forEach(function (c) {
    plan2026[c] = { months: planFull[c].months, name: planFull[c].name, pic: planFull[c].pic };
  });

  var cu = {
    bootstrap: oemAppBuildBootstrap_({ all: true, saleId: '', key: 'all' }),
    reportContext: { plan2026: plan2026, baselines2025: oemAppLoad2025Baselines_() },
    sopView: oemAppReadSopView_(),
    debtView: { rows: oemAppLoadDebtRows_() },
    orders: migDocOrdersCu_(),
    clients: oemAppLoadClients_()
  };

  var out = ['=== ĐỐI CHIẾU Sheet (cũ) vs Postgres (mới) ==='];
  Object.keys(cu).forEach(function (kind) {
    var kq = migGoi_('adminCompare', [secret, kind, cu[kind], boQua]);
    out.push(kind + ': ' + (kq.khop ? 'KHỚP' : 'LỆCH ' + kq.soKhac + (kq.soKhac >= 60 ? '+' : '') + ' chỗ'));
    (kq.khac || []).slice(0, 25).forEach(function (d) { out.push('    ' + d); });
  });
  var bao = out.join('\n');
  Logger.log(bao);
  return bao;
}

/** Thân của oemAppGetOrders_ không kèm kiểm phiên (hàm gốc đòi token). */
function migDocOrdersCu_() {
  var rows = oemAppGetOrdersSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[1] && !r[2]) continue;
    out.push({
      rowIndex: i + 1, stt: r[0], sku: String(r[1] || ''), name: String(r[2] || ''),
      qty: oemAppParseNum_(r[3]), price: oemAppParseNum_(r[4]), total: oemAppParseNum_(r[5]),
      orderNo: String(r[6] || ''), clientCode: String(r[7] || ''), clientCodeSearch: String(r[8] || ''),
      createdAt: oemAppNormalizeDateStr_(r[9]) || String(r[9] || ''), pic: String(r[10] || ''),
      updateAlias: String(r[11] || '')
    });
  }
  return out;
}

/**
 * Tạo secret nạp dữ liệu nếu chưa có. KHÔNG in giá trị ra log (Nhật ký thực
 * thi không tự xoá) — mở Project Settings > Script Properties để copy sang
 * Supabase > Edge Functions > Secrets, tên OEM_MIGRATE_SECRET.
 */
function migTaoSecret_() {
  var props = PropertiesService.getScriptProperties();
  var co = props.getProperty('OEM_MIGRATE_SECRET');
  if (!co) {
    co = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('OEM_MIGRATE_SECRET', co);
  }
  var bao = 'OEM_MIGRATE_SECRET đã có (' + co.length + ' ký tự). Mở ⚙ Project Settings > Script Properties ' +
            'để copy giá trị, dán vào Supabase > Edge Functions > Secrets với đúng tên OEM_MIGRATE_SECRET.';
  Logger.log(bao);
  return bao;
}
