/**
 * dot1-sua-loi.test.cjs — đợt sửa lỗi 1 (09/10/2026): gửi trùng, mất dữ liệu đã gõ.
 *
 *   node test/dot1-sua-loi.test.cjs
 *
 * Logic thuần (utils/priceDraft.js, utils/optimistic.js) gọi thẳng. ConfirmDialog
 * được esbuild (có sẵn trong node_modules của Vite) gói kèm React rồi render ra
 * HTML tĩnh để soát thuộc tính `disabled`. Phần còn lại là trạng thái React bên
 * trong màn lớn (AIOrderAgent, các panel) — soát bằng mã nguồn để chặn hồi quy.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}
const ROOT = path.join(__dirname, '..');
const SRC = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

(async () => {
  // -------------------------------------------------------------------------
  console.log('\n1. Đề xuất giá: gửi mọi nháp, không phụ thuộc bộ lọc');
  const pd = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'priceDraft.js')).href);
  const materials = [{ sku: 'A' }, { sku: 'B' }, { sku: 'C' }, { sku: 'D' }];
  const draft = {
    A: { retail: 50000, promoQty: '', promoPrice: '' },
    C: { retail: 70000, promoQty: 5, promoPrice: 60000 },   // giả sử C đang bị bộ lọc ẩn
    D: { retail: 0, promoQty: 3, promoPrice: '' },          // gõ rồi xoá Giá lẻ, còn SL KM
    B: { retail: '', promoQty: '', promoPrice: '' }         // chạm vào rồi bỏ trống
  };
  const gui = pd.dongDeXuat(materials, draft).map((m) => m.sku);
  check('gửi cả SKU bị lọc ẩn (C), bỏ Giá lẻ 0 / trống', JSON.stringify(gui) === '["A","C"]', gui);
  check('đếm nháp: A, C, D (D còn SL KM), không đếm B', pd.soMaCoNhap(draft) === 3, pd.soMaCoNhap(draft));
  const conLai = pd.boNhapDaGui(draft, gui);
  check('gửi xong chỉ bỏ nháp đã gửi, giữ D + B', JSON.stringify(Object.keys(conLai).sort()) === '["B","D"]', Object.keys(conLai));
  check('không đụng draftMap gốc', Object.keys(draft).length === 4);
  check('đầu vào rỗng không nổ', pd.dongDeXuat(null, null).length === 0 && pd.soMaCoNhap(undefined) === 0);

  // -------------------------------------------------------------------------
  console.log('\n2. withOptimistic trả kết quả để modal biết lưu hỏng');
  const op = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'optimistic.js')).href);
  const vet = [];
  let r = await op.chayLacQuan(() => vet.push('apply'), () => vet.push('revert'), async () => {}, 'Lỗi', (m) => vet.push('bao:' + m));
  check('thành công -> { ok: true }, không revert', r.ok === true && JSON.stringify(vet) === '["apply"]', vet);
  vet.length = 0;
  r = await op.chayLacQuan(() => vet.push('apply'), () => vet.push('revert'),
    async () => { throw new Error('Mã KH 1000700 đã có'); }, 'Không ghi được khách hàng mới', (m) => vet.push('bao'));
  check('hỏng -> { ok: false, error } kèm lý do server', r.ok === false && r.error === 'Không ghi được khách hàng mới: Mã KH 1000700 đã có', r);
  check('hỏng -> revert + báo lỗi', JSON.stringify(vet) === '["apply","revert","bao"]', vet);
  r = await op.chayLacQuan(() => {}, () => {}, async () => { throw 'chuỗi'; }, 'X');
  check('lỗi không phải Error, không có baoLoi -> vẫn trả error', r.ok === false && r.error === 'X: chuỗi', r);

  const app = SRC('App.jsx');
  check('App.jsx dùng chayLacQuan, 4 handler TRẢ kết quả (không còn await bỏ kết quả)',
    /chayLacQuan\(apply, revert, call, failMessage/.test(app) && (app.match(/return withOptimistic\(/g) || []).length === 4 &&
    !/await withOptimistic\(/.test(app));
  const cm = SRC('components/ClientManagement.jsx');
  check('ClientManagement: chỉ đóng modal khi ok, lỗi thì hiện trong form',
    (cm.match(/kq\.ok === false\) setSaveError/g) || []).length === 2 && /role="alert"/.test(cm) && /\{saveError\}/.test(cm));
  const pm = SRC('components/ProductManagement.jsx');
  check('ProductManagement: Thêm + Sửa đều giữ modal khi lỗi',
    /kq\.ok === false\) \{ setAddError/.test(pm) && /kq\.ok === false\) \{ setEditError/.test(pm) && /\{addError\}/.test(pm) && /\{editError\}/.test(pm));

  // -------------------------------------------------------------------------
  console.log('\n3. ConfirmDialog có busy');
  // Gói ConfirmDialog CÙNG React + react-dom/server vào một file (một bản React duy nhất, hook mới chạy),
  // ghi ra thư mục tạm của hệ điều hành rồi require — không ghi gì vào dự án.
  const esbuild = require('esbuild');
  const out = esbuild.buildSync({
    stdin: {
      contents: "import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';" +
        "import ConfirmDialog from './src/components/ConfirmDialog.jsx';" +
        "export const ve = (props) => renderToStaticMarkup(React.createElement(ConfirmDialog, props));",
      resolveDir: ROOT, loader: 'jsx'
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' }
  });
  const tmp = path.join(os.tmpdir(), 'oem-confirmdialog-' + process.pid + '.cjs');
  fs.writeFileSync(tmp, out.outputFiles[0].text);
  const { ve } = require(tmp);
  fs.unlinkSync(tmp);
  const nut = (html) => [...html.matchAll(/<button[^>]*>.*?<\/button>/g)].map((x) => x[0]);
  const noop = () => {};
  let html = ve({ title: 'T', message: 'M', confirmLabel: 'Gửi', onConfirm: noop, onCancel: noop });
  let b = nut(html);
  check('bình thường: 2 nút bấm được, nhãn xác nhận', b.length === 2 && b.every((x) => !/disabled/.test(x)) && />Gửi</.test(b[1]), b);
  html = ve({ title: 'T', message: 'M', confirmLabel: 'Gửi', busy: true, busyLabel: 'Đang gửi...', onConfirm: noop, onCancel: noop });
  b = nut(html);
  check('busy: KHOÁ cả Hủy lẫn Xác nhận, hiện nhãn đang xử lý', b.length === 2 && b.every((x) => /disabled=""/.test(x)) && />Đang gửi\.\.\.</.test(b[1]), b);
  check('busy: aria-busy để trình đọc màn hình biết', /aria-busy="true"/.test(html));
  const cd = SRC('components/ConfirmDialog.jsx');
  check('busy: Esc và bấm nền không đóng', /if \(!busyRef\.current\) onCancel\(\)/.test(cd) && /e\.target === e\.currentTarget && !busy/.test(cd));

  const callers = {
    'components/pricing/PriceProposePanel.jsx': ['busy={isSaving}', 'if (isSaving || !touchedRows.length) return'],
    'components/salesplan/SalesPlanApprovePanel.jsx': ['busy={isApproving}', 'if (isApproving) return'],
    'components/sop/SopPlanPanel.jsx': ['busy={isSaving}', 'if (isSaving || !submissionRows.length) return'],
    'components/pricing/PriceApprovePanel.jsx': ['busy={isSubmitting}', 'if (!currentBatch || isSubmitting) return'],
    'components/sop/SopApprovePanel.jsx': ['busy={isApproving}', 'if (isApproving) return'],
    'components/debt/DebtImportPanel.jsx': ['busy={isImporting}', 'if (isImporting) return'],
    'components/pricing/CostImportPanel.jsx': ['busy={isImporting}', 'if (isImporting) return'],
    'components/transactions/RevenueImportPanel.jsx': ['busy={isImporting}', 'if (isImporting) return'],
    'components/pricing/KitsPanel.jsx': ['busy={dangLuu}', 'if (dangLuu) return'],
    'components/salesplan/PlanNamPanel.jsx': ['busy={dangLuu}', 'if (dangLuu) return']
  };
  Object.keys(callers).forEach((f) => {
    const s = SRC(f);
    const thieu = callers[f].filter((x) => s.indexOf(x) < 0);
    check(path.basename(f) + ': truyền busy + chặn trong handler', thieu.length === 0, thieu);
  });

  // -------------------------------------------------------------------------
  console.log('\n4. Đơn AI: lưu xong không lưu lại được');
  const ai = SRC('components/AIOrderAgent.jsx');
  check('nút Lưu khoá khi saved', /onClick=\{handleSaveOrder\} disabled=\{isSaving \|\| saved\}/.test(ai));
  check('handler cũng chặn khi saved', /isSaving \|\| saved\) return;/.test(ai));
  const capNhat = ai.slice(ai.indexOf('const capNhatItems'), ai.indexOf('const handleUpdateItem'));
  const doiKhach = ai.slice(ai.indexOf('const handleClientChange'), ai.indexOf('const handleClientChange') + 700);
  check('sửa ô / đổi khách KHÔNG hạ cờ đã lưu (hạ là bấm Lưu lại được -> đơn trùng)',
    capNhat.length > 0 && !/setSaved\(false\)/.test(capNhat) && !/setSaved\(false\)/.test(doiKhach.slice(0, doiKhach.indexOf('};'))));
  const gen = ai.slice(ai.indexOf('const handleGenerateOrder'), ai.indexOf('// ---------- Sửa tay trên bảng'));
  check('bóc đơn MỚI thì hạ cờ, sau khi đã có đơn mới (2 nhánh AI + cục bộ)',
    (gen.match(/setSaved\(false\)/g) || []).length === 2 && gen.indexOf('setSaved(false)') > gen.indexOf('setOrderResult('));

  // -------------------------------------------------------------------------
  console.log('\n5. Quyền sửa dòng theo Sale: so bằng đúng như server (laSaleCuaMinh)');
  const roles = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'roles.js')).href);
  const sale = (sid) => ({ role: 'sale', saleId: sid });
  check('"Đình Hoan" sửa được "KH Đình Hoan" (bỏ tiền tố KH, NFD = NFC)',
    roles.ownsSaleRow(sale('Đình Hoan'), 'KH Đình Hoan') && roles.ownsSaleRow(sale('luyến'), 'KH Luyến'.normalize('NFD')));
  check('trọn chữ cuối sửa được ("Hoan" ~ "KH Đình Hoan"); chuỗi con giữa chữ / chữ đầu KHÔNG ("oan", "Đình")',
    roles.ownsSaleRow(sale('Hoan'), 'KH Đình Hoan') && !roles.ownsSaleRow(sale('oan'), 'KH Đình Hoan') && !roles.ownsSaleRow(sale('Đình'), 'KH Đình Hoan'));
  check('saleId trống -> không sửa được gì; admin/creator sửa hết; leader không',
    !roles.ownsSaleRow(sale(''), 'KH Luyến') && roles.ownsSaleRow({ role: 'admin' }, 'x') && !roles.ownsSaleRow({ role: 'leader' }, 'x'));

  console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
