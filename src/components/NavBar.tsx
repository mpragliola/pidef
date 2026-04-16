/**
 * NavBar.tsx — bottom navigation bar
 *
 * Layout (left → right):
 *   [nav-left]   ⏮ first  ◀ prev
 *   [nav-center] ── slider ──  "Page N / M" label
 *   [nav-right]  ▶ next  ⏭ last  🟫 sepia  ⚫ invert  ½ half  🔖 bookmarks
 *
 * The bookmark button has two interactions:
 *   - Short tap  → cycles display mode: hidden → 1-line → all → hidden
 *   - Long press → opens the 'overlay' mode (full-screen bookmark list)
 *
 * Touch sizing: all buttons must meet the 44×44 px minimum target (enforced in styles.scss).
 */

import React, { useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBackwardStep, faChevronLeft, faChevronRight, faForwardStep,
  faSun, faCircleHalfStroke, faTableColumns, faBookmark,
} from '@fortawesome/free-solid-svg-icons';
import { useAppContext } from '../AppContext';

/**
 * How long (ms) to wait between processing slider change events.
 *
 * Dragging the range input fires onChange on every pixel of movement. Each
 * event triggers a goToPage() which re-renders the PDF surface. Without
 * throttling this can saturate the renderer with hundreds of render calls per
 * second. 1 s feels responsive while keeping frame-rate manageable.
 */
const SLIDER_THROTTLE_MS = 1000;

/**
 * NavBar renders the bottom navigation strip.
 *
 * It reads all navigation state from AppContext and dispatches actions through
 * the same context — no local state of its own beyond the imperative timer
 * refs used for throttling and long-press detection.
 */
export function NavBar() {
  const {
    pdfDoc, currentPage, nPages,
    sepiaEnabled, invertEnabled, halfMode,
    bookmarkDisplayMode,
    goFirst, goPrev, goNext, goLast, goToPage,
    toggleSepia, toggleInvert, toggleHalfMode,
    setBookmarkDisplayMode,
  } = useAppContext();

  /**
   * Ref storing the timestamp of the last accepted slider change.
   * A ref (not state) because updating it must NOT trigger a re-render —
   * it is purely an imperative guard for the onChange handler.
   */
  const sliderThrottleRef = useRef(0);

  const disabled = !pdfDoc;
  const label = pdfDoc ? `Page ${currentPage + 1} / ${nPages}` : '';

  /**
   * Ref that holds the pending setTimeout ID for long-press detection.
   * A ref (not state) because we only need it for cleanup in pointerUp/cancel;
   * changing it should never cause a re-render.
   */
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Ref tracking whether the long-press action already fired for the current
   * pointer-down gesture. We need this so that the subsequent onClick event
   * (which always fires after pointerUp) can be suppressed — otherwise the
   * click handler would immediately cycle the mode away from 'overlay'.
   * Again a ref, not state: it is read and written synchronously inside event
   * handlers and must never schedule a re-render.
   */
  const longPressActivatedRef = useRef(false);

  /**
   * Handles a short tap on the bookmark button.
   *
   * Cycles through the three non-overlay modes: hidden → 1-line → all → hidden.
   *
   * Note: if the current mode is 'overlay' (set by long-press), indexOf returns
   * -1 because 'overlay' is not in the `modes` array. The `idx === -1` guard
   * resets the cycle to 0 ('hidden') in that case, preventing NaN modulo bugs.
   */
  const handleBookmarkClick = () => {
    if (!pdfDoc) return;
    // Long-press already handled this gesture — swallow the click event.
    if (longPressActivatedRef.current) { longPressActivatedRef.current = false; return; }
    const modes: ('hidden' | '1-line' | 'all')[] = ['hidden', '1-line', 'all'];
    const idx = modes.indexOf(bookmarkDisplayMode as any);
    // If mode is 'overlay', indexOf returns -1 → reset to 0 ('hidden') before cycling.
    const next = modes[(idx === -1 ? 0 : (idx + 1)) % modes.length];
    setBookmarkDisplayMode(next);
  };

  /**
   * Starts the 500 ms long-press timer when the pointer goes down on the
   * bookmark button. If the pointer is released before the timer fires, the
   * timer is cancelled in handleBookmarkPointerUp and only the click handler
   * runs (short tap = cycle modes). If the timer fires first, we set
   * 'overlay' mode and mark `longPressActivatedRef` so the follow-up click
   * event is ignored.
   */
  const handleBookmarkPointerDown = () => {
    if (!pdfDoc) return;
    longPressTimerRef.current = setTimeout(() => {
      longPressActivatedRef.current = true;
      setBookmarkDisplayMode('overlay');
    }, 500);
  };

  /** Cancels a pending long-press timer on pointer release or cancel. */
  const handleBookmarkPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <div id="nav-bar">
      <div id="nav-left">
        <button id="btn-first" title="First page" disabled={disabled} onClick={goFirst}>
          <FontAwesomeIcon icon={faBackwardStep} />
        </button>
        <button id="btn-prev" title="Previous page" disabled={disabled} onClick={goPrev}>
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
      </div>
      <div id="nav-center">
        <input
          type="range"
          id="page-slider"
          min={0}
          max={nPages > 0 ? nPages - 1 : 1}
          value={currentPage}
          disabled={disabled}
          onChange={e => {
            if (!pdfDoc) return;
            // Throttle: only call goToPage() at most once per SLIDER_THROTTLE_MS to
            // prevent overwhelming the PDF renderer with rapid re-renders while dragging.
            const now = Date.now();
            if (now - sliderThrottleRef.current < SLIDER_THROTTLE_MS) return;
            sliderThrottleRef.current = now;
            const idx = parseInt(e.target.value, 10);
            if (idx !== currentPage) goToPage(idx);
          }}
        />
        <span id="nav-label">{label}</span>
      </div>
      <div id="nav-right">
        <button id="btn-next" title="Next page" disabled={disabled} onClick={goNext}>
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
        <button id="btn-last" title="Last page" disabled={disabled} onClick={goLast}>
          <FontAwesomeIcon icon={faForwardStep} />
        </button>
        <button
          id="btn-sepia"
          title="Sepia tone"
          disabled={disabled}
          className={sepiaEnabled ? 'active' : ''}
          onClick={toggleSepia}
        >
          <FontAwesomeIcon icon={faSun} />
        </button>
        <button
          id="btn-invert"
          title="Invert colors"
          disabled={disabled}
          className={invertEnabled ? 'active' : ''}
          onClick={toggleInvert}
        >
          <FontAwesomeIcon icon={faCircleHalfStroke} />
        </button>
        <button
          id="btn-half"
          title="Half page mode"
          disabled={disabled}
          className={halfMode ? 'active' : ''}
          onClick={toggleHalfMode}
        >
          <FontAwesomeIcon icon={faTableColumns} />
        </button>
        <button
          id="btn-toggle-bookmarks-nav"
          title="Bookmarks"
          disabled={disabled}
          onPointerDown={handleBookmarkPointerDown}
          onPointerUp={handleBookmarkPointerUp}
          onPointerCancel={handleBookmarkPointerUp}
          onClick={handleBookmarkClick}
        >
          <FontAwesomeIcon icon={faBookmark} />
        </button>
      </div>
    </div>
  );
}
