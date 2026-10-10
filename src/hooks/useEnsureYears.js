import { useEffect, useMemo } from 'react';
import { namCanTai, trangThaiNam } from '../utils/txYears';

/**
 * Bảo đảm các NĂM màn hình sắp cộng số đã có giao dịch (Đợt 4). `txYears` do App.jsx cấp:
 *   { olderYears: ['2024', ...], loaded: ['2024'], errors: { '2023': 'câu lỗi' }, ensure(years), retry(years) }
 * hoặc undefined (màn dựng riêng / test) -> không có gì để tải.
 * `wanted`: mảng năm (số hoặc chuỗi), hoặc chứa 'ALL' = mọi năm cũ.
 *
 * Trả { dangTai, loi, canTai, thu() , nhan }: màn dùng cho TableState (loading / error / onRetry) — khi đang tải hoặc lỗi thì
 * KHÔNG hiện số cộng, vì dữ liệu năm đó chưa đủ.
 */
export function useEnsureYears(txYears, wanted) {
  const older = txYears && txYears.olderYears;
  const key = (wanted || []).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const canTai = useMemo(() => namCanTai(wanted, older), [key, older]);
  const ck = canTai.join(',');
  const ensure = txYears && txYears.ensure;
  useEffect(() => {
    if (ensure && canTai.length) ensure(canTai);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ck, ensure]);
  const st = trangThaiNam(canTai, txYears && txYears.loaded, null, txYears && txYears.errors);
  const retry = () => { if (txYears && txYears.retry) txYears.retry(canTai); };
  const nhan = canTai.length ? 'Đang tải doanh thu năm ' + canTai.join(', ') + '...' : 'Đang tải...';
  return { dangTai: st.dangTai, loi: st.loi, canTai, retry, nhan };
}
