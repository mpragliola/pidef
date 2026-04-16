import React from 'react';
import { useAppContext } from '../AppContext';
import { findNearestBookmark } from '../lib/bookmark-utils';

const pidef = (window as any).pidef;

export function Toolbar() {
  const {
    pdfDoc, currentPage, bookmarks,
    showTopBarTitle, rotationSteps,
    closePdf, rotate,
  } = useAppContext();

  let topBarTitle = '';
  if (showTopBarTitle && pdfDoc) {
    const { index } = findNearestBookmark(bookmarks, currentPage);
    topBarTitle = index !== null ? bookmarks[index].label : '';
  }

  return (
    <div id="toolbar">
      <button id="btn-open" title="Open PDF" onClick={() => pidef.openFileDialog()}>
        📁
      </button>
      <button id="btn-close" title="Close PDF" disabled={!pdfDoc} onClick={closePdf}>
        ✕
      </button>
      <span id="top-bar-title">{topBarTitle}</span>
      <button
        id="btn-rotate-ccw"
        title="Rotate 90° counter-clockwise"
        disabled={!pdfDoc}
        className={rotationSteps !== 0 ? 'active' : ''}
        onClick={() => rotate('ccw')}
      >
        ↺
      </button>
      <button
        id="btn-rotate-cw"
        title="Rotate 90° clockwise"
        disabled={!pdfDoc}
        className={rotationSteps !== 0 ? 'active' : ''}
        onClick={() => rotate('cw')}
      >
        ↻
      </button>
      <button
        id="btn-fullscreen"
        title="Fullscreen F11"
        onClick={() => pidef.toggleFullscreen()}
      >
        ⛶
      </button>
    </div>
  );
}
