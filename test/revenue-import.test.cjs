/**
 * revenue-import.test.cjs — kiểm panel "Nhập ZSD450" (tab Lịch sử doanh thu).
 *
 *   node test/revenue-import.test.cjs
 *
 * `.cjs` vì package.json là "type":"module" — cùng lý do với portalstats.test.cjs.
 *
 * Ba nhóm rủi ro:
 *
 *   1-2. TRÔI LỆCH. Bản đồ 65 cột tồn tại HAI BẢN: `src/utils/zsd450.js` và
 *        `Scripts/up-dt-oem/push_to_sheet.py`. SAP đổi tên một cột mà chỉ sửa
 *        một bên thì bên kia im lặng gửi sai — không ném lỗi, chỉ ra số sai.
 *        Hai mục này đọc thẳng mã nguồn Python và so từng phần tử.
 *   3-8. LOGIC ĐỌC FILE. Mỗi mục là một cái bẫy đã có thật trong dữ liệu ZSD450.
 *   9-10. NỐI DÂY. Cơ chế đúng mà không ai gọi thì panel không chạy.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const GAS = path.join(__dirname, '..', 'gas');
const PY = 'D:/Operation/Claude/Scripts/up-dt-oem/push_to_sheet.py';

let pass = 0, fail = 0;
function check(ten, dieuKien, them) {
  if (dieuKien) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}

// ---------------------------------------------------------------------
// Nạp module thuần. Nó là ESM; bỏ chữ `export ` rồi chạy trong vm là đủ —
// không có import nào bên trong, đó là điều kiện để tách nó ra khỏi React.
// ---------------------------------------------------------------------
function napModule() {
  const src = fs.readFileSync(path.join(SRC, 'utils', 'zsd450.js'), 'utf8');
  if (/^\s*import\s/m.test(src)) {
    throw new Error('zsd450.js đã có import — nó phải giữ thuần để test nạp được kiểu này.');
  }
  // Tên các thứ được export, lấy từ chính mã nguồn — thêm một export mới thì
  // nó tự nằm trong tầm test, không phải nhớ sửa danh sách ở đây.
  const ten = (src.match(/^export\s+(?:const|function)\s+([A-Za-z0-9_]+)/gm) || [])
    .map((d) => d.replace(/^export\s+(?:const|function)\s+/, ''));
  if (!ten.length) throw new Error('zsd450.js không export gì cả?');

  const sandbox = { Set, Date, String, Number, Object, Array, Math, JSON, isNaN, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // `const`/`let` chạy trong vm KHÔNG trở thành thuộc tính của sandbox (chỉ
  // `var` mới thế), nên phải gom lại bằng một câu lệnh cuối.
  vm.runInContext(
    src.replace(/^export\s+/gm, '') +
    '\nglobalThis.__xuat = { ' + ten.join(', ') + ' };',
    sandbox, { filename: 'zsd450.js' }
  );
  return sandbox.__xuat;
}
const m = napModule();

/** Lấy một danh sách chuỗi Python (['a', 'b'] hoặc {'a', 'b'}) theo tên biến. */
function danhSachPython(nguon, tenBien, mo, dong) {
  const i = nguon.indexOf(tenBien + ' = ' + mo);
  if (i < 0) throw new Error('Không thấy ' + tenBien + ' trong push_to_sheet.py');
  const j = nguon.indexOf('\n' + dong, i);
  const than = nguon.slice(i, j);
  // Bỏ chú thích cuối dòng trước khi bắt chuỗi — vài mục có `# công thức mảng`.
  return than.split('\n').slice(1)
    .map((d) => d.split('#')[0])
    .map((d) => { const k = d.match(/"([^"]*)"/); return k ? k[1] : null; })
    .filter((x) => x !== null);
}

const pySrc = fs.readFileSync(PY, 'utf8');

console.log('\n1. DATA_HEADERS — 65 cột, đúng thứ tự, khớp bản Python');
{
  const py = danhSachPython(pySrc, 'DATA_HEADERS', '[', ']');
  const js = m.DATA_HEADERS;
  check('bản Python đọc được 65 cột', py.length === 65, py.length);
  check('bản JS cũng 65 cột', js.length === 65, js.length);
  // Thứ tự LÀ hợp đồng: replaceMonth_ ghi theo VỊ TRÍ, không theo tên. Lệch một
  // ô là cả tháng dữ liệu vào sai cột mà không có gì báo.
  const lech = [];
  for (let i = 0; i < Math.max(py.length, js.length); i++) {
    if (py[i] !== js[i]) lech.push(`#${i}: py="${py[i]}" js="${js[i]}"`);
  }
  check('từng cột khớp đúng thứ tự', lech.length === 0, lech.slice(0, 5));
}

console.log('\n2. FORMULA_OR_MANUAL và SKIP_CUSTOMER_CODES khớp bản Python');
{
  const pyF = danhSachPython(pySrc, 'FORMULA_OR_MANUAL', '{', '}').sort();
  const jsF = Array.from(m.FORMULA_OR_MANUAL).sort();
  check('7 cột công thức/điền tay', pyF.length === 7 && jsF.length === 7, [pyF.length, jsF.length]);
  check('khớp từng cột', JSON.stringify(pyF) === JSON.stringify(jsF), [pyF, jsF]);

  const pyS = (pySrc.match(/SKIP_CUSTOMER_CODES = \{([^}]*)\}/) || [])[1] || '';
  const pySet = (pyS.match(/"([^"]*)"/g) || []).map((x) => x.replace(/"/g, '')).sort();
  const jsSet = Array.from(m.SKIP_CUSTOMER_CODES).sort();
  check('khách nội bộ bỏ qua khớp nhau', JSON.stringify(pySet) === JSON.stringify(jsSet), [pySet, jsSet]);

  // Mọi cột công thức phải thật sự nằm trong danh sách 65 — một cái tên gõ sai
  // ở đây thì cột đó KHÔNG được chừa ra, và ARRAYFORMULA của nó bị ghi đè.
  const laC = jsF.every((h) => m.DATA_HEADERS.indexOf(h) >= 0);
  check('mọi cột công thức đều có trong DATA_HEADERS', laC);
}

// --------------------------- dựng lưới thử ---------------------------

const NGAY = m.DATA_HEADERS.indexOf('Ngày phát sinh công nợ');
const KHACH = m.DATA_HEADERS.indexOf('Mã khách');
const THUE = m.DATA_HEADERS.indexOf('Thuế suất');
const DTT = m.DATA_HEADERS.indexOf('Doanh thu thuần VND');

/** Một dòng đủ 65 ô theo đúng thứ tự header, rồi ghi đè vài ô. */
function dong(ghiDe) {
  const r = m.DATA_HEADERS.map((h, i) => 'v' + i);
  Object.keys(ghiDe).forEach((k) => { r[Number(k)] = ghiDe[k]; });
  return r;
}
function luoi(...dongs) {
  return [m.DATA_HEADERS.slice()].concat(dongs);
}

console.log('\n3. Dòng "nhãn số cột" của SAP bị loại, dòng thật thì không');
{
  // ZSD450 hay chèn 1,2,3,… ngay dưới tiêu đề. Nó CÓ giá trị nên lọc theo rỗng
  // là không bắt được — phải lọc theo KIỂU (phải là Date thật).
  const nhan = dong({}); m.DATA_HEADERS.forEach((h, i) => { nhan[i] = i + 1; });
  const that = dong({ [NGAY]: new Date(2026, 8, 15), [KHACH]: '1002001' });
  const r = m.docLuoi(luoi(nhan, that));
  check('chỉ giữ 1 dòng thật', r.rows.length === 1, r.rows.length);
  check('đếm ra dòng bị loại', r.boQuaKhongPhaiNgay === 1, r.boQuaKhongPhaiNgay);
  check('tháng suy từ dữ liệu', r.thang === '2026-09', r.thang);
}

console.log('\n4. Khách nội bộ 1004554 không vào doanh thu');
{
  const a = dong({ [NGAY]: new Date(2026, 8, 2), [KHACH]: '1004554' });
  const b = dong({ [NGAY]: new Date(2026, 8, 3), [KHACH]: '1004554.0' }); // Excel trả số
  const c = dong({ [NGAY]: new Date(2026, 8, 4), [KHACH]: '1002001' });
  const r = m.docLuoi(luoi(a, b, c));
  check('bỏ cả dạng "1004554" và "1004554.0"', r.boQuaKhachNoiBo === 2, r.boQuaKhachNoiBo);
  check('giữ khách bình thường', r.rows.length === 1);
}

console.log('\n5. Bảy cột công thức/điền tay phải là null, không phải chuỗi rỗng');
{
  const r = m.docLuoi(luoi(dong({ [NGAY]: new Date(2026, 8, 5), [KHACH]: '1002001' })));
  const out = r.rows[0];
  check('đủ 65 ô', out.length === 65, out.length);
  const sai = [];
  m.DATA_HEADERS.forEach((h, i) => {
    if (m.FORMULA_OR_MANUAL.has(h) && out[i] !== null) sai.push(h);
  });
  // null thì replaceMonth_ chừa ô ra; chuỗi rỗng là GHI một ô rỗng đè lên
  // ARRAYFORMULA — khác nhau hoàn toàn, và cái sau giết công thức cả cột.
  check('mọi ô công thức đều null', sai.length === 0, sai);
  check('ô thường vẫn có giá trị', out[m.DATA_HEADERS.indexOf('Tên khách')] !== null);
}

console.log('\n6. Thuế suất "08 %" phải thành số 0.08');
{
  const r = m.docLuoi(luoi(dong({ [NGAY]: new Date(2026, 8, 6), [KHACH]: '1002001', [THUE]: '08 %' })));
  // Cột "Doanh thu thuần sau VAT" tính (1+Thuế suất)×DT thuần. Để nguyên chuỗi
  // là #VALUE! cả cột — đã gặp thật tháng 8/2026.
  check('"08 %" -> 0.08', r.rows[0][THUE] === 0.08, r.rows[0][THUE]);
  check('"10%" -> 0.1', m.docPhanTram('10%') === 0.1, m.docPhanTram('10%'));
  check('"8,5 %" (dấu phẩy) -> 0.085', m.docPhanTram('8,5 %') === 0.085, m.docPhanTram('8,5 %'));
  check('số thì giữ nguyên', m.docPhanTram(0.08) === 0.08);
  check('chuỗi rỗng giữ nguyên, không thành 0', m.docPhanTram('') === '');
  check('chữ lạ giữ nguyên chứ không thành NaN', m.docPhanTram('miễn thuế') === 'miễn thuế');
}

console.log('\n7. Ngày gửi đi dạng yyyy-MM-dd — đúng thứ normalizeCell_ nhận');
{
  const r = m.docLuoi(luoi(dong({ [NGAY]: new Date(2026, 8, 7), [KHACH]: '1002001' })));
  // normalizeCell_ bên up-dt-oem chỉ nhận /^\d{4}-\d{2}-\d{2}$/; dạng khác đi
  // thẳng vào ô dưới dạng chuỗi và cột ngày của tab Data hỏng.
  check('ô ngày là "2026-09-07"', r.rows[0][NGAY] === '2026-09-07', r.rows[0][NGAY]);
  check('tháng 1 chữ số vẫn có số 0 đứng đầu', m.ngayChuoi(new Date(2026, 0, 5)) === '2026-01-05');
}

console.log('\n8. Hai ca phải CHẶN chứ không phải cảnh báo');
{
  // File hai tháng: replaceMonth_ xoá đúng MỘT tháng rồi chèn TẤT CẢ dòng —
  // nên dòng của tháng còn lại nằm cạnh dòng cũ của chính nó, thành nhân đôi.
  const r = m.docLuoi(luoi(
    dong({ [NGAY]: new Date(2026, 7, 30), [KHACH]: '1002001' }),
    dong({ [NGAY]: new Date(2026, 8, 1), [KHACH]: '1002001' })
  ));
  check('phát hiện file nhiều tháng', r.nhieuThang.length === 2, r.nhieuThang);
  check('liệt kê đúng hai tháng', JSON.stringify(r.nhieuThang) === '["2026-08","2026-09"]', r.nhieuThang);

  // Thiếu cột: SAP đổi layout. Báo ra tên cột thiếu, đừng gửi một payload lệch.
  const thieu = m.docLuoi([
    m.DATA_HEADERS.filter((h) => h !== 'Doanh thu thuần VND'),
    []
  ]);
  check('phát hiện thiếu cột', thieu.thieuCot.length === 1, thieu.thieuCot);
  check('không trả dòng nào khi thiếu cột', thieu.rows.length === 0);
  // Cột công thức KHÔNG cần có trong file — Sheet tự tính. Đòi chúng là bắt
  // người dùng đi tìm một cột SAP không bao giờ xuất ra.
  const khongCoCotCongThuc = m.docLuoi(luoi(dong({ [NGAY]: new Date(2026, 8, 8), [KHACH]: '1002001' })));
  check('không đòi 7 cột công thức phải có trong file', khongCoCotCongThuc.thieuCot.length === 0,
    khongCoCotCongThuc.thieuCot);

  check('lưới rỗng thì báo thiếu cột, không nổ', m.docLuoi([]).thieuCot.length === 58,
    m.docLuoi([]).thieuCot.length);
}

console.log('\n9. Backend đã nối dây, và chặn đúng ba ca nguy hiểm');
{
  const code = fs.readFileSync(path.join(GAS, 'Code.gs'), 'utf8');
  check('có trong bảng định tuyến',
    /importRevenueExcel:\s*oemAppImportRevenueExcel_/.test(code));
  // Không có tên trong WRITE_FNS thì không chạy trong oemAppRunExclusive_, và
  // hai lượt nhập chồng nhau sẽ xen kẽ giữa pha xoá và pha ghi.
  check('có trong OEMAPP_WRITE_FNS_ (chạy trong khoá)',
    /OEMAPP_WRITE_FNS_[\s\S]{0,600}?importRevenueExcel:\s*1/.test(code));

  const ri = fs.readFileSync(path.join(GAS, 'RevenueImport.gs'), 'utf8');
  check('tự kiểm phiên đăng nhập', ri.indexOf('oemAppRequireSession_(token)') >= 0);
  check('chặn vai không phải admin/creator', /\['admin',\s*'creator'\]/.test(ri));
  // 0 dòng: replaceMonth_ xoá sạch tháng rồi mới chèn, nên gọi với mảng rỗng
  // là xoá trắng tháng đó mà không có gì thay thế.
  check('từ chối payload 0 dòng', /if \(!rows \|\| !rows\.length\)/.test(ri));
  check('kiểm định dạng tháng', /\^\\d\{4\}-\\d\{2\}\$/.test(ri));
  // Secret phải ở Script Properties. Kho này PUBLIC — chuỗi nào lọt xuống
  // client là công khai.
  check('secret đọc từ Script Properties', ri.indexOf('PropertiesService.getScriptProperties()') >= 0);
  check('không hardcode secret nào', !/secret\s*[:=]\s*['"][A-Za-z0-9]{6,}['"]/.test(ri));
  check('dọn cache bootstrap sau khi ghi', ri.indexOf('oemAppInvalidateBootstrap_()') >= 0);
}

console.log('\n10. Client: hạn giờ dài hơn mặc định, và panel được gắn vào tab');
{
  const api = fs.readFileSync(path.join(SRC, 'services', 'api.js'), 'utf8');
  // Mặc định 60 giây; backend còn chuyển tiếp sang up-dt-oem nơi replaceMonth_
  // xoá cả tháng rồi chèn lại. push_to_sheet.py để 180 giây cho đúng việc này.
  check('importRevenueExcel dùng hạn giờ 180 giây',
    /importRevenueExcel'\s*,\s*\[token,\s*month,\s*rows\]\s*,\s*180000/.test(api));
  check('lượt thử lại giữ nguyên hạn giờ đó',
    /callApiAttempt\(fn, args, attempt \+ 1, timeoutMs\)/.test(api));

  const grid = fs.readFileSync(path.join(SRC, 'components', 'TransactionGrid.jsx'), 'utf8');
  check('panel nằm trong tab Lịch sử doanh thu', grid.indexOf('RevenueImportPanel') >= 0);
  check('nút chỉ hiện với admin/creator', /\['admin',\s*'creator'\]\.includes\(activeUser\?\.role\)/.test(grid));

  const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
  // Dữ liệu vừa do một dự án Apps Script KHÁC ghi, nên cache bootstrap không
  // có đường nào tự biết là nó đã cũ — phải ép đọc lại.
  check('nhập xong thì ép tải lại dữ liệu', /onImported=\{\(\) => fetchAllData\(true\)\}/.test(app));

  const panel = fs.readFileSync(path.join(SRC, 'components', 'transactions', 'RevenueImportPanel.jsx'), 'utf8');
  // Không có cellDates thì mọi ô ngày về dạng SỐ, dòng nào cũng trượt phép
  // kiểm "phải là Date" và cả bảng bị bỏ qua — im lặng, không lỗi.
  check('đọc file với cellDates: true', /cellDates:\s*true/.test(panel));
  check('có bước xác nhận trước khi ghi', panel.indexOf('ConfirmDialog') >= 0);
}

// =====================================================================
// Nút "Cào từ SAP" — giao thức karofi-oem://
// =====================================================================

const PROTO = 'D:/Operation/Claude/Scripts/karofi-oem-protocol';
const docNeuCo = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

console.log('\n11. Phép lọc URL trong chay.vbs — CỬA CHẶN DUY NHẤT');
{
  const vbs = docNeuCo(path.join(PROTO, 'chay.vbs'));
  check('có file chay.vbs', vbs.length > 0);

  // Một giao thức đã đăng ký thì MỌI trang web đều gọi được. Chuỗi URL là dữ
  // liệu không tin được, và nó bị ghép vào một dòng lệnh ngay sau đó — nên
  // phép lọc này là thứ duy nhất đứng giữa một trang web lạ và shell của máy.
  const m = vbs.match(/re\.Pattern\s*=\s*"([^"]+)"/);
  check('đọc được biểu thức lọc', !!m, m && m[1]);
  if (m) {
    // VBScript không coi \ là ký tự thoát trong chuỗi, nên mẫu lấy ra là mẫu
    // thật — dùng thẳng được trong JS.
    const re = new RegExp(m[1]);

    check('nhận URL đúng khuôn', re.test('karofi-oem://dt-oem?month=2026-09'));
    check('nhận cả dạng có / thừa', re.test('karofi-oem://dt-oem/?month=2026-09'));
    check('nhận dạng không có tháng', re.test('karofi-oem://dt-oem'));

    // Mỗi dòng dưới đây là một cách thoát ra khỏi cặp nháy kép trong dòng lệnh
    // mà chay.vbs dựng, hoặc một cách nối thêm lệnh thứ hai.
    const doc = [
      'karofi-oem://dt-oem?month=2026-09" & shell("calc")',
      'karofi-oem://dt-oem?month=2026-09"',
      'karofi-oem://dt-oem&calc',
      'karofi-oem://dt-oem|calc',
      'karofi-oem://dt-oem;calc',
      'karofi-oem://dt-oem?month=2026-09 extra',
      'karofi-oem://dt-oem?month=../../windows',
      'karofi-oem://dt-oem?month=2026-9',
      'karofi-oem://dt-oem?month=20269',
      'karofi-oem://dt-oem?thang=2026-09&month=2026-09',
      'karofi-oem://../dt-oem?month=2026-09',
      'karofi-oem://dt oem?month=2026-09',
      'karofi-oem://dt-oem?month=2026-09%00',
      'karofi-oem://DT-OEM?month=2026-09',
      'http://x/karofi-oem://dt-oem'
    ];
    const lot = doc.filter((u) => re.test(u));
    check('chặn hết ' + doc.length + ' chuỗi độc/lệch khuôn', lot.length === 0, lot);

    // Tên việc phải là danh sách CHO PHÉP, không phải "cái gì cũng chạy".
    // Đúng hai việc: dt-oem (cào thật) và tu-kiem (không đụng SAP, không ghi).
    check('chỉ chấp nhận dt-oem và tu-kiem',
      /hanhDong <> "dt-oem" And hanhDong <> "tu-kiem" Then WScript\.Quit/.test(vbs));
    check('thoát ngay nếu không khớp khuôn', /If Not re\.Test\(url\) Then WScript\.Quit/.test(vbs));
    // Ghép dòng lệnh phải nằm SAU phép lọc — lọc sau khi ghép là vô nghĩa.
    check('lọc đứng trước bước ghép lệnh',
      vbs.indexOf('re.Test(url)') < vbs.indexOf('lenh = "powershell'));
  }

  // Cửa sổ console đen: bài học 08/09/2026 — "-WindowStyle Hidden" không ẩn
  // được cửa sổ do người gọi tạo ra, chỉ WScript.Shell.Run(..., 0, False) mới.
  check('chạy ẩn bằng shim .vbs (style 0)', /sh\.Run lenh, 0, False/.test(vbs));
}

console.log('\n12. dieu-phoi.ps1 — kiểm lớp hai, khoá, và không nói dối nhịp tim');
{
  const ps = docNeuCo(path.join(PROTO, 'dieu-phoi.ps1'));
  check('có file dieu-phoi.ps1', ps.length > 0);
  // Nhận tham số đã lọc, KHÔNG nhận URL — không có chỗ nào để phân tích chuỗi
  // lạ lần thứ hai.
  check('không nhận URL, chỉ nhận tham số đã lọc',
    /\[string\]\$HanhDong/.test(ps) && !/\$Url/.test(ps));
  check('kiểm lại việc cho phép', /@\('dt-oem', 'tu-kiem'\) -notcontains \$HanhDong/.test(ps));

  // `cai-dat.ps1 -Kiem` chỉ chứng minh khoá registry tồn tại. Sáu thứ khác
  // (Windows có gọi tới đây không, python, hai thư viện, config.json, Web App)
  // hỏng thứ nào thì nút cũng im lặng y như nhau. Đường tu-kiem đi hết chuỗi
  // trừ SAP và trừ việc ghi dữ liệu, nên nó là phép thử duy nhất không tốn một
  // lượt cào thật.
  check('có đường tự kiểm', /\$HanhDong -eq 'tu-kiem'/.test(ps));

  // Bẫy đã trả giá 10/09/2026: export_zsd450.py in JSON MỘT dòng còn
  // push_to_sheet.py in NHIỀU dòng (indent=2). Bản đầu của Doc-Json lọc "dòng
  // nào bắt đầu bằng {" nên đúng với bước 1 và sai với bước 2 — báo "không đẩy
  // lên Sheet được" cho một lượt ĐÃ GHI XONG 47 dòng. Sai kiểu tệ nhất: không
  // mất dữ liệu, nhưng đẩy người dùng đi chạy lại.
  check('Doc-Json lấy từ dấu { tới hết chuỗi, không lọc theo dòng',
    /IndexOf\('\{'\)/.test(ps) && !/StartsWith\('\{'\)/.test(ps));
  check('tự kiểm thử Doc-Json với CẢ HAI dạng JSON',
    /Doc-Json 1 dong/.test(ps) && /Doc-Json nhieu dong/.test(ps));
  check('tự kiểm KHÔNG gọi hai script ghi dữ liệu',
    ps.indexOf("if ($HanhDong -eq 'tu-kiem')") < ps.indexOf('Chay-Python $dtOem'));
  check('tự kiểm chỉ HỎI SAP, không mở transaction nào',
    /GetScriptingEngine/.test(ps) && !/tu-kiem[\s\S]{0,900}ZSD450/.test(ps));
  check('kiểm lại định dạng tháng', /\$Thang -notmatch '\^\\d\{4\}-\\d\{2\}\$'/.test(ps));

  // doPost của up-dt-oem KHÔNG có LockService; nút thì rất dễ bị bấm hai lần.
  check('có khoá chống chồng lượt', /dang-chay\.lock/.test(ps) && /Test-Path \$khoa/.test(ps));
  check('khoá cũ quá lâu thì tự bỏ', /TotalMinutes -lt 30/.test(ps));

  // 0 dòng: gọi Web App là xoá trắng tháng đó mà không có gì thay thế.
  check('SAP không có dữ liệu thì KHÔNG gọi bước 2', /\$j1\.no_data/.test(ps));

  // Nhịp dữ liệu do replaceMonth_ ghi, ngay tại chỗ dữ liệu vào Sheet. Bộ điều
  // phối ghi thêm dòng đó là kể lại một việc nó chỉ nghe qua HTTP.
  check("chỉ ghi dòng 'oem.doanh-thu.nut', không đụng dòng dữ liệu",
    /\$JOB\s*=\s*'oem\.doanh-thu\.nut'/.test(ps) && !/'oem\.doanh-thu'/.test(ps));
  check("dùng trạng thái 'dang-chay' làm hợp đồng với app", /'dang-chay'/.test(ps));
  check('lỗi ghi nhịp tim không làm hỏng việc chính', /không được để lỗi ở đây|khong phá|cái đo/i.test(ps) || /catch \{[\s\S]{0,120}Ghi-NhatKy/.test(ps));
  check('có nhật ký và tự giữ độ dài', /nhat-ky\.log/.test(ps) && /Select-Object -Last 400/.test(ps));
}

console.log('\n13. Web App chỉ cho ghi nhịp phụ, không cho ghi đè dòng dữ liệu');
{
  const code = docNeuCo('D:/Operation/Claude/Scripts/up-dt-oem/Code.gs');
  check('có nhánh action heartbeat', /body\.action === 'heartbeat'/.test(code));

  const m = code.match(/if \(!\/(\^oem[^/]+)\/\.test\(job\)\)/);
  check('khoá job bị giới hạn bằng biểu thức', !!m, m && m[1]);
  if (m) {
    const re = new RegExp(m[1]);
    // Nếu secret lọt, việc ghi đè `oem.doanh-thu` bằng một mốc giả sẽ làm dòng
    // nhịp thật KHÔNG BAO GIỜ báo ôi nữa — đúng thứ nhịp tim sinh ra để chống.
    check('CHẶN ghi đè dòng dữ liệu oem.doanh-thu', !re.test('oem.doanh-thu'));
    check('chặn oem.cong-no', !re.test('oem.cong-no'));
    check('cho ghi dòng phụ oem.doanh-thu.nut', re.test('oem.doanh-thu.nut'));
    check('chặn job của app khác', !re.test('fc.dong-bo-gia') && !re.test('export.sync-bom'));
    check('chặn job rỗng và ký tự lạ',
      !re.test('') && !re.test('oem..x') && !re.test('oem.a.b.c') && !re.test('OEM.A.B'));
  }
  // Dòng kể lại một lượt CHẠY thì không có số dòng và không được đặt ngưỡng ôi
  // — đặt ngưỡng cho nó là báo động về lịch chứ không về dữ liệu.
  check('không nhận soDong/hanGio từ ngoài',
    !/soDong:\s*body\./.test(code) && !/hanGio:\s*body\./.test(code));
  check('ba trạng thái hợp lệ', /\['ok', 'loi', 'dang-chay'\]/.test(code));
}

console.log('\n14. App theo dõi lượt chạy mà không phụ thuộc đồng hồ máy');
{
  const p = docNeuCo(path.join(SRC, 'components', 'transactions', 'CaoSapPanel.jsx'));
  check('có CaoSapPanel', p.length > 0);
  check('gọi đúng giao thức', /karofi-oem:\/\/dt-oem\?month=\$\{thang\}/.test(p));
  // `lanCuoi` do máy chủ Google ghi, `Date.now()` là đồng hồ trình duyệt. So
  // hai đồng hồ khác nhau là mời một lỗi chỉ xuất hiện trên máy lệch giờ.
  check('chụp mốc trước khi bấm rồi chờ mốc ĐỔI', /mocNut/.test(p) && /!== mocNut/.test(p));
  check("dừng theo trạng thái 'dang-chay', không đoán qua chữ",
    /trangThai !== 'dang-chay'/.test(p));
  check('có hạn chờ khởi động (báo "chưa cài")', /CHO_KHOI_DONG_MS/.test(p) && /khongCai/.test(p));
  check('có hạn tối đa, không quay vòng mãi', /CHO_TOI_DA_MS/.test(p));
  // setInterval sẽ xếp các lượt hỏi chồng lên nhau khi một lượt chậm. Bắt
  // đúng LỜI GỌI (`setInterval(`) chứ không bắt cái tên: bản trước của phép
  // kiểm này bắt cả chữ "setInterval" trong câu chú thích giải thích vì sao
  // không dùng nó — tức là một phép kiểm hỏng ngay khi có ai giải thích đúng.
  check('hỏi vòng tuần tự, không gọi setInterval', !/setInterval\s*\(/.test(p));
  check('dừng vòng hỏi khi rời màn', /dungRef/.test(p) && /useEffect\(\(\) => \(\) =>/.test(p));
  // Chỉ tải lại khi dòng DỮ LIỆU đổi: có ca chạy xong mà không ghi gì.
  check('chỉ tải lại khi dòng dữ liệu thật đổi', /!== mocData/.test(p));
  check('nút chỉ hiện với admin/creator', /\['admin',\s*'creator'\]\.includes\(activeUser\?\.role\)/.test(p));

  const grid = fs.readFileSync(path.join(SRC, 'components', 'TransactionGrid.jsx'), 'utf8');
  check('gắn vào tab Lịch sử doanh thu, cạnh đường kéo file',
    grid.indexOf('CaoSapPanel') >= 0 && grid.indexOf('RevenueImportPanel') >= 0);
}

console.log('\n15. Endpoint đọc nhịp tim: có, nhẹ, và KHÔNG cache');
{
  const nt = fs.readFileSync(path.join(GAS, 'NhipTimApi.gs'), 'utf8');
  check('tự kiểm phiên', nt.indexOf('oemAppRequireSession_(token)') >= 0);
  // Cache 10 phút làm mốc thời gian đứng yên 10 phút — đúng cái panel cần theo
  // dõi. Ở đây cache không phải tối ưu, nó là hỏng chức năng.
  check('không dùng CacheService', nt.indexOf('CacheService') < 0);

  const code = fs.readFileSync(path.join(GAS, 'Code.gs'), 'utf8');
  check('có trong bảng định tuyến', /getNhipTim:\s*oemAppGetNhipTim_/.test(code));
  // Chỉ đọc — nằm trong WRITE_FNS là bắt mỗi lượt hỏi vòng giành khoá ghi với
  // chính lượt nhập đang chạy.
  check('KHÔNG nằm trong OEMAPP_WRITE_FNS_',
    !/OEMAPP_WRITE_FNS_[\s\S]{0,600}?getNhipTim/.test(code));

  const api = fs.readFileSync(path.join(SRC, 'services', 'api.js'), 'utf8');
  check('client dùng hạn giờ ngắn cho lượt hỏi vòng',
    /getNhipTim'\s*,\s*\[token\]\s*,\s*15000/.test(api));
}

console.log('\n16. Trình cài đặt: HKCU, có đường gỡ, có kiểm điều kiện');
{
  const ci = docNeuCo(path.join(PROTO, 'cai-dat.ps1'));
  check('có cai-dat.ps1', ci.length > 0);
  // HKCU: không cần quyền quản trị, và không ảnh hưởng người khác dùng chung
  // máy. Giao thức này chỉ có nghĩa trên đúng một máy (máy có SAP).
  check('ghi vào HKCU, không phải HKLM',
    /HKCU:\\Software\\Classes\\karofi-oem/.test(ci) && !/HKLM/.test(ci));
  check('có đường gỡ', /-Go/.test(ci) && /Remove-Item \$khoa -Recurse -Force/.test(ci));
  check('có đường chỉ kiểm, không sửa', /-Kiem/.test(ci));
  // Đăng ký một giao thức trỏ tới file không tồn tại thì nút bấm im lặng
  // không làm gì, và không ai biết vì sao.
  check('kiểm đủ file trước khi đăng ký',
    /export_zsd450\.py/.test(ci) && /push_to_sheet\.py/.test(ci) && /config\.json/.test(ci));
  check('cảnh báo khi đang trỏ tới thư mục khác', /duong dan KHAC|CANH BAO/.test(ci));
}

console.log('');
console.log(pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
