/**
 * src/AppContext.ts
 *
 * Central React context that every component in the app can consume.
 *
 * Design rationale — two-part split:
 *
 *   AppState   — plain data; describes *what the app currently looks like*.
 *                Components that only read state (e.g. a toolbar that renders
 *                the page counter) import this shape.
 *
 *   AppActions — callbacks; describes *what the app can do*.
 *                Keeping actions separate makes it easy to see at a glance
 *                which parts of the interface are read-only vs. interactive,
 *                and allows future memoisation of the action object without
 *                touching the state object.
 *
 *   AppContextValue — a single merged interface (extends both) that is the
 *                     actual value stored in the React context.  Components
 *                     destructure whatever mix of state/actions they need
 *                     from a single `useAppContext()` call.
 */

import { createContext, useContext } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Bookmark } from './bookmarks';

/**
 * Snapshot of all application state.
 *
 * Every field here is owned by AppProvider and distributed to the tree
 * via the context.  Components must never mutate these directly — they
 * should call the corresponding action from AppActions instead.
 */
export interface AppState {
  /** The loaded pdf.js document proxy, or null when no file is open. */
  pdfDoc: PDFDocumentProxy | null;

  /** Zero-based index of the page currently displayed (0 = first page). */
  currentPage: number;

  /** Total number of pages in the loaded document (0 when no doc is open). */
  nPages: number;

  /** Filesystem path of the currently open file, or empty string. */
  currentFilePath: string;

  /**
   * When true, each "page" shows only half of the PDF page — useful for
   * portrait-oriented sheet music viewed in landscape.  Navigation cycles
   * through top/bottom halves before advancing to the next PDF page.
   */
  halfMode: boolean;

  /**
   * Which half of the split page is currently visible.
   * Only meaningful when halfMode is true.
   * 'top' = upper half; 'bottom' = lower half.
   */
  halfPage: 'top' | 'bottom';

  /** Persisted list of bookmarks for the current document. */
  bookmarks: Bookmark[];

  /**
   * Controls the visual presentation of the bookmark bar.
   *   'hidden'  — bar is not shown at all
   *   '1-line'  — compact single-row strip
   *   'all'     — full expanded list
   *   'overlay' — floating overlay panel
   */
  bookmarkDisplayMode: 'hidden' | '1-line' | 'all' | 'overlay';

  /**
   * Width of the bookmark panel when displayed.
   * Cycles through 's' (small), 'm' (medium), 'l' (large).
   */
  bookmarkWidthMode: 's' | 'm' | 'l';

  /** Whether to show the document filename in the top toolbar. */
  showTopBarTitle: boolean;

  /** Sepia colour-filter toggle — warm-toned tint for paper-like reading. */
  sepiaEnabled: boolean;

  /** Invert-colours toggle — dark-mode style inversion of the PDF. */
  invertEnabled: boolean;

  /**
   * CSS rotation of the entire UI, expressed as quarter-turn steps.
   * 0 = no rotation, 1 = 90° CW, 2 = 180°, 3 = 270° CW.
   * Rotation is applied as a CSS transform on <body>; all canvas and
   * rendering logic is entirely unaware of this value.
   */
  rotationSteps: 0 | 1 | 2 | 3;

  /**
   * Screen brightness multiplier in the range [0, 1].
   * Applied as a CSS filter on the canvas container.
   */
  brightness: number;

  /**
   * The bookmark currently being edited in the inline edit form,
   * or null when the edit UI is closed.
   */
  editingBookmark: { label: string; page: number; segue?: boolean } | null;
}

/**
 * All user-triggered operations the app exposes.
 *
 * Each action is a stable callback (created with useCallback in AppProvider)
 * so that components can safely list individual actions in their dependency
 * arrays without triggering unnecessary re-renders.
 */
export interface AppActions {
  /** Open and render the PDF at the given filesystem path. */
  loadFile: (path: string) => Promise<void>;

  /** Unload the current document and reset all document-specific state. */
  closePdf: () => Promise<void>;

  /** Advance to the next page (or next half when halfMode is active). */
  goNext: () => void;

  /** Go back to the previous page (or previous half). */
  goPrev: () => void;

  /** Jump to the very first page of the document. */
  goFirst: () => void;

  /** Jump to the very last page of the document. */
  goLast: () => void;

  /** Jump to an arbitrary zero-based page index. */
  goToPage: (idx: number) => void;

  /** Toggle half-page split mode on or off. */
  toggleHalfMode: () => void;

  /** Toggle the sepia colour filter. */
  toggleSepia: () => void;

  /** Toggle the invert colour filter. */
  toggleInvert: () => void;

  /** Rotate the UI 90° clockwise ('cw') or counter-clockwise ('ccw'). */
  rotate: (dir: 'cw' | 'ccw') => void;

  /** Set the brightness level (0–1). */
  setBrightness: (level: number) => void;

  /** Persist a new bookmark with the given label at the given page index. */
  addBookmark: (label: string, page: number) => void;

  /** Delete the bookmark for the given page index. */
  removeBookmark: (page: number) => void;

  /** Update label and segue flag for an existing bookmark. */
  updateBookmark: (page: number, label: string, segue: boolean) => void;

  /** Change which bookmark bar display mode is active. */
  setBookmarkDisplayMode: (mode: AppState['bookmarkDisplayMode']) => void;

  /** Change the bookmark panel width. */
  setBookmarkWidthMode: (mode: AppState['bookmarkWidthMode']) => void;

  /** Show or hide the document filename in the top toolbar. */
  setShowTopBarTitle: (v: boolean) => void;

  /** Open the inline bookmark edit form for the given bookmark. */
  openBookmarkEdit: (bm: { label: string; page: number; segue?: boolean }) => void;

  /** Close the inline bookmark edit form without saving. */
  closeBookmarkEdit: () => void;
}

/**
 * The value stored in — and consumed from — the React context.
 *
 * Merging AppState and AppActions into a single interface means that any
 * component can destructure whatever mix of state and actions it needs from
 * a single `useAppContext()` call.
 */
export interface AppContextValue extends AppState, AppActions {}

/**
 * The React context object itself.
 *
 * The default value is null rather than a fake/empty implementation so that
 * any component that accidentally calls useAppContext() outside of an
 * AppProvider will get a clear runtime error instead of silently operating
 * on stale or zero-value data.
 */
export const AppContext = createContext<AppContextValue | null>(null);

/**
 * Convenience hook for consuming the app context.
 *
 * The null-guard throw pattern serves two purposes:
 *   1. It narrows the TypeScript type from `AppContextValue | null` to just
 *      `AppContextValue`, so callers never need to null-check the result.
 *   2. It gives a descriptive error message at runtime when a component is
 *      accidentally rendered outside the AppProvider tree.
 */
export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
