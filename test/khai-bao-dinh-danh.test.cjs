/**
 * khai-bao-dinh-danh.test.cjs — soát ĐỊNH DANH CHƯA KHAI BÁO trong mọi file nguồn của client (Đợt 4, 10/10/2026).
 *
 *   node test/khai-bao-dinh-danh.test.cjs
 *
 * Vì sao có: OEM không có lint. Đợt 3 từng lọt ProductPricing.jsx dùng `useState` mà QUÊN import — `npm test` và
 * `npm run build` đều XANH (esbuild/Rollup coi tên lạ là biến toàn cục, chỉ nổ ReferenceError lúc chạy trên trình duyệt:
 * cả màn trắng). Bước này bắt đúng loại lỗi đó: phân tích phạm vi (@babel/parser + @babel/traverse — đã có sẵn trong
 * node_modules do @vitejs/plugin-react kéo theo) rồi liệt kê mọi tên được DÙNG mà không được khai báo/import ở đâu, trừ danh
 * sách biến toàn cục của trình duyệt/JS bên dưới. Thêm tên vào danh sách này CHỈ khi nó thật sự là biến toàn cục của trình duyệt.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}

const GLOBALS = new Set((
  // ngôn ngữ
  'undefined NaN Infinity globalThis Object Array String Number Boolean Symbol BigInt Function Date RegExp Error TypeError RangeError ' +
  'SyntaxError ReferenceError EvalError URIError Promise Proxy Reflect JSON Math Intl Set Map WeakMap WeakSet WeakRef Uint8Array ' +
  'Uint16Array Uint32Array Int8Array Int16Array Int32Array Float32Array Float64Array ArrayBuffer DataView parseInt parseFloat ' +
  'isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape structuredClone queueMicrotask ' +
  // trình duyệt
  'window document navigator location history screen localStorage sessionStorage indexedDB IDBKeyRange console fetch ' +
  'setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame requestIdleCallback ' +
  'URL URLSearchParams Blob File FileReader FormData AbortController Response Request Headers Event CustomEvent KeyboardEvent ' +
  'MouseEvent Node Element HTMLElement HTMLInputElement HTMLTextAreaElement HTMLSelectElement Image ResizeObserver IntersectionObserver MutationObserver ' +
  'getComputedStyle matchMedia performance crypto atob btoa TextEncoder TextDecoder alert confirm prompt open close print ' +
  'addEventListener removeEventListener dispatchEvent postMessage BroadcastChannel Notification'
).split(/\s+/));

const root = path.join(__dirname, '..', 'src');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(root).filter((f) => /\.(jsx?|mjs)$/.test(f));

/** Tên được dùng mà không khai báo trong một file nguồn. */
function chuaKhaiBao(file) {
  const src = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
  const thieu = new Set();
  traverse(ast, {
    Program(p) {
      Object.keys(p.scope.globals).forEach((n) => { if (!GLOBALS.has(n)) thieu.add(n); });
    }
  });
  return Array.from(thieu).sort();
}

// ---------------------------------------------------------------------------
console.log('\n1. Công cụ soát hoạt động đúng (bắt được lỗi thật, không báo oan)');
const tmp = path.join(require('os').tmpdir(), 'oem-khai-bao-' + process.pid);
fs.mkdirSync(tmp, { recursive: true });
const thu = (ten, code) => { const f = path.join(tmp, ten); fs.writeFileSync(f, code); return chuaKhaiBao(f); };
check('bắt `useState` dùng mà không import (đúng lỗi Đợt 3)',
  JSON.stringify(thu('a.jsx', "import React from 'react';\nexport default function A() { const [x] = useState(0); return <div>{x}</div>; }\n")) === '["useState"]');
check('bắt component JSX dùng mà không import',
  JSON.stringify(thu('b.jsx', "import React from 'react';\nexport default function B() { return <Foo />; }\n")) === '["Foo"]');
check('không báo oan: import, khai báo cục bộ, tham số, biến toàn cục trình duyệt',
  thu('c.jsx', "import React, { useState } from 'react';\nconst k = 1;\nexport default function C({ p }) { const [x] = useState(k); const f = (q) => q + p; return <div onClick={() => window.alert(localStorage.getItem('a') || f(x))}>{new Date().getTime()}</div>; }\n").length === 0);
check('bắt hàm dùng mà chưa khai báo ở đâu (gõ nhầm tên)',
  JSON.stringify(thu('d.js', "export function d(a) { return tinhTong(a); }\n")) === '["tinhTong"]');
fs.rmSync(tmp, { recursive: true, force: true });

// ---------------------------------------------------------------------------
console.log('\n2. Mọi file nguồn trong src/ (' + files.length + ' file, gồm cả src/dev)');
const loi = [];
files.forEach((f) => {
  try {
    const t = chuaKhaiBao(f);
    if (t.length) loi.push(path.relative(root, f).replace(/\\/g, '/') + ': ' + t.join(', '));
  } catch (e) {
    loi.push(path.relative(root, f).replace(/\\/g, '/') + ': KHÔNG PHÂN TÍCH ĐƯỢC — ' + e.message);
  }
});
check('không file nào dùng định danh chưa khai báo/import', loi.length === 0, loi);

console.log('\n' + '='.repeat(52));
console.log(pass + ' đạt, ' + fail + ' lỗi');
process.exit(fail ? 1 : 0);
