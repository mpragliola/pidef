// src/AppContext.ts
import { createContext, useContext } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Bookmark } from './bookmarks';

export interface AppState {
  pdfDoc: PDFDocumentProxy | null;
  currentPage: number;
  nPages: number;
  currentFilePath: string;
  halfMode: boolean;
  halfPage: 'top' | 'bottom';
  bookmarks: Bookmark[];
  bookmarkDisplayMode: 'hidden' | '1-line' | 'all' | 'overlay';
  bookmarkWidthMode: 's' | 'm' | 'l';
  showTopBarTitle: boolean;
  sepiaEnabled: boolean;
  invertEnabled: boolean;
  rotationSteps: 0 | 1 | 2 | 3;
  brightness: number;
  editingBookmark: { label: string; page: number; segue?: boolean } | null;
}

export interface AppActions {
  loadFile: (path: string) => Promise<void>;
  closePdf: () => Promise<void>;
  goNext: () => void;
  goPrev: () => void;
  goFirst: () => void;
  goLast: () => void;
  goToPage: (idx: number) => void;
  toggleHalfMode: () => void;
  toggleSepia: () => void;
  toggleInvert: () => void;
  rotate: (dir: 'cw' | 'ccw') => void;
  setBrightness: (level: number) => void;
  addBookmark: (label: string, page: number) => void;
  removeBookmark: (page: number) => void;
  updateBookmark: (page: number, label: string, segue: boolean) => void;
  setBookmarkDisplayMode: (mode: AppState['bookmarkDisplayMode']) => void;
  setBookmarkWidthMode: (mode: AppState['bookmarkWidthMode']) => void;
  setShowTopBarTitle: (v: boolean) => void;
  openBookmarkEdit: (bm: { label: string; page: number; segue?: boolean }) => void;
  closeBookmarkEdit: () => void;
}

export interface AppContextValue extends AppState, AppActions {}

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
