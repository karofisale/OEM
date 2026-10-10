import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { hasDirty, dirtyLabels, dirtyVersion } from '../utils/unsavedGuard';

// Hộp thoại chung "còn thay đổi chưa lưu" khi chuyển tab / đăng xuất trong app
// (Đợt 2 / mục 5). Màn nào có dữ liệu dở dang đăng ký bằng useUnsavedGuard().
//
//   const guard = useNavGuard();
//   guard(() => setActiveTab('sop'));      // chạy ngay nếu không có gì dở, không thì hỏi
//
// Hỏi MỘT lần cho mỗi đợt thay đổi: đã đồng ý rời đi thì các lần bấm tab tiếp theo
// không hỏi lại cho tới khi có màn KHÁC chuyển sang trạng thái chưa lưu (version
// trong utils/unsavedGuard.js tăng). Nếu hỏi mọi lần bấm tab, người dùng sẽ bấm
// "Rời đi" theo phản xạ và hộp thoại mất tác dụng.
//
// F5 / đóng tab / bấm link rời app do `beforeunload` lo (cũng ở utils/unsavedGuard.js).
const NavGuardContext = createContext(null);

export function NavGuardProvider({ children }) {
  const [pending, setPending] = useState(null); // { run, labels }
  const ackVersion = useRef(-1);

  const guard = useCallback((run) => {
    if (!hasDirty() || ackVersion.current === dirtyVersion()) { run(); return true; }
    setPending({ run, labels: dirtyLabels() });
    return false;
  }, []);

  const roiDi = () => {
    const run = pending.run;
    ackVersion.current = dirtyVersion();
    setPending(null);
    run();
  };

  return (
    <NavGuardContext.Provider value={guard}>
      {children}
      {pending && (
        <ConfirmDialog
          title="Còn thay đổi chưa lưu"
          message={
            (pending.labels.length
              ? `Bạn còn thay đổi chưa lưu ở: ${pending.labels.join(', ')}. `
              : 'Bạn còn thay đổi chưa lưu. ')
            + 'Chuyển đi bây giờ có thể làm mất chúng — nhất là khi tải lại trang.'
          }
          confirmLabel="Rời đi, bỏ thay đổi"
          cancelLabel="Ở lại để lưu"
          danger
          onConfirm={roiDi}
          onCancel={() => setPending(null)}
        />
      )}
    </NavGuardContext.Provider>
  );
}

/** Không có provider (test, harness) -> chạy thẳng, không hỏi. */
export function useNavGuard() {
  return useContext(NavGuardContext) || ((run) => { run(); return true; });
}
