import React, { useRef } from 'react';
import { useAppContext } from '../AppContext';

const SLIDER_THROTTLE_MS = 1000;

export function NavBar() {
  const {
    pdfDoc, currentPage, nPages,
    sepiaEnabled, invertEnabled, halfMode,
    bookmarkDisplayMode,
    goFirst, goPrev, goNext, goLast, goToPage,
    toggleSepia, toggleInvert, toggleHalfMode,
    setBookmarkDisplayMode,
  } = useAppContext();

  const sliderThrottleRef = useRef(0);
  const disabled = !pdfDoc;
  const label = pdfDoc ? `Page ${currentPage + 1} / ${nPages}` : '';

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActivatedRef = useRef(false);

  const handleBookmarkClick = () => {
    if (!pdfDoc) return;
    if (longPressActivatedRef.current) { longPressActivatedRef.current = false; return; }
    const modes: ('hidden' | '1-line' | 'all')[] = ['hidden', '1-line', 'all'];
    const idx = modes.indexOf(bookmarkDisplayMode as any);
    const next = modes[(idx === -1 ? 0 : (idx + 1)) % modes.length];
    setBookmarkDisplayMode(next);
  };

  const handleBookmarkPointerDown = () => {
    if (!pdfDoc) return;
    longPressTimerRef.current = setTimeout(() => {
      longPressActivatedRef.current = true;
      setBookmarkDisplayMode('overlay');
    }, 500);
  };

  const handleBookmarkPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <div id="nav-bar">
      <div id="nav-left">
        <button id="btn-first" title="First page" disabled={disabled} onClick={goFirst}>⏮</button>
        <button id="btn-prev" title="Previous page" disabled={disabled} onClick={goPrev}>◀</button>
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
        <button id="btn-next" title="Next page" disabled={disabled} onClick={goNext}>▶</button>
        <button id="btn-last" title="Last page" disabled={disabled} onClick={goLast}>⏭</button>
        <button
          id="btn-sepia"
          title="Sepia tone"
          disabled={disabled}
          className={sepiaEnabled ? 'active' : ''}
          onClick={toggleSepia}
        >🟫</button>
        <button
          id="btn-invert"
          title="Invert colors"
          disabled={disabled}
          className={invertEnabled ? 'active' : ''}
          onClick={toggleInvert}
        >⚫</button>
        <button
          id="btn-half"
          title="Half page mode"
          disabled={disabled}
          className={halfMode ? 'active' : ''}
          onClick={toggleHalfMode}
        >½</button>
        <button
          id="btn-toggle-bookmarks-nav"
          title="Bookmarks"
          disabled={disabled}
          onPointerDown={handleBookmarkPointerDown}
          onPointerUp={handleBookmarkPointerUp}
          onPointerCancel={handleBookmarkPointerUp}
          onClick={handleBookmarkClick}
        >🔖</button>
      </div>
    </div>
  );
}
