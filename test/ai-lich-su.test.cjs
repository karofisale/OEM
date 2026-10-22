/** 22/10/2026 — AI nhận đơn: nhãn "Khách từng mua / Chưa từng mua" từ lịch sử mua (máy chủ đối chiếu toàn bộ lịch sử). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/AIOrderAgent.jsx'), 'utf8').replace(/\r\n/g, '\n');
let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); pass++; console.log('  OK   ' + name); };

ok('có huy hiệu DaMuaBadge: true = "Khách từng mua", false = "Chưa từng mua", undefined = không hiện gì', /function DaMuaBadge/.test(src) && /Khách từng mua/.test(src) && /Chưa từng mua/.test(src) && /return null;\n\}\n\nfunction IconDinhKem/.test(src));
ok('dòng đơn mang cờ daMua và bảng vẽ huy hiệu', /note: note \|\| '',\n      daMua\n/.test(src) && /<DaMuaBadge daMua=\{item\.daMua\} \/>/.test(src));
ok('ưu tiên câu trả lời của máy chủ (lichSuKhach.coDuLieu, it.daMua); khách mới chưa có lịch sử thì KHÔNG cảnh báo', /kq\.lichSuKhach \? !!kq\.lichSuKhach\.coDuLieu : skuDaMua\.size > 0/.test(src) && /coLichSu \? \(it\.daMua !== undefined \? it\.daMua : skuDaMua\.has\(it\.sku\)\) : undefined/.test(src));
ok('đổi khách / đổi mã tay: chỉ khẳng định "từng mua" khi tìm thấy, không thấy thì không báo "chưa từng mua" (lịch sử đang tải có thể thiếu năm cũ)', (src.match(/\? true : undefined/g) || []).length === 2);
console.log('\n' + pass + ' đạt, 0 lỗi');
