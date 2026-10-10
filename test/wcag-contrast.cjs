/**
 * wcag-contrast.cjs — tính tỉ lệ tương phản WCAG 2.x THẬT từ src/index.css (không đoán bằng mắt).
 *
 *   node test/wcag-contrast.cjs            # in bảng mọi cặp chữ/nền ở cả hai giao diện, báo cặp < 4,5:1
 *
 * Dùng lại bởi test/dot2-khung-ui.test.cjs (require). Chỉ đọc file, không ghi gì.
 *
 * Cách làm: đọc khối `:root` (sáng) và khối tối (`@media (prefers-color-scheme: dark)` — khối
 * `:root[data-theme="dark"]` phải GIỐNG HỆT, test kia canh), gỡ `var(--x)` về giá trị thật, trộn
 * alpha (rgba) lên nền thẻ rồi áp công thức độ chói tương đối của WCAG.
 */
const fs = require('fs');
const path = require('path');

const CSS_PATH = process.env.WCAG_CSS || path.join(__dirname, '..', 'src', 'index.css');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** Lấy thân của khối bắt đầu bằng `header` (đếm ngoặc nhọn). */
function block(css, header) {
  const i = css.indexOf(header);
  if (i < 0) throw new Error('Không thấy khối: ' + header);
  const open = css.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') { depth--; if (depth === 0) return css.slice(open + 1, j); }
  }
  throw new Error('Khối không đóng: ' + header);
}

/** `--name: value;` -> Map. (Giữ thứ tự khai báo; khai báo sau đè khai báo trước.) */
function decls(body) {
  const m = new Map();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let x;
  while ((x = re.exec(stripComments(body)))) m.set(x[1], x[2].trim());
  return m;
}

function load() {
  const css = stripComments(fs.readFileSync(CSS_PATH, 'utf8').replace(/\r\n/g, '\n'));
  const light = decls(block(css, ':root {'));
  const darkMedia = decls(block(block(css, '@media (prefers-color-scheme: dark)'), ':root:not([data-theme="light"])'));
  const darkExplicit = decls(block(css, ':root[data-theme="dark"]'));
  const dark = new Map([...light, ...darkMedia]);
  return { css, light, dark, darkMedia, darkExplicit };
}

// ---- màu ---------------------------------------------------------------------
function parseColor(v) {
  v = v.trim();
  let m;
  if ((m = /^#([0-9a-f]{3})$/i.exec(v))) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  if ((m = /^#([0-9a-f]{6})$/i.exec(v))) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v))) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
  throw new Error('Không đọc được màu: ' + v);
}

/** Gỡ var(--x) (đệ quy) rồi đọc màu. */
function resolve(theme, name, depth = 0) {
  let v = theme.get(name);
  if (v == null) throw new Error('Thiếu token ' + name);
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  if (m && depth < 5) return resolve(theme, m[1], depth + 1);
  return parseColor(v);
}

const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });

function luminance(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** Tỉ lệ tương phản; màu trong suốt được trộn lên `nen` trước. */
function ratio(fg, bg, nen) {
  const b = bg.a < 1 ? over(bg, nen || { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const f = fg.a < 1 ? over(fg, b) : fg;
  const [hi, lo] = [luminance(f), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Nền chữ thường gặp trong app (token). */
const NEN = ['--bg-card', '--bg-main', '--surface-sunk', '--bg-card-hover', '--bg-input', '--summary-row-bg', '--row-hover'];

/** Token dùng làm MÀU CHỮ trong JSX (`color: 'var(--x)'`, cả nhánh ba ngôi). */
function tokenChuTrongJsx() {
  const root = path.join(__dirname, '..', 'src');
  const out = new Set();
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'dev') walk(p); return; }
    if (!/\.jsx$/.test(e.name)) return;
    const s = fs.readFileSync(p, 'utf8');
    const re = /\bcolor\s*:\s*([^,}\n]*)/g;
    let m;
    while ((m = re.exec(s))) {
      const t = /var\((--[a-z0-9-]+)\)/g;
      let x;
      while ((x = t.exec(m[1]))) out.add(x[1]);
    }
  });
  walk(root);
  return Array.from(out).sort();
}

/** Mọi cặp chữ thường < 4,5:1: [{ theme, fg, bg, ratio }]. */
function kiemTra() {
  const { light, dark } = load();
  const loi = [];
  const rows = [];
  const bo = new Set(['--on-accent']); // chữ trên nền màu đặc, đo riêng
  for (const [ten, theme] of [['sáng', light], ['tối', dark]]) {
    for (const tk of tokenChuTrongJsx()) {
      if (bo.has(tk)) continue;
      const fg = resolve(theme, tk);
      for (const n of NEN) {
        const r = ratio(fg, resolve(theme, n), resolve(theme, '--bg-card'));
        rows.push({ theme: ten, fg: tk, bg: n, ratio: r });
        if (r < 4.5) loi.push({ theme: ten, fg: tk, bg: n, ratio: r });
      }
    }
  }
  return { loi, rows };
}

module.exports = { load, block, decls, resolve, parseColor, ratio, over, luminance, tokenChuTrongJsx, kiemTra, NEN, stripComments };

if (require.main === module) {
  const { loi, rows } = kiemTra();
  console.log(rows.length + ' cặp chữ/nền đã đo; < 4,5:1: ' + loi.length);
  loi.forEach((l) => console.log('  ' + l.theme + ' ' + l.fg + ' trên ' + l.bg + ' = ' + l.ratio.toFixed(2)));
  process.exit(loi.length ? 1 : 0);
}
