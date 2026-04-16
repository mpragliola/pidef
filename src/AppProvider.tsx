/**
 * AppProvider.tsx — single source of truth for all application state.
 *
 * This component owns every piece of shared state and exposes it, together
 * with all mutation callbacks, through AppContext so that child components
 * can access what they need without prop-drilling.
 *
 * Two-tier state design
 * ─────────────────────
 * 1. React state (useState / useLocalStorage) — drives re-renders.  Any value
 *    that a component must display or react to lives here.
 *
 * 2. Ref mirrors (useRef) — kept in sync with state on every render (e.g.
 *    `pdfDocRef.current = pdfDoc`).  Callbacks wrapped in useCallback have a
 *    "stale closure" problem: they capture the variable values from the render
 *    in which they were created, and with an empty dep-array ([]) they are
 *    only created once.  Reading from a ref inside such a callback always
 *    yields the current value regardless of when the callback was created.
 *    None of the ref assignments below cause re-renders — they are plain
 *    object mutations that happen synchronously during render.
 */

// src/AppProvider.tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AppContext, AppContextValue } from './AppContext';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { Bookmark } from './bookmarks';

const pidef = (window as any).pidef;

/**
 * AppProvider wraps the entire application and provides AppContext.
 *
 * It handles:
 *   - PDF document lifecycle (load, close)
 *   - Page navigation (next, prev, first, last, goToPage) with half-mode support
 *   - Filter toggles (sepia, invert) and rotation steps
 *   - Brightness control (local state + IPC call to main process)
 *   - Bookmark CRUD (add, remove, update) with persistence via IPC
 *   - Bookmark display/edit modal state
 *   - Persisting UI preferences via localStorage (useLocalStorage)
 */
export function AppProvider({ children }: { children: React.ReactNode }) {

  // ── State ──────────────────────────────────────────────────────────────────

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [nPages, setNPages] = useState(0);
  const [currentFilePath, setCurrentFilePath] = useState('');
  const [halfMode, setHalfMode] = useState(false);
  const [halfPage, setHalfPage] = useState<'top' | 'bottom'>('top');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [editingBookmark, setEditingBookmark] = useState<{ label: string; page: number; segue?: boolean } | null>(null);

  // Persisted UI preferences — survive page reload / app restart via localStorage.
  const [bookmarkDisplayMode, setBookmarkDisplayModeRaw] = useLocalStorage<'hidden' | '1-line' | 'all' | 'overlay'>('pidef-bookmark-display-mode', '1-line');
  const setBookmarkDisplayMode = (mode: 'hidden' | '1-line' | 'all' | 'overlay') => setBookmarkDisplayModeRaw(mode);
  const [bookmarkWidthMode, setBookmarkWidthMode] = useLocalStorage<'s' | 'm' | 'l'>('pidef-bookmark-width-mode', 'm');
  const [showTopBarTitle, setShowTopBarTitle] = useLocalStorage<boolean>('pidef-show-top-bar-title', true);
  const [sepiaEnabled, setSepiaEnabled] = useLocalStorage<boolean>('pidef-sepia', false);
  const [invertEnabled, setInvertEnabled] = useLocalStorage<boolean>('pidef-invert', false);
  const [rotationSteps, setRotationSteps] = useLocalStorage<0 | 1 | 2 | 3>('pidef-rotation', 0);
  const [brightness, setBrightnessState] = useLocalStorage<number>('pidef-brightness', 1.0);

  // ── Refs (stale-closure mirrors) ───────────────────────────────────────────
  //
  // Each ref is assigned directly from its corresponding state value on every
  // render (synchronous assignment, no side-effect). This is safe because React
  // renders are synchronous and the assignment happens before any event handler
  // or callback can fire against the new render's values.
  //
  // Why not just add these to every useCallback dep-array?  Because that would
  // recreate the callbacks on every page change, which in turn would re-run
  // effects that depend on those callbacks, causing cascading re-renders.

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const currentPageRef = useRef(0);
  const nPagesRef = useRef(0);
  const currentFilePathRef = useRef('');
  const halfModeRef = useRef(false);
  const halfPageRef = useRef<'top' | 'bottom'>('top');

  // Keep refs in sync with state on every render (plain assignment — no re-render triggered).
  pdfDocRef.current = pdfDoc;
  currentPageRef.current = currentPage;
  nPagesRef.current = nPages;
  currentFilePathRef.current = currentFilePath;
  halfModeRef.current = halfMode;
  halfPageRef.current = halfPage;

  // ── File loading ───────────────────────────────────────────────────────────

  const loadFile = useCallback(async (filePath: string) => {
    // `require('pdfjs-dist')` uses CommonJS require at runtime.  In Electron
    // with nodeIntegration enabled the renderer runs in Node context; using
    // `require` avoids ESM/CJS interop issues that can arise when pdfjs-dist
    // ships both module formats and bundlers pick the wrong one.
    const pdfjsLib = require('pdfjs-dist') as typeof import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');

    const url = `file://${filePath}`;
    const doc = await pdfjsLib.getDocument(url).promise;
    const pages = doc.numPages;

    const recentFiles = await pidef.getRecentFiles();
    const fileRecord = recentFiles.find((f: any) => f.path === filePath);
    const page = fileRecord ? Math.min(fileRecord.page, pages - 1) : 0;
    const hm = fileRecord?.halfMode ?? false;

    setPdfDoc(doc);
    setNPages(pages);
    setCurrentPage(page);
    setCurrentFilePath(filePath);
    setHalfMode(hm);
    setHalfPage('top');

    const bms = await pidef.readBookmarks(filePath);
    setBookmarks(bms);

    await pidef.addRecentFile(filePath, page);

    const name = filePath.split('/').pop() || filePath;
    document.title = `pidef — ${name}`;
  }, []);

  const closePdf = useCallback(async () => {
    // Persist the last-read page before clearing state so the next open
    // resumes from where the user left off.
    if (currentFilePathRef.current) {
      await pidef.addRecentFile(currentFilePathRef.current, currentPageRef.current);
    }
    setPdfDoc(null);
    setCurrentPage(0);
    setNPages(0);
    setCurrentFilePath('');
    setHalfMode(false);
    setHalfPage('top');
    setBookmarks([]);
    document.title = 'pidef';
  }, []);

  // ── Navigation ─────────────────────────────────────────────────────────────
  //
  // All navigation callbacks use refs to read current page/nPages/etc. rather
  // than closing over the corresponding state variables.  Because they are all
  // wrapped in useCallback with an empty dep-array (or minimal deps), they are
  // stable function references across renders — which is important so that
  // downstream useEffects that list them as dependencies don't fire
  // unnecessarily.  If they closed over state directly they would need those
  // state variables in their dep-arrays, causing them to be recreated (and
  // downstream effects to re-run) on every page change.

  const goToPage = useCallback((idx: number) => {
    // Use refs to read current values — avoids stale closure on currentPage/nPages.
    if (!pdfDocRef.current || idx < 0 || idx >= nPagesRef.current || idx === currentPageRef.current) return;
    setCurrentPage(idx);
    if (currentFilePathRef.current) pidef.updateFilePage(currentFilePathRef.current, idx);
  }, []);

  const goNext = useCallback(() => {
    if (!pdfDocRef.current) return;
    // In half-mode, the first half (top) advances to the second half (bottom)
    // before turning the physical page.
    if (halfModeRef.current && halfPageRef.current === 'top') { setHalfPage('bottom'); return; }
    if (currentPageRef.current >= nPagesRef.current - 1) return;
    if (halfModeRef.current) setHalfPage('top');
    // Functional update pattern: `p => p + 1` reads the latest committed state
    // value rather than the closure-captured `currentPage`.  This prevents a
    // stale read if goNext is called multiple times before React flushes.
    setCurrentPage(p => {
      const next = p + 1;
      if (currentFilePathRef.current) pidef.updateFilePage(currentFilePathRef.current, next);
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    if (!pdfDocRef.current) return;
    // In half-mode, second half (bottom) steps back to the first half (top)
    // before turning to the previous physical page.
    if (halfModeRef.current && halfPageRef.current === 'bottom') { setHalfPage('top'); return; }
    if (currentPageRef.current <= 0) return;
    if (halfModeRef.current) setHalfPage('bottom');
    // Functional update — same reasoning as goNext above.
    setCurrentPage(p => {
      const prev = p - 1;
      if (currentFilePathRef.current) pidef.updateFilePage(currentFilePathRef.current, prev);
      return prev;
    });
  }, []);

  const goFirst = useCallback(() => {
    if (!pdfDocRef.current) return;
    // In half-mode, if we're already on the top half of page 0 there is
    // nothing to do.  If we're on the bottom half, jump to top half first.
    if (halfModeRef.current && halfPageRef.current !== 'top') { setHalfPage('top'); return; }
    if (currentPageRef.current === 0) return;
    goToPage(0);
  }, [goToPage]);

  const goLast = useCallback(() => {
    if (!pdfDocRef.current) return;
    if (halfModeRef.current && halfPageRef.current !== 'top') { setHalfPage('top'); return; }
    if (currentPageRef.current === nPagesRef.current - 1) return;
    goToPage(nPagesRef.current - 1);
  }, [goToPage]);

  const toggleHalfMode = useCallback(() => {
    setHalfMode(hm => {
      const next = !hm;
      setHalfPage('top');
      if (currentFilePathRef.current) pidef.updateFileHalfMode(currentFilePathRef.current, next);
      return next;
    });
  }, []);

  // ── Filters & rotation ─────────────────────────────────────────────────────

  const toggleSepia = useCallback(() => setSepiaEnabled(v => !v), [setSepiaEnabled]);
  const toggleInvert = useCallback(() => setInvertEnabled(v => !v), [setInvertEnabled]);

  /** Rotate the whole UI clockwise or counter-clockwise by 90°. */
  const rotate = useCallback((dir: 'cw' | 'ccw') => {
    setRotationSteps(r => (dir === 'cw' ? ((r + 1) % 4) : ((r + 3) % 4)) as 0 | 1 | 2 | 3);
  }, [setRotationSteps]);

  // ── Brightness ─────────────────────────────────────────────────────────────

  const setBrightness = useCallback((level: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, level));
    setBrightnessState(clamped);
    // Also propagate the change to the main process via IPC so the OS-level
    // display brightness can be adjusted if supported.
    pidef.setBrightness(clamped).catch(() => {});
  }, [setBrightnessState]);

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  const addBookmark = useCallback((label: string, page: number) => {
    setBookmarks(bms => {
      // Replace any existing bookmark on the same page then re-sort by page.
      const next = [...bms.filter(b => b.page !== page), { label, page }].sort((a, b) => a.page - b.page);
      if (currentFilePathRef.current) pidef.writeBookmarks(currentFilePathRef.current, next);
      return next;
    });
  }, []);

  const removeBookmark = useCallback((page: number) => {
    setBookmarks(bms => {
      const next = bms.filter(b => b.page !== page);
      if (currentFilePathRef.current) pidef.writeBookmarks(currentFilePathRef.current, next);
      return next;
    });
  }, []);

  const updateBookmark = useCallback((page: number, label: string, segue: boolean) => {
    setBookmarks(bms => {
      const next = bms.map(b => b.page === page ? { ...b, label, segue } : b);
      if (currentFilePathRef.current) pidef.writeBookmarks(currentFilePathRef.current, next);
      return next;
    });
  }, []);

  const openBookmarkEdit = useCallback((bm: { label: string; page: number; segue?: boolean }) => {
    setEditingBookmark(bm);
  }, []);

  const closeBookmarkEdit = useCallback(() => {
    setEditingBookmark(null);
  }, []);

  /**
   * Expose `openBookmarkEdit` on `window.__pidefOpenBookmarkEdit` as a
   * temporary escape-hatch bridge for components that cannot easily access
   * AppContext (e.g. legacy non-React code).
   *
   * The dep-array is `[openBookmarkEdit]`.  `openBookmarkEdit` is stable
   * because it is wrapped in useCallback with an empty dep-array, so this
   * effect runs only once in practice — exactly when we want it.
   */
  useEffect(() => {
    (window as any).__pidefOpenBookmarkEdit = openBookmarkEdit;
  }, [openBookmarkEdit]);

  // ── Context value ──────────────────────────────────────────────────────────

  const value: AppContextValue = {
    pdfDoc, currentPage, nPages, currentFilePath,
    halfMode, halfPage, bookmarks, editingBookmark,
    bookmarkDisplayMode, bookmarkWidthMode, showTopBarTitle,
    sepiaEnabled, invertEnabled, rotationSteps, brightness,
    loadFile, closePdf, goNext, goPrev, goFirst, goLast, goToPage,
    toggleHalfMode, toggleSepia, toggleInvert, rotate, setBrightness,
    addBookmark, removeBookmark, updateBookmark,
    setBookmarkDisplayMode, setBookmarkWidthMode, setShowTopBarTitle,
    openBookmarkEdit, closeBookmarkEdit,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
