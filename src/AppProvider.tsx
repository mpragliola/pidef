// src/AppProvider.tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AppContext, AppContextValue } from './AppContext';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { Bookmark } from './bookmarks';

const pidef = (window as any).pidef;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [nPages, setNPages] = useState(0);
  const [currentFilePath, setCurrentFilePath] = useState('');
  const [halfMode, setHalfMode] = useState(false);
  const [halfPage, setHalfPage] = useState<'top' | 'bottom'>('top');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [editingBookmark, setEditingBookmark] = useState<{ label: string; page: number; segue?: boolean } | null>(null);

  const [bookmarkDisplayMode, setBookmarkDisplayMode] = useLocalStorage<'hidden' | '1-line' | 'all' | 'overlay'>('pidef-bookmark-display-mode', '1-line');
  const [bookmarkWidthMode, setBookmarkWidthMode] = useLocalStorage<'s' | 'm' | 'l'>('pidef-bookmark-width-mode', 'm');
  const [showTopBarTitle, setShowTopBarTitle] = useLocalStorage<boolean>('pidef-show-top-bar-title', true);
  const [sepiaEnabled, setSepiaEnabled] = useLocalStorage<boolean>('pidef-sepia', false);
  const [invertEnabled, setInvertEnabled] = useLocalStorage<boolean>('pidef-invert', false);
  const [rotationSteps, setRotationSteps] = useLocalStorage<0 | 1 | 2 | 3>('pidef-rotation', 0);
  const [brightness, setBrightnessState] = useLocalStorage<number>('pidef-brightness', 1.0);

  // Stable refs — kept in sync with state, used in callbacks to avoid stale closures
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const currentPageRef = useRef(0);
  const nPagesRef = useRef(0);
  const currentFilePathRef = useRef('');
  const halfModeRef = useRef(false);
  const halfPageRef = useRef<'top' | 'bottom'>('top');

  pdfDocRef.current = pdfDoc;
  currentPageRef.current = currentPage;
  nPagesRef.current = nPages;
  currentFilePathRef.current = currentFilePath;
  halfModeRef.current = halfMode;
  halfPageRef.current = halfPage;

  const loadFile = useCallback(async (filePath: string) => {
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

  const goToPage = useCallback((idx: number) => {
    if (!pdfDocRef.current || idx < 0 || idx >= nPagesRef.current || idx === currentPageRef.current) return;
    setCurrentPage(idx);
    if (currentFilePathRef.current) pidef.updateFilePage(currentFilePathRef.current, idx);
  }, []);

  const goNext = useCallback(() => {
    if (!pdfDocRef.current) return;
    if (halfModeRef.current && halfPageRef.current === 'top') { setHalfPage('bottom'); return; }
    if (currentPageRef.current >= nPagesRef.current - 1) return;
    if (halfModeRef.current) setHalfPage('top');
    setCurrentPage(p => {
      const next = p + 1;
      if (currentFilePathRef.current) pidef.updateFilePage(currentFilePathRef.current, next);
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    if (!pdfDocRef.current) return;
    if (halfModeRef.current && halfPageRef.current === 'bottom') { setHalfPage('top'); return; }
    if (currentPageRef.current <= 0) return;
    if (halfModeRef.current) setHalfPage('bottom');
    setCurrentPage(p => {
      const prev = p - 1;
      if (currentFilePathRef.current) pidef.updateFilePage(currentFilePathRef.current, prev);
      return prev;
    });
  }, []);

  const goFirst = useCallback(() => {
    if (!pdfDocRef.current) return;
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

  const toggleSepia = useCallback(() => setSepiaEnabled(v => !v), [setSepiaEnabled]);
  const toggleInvert = useCallback(() => setInvertEnabled(v => !v), [setInvertEnabled]);

  const rotate = useCallback((dir: 'cw' | 'ccw') => {
    setRotationSteps(r => (dir === 'cw' ? ((r + 1) % 4) : ((r + 3) % 4)) as 0 | 1 | 2 | 3);
  }, [setRotationSteps]);

  const setBrightness = useCallback((level: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, level));
    setBrightnessState(clamped);
    pidef.setBrightness(clamped).catch(() => {});
  }, [setBrightnessState]);

  const addBookmark = useCallback((label: string, page: number) => {
    setBookmarks(bms => {
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

  // Expose openBookmarkEdit globally so BookmarkPill can call it (temporary bridge)
  useEffect(() => {
    (window as any).__pidefOpenBookmarkEdit = openBookmarkEdit;
  }, [openBookmarkEdit]);

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
