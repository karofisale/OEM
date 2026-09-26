/**
 * Tiện ích BOM dùng chung giữa modal xem/cập nhật và (sau này) chỗ nào cần
 * đọc cùng một quy ước.
 */

/** Dòng nhịp tim của NÚT cào BOM — do dieu-phoi.ps1 ghi, không phải dòng dữ
 *  liệu. Đổi tên ở đây thì phải đổi cả trong dieu-phoi.ps1. */
export const JOB_BOM_NUT = 'oem.bom.nut';

/** Mã máy = mã bắt đầu bằng số 1 (quy ước của người dùng, 15/09/2026). Chỉ
 *  những mã này mới có BOM, nên chỉ chúng mới hiện nút BOM. */
export function laMaMay(sku) {
  return /^1/.test(String(sku || '').trim());
}

const chuanHoaODuLieu = (s) => String(s === null || s === undefined ? '' : s).trim();

// "1.234,5" (vi) và "1,234.5" (en) đều phải ra đúng một số. SAP xuất theo cấu
// hình vùng của máy nên không đoán trước được kiểu nào.
export function doSo(text) {
  const s = chuanHoaODuLieu(text).replace(/\s/g, '');
  if (!s) return 0;
  let t = s;
  const phay = t.lastIndexOf(',');
  const cham = t.lastIndexOf('.');
  if (phay >= 0 && cham >= 0) {
    // Dấu nào đứng SAU là dấu thập phân, dấu kia là phân cách nghìn.
    if (phay > cham) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (phay >= 0) {
    // Chỉ có phẩy: là thập phân khi đứng cách đuôi 1-2 chữ số, còn lại là nghìn.
    t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  } else if (cham >= 0) {
    // Đối xứng với nhánh trên. Không dùng lookbehind: Safari cũ chưa hỗ trợ, mà
    // một regex không chạy được ở đây làm hỏng cả ô dán chứ không chỉ một số.
    t = /\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, '');
  }
  const n = parseFloat(t.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * Đọc bảng Z_BOM người dùng copy từ SAP dán vào app.
 *
 * SAP copy ra dạng TSV (các cột cách nhau bằng Tab). Chỉ lấy 5 cột ĐẦU TIÊN,
 * đúng như yêu cầu — bảng thật còn nhiều cột phía sau (đơn vị, mức, kho...) mà
 * app không dùng tới, và bỏ qua chúng ở đây thì phần còn lại không phải biết.
 *
 * BỎ DÒNG TIÊU ĐỀ nếu có: người dùng hay bôi cả bảng kể cả dòng đầu. Nhận ra
 * bằng chính chữ "material" ở ô thứ nhất, không phải bằng "dòng số 1" — dán
 * không kèm tiêu đề cũng phải chạy đúng.
 *
 * LỌC THEO ĐÚNG MÃ ĐANG MỞ. Bảng SAP có thể chứa nhiều Material nếu người dùng
 * lỡ chạy cho một dải mã; ghi nhầm BOM của mã khác đè lên mã này là hỏng dữ
 * liệu mà không ai nhận ra. `skuMongMuon` để trống thì nhận tất cả.
 *
 * Ném lỗi có câu chữ rõ ràng thay vì trả mảng rỗng — mảng rỗng đi tiếp xuống
 * backend sẽ thành "Không tìm thấy BOM", một câu SAI cho trường hợp dán nhầm.
 */
export function parseBomDan(text, skuMongMuon) {
  const dong = String(text || '').split(/\r?\n/).map((d) => d.trimEnd()).filter((d) => d.trim());
  if (!dong.length) throw new Error('Chưa dán nội dung nào.');

  const o = dong.map((d) => d.split('\t'));
  if (o.length && /material/i.test(chuanHoaODuLieu(o[0][0]))) o.shift();
  if (!o.length) throw new Error('Bảng dán chỉ có dòng tiêu đề, không có dòng dữ liệu nào.');

  const mong = chuanHoaODuLieu(skuMongMuon);
  const rows = [];
  const maKhac = new Set();

  o.forEach((c) => {
    const material = chuanHoaODuLieu(c[0]);
    const component = chuanHoaODuLieu(c[2]);
    if (!component) return;
    if (mong && material && material !== mong) { maKhac.add(material); return; }
    rows.push({
      materialDesc: chuanHoaODuLieu(c[1]),
      component,
      componentDesc: chuanHoaODuLieu(c[3]),
      quantity: doSo(c[4])
    });
  });

  if (!rows.length) {
    if (maKhac.size) {
      throw new Error(
        `Bảng dán không có dòng nào của mã ${mong} — chỉ thấy mã ${Array.from(maKhac).slice(0, 3).join(', ')}. ` +
        'Chạy lại Z_BOM với đúng mã này rồi dán lại.'
      );
    }
    throw new Error('Không đọc được dòng nào. Cần dán nguyên bảng từ SAP (các cột cách nhau bằng Tab).');
  }
  return rows;
}
