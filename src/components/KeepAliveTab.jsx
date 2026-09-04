import React, { useRef, Suspense } from 'react';
import LoadingScreen from './LoadingScreen';

// Renders a tab's content the first time that tab is opened, then keeps it
// mounted and simply hides it when the user navigates elsewhere.
//
// The app previously rendered tabs with `activeTab === 'x' && <X/>`, which
// unmounts on every switch. That threw away:
//   - OrdersReview's fetched data, so `useEffect(..., [])` refired and made a
//     fresh backend round-trip every single time the tab was reopened — on a
//     connection where those have been measured from 1.4s to minutes.
//   - every useMemo cache (Revenue Reports re-aggregated the full transaction
//     history from scratch), and
//   - all local UI state: search text, month/sale filters, current page.
//
// Mounting lazily rather than rendering all ten tabs up front matters: a few of
// these are heavy (ProductManagement alone renders ~8,000 elements), so eagerly
// mounting everything would move that cost onto app startup, which is exactly
// what we're trying to make fast.
//
// `display: none` rather than the `hidden` attribute, because `hidden` is only a
// UA default that any `display` rule in index.css would silently override.
//
// `hasVisited` is optional (2026-08-27): App.jsx already keeps a visitedTabs Set
// for the sidebar tabs and passes it in, but the SUB-tab containers
// (ProductPricing/DebtManagement/SopPlan/SalesPlan/RevenueReports) have no such
// Set — and duplicating one in each of them buys nothing. When the prop is
// omitted, this tracks its own "has been active at least once" flag instead, so
// a sub-tab gets the identical lazy-mount-then-keep-alive behaviour for free.
export default function KeepAliveTab({ isActive, hasVisited, children }) {
  // A ref, not state: the flag only ever goes false -> true and is read in the
  // same render that sets it, so no re-render is needed to act on it. Doing this
  // with useState + useEffect instead would return null for one frame the first
  // time a sub-tab is opened (the effect runs after that render), i.e. a visible
  // blank flash on every first open. Every isActive change already comes from a
  // parent state update, which re-renders this component anyway.
  const visitedRef = useRef(false);
  if (isActive) visitedRef.current = true;

  const visited = hasVisited === undefined ? visitedRef.current : hasVisited;
  if (!visited) return null;
  return (
    <div style={{ display: isActive ? 'block' : 'none' }} aria-hidden={!isActive}>
      {/* Ranh giới Suspense đặt ở ĐÂY, không phải bọc chung cả vùng nội dung.
          App.jsx tải các tab bằng React.lazy (2026-09-04), nên lần đầu mở một
          tab là một lượt tải chunk. Nếu bọc chung một Suspense cho cả <main>
          thì trong lúc chờ chunk đó, React ẩn TOÀN BỘ con của ranh giới — tức
          tab đang xem cũng nháy sang màn chờ. Đặt trong đây thì chỉ đúng ô của
          tab đang mở hiện màn chờ.

          Đặt ở KeepAliveTab thay vì ở từng chỗ gọi vì mọi tab và sub-tab đều
          đi qua đây — không phải sửa 16 chỗ, và tab nào chưa dùng lazy thì
          không bao giờ treo nên ranh giới này vô hại với chúng. */}
      <Suspense fallback={<LoadingScreen compact label="Đang mở..." />}>
        {children}
      </Suspense>
    </div>
  );
}
