/**
 * Toolbar.tsx
 *
 * The horizontal toolbar pinned to the top of the layout. It contains all
 * document-level controls: open, close, rotate (CW / CCW), and fullscreen
 * toggle. It also displays the nearest bookmark label as the document title
 * in the centre of the bar when `showTopBarTitle` is enabled.
 *
 * The toolbar is always mounted; buttons that require an open PDF carry a
 * `disabled` attribute so they cannot be activated on the welcome screen.
 * The sole exception is the fullscreen button — see its inline note below.
 */

import React from 'react';
import { useAppContext } from '../AppContext';
import { findNearestBookmark } from '../lib/bookmark-utils';

/** Electron preload bridge — typed as `any` because it lives outside TypeScript's reach. */
const pidef = (window as any).pidef;

/**
 * Toolbar — top bar with open / close / rotate / fullscreen actions and an
 * optional bookmark-based document title.
 */
export function Toolbar() {
  const {
    pdfDoc, currentPage, bookmarks,
    showTopBarTitle, rotationSteps,
    closePdf, rotate,
  } = useAppContext();

  // Determine the title string to show in the centre of the bar.
  // `findNearestBookmark` walks backwards through the bookmark list to find the
  // last bookmark whose page is ≤ currentPage, giving us the "current section"
  // label. If there are no bookmarks, or no bookmark precedes the current page,
  // `index` is null and the title stays empty.
  let topBarTitle = '';
  if (showTopBarTitle && pdfDoc) {
    const { index } = findNearestBookmark(bookmarks, currentPage);
    topBarTitle = index !== null ? bookmarks[index].label : '';
  }

  return (
    <div id="toolbar">
      {/*
        Clicking "Open" delegates to the Electron main process via the preload
        bridge. The file dialog must run in the main process because the
        renderer (a web page) has no direct filesystem access; Electron's
        `dialog.showOpenDialog` API is only available there.
      */}
      <button id="btn-open" title="Open PDF" onClick={() => pidef.openFileDialog()}>
        <i className="fa-solid fa-folder-open" />
      </button>

      <button id="btn-close" title="Close PDF" disabled={!pdfDoc} onClick={closePdf}>
        <i className="fa-solid fa-xmark" />
      </button>

      {/* Bookmark-derived section title; empty string renders as nothing. */}
      <span id="top-bar-title">{topBarTitle}</span>

      <button
        id="btn-rotate-ccw"
        title="Rotate 90° counter-clockwise"
        disabled={!pdfDoc}
        className={rotationSteps !== 0 ? 'active' : ''}
        onClick={() => rotate('ccw')}
      >
        <i className="fa-solid fa-rotate-left" />
      </button>
      <button
        id="btn-rotate-cw"
        title="Rotate 90° clockwise"
        disabled={!pdfDoc}
        className={rotationSteps !== 0 ? 'active' : ''}
        onClick={() => rotate('cw')}
      >
        <i className="fa-solid fa-rotate-right" />
      </button>

      {/*
        The fullscreen button intentionally does NOT carry `disabled={!pdfDoc}`.
        F11 and the OS-level fullscreen gesture work regardless of whether a PDF
        is open, so the button should match that behaviour: the user can enter
        fullscreen on the welcome screen before opening a file, which is a
        common workflow on touchscreen devices where the keyboard shortcut is
        less accessible.
      */}
      <button
        id="btn-fullscreen"
        title="Fullscreen F11"
        onClick={() => pidef.toggleFullscreen()}
      >
        <i className="fa-solid fa-expand" />
      </button>
    </div>
  );
}
