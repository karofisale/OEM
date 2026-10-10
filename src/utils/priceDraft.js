/**
 * Logic thuần của màn Đề xuất giá (PriceProposePanel) — tách ra để test gọi thẳng.
 *
 * `draftMap`: { sku: { retail, promoQty, promoPrice } } — số đã gõ, chưa gửi.
 * Ô bị xoá trắng thì parseDigits trả 0, nên "có nhập" nghĩa là > 0 chứ không
 * phải khác ''.
 */

const coSo = (v) => v !== '' && v != null && Number(v) > 0;

/**
 * Dòng sẽ gửi: mọi SKU trong danh mục có Giá lẻ đề xuất > 0 — đọc thẳng từ
 * draftMap, KHÔNG qua bộ lọc đang xem (09/10/2026). Bản trước lấy danh sách
 * đang lọc, nên giá gõ cho SKU bị ô tìm / Nhóm SP ẩn đi không được gửi, rồi
 * setDraftMap({}) xoá luôn — mất im lặng.
 */
export function dongDeXuat(materials, draftMap) {
  return (materials || []).filter((m) => {
    const d = draftMap && draftMap[m.sku];
    return !!d && coSo(d.retail);
  });
}

/** Số SKU đang có ít nhất một ô nháp có số (kể cả SL KM / Giá KM chưa kèm Giá lẻ). */
export function soMaCoNhap(draftMap) {
  return Object.keys(draftMap || {}).filter((sku) => {
    const d = draftMap[sku] || {};
    return coSo(d.retail) || coSo(d.promoQty) || coSo(d.promoPrice);
  }).length;
}

/** Bỏ nháp của các SKU VỪA gửi, giữ nguyên phần còn lại (nháp chưa đủ Giá lẻ thì chưa được gửi). */
export function boNhapDaGui(draftMap, skusDaGui) {
  const sent = new Set(skusDaGui || []);
  const next = {};
  Object.keys(draftMap || {}).forEach((sku) => { if (!sent.has(sku)) next[sku] = draftMap[sku]; });
  return next;
}
