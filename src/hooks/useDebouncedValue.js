import { useEffect, useState } from 'react';

/**
 * Trả về `value` nhưng trễ `delay` ms sau lần đổi cuối — dùng cho ô tìm kiếm
 * lọc danh sách tại chỗ (client-side filter), để không lọc lại toàn bộ mảng
 * mỗi ký tự gõ. Dữ liệu các bảng hiện còn nhỏ nên chưa thấy giật, nhưng làm
 * nhất quán một chỗ vẫn tốt hơn để mỗi màn tự set state trực tiếp.
 *
 * KHÔNG dùng cho autocomplete cần phản hồi tức thì (VD: chọn SKU khi thêm
 * dòng PI) — ở đó độ trễ lại là điều không mong muốn.
 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
