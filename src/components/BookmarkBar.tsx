import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { formatPillContent, extractLeadingChars, findNearestBookmark } from '../lib/bookmark-utils';
import type { Bookmark } from '../bookmarks';

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

  useEffect(() => {
    if (showInput) {
      setInputValue(`p.${currentPage + 1}`);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    }
  }, [showInput, currentPage]);

  // Scroll nearest pill into view in 1-line mode
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
      <div id="bookmark-pills" ref={pillsRef} style={{ touchAction: 'none' }}>
        {bookmarks.map((bm, i) => (
          <BookmarkPill
            key={bm.page}
            bm={bm}
            highlighted={nearestIndex !== null && i === nearestIndex}
            widthMode={bookmarkWidthMode}
            onNavigate={() => goToPage(bm.page)}
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

function BookmarkPill({ bm, highlighted, widthMode, onNavigate, onEdit }: PillProps) {
  const [armed, setArmed] = useState(false);
  const armedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = () => {
    setArmed(false);
    if (armedTimerRef.current) { clearTimeout(armedTimerRef.current); armedTimerRef.current = null; }
  };

  const handleClick = () => {
    if (armed) {
      disarm();
      onEdit();
    } else {
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
