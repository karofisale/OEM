// Làm sạch + kiểm tra ô nhập của form Khách hàng / Sản phẩm — thuần JS, test gọi thẳng.
//
// Vì sao: mã dán từ Excel/SAP hay dính khoảng trắng đầu-cuối (kể cả khoảng trắng không ngắt NBSP và
// ký tự rộng-bằng-không). "MAT1000 " và "MAT1000" nhìn giống hệt nhưng so bằng === không bao giờ khớp,
// nên kiểm trùng bị lọt rồi server (so chính xác) lại nhận thêm một mã trùng. Cắt trước khi so và trước khi lưu.

/** Cắt khoảng trắng đầu-cuối, kể cả NBSP / zero-width / BOM. Không đụng khoảng trắng ở giữa. */
export function catKhoangTrang(v) {
  return String(v == null ? '' : v).replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ').trim();
}

/** Khoá để SO TRÙNG mã: cắt khoảng trắng + không phân biệt hoa/thường. */
export function khoaMa(v) {
  return catKhoangTrang(v).toLowerCase();
}

/**
 * Tìm phần tử đã có cùng mã (sau khi cắt khoảng trắng). `layMa(item)` lấy mã của một phần tử;
 * `boQua(item)` loại chính bản ghi đang sửa. Trả phần tử trùng đầu tiên hoặc null. Mã rỗng thì không bao giờ trùng.
 */
export function timMaTrung(danhSach, layMa, ma, boQua) {
  const k = khoaMa(ma);
  if (!k) return null;
  for (const it of danhSach || []) {
    if (boQua && boQua(it)) continue;
    if (khoaMa(layMa(it)) === k) return it;
  }
  return null;
}

/**
 * Kiểm một ô giá/số tiền: '' / null = chưa nhập (hợp lệ, hiểu là 0). Trả '' nếu ổn, hoặc câu báo lỗi.
 * Chặn số âm và giá trị không phải số.
 */
export function kiemGia(v, nhan = 'Giá') {
  if (v === '' || v == null) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return `${nhan} phải là một số.`;
  if (n < 0) return `${nhan} không được âm.`;
  return '';
}

/**
 * Dựng bản ghi SẢN PHẨM MỚI từ ô nhập của form (dùng ở "Thêm sản phẩm vào kế hoạch" của Kế hoạch SOP) — CÙNG quy tắc với
 * form Thêm sản phẩm của Danh mục (ProductManagement): cắt khoảng trắng, SKU + Tên bắt buộc, giá không âm (trống = 0,
 * server cũng nhận trống/0), trùng mã không phân biệt hoa/thường, alias mặc định = từ đầu của tên, đơn vị PC.
 * Trả { error } (câu tiếng Việt) hoặc { mat }. `nhomCoSan` (mảng) để gộp nhóm gõ khác hoa/thường về đúng chữ đã có.
 */
export function dungSanPhamMoi(f, materials, nhomCoSan) {
  const sku = catKhoangTrang(f && f.sku);
  const name = catKhoangTrang(f && f.name);
  if (!sku || !name) return { error: 'Nhập đủ Mã SKU và Tên sản phẩm (khoảng trắng đơn thuần không tính).' };
  const loiGia = kiemGia(f.price, 'Giá bán');
  if (loiGia) return { error: loiGia };
  const trung = timMaTrung(materials, (m) => m.sku, sku);
  if (trung) return { error: `Mã SKU "${trung.sku}" đã có trong danh mục (${trung.name}).`, trung };
  let group = catKhoangTrang(f.group);
  const khop = (nhomCoSan || []).find((g) => khoaMa(g) === khoaMa(group));
  if (khop) group = khop;
  if (!group) return { error: 'Chọn hoặc gõ Nhóm SP.' };
  const gia = parseFloat(f.price) || 0;
  return {
    mat: {
      sku, name,
      alias: catKhoangTrang(f.alias) || name.split(' ')[0],
      group,
      unit: 'PC',
      exclusiveTo: catKhoangTrang(f.exclusiveTo),
      suggestedPrice: gia,
      avgPrice: gia,
      latestPrice: 0,
      latestPriceVat: 0,
      totalQty: 0
    }
  };
}
