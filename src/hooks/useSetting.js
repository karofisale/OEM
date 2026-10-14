import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { getSetting, getTrangThai, subscribe } from '../services/prefsSync';
import { DEFS, saleMacDinh } from '../utils/settings';
import { ownsSaleRow } from '../utils/roles';

/**
 * Đọc một cài đặt cá nhân (khoá `st.*`, xem utils/settings.js) và tự vẽ lại khi nó đổi — do người dùng sửa ở trang Cài đặt
 * hoặc do bản từ máy chủ về sau lần tải đầu. Chưa chọn / giá trị hỏng -> mặc định của khoá đó.
 */
export function useSetting(key) {
  return useSyncExternalStore(subscribe, () => getSetting(key), () => DEFS[key].def);
}

/** Chạy `fn` mỗi khi cài đặt `key` ĐỔI (không chạy ở lần dựng đầu). Dùng để bỏ bộ lọc đã nhớ khi người dùng đổi mặc định. */
export function useOnSettingChange(key, fn) {
  const v = useSetting(key);
  const first = useRef(true);
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    cb.current(v);
  }, [v]);
}

/** Cỡ trang mặc định: cài đặt "Số dòng mỗi trang" nếu đã chọn, không thì mặc định riêng của màn (`macDinh`). */
export function useDefaultPageSize(macDinh) {
  const s = useSetting('st.pageSize');
  return s || macDinh;
}

/** Mật độ bảng: gắn/gỡ class `density-compact` trên <html> theo cài đặt (CSS ở index.css). Gỡ khi `bat` = false (chưa đăng nhập). */
export function useApplyDensity(bat) {
  const d = useSetting('st.density');
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('density-compact', !!bat && d === 'compact');
    return () => { root.classList.remove('density-compact'); };
  }, [bat, d]);
}

/** 'chua' | 'dang' | 'ok' | 'loi' — trạng thái đồng bộ cài đặt với máy chủ (chỉ để hiện một dòng thông tin). */
export function useSyncStatus() {
  return useSyncExternalStore(subscribe, getTrangThai, () => 'chua');
}

/**
 * Mặc định của bộ lọc báo cáo theo Cài đặt cá nhân (st.reportYear / st.reportSale) — CHỈ dùng khi người dùng chưa tự chọn ở màn đó
 * (bộ lọc đã nhớ vẫn thắng, như trước). { nam: '2026' | null (null = năm mới nhất có dữ liệu), sale: tên Sale | 'ALL' }.
 * "Của tôi" so mã Sale của tài khoản với danh sách Sale (không áp cho tài khoản không có mã Sale, vd admin chung -> 'ALL').
 */
export function useReportDefaults(activeUser, salesList) {
  const ry = useSetting('st.reportYear');
  const rs = useSetting('st.reportSale');
  const saleId = activeUser && activeUser.saleId;
  const sale = saleMacDinh(rs, salesList, activeUser, (u, ten) => !!saleId && ownsSaleRow({ role: 'sale', saleId }, ten));
  return { nam: ry === 'current' ? String(new Date().getFullYear()) : null, sale };
}
