// Chuyển sang app khác (Portal / Forecast / Xuất khẩu) là TẢI LẠI CẢ TRANG: trang đích
// mất 1–6 giây (Xuất khẩu ~800KB) trong lúc màn hình cũ đứng im, nên người dùng tưởng nút
// không ăn và bấm tiếp. Hai việc ở đây giảm cảm giác đó:
//  - lamNongTrang: rê chuột / chạm vào nút là tải sẵn trang đích vào bộ nhớ đệm của trình duyệt;
//  - layBamChuyen: bấm thường (không phải mở tab mới) thì báo ngay "Đang chuyển…".

const daNong = new Set();

/** Gợi ý trình duyệt tải sẵn trang đích. Mỗi địa chỉ chỉ làm một lần; lỗi thì bỏ qua. */
export function lamNongTrang(href) {
  try {
    if (!href || daNong.has(href) || typeof document === 'undefined') return;
    daNong.add(href);
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = href;
    document.head.appendChild(l);
  } catch {
    // prefetch chỉ là gợi ý — không tải sẵn được thì lần bấm vẫn đi bình thường
  }
}

/** Lần bấm có đúng là "đi tới trang này" không (bấm trái, không phím bổ trợ, chưa ai chặn). */
export function laBamDiThang(e) {
  return !!e && !e.defaultPrevented && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}
