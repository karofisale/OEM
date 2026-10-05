/**
 * kpi-nam.test.cjs — co giãn KPI năm theo khách (src/utils/kpiNam.js): sửa tổng năm / tỷ trọng tháng thì tổng tháng + từng khách co giãn theo,
 * số nguyên VNĐ, tổng khớp tuyệt đối.   node test/kpi-nam.test.cjs
 */
const path = require('path');
const { pathToFileURL } = require('url');
let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); } else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}
const loi = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

(async () => {
  const K = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'kpiNam.js')).href);
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const mk = () => [
    { code: 'TECOM', name: 'Tecom', pic: 'A', months: [3e9, 2e9, 2.5e9, 3e9, 2e9, 2.5e9, 3e9, 2.5e9, 2e9, 3e9, 3e9, 3.5e9] },
    { code: 'MAXIM', name: 'Maxim', pic: 'B', months: [1e9, 1.5e9, 1e9, 1e9, 1.5e9, 1e9, 1e9, 1e9, 1.5e9, 1e9, 1e9, 1.5e9] },
    { code: 'SONHA', name: 'Sơn Hà', pic: 'C', months: [5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8] }
  ];
  const r0 = mk();
  const bak = JSON.stringify(r0);
  let seed = 99;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  console.log('--- phân bổ nguyên + tỷ trọng hiện tại ---');
  let ok = true;
  for (let k = 0; k < 300 && ok; k++) {
    const n = 1 + Math.floor(rnd() * 20), raw = Array.from({ length: n }, () => rnd() * 1e6), T = Math.round(sum(raw));
    const r = K.phanBoNguyen(raw, T);
    if (sum(r) !== T || r.some((v) => !Number.isInteger(v) || v < 0) || r.some((v, i) => Math.abs(v - raw[i]) >= 1)) ok = false;
  }
  check('300 ca: phanBoNguyen cho số nguyên, tổng đúng, mỗi phần tử lệch < 1 so với số thực', ok);
  const ty = K.tyTrongHienTai(r0);
  check('tỷ trọng hiện tại: 12 số nguyên (1/100 %), tổng 100,00%', ty.length === 12 && sum(ty) === 10000 && ty.every(Number.isInteger));
  check('bảng rỗng / toàn 0 -> chia đều', sum(K.tyTrongHienTai([{ code: 'X', months: new Array(12).fill(0) }])) === 10000);

  console.log('--- sửa TỔNG NĂM ---');
  const T0 = K.tongNam(r0);
  const t1 = K.datTongNam(r0, T0 * 1.2);
  check('tổng năm mới = đúng số nhập (làm tròn VNĐ), mọi ô số nguyên', K.tongNam(t1) === Math.round(T0 * 1.2) && t1.every((r) => r.months.every(Number.isInteger)));
  const tt0 = K.tongThang(r0), tt1 = K.tongThang(t1);
  check('tỷ trọng tháng giữ nguyên (lệch < 0,01%)', tt0.every((v, m) => Math.abs(v / T0 - tt1[m] / K.tongNam(t1)) < 0.0001));
  check('tỷ lệ giữa các khách trong tháng giữ nguyên (lệch < 1e-6)', [0, 5, 11].every((m) => Math.abs(t1[0].months[m] / t1[1].months[m] - r0[0].months[m] / r0[1].months[m]) < 1e-6));
  check('tên + PIC + mã giữ nguyên; đầu vào không bị sửa', t1[2].name === 'Sơn Hà' && t1[1].pic === 'B' && JSON.stringify(r0) === bak);
  check('giảm tổng năm cũng được', K.tongNam(K.datTongNam(r0, 1e9)) === 1e9);
  check('tổng ≤ 0 / KPI trống -> báo lỗi rõ', /lớn hơn 0/.test(loi(() => K.datTongNam(r0, 0))) && /chưa có doanh thu/.test(loi(() => K.datTongNam([{ code: 'X', months: new Array(12).fill(0) }], 5e9))));

  console.log('--- sửa TỶ TRỌNG THÁNG ---');
  const p1 = K.datTyTrongThang(r0, 11, 12, 'deu');
  const ttp = K.tongThang(p1);
  check('tổng năm giữ nguyên TUYỆT ĐỐI', K.tongNam(p1) === T0);
  check('T12 đúng 12,00% (lệch < 1 đồng/tháng quy đổi); tổng tỷ trọng 100%', Math.abs(ttp[11] - T0 * 0.12) <= 1 && sum(K.tyTrongHienTai(p1)) === 10000, [ttp[11], T0 * 0.12]);
  check('các tháng khác giảm đều (chia đều phần chênh), mỗi tháng trong [1%, 30%]', K.tyTrongHienTai(p1).every((v) => v >= 100 && v <= 3000));
  check('trong từng tháng tỷ lệ giữa các khách giữ nguyên', [0, 4, 11].every((m) => Math.abs(p1[0].months[m] / p1[1].months[m] - r0[0].months[m] / r0[1].months[m]) < 1e-6 * 10 || Math.abs(p1[0].months[m] / p1[1].months[m] - r0[0].months[m] / r0[1].months[m]) < 1e-3));
  const p2 = K.datTyTrongThang(r0, 0, 5, 'chiDinh', [5, 6]);
  const ty2 = K.tyTrongHienTai(p2), ty0 = K.tyTrongHienTai(r0);
  check('chế độ chỉ định: chỉ T6, T7 nhận phần chênh; các tháng khác không đổi tỷ trọng', ty2.every((v, i) => [0, 5, 6].includes(i) || v === ty0[i]) && ty2[0] === 500 && K.tongNam(p2) === T0, [ty0, ty2]);
  check('tỷ trọng ngoài [1%, 30%] bị chặn', /1%, 30%/.test(loi(() => K.datTyTrongThang(r0, 0, 31))) && /1%, 30%/.test(loi(() => K.datTyTrongThang(r0, 0, 0.5))));
  const co0 = [{ code: 'A', months: [5e9, 0, 5e9, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { code: 'B', months: [5e9, 0, 5e9, 0, 0, 0, 0, 0, 0, 0, 0, 0] }];
  const p3 = K.datTyTrongThang(co0, 0, 25, 'deu');
  check('tháng hiện không có KPI nhưng được chia tỷ trọng > 0: chia theo tỷ lệ cả năm của các khách, tổng khớp', K.tongNam(p3) === 2e10 && p3.every((r) => r.months.every(Number.isInteger)));
  let ok2 = true;
  for (let k = 0; k < 120 && ok2; k++) {
    const n = 2 + Math.floor(rnd() * 8);
    const rows = Array.from({ length: n }, (_, i) => ({ code: 'K' + i, months: Array.from({ length: 12 }, () => Math.round(rnd() * 5e9)) }));
    const m = Math.floor(rnd() * 12), pct = 1 + rnd() * 29;
    let r;
    try { r = K.datTyTrongThang(rows, m, pct, 'deu'); } catch (e) { continue; }
    const T = K.tongNam(rows), tt = K.tongThang(r);
    if (K.tongNam(r) !== T || Math.abs(tt[m] - T * Math.round(pct * 100) / 10000) > 1 || r.some((x) => x.months.some((v) => !Number.isInteger(v) || v < 0))) ok2 = false;
  }
  check('120 ca ngẫu nhiên: tổng năm không đổi, tháng được sửa đúng tỷ trọng, mọi ô nguyên không âm', ok2);

  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng');
  process.exit(fail ? 1 : 0);
})();
