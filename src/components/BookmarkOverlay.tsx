import React, { useRef } from 'react';
import { useAppContext } from '../AppContext';
import { findNearestBookmark, extractLeadingChars, formatPillContent } from '../lib/bookmark-utils';

export function BookmarkOverlay() {
  const {
    pdfDoc, currentPage, bookmarks, bookmarkDisplayMode,
    goToPage, setBookmarkDisplayMode,
  } = useAppContext();

  const overlayPillsRef = useRef<HTMLDivElement>(null);

  if (bookmarkDisplayMode !== 'overlay') return null;

  const { index: nearestIndex } = findNearestBookmark(bookmarks, currentPage);

  const close = () => setBookmarkDisplayMode('1-line');

  return (
    <div
      id="bookmark-overlay"
      onPointerDown={e => {
        // Tapping the backdrop closes the overlay
        e.stopPropagation();
        e.preventDefault();
        close();
      }}
    >
      <div id="bookmark-overlay-backdrop" />
      <div
        id="bookmark-overlay-pills"
        ref={overlayPillsRef}
        onPointerDown={e => e.stopPropagation()}
      >
        {bookmarks.map((bm, i) => {
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
              {(bm as any).segue ? ' ▶' : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
