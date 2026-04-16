/**
 * BookmarkBar.tsx — horizontal strip of bookmark pills with add/controls.
 *
 * Display modes (controlled by `bookmarkDisplayMode` in AppContext):
 *   'hidden'  — bar is not rendered at all (shouldShow = false → early return null)
 *   '1-line'  — single scrollable row; the nearest bookmark scrolls into view
 *   'all'     — multi-line wrapping layout showing every pill
 *   'overlay' — full-screen overlay rendered by BookmarkOverlay, not this component
 *
 * Width modes ('s' / 'm' / 'l') control how much of the bookmark label is
 * shown on each pill — short abbreviation, medium, or full label.
 *
 * The "armed / double-tap" pattern on each BookmarkPill:
 *   First tap  → navigate to the bookmark page AND arm the pill (highlight it)
 *   Second tap within 800 ms → open the edit modal (double-tap to edit)
 *   If 800 ms passes without a second tap → disarm silently
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { formatPillContent, extractLeadingChars, findNearestBookmark } from '../lib/bookmark-utils';
import type { Bookmark } from '../bookmarks';

/**
 * BookmarkBar renders the bookmark pill strip below the PDF canvas.
 *
 * It is only mounted when `bookmarkDisplayMode` is '1-line' or 'all' and a PDF
 * is open. The component also manages a transient "add bookmark" inline input
 * that appears in place of the '+' button when the user taps it.
 */
export function BookmarkBar() {
  const {
    pdfDoc, currentPage, bookmarks, bookmarkDisplayMode, bookmarkWidthMode,
    showTopBarTitle, goToPage, addBookmark,
    setBookmarkDisplayMode, setBookmarkWidthMode, setShowTopBarTitle,
    openBookmarkEdit,
  } = useAppContext();

  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  const { index: nearestIndex } = findNearestBookmark(bookmarks, currentPage);

  const shouldShow = pdfDoc !== null &&
    bookmarkDisplayMode !== 'hidden' &&
    bookmarkDisplayMode !== 'overlay';

  /**
   * When the inline add-bookmark input becomes visible, pre-fill it with a
   * sensible default label and focus it immediately.
   *
   * `setTimeout(0)` is required because React batches the state update and the
   * DOM hasn't painted the `<input>` element yet at the moment this effect
   * fires synchronously. Deferring to the next macrotask lets the browser
   * complete the DOM update so `.focus()` and `.select()` find a real element.
   */
  useEffect(() => {
    if (showInput) {
      setInputValue(`p.${currentPage + 1}`);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    }
  }, [showInput, currentPage]);

  /**
   * In 1-line mode, keep the nearest bookmark pill scrolled into view whenever
   * the current page changes or the mode switches to 1-line.
   *
   * This effect fires after React has committed the render (so the pill
   * elements exist in the DOM). No extra setTimeout is needed here — the
   * effect itself acts as the post-paint callback.
   */
  useEffect(() => {
    if (bookmarkDisplayMode === '1-line' && nearestIndex !== null && pillsRef.current) {
      const pill = pillsRef.current.children[nearestIndex] as HTMLElement;
      if (pill) pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [bookmarkDisplayMode, nearestIndex, currentPage]);

  if (!shouldShow) return null;

  const confirmInput = () => {
    const label = inputValue.trim();
    if (label) addBookmark(label, currentPage);
    setShowInput(false);
  };

  return (
    // The `mode-${...}` className maps directly to CSS selectors `.mode-1-line`
    // and `.mode-all`, which control row height and flex-wrap behaviour.
    <div id="bookmark-bar" className={`mode-${bookmarkDisplayMode === '1-line' ? '1-line' : bookmarkDisplayMode}`}>
      <div id="bookmark-controls">
        {showInput ? (
          <div id="bookmark-input-wrap">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); confirmInput(); }
                if (e.key === 'Escape') setShowInput(false);
              }}
              onBlur={() => setTimeout(() => setShowInput(false), 150)}
            />
            <button onClick={confirmInput}>✓</button>
            <button onClick={() => setShowInput(false)}>✕</button>
          </div>
        ) : (
          <button
            id="btn-add-bookmark"
            title="Add bookmark"
            disabled={!pdfDoc}
            onClick={() => {
              if (!pdfDoc) return;
              if (bookmarks.find(b => b.page === currentPage)) return;
              setShowInput(true);
            }}
          >+</button>
        )}
        <button
          id="btn-width-control"
          title="Width: s/m/l"
          disabled={!pdfDoc}
          onClick={() => {
            const modes: ('s' | 'm' | 'l')[] = ['s', 'm', 'l'];
            const next = modes[(modes.indexOf(bookmarkWidthMode) + 1) % modes.length];
            setBookmarkWidthMode(next);
          }}
        >{bookmarkWidthMode}</button>
        <button
          id="btn-title-toggle"
          title="Toggle title"
          disabled={!pdfDoc}
          onClick={() => setShowTopBarTitle(!showTopBarTitle)}
        >Aa</button>
      </div>

      {/*
        `touchAction: 'none'` disables the browser's native touch-scroll on
        this container. Without it, a horizontal swipe on the pills would be
        captured by the browser's scroll gesture before our inertia-scroll
        handler sees it. Setting it to 'none' gives our pointer-event handlers
        full control over touch input.
      */}
      <div id="bookmark-pills" ref={pillsRef} style={{ touchAction: 'none' }}>
        {bookmarks.map((bm, i) => (
          <BookmarkPill
            key={bm.page}
            bm={bm}
            highlighted={nearestIndex !== null && i === nearestIndex}
            widthMode={bookmarkWidthMode}
            onNavigate={() => goToPage(bm.page)}
            // `onEdit` is called on double-tap — opens the BookmarkEditModal
            // via AppContext.openBookmarkEdit so the user can rename or delete.
            onEdit={() => openBookmarkEdit(bm)}
          />
        ))}
      </div>
    </div>
  );
}

interface PillProps {
  bm: Bookmark;
  highlighted: boolean;
  widthMode: 's' | 'm' | 'l';
  onNavigate: () => void;
  onEdit: () => void;
}

/**
 * BookmarkPill renders a single tappable bookmark button.
 *
 * Interaction model — armed / double-tap pattern:
 *   1st tap  → navigate to the bookmark page (`onNavigate`) and enter "armed"
 *              state (pill gets an `armed` CSS class for visual feedback).
 *   2nd tap within 800 ms → open the edit modal (`onEdit`).
 *   After 800 ms without a second tap → automatically disarm (timer via
 *   `armedTimerRef`).
 *
 * This avoids a dedicated long-press for editing while still making accidental
 * edits unlikely (user must tap twice in quick succession).
 */
function BookmarkPill({ bm, highlighted, widthMode, onNavigate, onEdit }: PillProps) {
  const [armed, setArmed] = useState(false);

  /**
   * Ref for the 800 ms auto-disarm timer. A ref (not state) because we only
   * need it for cleanup — changing it should never cause a re-render.
   */
  const armedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Cancel any pending auto-disarm and clear the armed state immediately. */
  const disarm = () => {
    setArmed(false);
    if (armedTimerRef.current) { clearTimeout(armedTimerRef.current); armedTimerRef.current = null; }
  };

  const handleClick = () => {
    if (armed) {
      // Second tap within 800 ms → open edit modal, then disarm.
      disarm();
      onEdit();
    } else {
      // First tap → navigate and arm.  Start the 800 ms disarm timer so the
      // armed state is automatically cleared if there is no second tap.
      setArmed(true);
      armedTimerRef.current = setTimeout(disarm, 800);
      onNavigate();
    }
  };

  const leading = extractLeadingChars(bm.label);
  const content = formatPillContent(bm.label, widthMode);

  return (
    <button
      className={`bookmark-pill${highlighted ? ' highlighted' : ''}${armed ? ' armed' : ''}`}
      onClick={handleClick}
    >
      <span>
        <strong className="pill-leading">{leading || '#'}</strong>
        {(widthMode === 'm' || widthMode === 'l') ? content.substring(leading.length) : ''}
      </span>
      {(bm as any).segue ? ' ▶' : null}
    </button>
  );
}
