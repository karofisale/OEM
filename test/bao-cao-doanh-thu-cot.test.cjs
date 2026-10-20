/**
 * bao-cao-doanh-thu-cot.test.cjs — 20/10/2026: Báo cáo doanh thu có cột kỳ.
 *  - DT Tháng: "Tất cả tháng" có công tắc xem chi tiết các tháng (mặc định TẮT) + xuất Excel; chọn một tháng thì thêm cột các TUẦN lịch của tháng.
 *  - DT Ngày: chỉ chọn từng tháng; Client là dòng, NGÀY là cột (chỉ ngày có doanh thu, 1–31), Sum lũy kế đứng trước; chọn 1 tuần thì Sum của tuần đó.
 *   node test/bao-cao-doanh-thu-cot.test.cjs
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..');
const SRC = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); } else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}
(async () => {
  const P = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'revenuePivot.js')).href);

  console.log('--- tuần lịch thứ 2–CN của tháng ---');
  const k10 = P.khoangTuanThang('T10-2026');
  check('T10-2026 (1/10 là thứ 5): W1 = 1–4, W2 = 5–11, W3 = 12–18, W4 = 19–25, W5 = 26–31, không có W6',
    JSON.stringify(k10) === JSON.stringify({ W1: { tu: 1, den: 4 }, W2: { tu: 5, den: 11 }, W3: { tu: 12, den: 18 }, W4: { tu: 19, den: 25 }, W5: { tu: 26, den: 31 } }), k10);
  const k8 = P.khoangTuanThang('T08-2026');
  check('T08-2026 (1/8 là thứ 7): W1 = 1–2, ..., có W6 = 31–31', k8.W1.den === 2 && k8.W2.tu === 3 && k8.W6 && k8.W6.tu === 31 && k8.W6.den === 31, k8);
  const k6 = P.khoangTuanThang('T06-2026');
  check('T06-2026 (1/6 là thứ 2): W1 = 1–7, W5 = 29–30', k6.W1.tu === 1 && k6.W1.den === 7 && k6.W5.tu === 29 && k6.W5.den === 30 && !k6.W6, k6);
  check('khoảng ngày khớp công thức server oem-api (oemComputeWeekFromDate): mọi ngày của T10-2026 nằm đúng tuần', (() => {
    for (let d = 1; d <= 31; d++) {
      const lech = (new Date(Date.UTC(2026, 9, 1)).getUTCDay() + 6) % 7;
      const w = 'W' + (Math.floor((d - 1 + lech) / 7) + 1);
      if (!(k10[w].tu <= d && d <= k10[w].den)) return false;
    }
    return true;
  })());
  check('nhãn tuần: "Tuần 2 (05–11)"; thiếu khoảng ngày thì chỉ "Tuần 2"; sắp W1..W6 theo số (W10 không chen trước W2)', P.nhanTuan('W2', k10) === 'Tuần 2 (05–11)' && P.nhanTuan('W2') === 'Tuần 2' && P.sapTuan(['W5', 'W1', 'W10', 'W2']).join() === 'W1,W2,W5,W10');
  check('tháng không hợp lệ -> không có tuần, không lỗi', Object.keys(P.khoangTuanThang('xxx')).length === 0 && P.soNgayThang('xxx') === 0);
  check('sắp tháng theo thời gian (qua năm); nhãn ngắn T08', P.sapThang(['T01-2027', 'T12-2026', 'T02-2026']).join() === 'T02-2026,T12-2026,T01-2027' && P.nhanThangNgan('T08-2026') === 'T08');
  check('thứ của ngày: 05/10/2026 là thứ 2, 04/10/2026 là Chủ nhật', P.NHAN_THU[P.thuCuaNgay('T10-2026', 5)] === 'T2' && P.NHAN_THU[P.thuCuaNgay('T10-2026', 4)] === 'CN');

  console.log('--- gom theo khách × cột ---');
  const tx = [
    { clientCode: 'abc', clientName: 'ABC Co', clientAlias: 'Alias ABC', sale: 'Lan', month: 'T10-2026', week: 'W1', date: '02/10/2026', netRevenue: 100 },
    { clientCode: 'ABC', clientName: 'ABC Co', sale: 'Lan', month: 'T10-2026', week: 'W1', date: '02/10/2026', netRevenue: 50 },          // cùng mã (hoa/thường) cùng ngày: cộng dồn
    { clientCode: 'ABC', clientName: 'ABC Co', sale: 'Lan', month: 'T10-2026', week: 'W2', date: '07/10/2026', netRevenue: 300 },
    { clientCode: 'XYZ', clientName: 'XYZ', sale: 'Tom', month: 'T10-2026', week: 'W2', date: '09/10/2026', netRevenue: 70 },
    { clientCode: 'XYZ', clientName: 'XYZ', sale: 'Tom', month: 'T10-2026', week: 'W5', date: '30/10/2026', netRevenue: 30 },
    { clientCode: 'XYZ', clientName: 'XYZ', sale: 'Tom', month: 'T09-2026', week: 'W4', date: '29/09/2026', netRevenue: 9999 },        // tháng khác
    { clientCode: 'QQQ', clientName: 'QQQ', sale: 'Tom', month: 'T10-2026', week: 'W3', date: 'không rõ', netRevenue: 5 },              // ngày không đọc được
  ];
  const thang10 = (t) => t.month === 'T10-2026';
  const g = P.gopTheoKhach(tx, { loc: thang10, cot: P.ngayTrongThang });
  check('mỗi khách một dòng (mã chữ không phân biệt hoa/thường), tên hiện Alias, sắp tổng giảm dần', g.rows.map((r) => r.clientCode).join() === 'ABC,XYZ,QQQ' && g.rows[0].clientName === 'Alias ABC' && g.rows[0].tong === 450 && g.rows[1].tong === 100, g.rows);
  check('cột ngày: chỉ ngày có doanh thu, xếp tăng dần (2, 7, 9, 30; "0" = chưa rõ ngày); tổng cột + tổng chung đúng',
    g.cotKeys.map(Number).sort((a, b) => (a || 99) - (b || 99)).join() === '2,7,9,30,0' && g.tongCot[2] === 150 && g.tongCot[7] === 300 && g.tongCot[9] === 70 && g.tongCot[30] === 30 && g.tongCot[0] === 5 && g.tong === 555, [g.cotKeys, g.tongCot, g.tong]);
  check('ô khách × ngày: ABC ngày 2 = 150 (cộng dồn), ngày 7 = 300; ngày không phát sinh không có khoá', g.rows[0].cot[2] === 150 && g.rows[0].cot[7] === 300 && g.rows[0].cot[9] === undefined, g.rows[0].cot);
  check('không tính tháng khác (T09: 9999 không lọt vào)', g.tong === 555 && !g.cotKeys.includes('29'));
  const gw = P.gopTheoKhach(tx, { loc: (t) => thang10(t) && t.week === 'W2', cot: P.ngayTrongThang });
  check('chọn một tuần (W2 = 5–11): chỉ các ngày của tuần đó (7, 9) và Sum lũy kế = tổng của tuần đó (370)', gw.cotKeys.map(Number).join() === '7,9' && gw.tong === 370 && gw.rows.map((r) => r.tong).join() === '300,70', gw);
  check('Sum lũy kế mỗi khách = tổng các cột ngày của khách đó (không lệch)', g.rows.every((r) => r.tong === Object.keys(r.cot).reduce((a, k) => a + r.cot[k], 0)));
  const gm = P.gopTheoKhach(tx.concat([{ clientCode: 'ABC', sale: 'Lan', month: 'T11-2026', week: 'W1', date: '03/11/2026', netRevenue: 11 }]), { loc: (t) => /2026$/.test(t.month), cot: (t) => t.month });
  check('cột tháng (xem chi tiết các tháng): khoá theo tháng, sắp theo thời gian bằng sapThang', P.sapThang(gm.cotKeys).join() === 'T09-2026,T10-2026,T11-2026' && gm.tongCot['T11-2026'] === 11, gm.cotKeys);
  check('danh sách rỗng / không loc: không lỗi', P.gopTheoKhach([], {}).rows.length === 0 && P.gopTheoKhach(null).tong === 0);

  console.log('--- dòng xuất Excel ---');
  const cotX = [{ key: 'T09-2026', label: 'T09' }, { key: 'T10-2026', label: 'T10' }];
  const gx = P.gopTheoKhach(tx, { cot: (t) => t.month });
  const dx = P.dongXuatTheoCot(gx.rows, cotX, { tongCot: gx.tongCot, cotCuoi: [{ ten: 'DT thuần (VND)', get: (r) => r.tong, tongRow: gx.tong }, { ten: 'Biến động', get: () => '+5%' }] });
  check('xuất đúng cột đang hiện theo thứ tự: Client, Tên, SALE, T09, T10, DT thuần, Biến động; ô không có = 0', Object.keys(dx[0]).join() === 'Client,Tên khách hàng,SALE,T09,T10,DT thuần (VND),Biến động' && dx.find((r) => r.Client === 'ABC').T09 === 0 && dx.find((r) => r.Client === 'ABC').T10 === 450, dx[0]);
  const xyz = dx.find((r) => r.Client === 'XYZ');
  check('dòng của khách đúng số (XYZ: T09 = 9999, T10 = 100); có dòng TỔNG ở cuối với tổng từng cột kỳ + tổng chung', xyz.T09 === 9999 && xyz.T10 === 100 && dx[dx.length - 1].Client === 'Σ' && dx[dx.length - 1].T10 === 555 && dx[dx.length - 1]['DT thuần (VND)'] === gx.tong && dx[dx.length - 1]['Biến động'] === '', dx[dx.length - 1]);
  check('không truyền tongCot thì không có dòng tổng', P.dongXuatTheoCot(gx.rows, cotX).length === gx.rows.length);
  check('tên file: cả năm / một tháng', P.tenFileDtThang('ALL', '2026', '20-10-2026') === 'DT_thang_Nam_2026_20-10-2026.xlsx' && P.tenFileDtThang('T10-2026', '2026', '20-10-2026') === 'DT_thang_T10-2026_20-10-2026.xlsx');

  console.log('--- màn hình (nguồn) ---');
  const ngay = SRC('components/reports/DtNgayReport.jsx'), thang = SRC('components/reports/DtThangReport.jsx');
  check('DT Ngày: không còn lựa chọn "Tất cả tháng"; ô chọn tháng chỉ liệt kê từng tháng; giá trị "ALL" đã nhớ rơi về tháng mới nhất', !/Tất cả tháng/.test(ngay) && !/<option value="ALL">Tất cả tháng/.test(ngay) && /monthChon !== 'ALL' \? monthChon : \(monthsList\[0\] \|\| ''\)/.test(ngay));
  check('DT Ngày: Client là dòng, ngày là cột (chỉ ngày có doanh thu), Sum lũy kế đứng TRƯỚC cột ngày', /gopTheoKhach\(/.test(ngay) && /ngayCot\.map/.test(ngay) && ngay.indexOf('col="totalRevenue"') < ngay.indexOf("col={'d:' + d}") && /Sum lũy kế/.test(ngay));
  check('DT Ngày: lọc tuần chỉ liệt kê tuần của THÁNG đang chọn; chọn tuần thì Sum lũy kế của tuần (nhãn đổi; tuần tính từ ngày chứng từ, không tin `week` đã lưu đệm)', /t\.month === effectiveMonth\) s\.add\(tuanLichCuaGiaoDich\(t\)\)/.test(ngay) && /ngayFilterWeek === 'ALL' \|\| tuanLichCuaGiaoDich\(t\) === ngayFilterWeek/.test(ngay) && /'Sum lũy kế ' \+ nhanTuan/.test(ngay) && /tuanLichCuaGiaoDich\(t\)/.test(thang));
  check('tuần lịch của giao dịch tính từ NGÀY: 04/10 = W1, 05/10 = W2, 11/10 = W2, 31/10 = W5 (bỏ qua `week` cũ); ngày không đọc được hoặc lệch tháng thì dùng `week` đã có',
    P.tuanLichCuaGiaoDich({ month: 'T10-2026', date: '04/10/2026', week: 'W9' }) === 'W1' && P.tuanLichCuaGiaoDich({ month: 'T10-2026', date: '05/10/2026', week: 'W1' }) === 'W2' && P.tuanLichCuaGiaoDich({ month: 'T10-2026', date: '11/10/2026' }) === 'W2' &&
    P.tuanLichCuaGiaoDich({ month: 'T10-2026', date: '31/10/2026' }) === 'W5' && P.tuanLichCuaGiaoDich({ month: 'T08-2026', date: '31/08/2026' }) === 'W6' && P.tuanLichCuaGiaoDich({ month: 'T10-2026', date: 'xx', week: 'W3' }) === 'W3' &&
    P.tuanLichCuaGiaoDich({ month: 'T10-2026', date: '03/09/2026', week: 'W4' }) === 'W4' && P.tuanLichCuaGiaoDich({ month: 'T10-2026', date: '03/10/2026' }) === 'W1' && P.tuanLichCuaGiaoDich({}) === 'W1');
  check('DT Ngày: giữ khoá nhớ F5, cỡ trang, TableState, sắp xếp trước khi cắt trang', /'rpt\.ngay\.month'/.test(ngay) && /'rpt\.ngay\.sale'/.test(ngay) && /'rpt\.ngay\.week'/.test(ngay) && /usePagedSlice\(sortedNgay/.test(ngay) && /useEnsureYears\(txYears, \[effectiveYear\]\)/.test(ngay));
  check('DT Tháng: công tắc "Xem chi tiết các tháng" chỉ hiện khi chọn Tất cả tháng, MẶC ĐỊNH TẮT, nhớ qua F5', /usePersistentState\('rpt\.thang\.chiTiet', false/.test(thang) && /effectiveMonth === 'ALL' && \(\s*<label/.test(thang) && /Xem chi tiết các tháng/.test(thang));
  check('DT Tháng: cột tháng khi (Tất cả tháng + bật chi tiết), cột tuần khi chọn một tháng', /xemTheoThang = effectiveMonth === 'ALL' && chiTietThang/.test(thang) && /xemTheoTuan = effectiveMonth !== 'ALL'/.test(thang) && /cotHien\.map/.test(thang) && /khoangTuanThang\(effectiveMonth\)/.test(thang));
  check('DT Tháng: xuất Excel đúng các cột đang hiện (dongXuatTheoCot + tải xlsx lười), có nút', /dongXuatTheoCot\(sortedThang/.test(thang) && /await import\('xlsx'\)/.test(thang) && /Xuất Excel/.test(thang));
  check('DT Tháng: giữ nguyên so sánh với năm trước / tháng trước và đòi cả năm trước', /useEnsureYears\(txYears, \[effectiveYear, prevYear\]\)/.test(thang) && /compareLabel/.test(thang) && /\|\| macDinhNam \|\| null/.test(thang));

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
})();
