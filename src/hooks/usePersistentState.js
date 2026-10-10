import { useState, useCallback } from 'react';
import { readUi, writeUi } from '../utils/uiState';

/**
 * useState có nhớ qua F5 (localStorage, xem utils/uiState.js).
 *
 *   const [thang, setThang] = usePersistentState('reports.thang', null);
 *
 * `validate(v)` chặn giá trị cũ không còn hợp lệ (vai trò đổi, tab bị gỡ...) —
 * không qua thì dùng `initial`. Setter nhận giá trị hoặc hàm như useState.
 */
export function usePersistentState(key, initial, validate) {
  const [value, setValue] = useState(() => readUi(key, initial, validate));
  const set = useCallback((next) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? next(prev) : next;
      writeUi(key, v);
      return v;
    });
  }, [key]);
  return [value, set];
}
