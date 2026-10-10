import { useEffect, useRef } from 'react';
import { setDirty } from '../utils/unsavedGuard';

let nextId = 1;

/**
 * Báo "màn này đang có thay đổi chưa lưu" cho khung dùng chung:
 *  - F5 / đóng tab / bấm link rời app -> trình duyệt hỏi (beforeunload);
 *  - bấm tab/menu khác trong app -> hộp thoại chung hỏi (NavGuardProvider).
 *
 *   useUnsavedGuard(soMaCoNhap(draftMap) > 0, 'Đề xuất giá');
 *
 * Tự gỡ khi màn bị unmount. `label` hiện trong hộp thoại ("Còn thay đổi chưa
 * lưu ở: Đề xuất giá").
 */
export function useUnsavedGuard(isDirty, label) {
  const id = useRef(null);
  if (id.current === null) id.current = 'g' + (nextId++);
  useEffect(() => {
    setDirty(id.current, !!isDirty, label);
  }, [isDirty, label]);
  useEffect(() => () => setDirty(id.current, false), []);
}
