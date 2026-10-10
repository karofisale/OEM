import { useMemo, useState, useCallback } from 'react';
import { sapXepDong, doiSapXep } from '../utils/tableSort';

/**
 * Sắp xếp theo cột cho một bảng.
 *
 *   const cols = useMemo(() => [{ key: 'name' }, { key: 'qty', type: 'number' }], []);
 *   const { rows, sort, onSort } = useTableSort(filtered, cols);
 *   ... usePagedSlice(rows, ...)           // sắp TRƯỚC khi cắt trang
 *   <SortableTh col="qty" sort={sort} onSort={onSort}>Số lượng</SortableTh>
 *
 * `initial` = { key, dir } hoặc null (giữ thứ tự gốc của dữ liệu).
 * `cols` nên ổn định (hằng ngoài component hoặc useMemo) để useMemo bên dưới có tác dụng.
 */
export function useTableSort(rows, cols, initial = null) {
  const [sort, setSort] = useState(initial);
  const onSort = useCallback((key) => {
    setSort((cur) => doiSapXep(cur, cols.find((c) => c.key === key) || key));
  }, [cols]);
  const sorted = useMemo(() => sapXepDong(rows, sort, cols), [rows, sort, cols]);
  return { rows: sorted, sort, onSort, setSort };
}
