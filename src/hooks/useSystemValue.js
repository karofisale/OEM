import { useSyncExternalStore } from 'react';
import { getSystemValue, subscribe } from '../services/systemValues';
import { subscribe as subscribePrefs, daChon } from '../services/prefsSync';
import { useSetting } from './useSetting';
import { SYS_DEFAULTS, KHOA_LNG } from '../utils/systemSettings';

/**
 * Đọc một cài đặt HỆ THỐNG đang hiệu lực (khoá `oem.*`, xem utils/systemSettings.js) và tự vẽ lại khi nó đổi (lượt tải sau bootstrap
 * hoặc master vừa lưu). Luôn trả một số hợp lệ: chưa tải được / máy chủ lỗi -> mặc định có sẵn (VAT 0.08, LNG 20).
 */
export function useSystemValue(key) {
  return useSyncExternalStore(subscribe, () => getSystemValue(key), () => SYS_DEFAULTS[key]);
}

/**
 * % LNG điền sẵn ở máy tính giá: giá trị CÁ NHÂN (st.calcMargin) nếu người dùng đã chọn, không thì mặc định HỆ THỐNG (oem.defaultMargin).
 * { value, heThong, daChon }: `value` là số dùng, `heThong` là mặc định hệ thống hiện hành (để hiện gợi ý ở trang Cài đặt cá nhân).
 */
export function useCalcMargin() {
  const rieng = useSetting('st.calcMargin');
  const daChonRieng = useSyncExternalStore(subscribePrefs, () => daChon('st.calcMargin'), () => false);
  const heThong = useSystemValue(KHOA_LNG);
  return { value: daChonRieng ? rieng : heThong, heThong, daChon: daChonRieng };
}
