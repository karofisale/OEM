import { useEffect, useRef } from 'react';

/**
 * Mục có tab con nhận lệnh "mở thẳng tab con này" từ nơi khác (30/10/2026) — vd nút "Mở Chờ duyệt" ở màn Nhận đơn, hoặc Bán hàng
 * thanh lý. `jump` = { n, sub } do App cấp (`null` nếu lệnh không dành cho mục này); mỗi lệnh có `n` tăng dần nên bấm lại cùng
 * một đích vẫn có tác dụng. Mục được dựng lười, nên lệnh đến NGAY LÚC dựng lần đầu cũng được áp (ref khởi đầu 0).
 * Chỉ nhận tab con nằm trong `tabs` (vai trò không thấy tab đó thì bỏ qua).
 */
export function useJump(jump, tabs, setSub) {
  const daAp = useRef(0);
  const n = jump ? jump.n : 0;
  useEffect(() => {
    if (!jump || !jump.n || jump.n === daAp.current) return;
    daAp.current = jump.n;
    if (tabs.some((t) => t.id === jump.sub)) setSub(jump.sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
}
