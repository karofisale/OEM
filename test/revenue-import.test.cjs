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

console.log('');
console.log(pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
