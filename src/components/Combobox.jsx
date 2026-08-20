import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

// One searchable free-type picker, replacing three near-identical hand-rolled
// dropdowns (SkuPickerCell, ClientPickerCell, and the client field in SalesPlan's
// proposal modal). Picking a SKU or a client is the most-repeated action in the
// app — every line of every order — and all three copies had the same two defects:
//
// 1. CLIPPED. `.table-container` sets `overflow-x: auto`, and per the CSS spec a
//    non-`visible` value on one axis computes the other to `auto` too. The
//    dropdowns were absolutely positioned INSIDE that container, so choosing a
//    SKU on one of the last visible rows meant the suggestions were cut off.
//    Fixed by rendering the list in a portal on document.body, positioned from
//    the input's viewport rect. This also clears the modal stacking problem for
//    SalesPlan, whose picker lives inside a z-index:1000 overlay.
//
// 2. MOUSE-ONLY. There was no onKeyDown, tabIndex or role anywhere in the app.
//    A salesperson who had just typed a SKU could not press ArrowDown+Enter —
//    they had to move to the mouse for every single line. Now: ArrowUp/Down to
//    move, Enter to pick, Escape to dismiss, Tab to leave.
//
// The old code also closed the list via `onBlur={() => setTimeout(close, 150)}`,
// a race that onMouseDown happened to win. Keyboard selection would have lost
// it. The list now calls preventDefault on mousedown so the input never blurs.

const LIST_MAX_HEIGHT = 260;

export default function Combobox({
  initialText = '',
  options,
  filterFn,
  toText,
  getKey,
  renderOption,
  onSelect,
  placeholder,
  ariaLabel,
  inputClassName = 'input-field',
  inputStyle,
  maxOptions = 30,
  minListWidth = 280
}) {
  const [query, setQuery] = useState(initialText);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState(null);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const optionRefs = useRef([]);

  const matches = useMemo(
    () => options.filter(o => filterFn(o, query)).slice(0, maxOptions),
    [options, filterFn, query, maxOptions]
  );

  // Track the input's viewport position while the list is open. `true` on the
  // scroll listener catches scrolling of the table container too, not just the
  // page — otherwise the portalled list would detach from its input.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Keep the keyboard-highlighted option visible.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = optionRefs.current[activeIndex];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (item) => {
    setQuery(toText(item));
    setOpen(false);
    setActiveIndex(-1);
    onSelect(item);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); setActiveIndex(0); return; }
      setActiveIndex(i => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return;
      setActiveIndex(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && matches[activeIndex]) {
        e.preventDefault(); // don't submit the surrounding form on a pick
        commit(matches[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    } else if (e.key === 'Tab') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const listboxId = useRef(`cbx-${Math.random().toString(36).slice(2, 8)}`).current;
  const showList = open && matches.length > 0 && rect;

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className={inputClassName}
        style={inputStyle}
        value={query}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={showList ? 'true' : 'false'}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={showList && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
        autoComplete="off"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(-1); }}
        onFocus={(e) => { e.target.select(); setOpen(true); }}
        onBlur={() => { setOpen(false); setActiveIndex(-1); }}
        onKeyDown={handleKeyDown}
      />

      {showList && createPortal(
        <div
          id={listboxId}
          ref={listRef}
          role="listbox"
          // Keeps focus in the input, so onBlur never fires mid-click and the
          // 150ms close-timeout race the old code relied on is gone.
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            top: Math.round(rect.bottom + 4),
            left: Math.round(rect.left),
            minWidth: Math.max(minListWidth, Math.round(rect.width)),
            maxHeight: LIST_MAX_HEIGHT,
            overflowY: 'auto',
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            // Above the z-index:1000 modal overlays, since SalesPlan's picker
            // sits inside one.
            zIndex: 2000
          }}
        >
          {matches.map((opt, i) => (
            <div
              key={getKey(opt)}
              id={`${listboxId}-opt-${i}`}
              ref={(el) => { optionRefs.current[i] = el; }}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => commit(opt)}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border-color)',
                background: i === activeIndex ? 'var(--bg-card-hover, #eef2f6)' : 'transparent'
              }}
            >
              {renderOption(opt)}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
