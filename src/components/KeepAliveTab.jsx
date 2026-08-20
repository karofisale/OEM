import React from 'react';

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
export default function KeepAliveTab({ isActive, hasVisited, children }) {
  if (!hasVisited) return null;
  return (
    <div style={{ display: isActive ? 'block' : 'none' }} aria-hidden={!isActive}>
      {children}
    </div>
  );
}
