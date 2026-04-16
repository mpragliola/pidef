/**
 * BookmarkOverlay.tsx
 *
 * A full-screen modal overlay that lists all bookmarks as tappable "pill"
 * buttons. Tapping a pill navigates to the corresponding page and closes the
 * overlay. The pill for the nearest preceding bookmark is highlighted so the
 * user can quickly orient themselves.
 *
 * The overlay is triggered by a long-press on the bookmark button in the nav
 * bar. It is controlled by the `bookmarkDisplayMode` value in the app context:
 * when the mode is `'overlay'` the component renders; otherwise it returns null.
 *
 * Layout: a semi-transparent backdrop div covers the full screen. The pills
 * panel sits on top of it. Tapping the backdrop closes the overlay; tapping
 * inside the pills panel navigates without accidentally triggering the backdrop
 * handler.
 */

import React, { useRef } from 'react';
import { useAppContext } from '../AppContext';
import { findNearestBookmark, extractLeadingChars, formatPillContent } from '../lib/bookmark-utils';

/**
 * BookmarkOverlay — full-screen bookmark picker shown on long-press of the
 * bookmark nav button.
 *
 * Renders null when not active (bookmarkDisplayMode !== 'overlay'), so it has
 * zero DOM cost while hidden.
 */
export function BookmarkOverlay() {
  const {
    pdfDoc, currentPage, bookmarks, bookmarkDisplayMode,
    goToPage, setBookmarkDisplayMode,
  } = useAppContext();

  /** Ref to the pills container — reserved for future scroll-to-highlighted logic. */
  const overlayPillsRef = useRef<HTMLDivElement>(null);

  // Null render when the overlay is not active. This keeps the component
  // mounted in the tree (so context subscriptions are preserved) while
  // producing no DOM output and incurring no layout cost.
  if (bookmarkDisplayMode !== 'overlay') return null;

  /** Index of the nearest bookmark at or before the current page (for highlighting). */
  const { index: nearestIndex } = findNearestBookmark(bookmarks, currentPage);

  /**
   * Close the overlay by resetting the display mode to `'1-line'`.
   *
   * Note: the original renderer used an `overlayActiveFromMode` variable to
   * remember which display mode was active before the overlay opened so it
   * could be restored on close. In the React refactor that complexity was
   * removed: the overlay is always entered from `'1-line'` mode, so we always
   * return to `'1-line'`. If multi-mode entry is needed in the future,
   * `overlayActiveFromMode` can be reintroduced as a context value.
   */
  const close = () => setBookmarkDisplayMode('1-line');

  return (
    <div
      id="bookmark-overlay"
      onPointerDown={e => {
        // The overlay root acts as the backdrop close target. Any pointer-down
        // that reaches here (i.e. not stopped by the pills panel below) means
        // the user tapped outside the pills — close the overlay.
        // `stopPropagation` prevents the event from bubbling further into the
        // canvas/gesture layer beneath the overlay.
        // `preventDefault` suppresses the synthetic "ghost" click that browsers
        // fire ~300 ms after a pointerdown on touch devices, which could
        // accidentally activate whatever element is underneath after close.
        e.stopPropagation();
        e.preventDefault();
        close();
      }}
    >
      <div id="bookmark-overlay-backdrop" />
      <div
        id="bookmark-overlay-pills"
        ref={overlayPillsRef}
        onPointerDown={e =>
          // Stop the pointer event from bubbling up to the overlay root so
          // that tapping a pill (or anywhere inside the panel) does NOT trigger
          // the backdrop close handler above.
          e.stopPropagation()
        }
      >
        {bookmarks.map((bm, i) => {
          // Split the label into an optional leading token (e.g. a chord symbol
          // or section letter) and the remainder, so the leading part can be
          // styled in bold for quick scanning.
          const leading = extractLeadingChars(bm.label);
          const content = formatPillContent(bm.label, 'l');
          return (
            <button
              key={bm.page}
              className={`overlay-pill${nearestIndex !== null && i === nearestIndex ? ' highlighted' : ''}`}
              onClick={() => {
                goToPage(bm.page);
                close();
              }}
            >
              {leading
                ? <><strong className="pill-leading">{leading}</strong>{' ' + content.substring(leading.length)}</>
                : content
              }
              {/* Render a segue indicator arrow if the bookmark carries a segue flag. */}
              {(bm as any).segue ? ' ▶' : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
