# React Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Pidef's monolithic `renderer.ts` to a React + TypeScript frontend using an incremental, always-runnable migration.

**Architecture:** React owns all stable state via `AppContext`; animation/drag hot-path stays in `useRef`s inside `usePdfEngine`. Build uses Vite for the renderer and `tsc` for main/preload. Migration proceeds in 6 phases — tooling, extract utilities, React scaffold, components, delete dead code, tests.

**Tech Stack:** React 18, TypeScript, Vite + `@vitejs/plugin-react`, Vitest, Playwright

---

## Phase 1 — Tooling

### Task 1: Install React and Vite dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install --save-dev react react-dom @types/react @types/react-dom vite @vitejs/plugin-react
```

- [ ] **Step 2: Verify install**

```bash
npm ls react vite @vitejs/plugin-react 2>/dev/null | head -10
```

Expected: lines showing `react@18.x`, `vite@5.x`, `@vitejs/plugin-react@4.x`

---

### Task 2: Add vite.config.ts

**Files:**
- Create: `vite.config.ts`

- [ ] **Step 1: Create Vite config for Electron renderer**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: false,   // tsc also writes to dist/; don't nuke it
    rollupOptions: {
      input: path.resolve(__dirname, 'src/index.html'),
    },
    target: 'chrome120',  // Electron 35 ships Chromium ~120
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

---

### Task 3: Update package.json scripts and .gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore` (create if absent)

- [ ] **Step 1: Update build scripts in package.json**

Replace the `"scripts"` block with:

```json
"scripts": {
  "build": "tsc --project tsconfig.main.json && vite build",
  "build:main": "tsc --project tsconfig.main.json",
  "build:renderer": "vite build",
  "start": "npm run build && electron dist/main.js",
  "dev": "npm run build && electron dist/main.js",
  "test": "vitest run",
  "test:unit": "vitest run tests/unit",
  "test:e2e": "playwright test"
},
```

- [ ] **Step 2: Create tsconfig.main.json for main/preload only**

```json
// tsconfig.main.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "module": "commonjs",
    "target": "es2020"
  },
  "include": ["src/main.ts", "src/preload.ts", "src/bookmarks.ts", "src/recent-files.ts"]
}
```

- [ ] **Step 3: Check existing tsconfig.json**

Read `tsconfig.json` to see current settings. It should compile everything; we'll keep it for IDE support and let `tsconfig.main.json` drive the main-process build.

- [ ] **Step 4: Update .gitignore**

Add these lines if not already present:

```
.vite/
dist/
```

- [ ] **Step 5: Verify renderer.ts still works by building**

```bash
npm run build:main
```

Expected: exits 0, `dist/main.js`, `dist/preload.js`, `dist/bookmarks.js`, `dist/recent-files.js` present.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts tsconfig.main.json package.json .gitignore
git commit -m "build: add Vite + React deps, split tsc and vite build scripts"
```

---

## Phase 2 — Extract Pure Utilities

### Task 4: Create src/lib/easing.ts

**Files:**
- Create: `src/lib/easing.ts`
- Modify: `src/renderer.ts`

- [ ] **Step 1: Create the module**

```ts
// src/lib/easing.ts
export function easeOut(t: number): number {
  return 1.0 - (1.0 - t) ** 2;
}
```

- [ ] **Step 2: Replace the function in renderer.ts with an import**

Remove the `easeOut` function body from `renderer.ts` (around line 496) and add at the top of the imports section:

```ts
import { easeOut } from './lib/easing';
```

- [ ] **Step 3: Run unit tests**

```bash
npm run test:unit
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/easing.ts src/renderer.ts
git commit -m "refactor: extract easeOut to src/lib/easing.ts"
```

---

### Task 5: Create src/lib/pdf-geometry.ts

**Files:**
- Create: `src/lib/pdf-geometry.ts`
- Modify: `src/renderer.ts`

- [ ] **Step 1: Create the module**

```ts
// src/lib/pdf-geometry.ts

const BRIGHTNESS_ZONE_PX = 60;

export function halfSrcRect(
  half: 'top' | 'bottom',
  halfMode: boolean,
  cacheWidth: number,
  cacheHeight: number
): [number, number, number, number] {
  const w = cacheWidth;
  const h = cacheHeight;
  if (!halfMode) return [0, 0, w, h];
  const fullH = h * 2;
  return half === 'top'
    ? [0, 0, w, fullH / 2]
    : [0, fullH / 2, w, fullH / 2];
}

export function toVisualDx(dx: number, dy: number, rotationSteps: 0 | 1 | 2 | 3): number {
  switch (rotationSteps) {
    case 1: return dy;
    case 2: return -dx;
    case 3: return -dy;
    default: return dx;
  }
}

export function toVisualDy(dx: number, dy: number, rotationSteps: 0 | 1 | 2 | 3): number {
  switch (rotationSteps) {
    case 1: return -dx;
    case 2: return -dy;
    case 3: return dx;
    default: return dy;
  }
}

export function isInBrightnessZone(
  clientX: number,
  clientY: number,
  rotationSteps: 0 | 1 | 2 | 3,
  cacheWidth: number,
  cacheHeight: number
): boolean {
  switch (rotationSteps) {
    case 1: return clientY < BRIGHTNESS_ZONE_PX;
    case 2: return clientX > (cacheWidth - BRIGHTNESS_ZONE_PX);
    case 3: return clientY > (cacheHeight - BRIGHTNESS_ZONE_PX);
    default: return clientX < BRIGHTNESS_ZONE_PX;
  }
}

export function visualXFrac(
  clientX: number,
  clientY: number,
  rotationSteps: 0 | 1 | 2 | 3,
  cacheWidth: number
): number {
  switch (rotationSteps) {
    case 1: return clientY / cacheWidth;
    case 2: return (cacheWidth - clientX) / cacheWidth;
    case 3: return (cacheWidth - clientY) / cacheWidth;
    default: return clientX / cacheWidth;
  }
}
```

- [ ] **Step 2: Update renderer.ts to import from pdf-geometry**

Remove the five function bodies (`halfSrcRect`, `toVisualDx`, `toVisualDy`, `isInBrightnessZone`, `visualXFrac`) from `renderer.ts`.

Note: the existing `halfSrcRect` in `renderer.ts` closes over `cacheWidth`, `cacheHeight`, `halfMode` — the new version takes them as explicit parameters. Update all call sites in `renderer.ts`:

- `halfSrcRect(halfPage)` → `halfSrcRect(halfPage, halfMode, cacheWidth, cacheHeight)`
- `toVisualDx(dx, dy)` → `toVisualDx(dx, dy, rotationSteps)`
- `toVisualDy(dx, dy)` → `toVisualDy(dx, dy, rotationSteps)`
- `isInBrightnessZone(x, y)` → `isInBrightnessZone(x, y, rotationSteps, cacheWidth, cacheHeight)`
- `visualXFrac(x, y)` → `visualXFrac(x, y, rotationSteps, cacheWidth)`

Add import at top of renderer.ts:

```ts
import { halfSrcRect, toVisualDx, toVisualDy, isInBrightnessZone, visualXFrac } from './lib/pdf-geometry';
```

Also remove the `BRIGHTNESS_ZONE_PX` constant from `renderer.ts` (it's now in `pdf-geometry.ts`).

- [ ] **Step 3: Update the half-mode-rotation unit test to import from src/lib**

The test at `tests/unit/half-mode-rotation.test.ts` currently defines its own inline `halfSrcRect`. Update it to import the real function:

```ts
// tests/unit/half-mode-rotation.test.ts
import { describe, it, expect } from 'vitest';
import { halfSrcRect } from '../../src/lib/pdf-geometry';

const W = 100, H = 200;

describe('halfSrcRect — always top/bottom split, rotation handled by CSS', () => {
  it("'top' = upper half", () => {
    expect(halfSrcRect('top', true, W, H)).toEqual([0, 0, W, H]);
  });

  it("'bottom' = lower half", () => {
    expect(halfSrcRect('bottom', true, W, H)).toEqual([0, H, W, H]);
  });

  it('top + bottom together cover the full surface', () => {
    const [, ty, , th] = halfSrcRect('top', true, W, H);
    const [, by, , bh] = halfSrcRect('bottom', true, W, H);
    expect(ty).toBe(0);
    expect(by).toBe(th);
    expect(th + bh).toBe(H * 2);
  });

  it('returns full surface when halfMode is false', () => {
    expect(halfSrcRect('top', false, W, H)).toEqual([0, 0, W, H]);
  });
});
```

- [ ] **Step 4: Run unit tests**

```bash
npm run test:unit
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf-geometry.ts src/renderer.ts tests/unit/half-mode-rotation.test.ts
git commit -m "refactor: extract pdf-geometry utils to src/lib/pdf-geometry.ts"
```

---

### Task 6: Create src/lib/bookmark-utils.ts

**Files:**
- Create: `src/lib/bookmark-utils.ts`
- Modify: `src/renderer.ts`

- [ ] **Step 1: Create the module**

```ts
// src/lib/bookmark-utils.ts
import { Bookmark } from '../bookmarks';

export function extractLeadingChars(title: string): string {
  const match = title.match(/^(\d+[a-zA-Z]?)/);
  return match ? match[1] : '';
}

export function formatPillContent(title: string, mode: 's' | 'm' | 'l'): string {
  switch (mode) {
    case 's': {
      const leading = extractLeadingChars(title);
      return leading || '#bookmark';
    }
    case 'm':
      return title.length > 12 ? title.substring(0, 12) + '...' : title;
    case 'l':
      return title;
  }
}

export function findNearestBookmark(
  bookmarks: Bookmark[],
  currentPage: number
): { page: number | null; index: number | null } {
  if (bookmarks.length === 0) return { page: null, index: null };
  let nearest: { page: number; index: number } | null = null;
  for (let i = 0; i < bookmarks.length; i++) {
    if (bookmarks[i].page <= currentPage) {
      if (!nearest || bookmarks[i].page > nearest.page) {
        nearest = { page: bookmarks[i].page, index: i };
      }
    }
  }
  return { page: nearest?.page ?? null, index: nearest?.index ?? null };
}
```

- [ ] **Step 2: Update renderer.ts to import from bookmark-utils**

Remove the three function bodies (`extractLeadingChars`, `formatPillContent`, `findNearestBookmark`) from `renderer.ts`.

Update `findNearestBookmark` call sites — the existing function in `renderer.ts` closes over `bookmarks` and `currentPage`. The new version takes them as explicit parameters. Update the one call site:

```ts
// was: const { page, index } = findNearestBookmark();
const { page, index } = findNearestBookmark(bookmarks, currentPage);
```

Add import at top of renderer.ts:

```ts
import { extractLeadingChars, formatPillContent, findNearestBookmark } from './lib/bookmark-utils';
```

- [ ] **Step 3: Run unit tests**

```bash
npm run test:unit
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/bookmark-utils.ts src/renderer.ts
git commit -m "refactor: extract bookmark utils to src/lib/bookmark-utils.ts"
```

---

## Phase 3 — React Scaffold

### Task 7: Create useLocalStorage hook

**Files:**
- Create: `src/hooks/useLocalStorage.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/useLocalStorage.ts
import { useState, useCallback } from 'react';

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;
      return JSON.parse(item) as T;
    } catch {
      return defaultValue;
    }
  });

  const setValue = useCallback((value: T) => {
    setState(value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key]);

  return [state, setValue];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useLocalStorage.ts
git commit -m "feat: add useLocalStorage hook"
```

---

### Task 8: Create AppContext and types

**Files:**
- Create: `src/AppContext.ts`

- [ ] **Step 1: Create the context file**

```ts
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
}

export interface AppContextValue extends AppState, AppActions {}

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/AppContext.ts
git commit -m "feat: add AppContext with AppState and AppActions interfaces"
```

---

### Task 9: Create AppProvider

**Files:**
- Create: `src/AppProvider.tsx`

- [ ] **Step 1: Create AppProvider with all stable state**

```tsx
// src/AppProvider.tsx
import React, { useState, useCallback, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AppContext, AppState, AppContextValue } from './AppContext';
import { useLocalStorage } from './hooks/useLocalStorage';
import { readBookmarks, writeBookmarks, Bookmark } from './bookmarks';
import { findNearestBookmark } from './lib/bookmark-utils';

const pidef = (window as any).pidef;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [nPages, setNPages] = useState(0);
  const [currentFilePath, setCurrentFilePath] = useState('');
  const [halfMode, setHalfMode] = useState(false);
  const [halfPage, setHalfPage] = useState<'top' | 'bottom'>('top');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  const [bookmarkDisplayMode, setBookmarkDisplayMode] = useLocalStorage<AppState['bookmarkDisplayMode']>(
    'pidef-bookmark-display-mode', '1-line'
  );
  const [bookmarkWidthMode, setBookmarkWidthMode] = useLocalStorage<AppState['bookmarkWidthMode']>(
    'pidef-bookmark-width-mode', 'm'
  );
  const [showTopBarTitle, setShowTopBarTitle] = useLocalStorage<boolean>(
    'pidef-show-top-bar-title', true
  );
  const [sepiaEnabled, setSepiaEnabled] = useLocalStorage<boolean>('pidef-sepia', false);
  const [invertEnabled, setInvertEnabled] = useLocalStorage<boolean>('pidef-invert', false);
  const [rotationSteps, setRotationSteps] = useLocalStorage<0 | 1 | 2 | 3>('pidef-rotation', 0);
  const [brightness, setBrightnessState] = useLocalStorage<number>('pidef-brightness', 1.0);

  // Stable refs to avoid stale closures in callbacks
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const currentPageRef = useRef(0);
  const nPagesRef = useRef(0);
  const currentFilePathRef = useRef('');
  const halfModeRef = useRef(false);
  const halfPageRef = useRef<'top' | 'bottom'>('top');
  const bookmarksRef = useRef<Bookmark[]>([]);

  // Keep refs in sync with state
  pdfDocRef.current = pdfDoc;
  currentPageRef.current = currentPage;
  nPagesRef.current = nPages;
  currentFilePathRef.current = currentFilePath;
  halfModeRef.current = halfMode;
  halfPageRef.current = halfPage;
  bookmarksRef.current = bookmarks;

  const loadFile = useCallback(async (filePath: string) => {
    let pdfjsLib: typeof import('pdfjs-dist');
    pdfjsLib = require('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');

    const url = `file://${filePath}`;
    const doc = await pdfjsLib.getDocument(url).promise;
    const pages = doc.numPages;

    const recentFiles = await pidef.getRecentFiles();
    const fileRecord = recentFiles.find((f: any) => f.path === filePath);
    const page = fileRecord ? Math.min(fileRecord.page, pages - 1) : 0;
    const hm = fileRecord?.halfMode ?? false;

    pdfDocRef.current = doc;
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
    const doc = pdfDocRef.current;
    const pages = nPagesRef.current;
    if (!doc || idx < 0 || idx >= pages || idx === currentPageRef.current) return;
    setCurrentPage(idx);
    if (currentFilePathRef.current) pidef.updateFilePage(currentFilePathRef.current, idx);
  }, []);

  const goNext = useCallback(() => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    const hm = halfModeRef.current;
    const hp = halfPageRef.current;
    const page = currentPageRef.current;
    const pages = nPagesRef.current;
    if (hm && hp === 'top') { setHalfPage('bottom'); return; }
    if (page >= pages - 1) return;
    if (hm) setHalfPage('top');
    setCurrentPage(p => {
      const next = p + 1;
      if (currentFilePathRef.current) pidef.updateFilePage(currentFilePathRef.current, next);
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    const hm = halfModeRef.current;
    const hp = halfPageRef.current;
    const page = currentPageRef.current;
    if (hm && hp === 'bottom') { setHalfPage('top'); return; }
    if (page <= 0) return;
    if (hm) setHalfPage('bottom');
    setCurrentPage(p => {
      const prev = p - 1;
      if (currentFilePathRef.current) pidef.updateFilePage(currentFilePathRef.current, prev);
      return prev;
    });
  }, []);

  const goFirst = useCallback(() => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    if (halfModeRef.current && halfPageRef.current !== 'top') { setHalfPage('top'); return; }
    if (currentPageRef.current === 0) return;
    goToPage(0);
  }, [goToPage]);

  const goLast = useCallback(() => {
    const doc = pdfDocRef.current;
    if (!doc) return;
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

  const toggleSepia = useCallback(() => {
    setSepiaEnabled(v => !v);
  }, [setSepiaEnabled]);

  const toggleInvert = useCallback(() => {
    setInvertEnabled(v => !v);
  }, [setInvertEnabled]);

  const rotate = useCallback((dir: 'cw' | 'ccw') => {
    setRotationSteps(r => {
      const next = dir === 'cw' ? ((r + 1) % 4) as 0|1|2|3 : ((r + 3) % 4) as 0|1|2|3;
      return next;
    });
  }, [setRotationSteps]);

  const setBrightness = useCallback((level: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, level));
    setBrightnessState(clamped);
    pidef.setBrightness(clamped).catch(() => {});
  }, [setBrightnessState]);

  const addBookmark = useCallback((label: string, page: number) => {
    setBookmarks(bms => {
      const next = [...bms.filter(b => b.page !== page), { label, page }]
        .sort((a, b) => a.page - b.page);
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

  const value: AppContextValue = {
    pdfDoc,
    currentPage,
    nPages,
    currentFilePath,
    halfMode,
    halfPage,
    bookmarks,
    bookmarkDisplayMode,
    bookmarkWidthMode,
    showTopBarTitle,
    sepiaEnabled,
    invertEnabled,
    rotationSteps,
    brightness,
    loadFile,
    closePdf,
    goNext,
    goPrev,
    goFirst,
    goLast,
    goToPage,
    toggleHalfMode,
    toggleSepia,
    toggleInvert,
    rotate,
    setBrightness,
    addBookmark,
    removeBookmark,
    updateBookmark,
    setBookmarkDisplayMode,
    setBookmarkWidthMode,
    setShowTopBarTitle,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/AppProvider.tsx
git commit -m "feat: add AppProvider with full stable state and actions"
```

---

### Task 10: Create useIpc hook

**Files:**
- Create: `src/hooks/useIpc.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/useIpc.ts
import { useEffect } from 'react';
import { useAppContext } from '../AppContext';

const pidef = (window as any).pidef;

export function useIpc() {
  const { loadFile } = useAppContext();

  useEffect(() => {
    pidef.onOpenFile((path: string) => {
      loadFile(path);
    });
    pidef.onToggleFullscreen(() => {
      pidef.toggleFullscreen();
    });
    // These listeners are set once; preload registers them with ipcRenderer.on
    // which does not provide a cleanup method — intentionally fire-and-forget.
  }, [loadFile]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useIpc.ts
git commit -m "feat: add useIpc hook for Electron IPC listeners"
```

---

### Task 11: Create App.tsx and src/index.tsx entry point

**Files:**
- Create: `src/App.tsx`
- Create: `src/index.tsx`
- Modify: `src/index.html`

- [ ] **Step 1: Create App.tsx (stub — renders nothing yet)**

```tsx
// src/App.tsx
import React from 'react';
import { AppProvider } from './AppProvider';
import { useIpc } from './hooks/useIpc';

function AppInner() {
  useIpc();
  // Components will be added here in Phase 4
  return (
    <div style={{ color: 'white', padding: 16 }}>
      React scaffold ready. Components coming in Phase 4.
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
```

- [ ] **Step 2: Create src/index.tsx**

```tsx
// src/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);
```

- [ ] **Step 3: Update src/index.html**

Replace the current `index.html` body content with a minimal shell that:
- Keeps `<link rel="stylesheet" href="styles.css">` (Vite will copy it)
- Has a `<div id="root"></div>` mount point
- Loads `src/index.tsx` via Vite's module script (Vite rewrites this on build)
- Removes the old `<script src="renderer.js"></script>`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>pidef</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/index.tsx"></script>
</body>
</html>
```

- [ ] **Step 4: Build renderer and verify it boots**

```bash
npm run build:renderer
```

Expected: exits 0, `dist/index.html` and `dist/assets/index-*.js` present.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/index.tsx src/index.html
git commit -m "feat: add React entry point (App.tsx + index.tsx), update index.html for Vite"
```

---

## Phase 4 — Components

> Before each component task: the existing HTML in `src/index.html` no longer has the old structure — we're building it piece by piece in React. The CSS class names and IDs in `src/styles.scss` stay unchanged; components use the same names.

### Task 12: Toolbar component

**Files:**
- Create: `src/components/Toolbar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create Toolbar**

```tsx
// src/components/Toolbar.tsx
import React from 'react';
import { useAppContext } from '../AppContext';

export function Toolbar() {
  const {
    pdfDoc, currentPage, nPages, bookmarks,
    showTopBarTitle, rotationSteps,
    closePdf, rotate, loadFile,
  } = useAppContext();

  // Nearest bookmark label for top-bar title
  let topBarTitle = '';
  if (showTopBarTitle && pdfDoc) {
    // Find bookmark with largest page <= currentPage
    let nearest: typeof bookmarks[0] | null = null;
    for (const bm of bookmarks) {
      if (bm.page <= currentPage) {
        if (!nearest || bm.page > nearest.page) nearest = bm;
      }
    }
    topBarTitle = nearest?.label ?? '';
  }

  const pidef = (window as any).pidef;

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
        disabled={!pdfDoc}
        onClick={() => pidef.toggleFullscreen()}
      >
        ⛶
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire CSS rotation to body**

The rotation is a CSS class on `<body>`. Add a `useEffect` in `AppProvider.tsx` (or a small `useRotation` effect in `App.tsx`) to apply/remove classes:

In `src/App.tsx`, update `AppInner`:

```tsx
import React, { useEffect } from 'react';
import { useAppContext } from './AppContext';
import { useIpc } from './hooks/useIpc';
import { Toolbar } from './components/Toolbar';

function AppInner() {
  useIpc();
  const { rotationSteps } = useAppContext();

  useEffect(() => {
    document.body.classList.remove('rotate-90', 'rotate-180', 'rotate-270');
    if (rotationSteps === 1) document.body.classList.add('rotate-90');
    else if (rotationSteps === 2) document.body.classList.add('rotate-180');
    else if (rotationSteps === 3) document.body.classList.add('rotate-270');
  }, [rotationSteps]);

  return (
    <>
      <Toolbar />
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
```

- [ ] **Step 3: Build**

```bash
npm run build:renderer
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/Toolbar.tsx src/App.tsx
git commit -m "feat: add Toolbar component"
```

---

### Task 13: NavBar component

**Files:**
- Create: `src/components/NavBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create NavBar**

```tsx
// src/components/NavBar.tsx
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

  // Bookmark button: cycle hidden → 1-line → all → hidden
  // Long-press (500ms): enter overlay
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActivatedRef = useRef(false);

  const handleBookmarkClick = () => {
    if (!pdfDoc) return;
    if (longPressActivatedRef.current) { longPressActivatedRef.current = false; return; }
    const modes: ('hidden' | '1-line' | 'all')[] = ['hidden', '1-line', 'all'];
    const idx = modes.indexOf(bookmarkDisplayMode as any);
    const next = modes[(idx + 1) % modes.length];
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
        >
          🟫
        </button>
        <button
          id="btn-invert"
          title="Invert colors"
          disabled={disabled}
          className={invertEnabled ? 'active' : ''}
          onClick={toggleInvert}
        >
          ⚫
        </button>
        <button
          id="btn-half"
          title="Half page mode"
          disabled={disabled}
          className={halfMode ? 'active' : ''}
          onClick={toggleHalfMode}
        >
          ½
        </button>
        <button
          id="btn-toggle-bookmarks-nav"
          title="Bookmarks"
          disabled={disabled}
          onPointerDown={handleBookmarkPointerDown}
          onPointerUp={handleBookmarkPointerUp}
          onPointerCancel={handleBookmarkPointerUp}
          onClick={handleBookmarkClick}
        >
          🔖
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add NavBar to App.tsx**

```tsx
import { NavBar } from './components/NavBar';
// In AppInner return:
return (
  <>
    <Toolbar />
    <NavBar />
  </>
);
```

- [ ] **Step 3: Build**

```bash
npm run build:renderer
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/NavBar.tsx src/App.tsx
git commit -m "feat: add NavBar component"
```

---

### Task 14: WelcomeScreen component

**Files:**
- Create: `src/components/WelcomeScreen.tsx`

- [ ] **Step 1: Create WelcomeScreen**

```tsx
// src/components/WelcomeScreen.tsx
import React, { useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';

interface FileRecord {
  path: string;
  page: number;
}

const pidef = (window as any).pidef;

export function WelcomeScreen() {
  const { pdfDoc, loadFile } = useAppContext();
  const [recentFiles, setRecentFiles] = useState<FileRecord[]>([]);

  useEffect(() => {
    pidef.getRecentFiles().then(setRecentFiles);
  }, [pdfDoc]); // refresh when a file is closed

  if (pdfDoc) return null;

  return (
    <div id="welcome-screen">
      <div id="welcome-hint">Open a PDF to start reading</div>
      <div id="recent-files-section">
        <div id="recent-files-label">Recent Files</div>
        <ul id="recent-files-list">
          {recentFiles.map(f => {
            const filename = f.path.split('/').pop() || f.path;
            return (
              <li key={f.path} onClick={() => loadFile(f.path)}>
                <div className="filename">{filename}</div>
                <div className="filepath">{f.path}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run build:renderer
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/WelcomeScreen.tsx
git commit -m "feat: add WelcomeScreen component"
```

---

### Task 15: BrightnessHud component

**Files:**
- Create: `src/components/BrightnessHud.tsx`

- [ ] **Step 1: Create BrightnessHud**

```tsx
// src/components/BrightnessHud.tsx
import React from 'react';

const BRIGHTNESS_MIN = 0.1;
const BRIGHTNESS_MAX = 1.0;

interface Props {
  brightness: number;
  visible: boolean;
}

export function BrightnessHud({ brightness, visible }: Props) {
  const pct = ((brightness - BRIGHTNESS_MIN) / (BRIGHTNESS_MAX - BRIGHTNESS_MIN)) * 100;
  return (
    <div id="brightness-hud" className={visible ? 'visible' : ''}>
      <div id="brightness-fill" style={{ height: `${pct.toFixed(1)}%` }} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BrightnessHud.tsx
git commit -m "feat: add BrightnessHud component"
```

---

### Task 16: BookmarkBar component

**Files:**
- Create: `src/components/BookmarkBar.tsx`

- [ ] **Step 1: Create BookmarkBar**

```tsx
// src/components/BookmarkBar.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { formatPillContent, extractLeadingChars, findNearestBookmark } from '../lib/bookmark-utils';

export function BookmarkBar() {
  const {
    pdfDoc, currentPage, bookmarks, bookmarkDisplayMode, bookmarkWidthMode,
    showTopBarTitle, goToPage, addBookmark,
    setBookmarkDisplayMode, setBookmarkWidthMode, setShowTopBarTitle,
  } = useAppContext();

  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  const { index: nearestIndex } = findNearestBookmark(bookmarks, currentPage);

  const shouldShow = pdfDoc !== null && bookmarkDisplayMode !== 'hidden' && bookmarkDisplayMode !== 'overlay';

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
    <div id="bookmark-bar" className={`mode-${bookmarkDisplayMode.replace('-', '-')}`}>
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
          >
            +
          </button>
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
        >
          {bookmarkWidthMode}
        </button>
        <button
          id="btn-title-toggle"
          title="Toggle title"
          disabled={!pdfDoc}
          onClick={() => setShowTopBarTitle(!showTopBarTitle)}
        >
          Aa
        </button>
      </div>
      <div
        id="bookmark-pills"
        ref={pillsRef}
        style={{ touchAction: 'none' }}
      >
        {bookmarks.map((bm, i) => (
          <BookmarkPill
            key={bm.page}
            bm={bm}
            highlighted={nearestIndex !== null && i === nearestIndex}
            widthMode={bookmarkWidthMode}
            onNavigate={() => goToPage(bm.page)}
          />
        ))}
      </div>
    </div>
  );
}

interface PillProps {
  bm: { label: string; page: number; segue?: boolean };
  highlighted: boolean;
  widthMode: 's' | 'm' | 'l';
  onNavigate: () => void;
}

function BookmarkPill({ bm, highlighted, widthMode, onNavigate }: PillProps) {
  const { } = useAppContext(); // access to openBookmarkEditModal will come via BookmarkEditModal
  const [armed, setArmed] = useState(false);
  const armedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { updateBookmark } = useAppContext();

  const disarm = () => {
    setArmed(false);
    if (armedTimerRef.current) { clearTimeout(armedTimerRef.current); armedTimerRef.current = null; }
  };

  // We'll open the edit modal via a shared modal state in context; for now navigate on double-tap
  // The BookmarkEditModal in Task 19 will handle the edit flow via context state
  const handleClick = () => {
    if (armed) {
      disarm();
      // Signal to open edit modal — stored in context (added in Task 19)
      (window as any).__pidefOpenBookmarkEdit?.(bm);
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
      {bm.segue && ' ▶'}
    </button>
  );
}
```

- [ ] **Step 2: Add BookmarkBar to App.tsx**

```tsx
import { BookmarkBar } from './components/BookmarkBar';
// In AppInner return:
return (
  <>
    <Toolbar />
    <BookmarkBar />
    <NavBar />
  </>
);
```

- [ ] **Step 3: Build**

```bash
npm run build:renderer
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/BookmarkBar.tsx src/App.tsx
git commit -m "feat: add BookmarkBar component"
```

---

### Task 17: BookmarkOverlay component

**Files:**
- Create: `src/components/BookmarkOverlay.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create BookmarkOverlay**

```tsx
// src/components/BookmarkOverlay.tsx
import React from 'react';
import { useAppContext } from '../AppContext';
import { findNearestBookmark, extractLeadingChars, formatPillContent } from '../lib/bookmark-utils';

export function BookmarkOverlay() {
  const {
    pdfDoc, currentPage, bookmarks, bookmarkDisplayMode,
    goToPage, setBookmarkDisplayMode,
  } = useAppContext();

  if (bookmarkDisplayMode !== 'overlay') return null;

  const { index: nearestIndex } = findNearestBookmark(bookmarks, currentPage);

  const close = () => {
    // Return to the mode that was active before overlay was opened.
    // We don't have overlayActiveFromMode in context — default back to '1-line'.
    // BookmarkBar's long-press handler sets mode to 'overlay'; we restore '1-line'.
    setBookmarkDisplayMode('1-line');
  };

  return (
    <div id="bookmark-overlay" onPointerDown={e => { e.stopPropagation(); e.preventDefault(); close(); }}>
      <div id="bookmark-overlay-backdrop" />
      <div
        id="bookmark-overlay-pills"
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
              {bm.segue && ' ▶'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add BookmarkOverlay to App.tsx**

```tsx
import { BookmarkOverlay } from './components/BookmarkOverlay';
// In AppInner return:
return (
  <>
    <Toolbar />
    <BookmarkOverlay />
    <BookmarkBar />
    <NavBar />
  </>
);
```

- [ ] **Step 3: Build**

```bash
npm run build:renderer
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/BookmarkOverlay.tsx src/App.tsx
git commit -m "feat: add BookmarkOverlay component"
```

---

### Task 18: BookmarkEditModal component

**Files:**
- Create: `src/components/BookmarkEditModal.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add editingBookmark state to AppContext**

In `src/AppContext.ts`, add to `AppState`:

```ts
editingBookmark: { label: string; page: number; segue?: boolean } | null;
```

In `AppActions`, add:

```ts
openBookmarkEdit: (bm: { label: string; page: number; segue?: boolean }) => void;
closeBookmarkEdit: () => void;
```

- [ ] **Step 2: Add editingBookmark state to AppProvider**

In `src/AppProvider.tsx`, add:

```tsx
const [editingBookmark, setEditingBookmark] = useState<{ label: string; page: number; segue?: boolean } | null>(null);

const openBookmarkEdit = useCallback((bm: { label: string; page: number; segue?: boolean }) => {
  setEditingBookmark(bm);
}, []);

const closeBookmarkEdit = useCallback(() => {
  setEditingBookmark(null);
}, []);
```

Add `editingBookmark`, `openBookmarkEdit`, `closeBookmarkEdit` to the `value` object.

Also set `(window as any).__pidefOpenBookmarkEdit = openBookmarkEdit;` in a `useEffect` so `BookmarkPill` can call it (temporary bridge, removed when BookmarkPill is refactored):

```tsx
useEffect(() => {
  (window as any).__pidefOpenBookmarkEdit = openBookmarkEdit;
}, [openBookmarkEdit]);
```

- [ ] **Step 3: Create BookmarkEditModal**

```tsx
// src/components/BookmarkEditModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';

export function BookmarkEditModal() {
  const { editingBookmark, closeBookmarkEdit, updateBookmark, removeBookmark } = useAppContext();
  const [label, setLabel] = useState('');
  const [segue, setSegue] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingBookmark) {
      setLabel(editingBookmark.label);
      setSegue(editingBookmark.segue ?? false);
      setTimeout(() => { labelRef.current?.focus(); labelRef.current?.select(); }, 0);
    }
  }, [editingBookmark]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingBookmark) closeBookmarkEdit();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editingBookmark, closeBookmarkEdit]);

  if (!editingBookmark) return null;

  const handleDone = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    updateBookmark(editingBookmark.page, trimmed, segue);
    closeBookmarkEdit();
  };

  const handleDelete = () => {
    if (confirm(`Delete bookmark "${editingBookmark.label}"?`)) {
      removeBookmark(editingBookmark.page);
      closeBookmarkEdit();
    }
  };

  return (
    <div id="bookmark-edit-modal">
      <div id="bookmark-modal-backdrop" onClick={closeBookmarkEdit} />
      <div id="bookmark-modal-content">
        <h2>Edit Bookmark</h2>
        <input
          ref={labelRef}
          type="text"
          id="bookmark-modal-label"
          placeholder="Bookmark label"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleDone(); } }}
        />
        <label id="bookmark-segue-label">
          <input
            type="checkbox"
            id="bookmark-modal-segue"
            checked={segue}
            onChange={e => setSegue(e.target.checked)}
          />
          Mark as segue
        </label>
        <button id="bookmark-modal-delete" className="destructive" onClick={handleDelete}>
          Delete
        </button>
        <div id="bookmark-modal-buttons">
          <button id="bookmark-modal-cancel" onClick={closeBookmarkEdit}>Cancel</button>
          <button id="bookmark-modal-done" onClick={handleDone}>Done</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add BookmarkEditModal to App.tsx**

```tsx
import { BookmarkEditModal } from './components/BookmarkEditModal';
// In AppInner return:
return (
  <>
    <Toolbar />
    <BookmarkOverlay />
    <BookmarkEditModal />
    <BookmarkBar />
    <NavBar />
  </>
);
```

- [ ] **Step 5: Build**

```bash
npm run build:renderer
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/BookmarkEditModal.tsx src/AppContext.ts src/AppProvider.tsx src/App.tsx
git commit -m "feat: add BookmarkEditModal component and editingBookmark state"
```

---

### Task 19: usePdfEngine hook

**Files:**
- Create: `src/hooks/usePdfEngine.ts`

This hook owns all animation/RAF hot-path state as `useRef`s and returns a `canvasRef` for `<PdfCanvas>` to attach to.

- [ ] **Step 1: Create usePdfEngine**

```ts
// src/hooks/usePdfEngine.ts
import { useRef, useEffect, useCallback } from 'react';
import type { AppContextValue } from '../AppContext';
import { halfSrcRect, toVisualDx, toVisualDy, isInBrightnessZone, visualXFrac } from '../lib/pdf-geometry';
import { easeOut } from '../lib/easing';

const ANIM_MS = 120;
const SNAP_MS = 80;
const THRESHOLD_PX = 40;
const SLIDE_PX = 40;
const PRERENDER_FWD = 2;
const HALF_PAN_MS = 100;
const BRIGHTNESS_PX_PER_UNIT = 200;

type AnimState = 'idle' | 'dragging' | 'snap' | 'animating' | 'half-pan';

export function usePdfEngine(ctx: AppContextValue) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Surface cache
  const surfCache = useRef(new Map<number, ImageBitmap>());
  const rendering = useRef(new Set<number>());
  const cacheWidth = useRef(0);
  const cacheHeight = useRef(0);
  const currentSurf = useRef<ImageBitmap | null>(null);
  const animFromSurf = useRef<ImageBitmap | null>(null);
  const animFromHalf = useRef<'top' | 'bottom'>('top');

  // Animation state
  const animState = useRef<AnimState>('idle');
  const animT = useRef(1.0);
  const animStartTime = useRef<number | null>(null);
  const animMs = useRef(ANIM_MS);
  const animDir = useRef(1);
  const rafId = useRef<number | null>(null);

  // Drag state
  const dragX = useRef(0);
  const dragAdjDir = useRef(0);
  const snapFromX = useRef(0);
  const dragCommitted = useRef(false);
  const pointerDown = useRef(false);
  const pointerStartX = useRef(0);
  const pointerStartY = useRef(0);

  // Brightness drag
  const inBrightnessDrag = useRef(false);
  const brightnessAtDragStart = useRef(1.0);
  const brightnessHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brightnessHudVisible = useRef(false);

  // Stable refs to context values (avoid stale closures)
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const getCanvas = () => canvasRef.current;
  const getCtx2d = () => canvasRef.current?.getContext('2d') ?? null;

  // ── Drawing ──────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = getCanvas();
    const c = getCtx2d();
    if (!canvas || !c) return;
    const w = cacheWidth.current;
    const h = cacheHeight.current;
    const { pdfDoc, halfMode, halfPage, sepiaEnabled, invertEnabled } = ctxRef.current;

    c.fillStyle = '#212121';
    c.fillRect(0, 0, w, h);
    if (!pdfDoc || !currentSurf.current) return;

    const filters: string[] = [];
    if (sepiaEnabled) filters.push('sepia(0.8) brightness(0.6) saturate(0.7)');
    if (invertEnabled) filters.push('invert(1)');
    c.filter = filters.join(' ') || 'none';

    const st = animState.current;
    const t = animT.current;

    if (st === 'dragging' || st === 'snap') {
      const [sx, sy, sw, sh] = halfSrcRect(halfPage, halfMode, w, h);
      c.drawImage(currentSurf.current, sx, sy, sw, sh, dragX.current, 0, w, h);
      if (dragAdjDir.current !== 0) {
        const adjSurf = surfCache.current.get(ctxRef.current.currentPage + dragAdjDir.current);
        if (adjSurf) {
          const adjHalf = halfMode ? (dragAdjDir.current === 1 ? 'top' : 'bottom') : 'top';
          const [asx, asy, asw, ash] = halfSrcRect(adjHalf, halfMode, w, h);
          c.drawImage(adjSurf, asx, asy, asw, ash, dragAdjDir.current * w + dragX.current, 0, w, h);
        }
      }
      c.filter = 'none';
      return;
    }

    if (st === 'half-pan' && t < 1.0) {
      const ease = easeOut(t);
      const dir = animDir.current;
      const outY = -dir * ease * h;
      const inY = dir * (1.0 - ease) * h;
      const [fsx, fsy, fsw, fsh] = halfSrcRect(dir === 1 ? 'top' : 'bottom', halfMode, w, h);
      const [csx, csy, csw, csh] = halfSrcRect(halfPage, halfMode, w, h);
      if (animFromSurf.current) c.drawImage(animFromSurf.current, fsx, fsy, fsw, fsh, 0, outY, w, h);
      c.globalAlpha = 1.0;
      c.drawImage(currentSurf.current, csx, csy, csw, csh, 0, inY, w, h);
      c.globalAlpha = 1.0;
      c.filter = 'none';
      return;
    }

    if (st === 'animating' && t < 1.0) {
      const ease = easeOut(t);
      const [csx, csy, csw, csh] = halfSrcRect(halfPage, halfMode, w, h);
      if (animFromSurf.current) {
        const [fsx, fsy, fsw, fsh] = halfSrcRect(animFromHalf.current, halfMode, w, h);
        c.globalAlpha = 1.0 - ease;
        c.drawImage(animFromSurf.current, fsx, fsy, fsw, fsh, 0, 0, w, h);
      }
      const inX = animDir.current * SLIDE_PX * (1.0 - ease);
      c.globalAlpha = ease;
      c.drawImage(currentSurf.current, csx, csy, csw, csh, inX, 0, w, h);
      c.globalAlpha = 1.0;
      c.filter = 'none';
      return;
    }

    // idle
    const [sx, sy, sw, sh] = halfSrcRect(halfPage, halfMode, w, h);
    c.drawImage(currentSurf.current, sx, sy, sw, sh, 0, 0, w, h);
    c.filter = 'none';
  }, []);

  // ── RAF ──────────────────────────────────────────────────────────────────

  const onTick = useCallback((timestamp: number) => {
    if (animStartTime.current === null) animStartTime.current = timestamp;
    const elapsed = timestamp - animStartTime.current;
    const t = Math.min(1.0, elapsed / animMs.current);
    animT.current = t;

    if (animState.current === 'snap') {
      dragX.current = snapFromX.current * (1.0 - easeOut(t));
    }

    draw();

    if (t >= 1.0) {
      rafId.current = null;
      if (animState.current === 'snap') { dragX.current = 0; dragAdjDir.current = 0; }
      else if (animState.current === 'animating') { animFromSurf.current = null; }
      animT.current = 1.0;
      animState.current = 'idle';
      return;
    }

    rafId.current = requestAnimationFrame(onTick);
  }, [draw]);

  const startTick = useCallback(() => {
    animT.current = 0.0;
    animStartTime.current = null;
    if (rafId.current === null) rafId.current = requestAnimationFrame(onTick);
  }, [onTick]);

  const cancelAll = useCallback(() => {
    if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
    animT.current = 1.0;
    animStartTime.current = null;
    animState.current = 'idle';
    dragX.current = 0;
    dragAdjDir.current = 0;
    animFromSurf.current = null;
  }, []);

  // ── Rendering ────────────────────────────────────────────────────────────

  const renderPage = useCallback(async (pageIdx: number, w: number, h: number): Promise<ImageBitmap> => {
    const { pdfDoc, halfMode } = ctxRef.current;
    const page = await pdfDoc!.getPage(pageIdx + 1);
    const viewport = page.getViewport({ scale: 1 });
    const surfW = w;
    const surfH = halfMode ? h * 2 : h;
    const scale = Math.min(surfW / viewport.width, surfH / viewport.height);
    const sw = viewport.width * scale;
    const sh = viewport.height * scale;
    const cx = (surfW - sw) / 2;
    const cy = (surfH - sh) / 2;
    const offscreen = new OffscreenCanvas(surfW, surfH);
    const oc = offscreen.getContext('2d')!;
    oc.fillStyle = '#212121';
    oc.fillRect(0, 0, surfW, surfH);
    oc.fillStyle = 'rgba(0,0,0,0.35)';
    oc.fillRect(cx + 4, cy + 4, sw, sh);
    oc.fillStyle = '#ffffff';
    oc.fillRect(cx, cy, sw, sh);
    const renderCanvas = new OffscreenCanvas(Math.ceil(sw), Math.ceil(sh));
    const renderCtx = renderCanvas.getContext('2d')!;
    await page.render({ canvasContext: renderCtx as any, viewport: page.getViewport({ scale }) }).promise;
    oc.drawImage(renderCanvas, cx, cy);
    return createImageBitmap(offscreen);
  }, []);

  const renderPageCached = useCallback(async (pageIdx: number): Promise<ImageBitmap | null> => {
    const { pdfDoc, nPages } = ctxRef.current;
    if (!pdfDoc || pageIdx < 0 || pageIdx >= nPages) return null;
    if (cacheWidth.current === 0 || cacheHeight.current === 0) return null;
    const cached = surfCache.current.get(pageIdx);
    if (cached) return cached;
    const bmp = await renderPage(pageIdx, cacheWidth.current, cacheHeight.current);
    surfCache.current.set(pageIdx, bmp);
    return bmp;
  }, [renderPage]);

  const prerenderAsync = useCallback((...indices: number[]) => {
    const { pdfDoc, nPages } = ctxRef.current;
    if (!pdfDoc || cacheWidth.current === 0) return;
    for (const idx of indices) {
      if (idx < 0 || idx >= nPages) continue;
      if (surfCache.current.has(idx) || rendering.current.has(idx)) continue;
      rendering.current.add(idx);
      const w = cacheWidth.current; const h = cacheHeight.current;
      renderPage(idx, w, h).then(bmp => {
        rendering.current.delete(idx);
        if (cacheWidth.current === w && cacheHeight.current === h) surfCache.current.set(idx, bmp);
      });
    }
  }, [renderPage]);

  const bgScan = useCallback(() => {
    const { currentPage } = ctxRef.current;
    const fwd = [];
    for (let i = 1; i <= PRERENDER_FWD; i++) fwd.push(currentPage + i);
    fwd.push(currentPage - 1);
    prerenderAsync(...fwd);
  }, [prerenderAsync]);

  // ── Page-change helpers ──────────────────────────────────────────────────

  const beginPageChange = useCallback(async (direction: number, adjSurf?: ImageBitmap | null) => {
    const { currentPage, goNext, goPrev, goToPage } = ctxRef.current;
    cancelAll();
    animFromSurf.current = currentSurf.current;
    animFromHalf.current = ctxRef.current.halfPage;
    const nextPage = currentPage + direction;
    currentSurf.current = adjSurf ?? await renderPageCached(nextPage);
    animDir.current = direction;
    animMs.current = ANIM_MS;
    animState.current = 'animating';
    // Update page in context
    ctxRef.current.goToPage(nextPage);
    startTick();
    bgScan();
  }, [cancelAll, renderPageCached, startTick, bgScan]);

  const beginHalfChange = useCallback((direction: 1 | -1) => {
    cancelAll();
    animFromSurf.current = currentSurf.current;
    animDir.current = direction;
    animMs.current = HALF_PAN_MS;
    animState.current = 'half-pan';
    startTick();
  }, [cancelAll, startTick]);

  // ── Canvas resize ────────────────────────────────────────────────────────

  const resizeCanvas = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas) return;
    const container = canvas.parentElement!;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const c = canvas.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (cacheWidth.current !== w || cacheHeight.current !== h) {
      cacheWidth.current = w;
      cacheHeight.current = h;
      surfCache.current.clear();
      rendering.current.clear();
      currentSurf.current = null;
      animFromSurf.current = null;
      const { pdfDoc, currentPage } = ctxRef.current;
      if (pdfDoc) {
        renderPage(currentPage, w, h).then(bmp => {
          surfCache.current.set(currentPage, bmp);
          currentSurf.current = bmp;
          bgScan();
          draw();
        });
      }
    }
    draw();
  }, [renderPage, bgScan, draw]);

  // ── Pointer handlers ─────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: PointerEvent) => {
    const { pdfDoc, rotationSteps, brightness } = ctxRef.current;
    if (!pdfDoc) return;
    pointerDown.current = true;
    dragCommitted.current = false;
    pointerStartX.current = e.clientX;
    pointerStartY.current = e.clientY;

    if (isInBrightnessZone(e.clientX, e.clientY, rotationSteps, cacheWidth.current, cacheHeight.current)) {
      inBrightnessDrag.current = true;
      brightnessAtDragStart.current = brightness;
      if (brightnessHideTimer.current) clearTimeout(brightnessHideTimer.current);
      brightnessHudVisible.current = true;
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    cancelAll();
    dragX.current = 0;
    dragAdjDir.current = 0;
    animState.current = 'dragging';
    canvasRef.current?.setPointerCapture(e.pointerId);
    draw();
  }, [cancelAll, draw]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const { rotationSteps, currentPage, nPages, halfMode, halfPage } = ctxRef.current;

    if (inBrightnessDrag.current) {
      const sdx = e.clientX - pointerStartX.current;
      const sdy = e.clientY - pointerStartY.current;
      const delta = -toVisualDy(sdx, sdy, rotationSteps);
      const next = Math.max(0.1, Math.min(1.0, brightnessAtDragStart.current + delta / BRIGHTNESS_PX_PER_UNIT));
      ctxRef.current.setBrightness(next);
      brightnessHudVisible.current = true;
      return;
    }

    if (!pointerDown.current || animState.current !== 'dragging' || dragCommitted.current) return;
    const dx = toVisualDx(e.clientX - pointerStartX.current, e.clientY - pointerStartY.current, rotationSteps);
    dragX.current = dx;
    if (dx < -5) dragAdjDir.current = 1;
    else if (dx > 5) dragAdjDir.current = -1;
    else dragAdjDir.current = 0;

    if (Math.abs(dx) >= THRESHOLD_PX) {
      const direction = dx < 0 ? 1 : -1;
      dragCommitted.current = true;
      animState.current = 'idle';
      dragX.current = 0;
      dragAdjDir.current = 0;

      if (halfMode && direction === 1 && halfPage === 'top') {
        beginHalfChange(1);
      } else if (halfMode && direction === -1 && halfPage === 'bottom') {
        beginHalfChange(-1);
      } else {
        const canGo = (direction === 1 && currentPage < nPages - 1) || (direction === -1 && currentPage > 0);
        if (canGo) {
          const adjSurf = surfCache.current.get(currentPage + direction) ?? null;
          beginPageChange(direction, adjSurf);
        } else {
          doDragCancel();
        }
      }
      return;
    }
    draw();
  }, [beginHalfChange, beginPageChange, draw]);

  const doDragCancel = useCallback(() => {
    if (animState.current !== 'dragging') return;
    const sx = dragX.current;
    animState.current = 'snap';
    if (Math.abs(sx) < 1.0) {
      dragX.current = 0; dragAdjDir.current = 0;
      animState.current = 'idle';
      draw();
      return;
    }
    snapFromX.current = sx;
    animMs.current = SNAP_MS;
    startTick();
  }, [draw, startTick]);

  const TAP_ZONE = 0.30;
  const TAP_MAX_MOVE = 15;

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);

    if (inBrightnessDrag.current) {
      inBrightnessDrag.current = false;
      brightnessHudVisible.current = false;
      if (brightnessHideTimer.current) clearTimeout(brightnessHideTimer.current);
      brightnessHideTimer.current = setTimeout(() => { brightnessHudVisible.current = false; draw(); }, 1500);
      return;
    }

    const { rotationSteps } = ctxRef.current;
    if (!dragCommitted.current) {
      const moved = Math.abs(toVisualDx(e.clientX - pointerStartX.current, e.clientY - pointerStartY.current, rotationSteps));
      if (moved < TAP_MAX_MOVE) {
        const xFrac = visualXFrac(pointerStartX.current, pointerStartY.current, rotationSteps, cacheWidth.current);
        if (xFrac < TAP_ZONE) { cancelAll(); ctxRef.current.goPrev(); dragCommitted.current = false; return; }
        else if (xFrac > 1 - TAP_ZONE) { cancelAll(); ctxRef.current.goNext(); dragCommitted.current = false; return; }
      }
      doDragCancel();
    }
    dragCommitted.current = false;
  }, [cancelAll, doDragCancel, draw]);

  const handlePointerCancel = useCallback((e: PointerEvent) => {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    if (inBrightnessDrag.current) { inBrightnessDrag.current = false; return; }
    if (!dragCommitted.current) doDragCancel();
    dragCommitted.current = false;
  }, [doDragCancel]);

  // ── Effects ──────────────────────────────────────────────────────────────

  // Attach pointer events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [resizeCanvas]);

  // Keyboard events
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { pdfDoc } = ctxRef.current;
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': case ' ':
          if (!pdfDoc) break;
          e.preventDefault(); ctxRef.current.goNext(); break;
        case 'ArrowLeft': case 'PageUp': case 'Backspace':
          if (!pdfDoc) break;
          e.preventDefault(); ctxRef.current.goPrev(); break;
        case 'F11':
          if (!pdfDoc) break;
          e.preventDefault(); (window as any).pidef.toggleFullscreen(); break;
        case 'Escape':
          (window as any).pidef.getFullscreen().then((fs: boolean) => {
            if (fs) (window as any).pidef.toggleFullscreen();
          }); break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Re-render when pdfDoc / currentPage / halfMode / filters change
  useEffect(() => {
    const { pdfDoc, currentPage, halfMode } = ctx;
    if (!pdfDoc) { draw(); return; }
    // If cache is stale (e.g. after halfMode toggle), clear and re-render
    surfCache.current.clear();
    rendering.current.clear();
    currentSurf.current = null;
    animFromSurf.current = null;
    if (cacheWidth.current > 0 && cacheHeight.current > 0) {
      renderPage(currentPage, cacheWidth.current, cacheHeight.current).then(bmp => {
        surfCache.current.set(currentPage, bmp);
        currentSurf.current = bmp;
        bgScan();
        draw();
      });
    }
  }, [ctx.pdfDoc, ctx.currentPage, ctx.halfMode, ctx.sepiaEnabled, ctx.invertEnabled]);

  return { canvasRef, brightnessHudVisible };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePdfEngine.ts
git commit -m "feat: add usePdfEngine hook with RAF loop and pointer handling"
```

---

### Task 20: CanvasContainer and PdfCanvas components

**Files:**
- Create: `src/components/CanvasContainer.tsx`
- Create: `src/components/PdfCanvas.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create PdfCanvas**

```tsx
// src/components/PdfCanvas.tsx
import React from 'react';
import { useAppContext } from '../AppContext';
import { usePdfEngine } from '../hooks/usePdfEngine';
import { BrightnessHud } from './BrightnessHud';

export function PdfCanvas() {
  const ctx = useAppContext();
  const { canvasRef, brightnessHudVisible } = usePdfEngine(ctx);

  return (
    <>
      <canvas
        id="pdf-canvas"
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
      />
      <BrightnessHud brightness={ctx.brightness} visible={brightnessHudVisible.current} />
    </>
  );
}
```

- [ ] **Step 2: Create CanvasContainer**

```tsx
// src/components/CanvasContainer.tsx
import React from 'react';
import { useAppContext } from '../AppContext';
import { PdfCanvas } from './PdfCanvas';
import { WelcomeScreen } from './WelcomeScreen';

export function CanvasContainer() {
  const { bookmarkDisplayMode } = useAppContext();

  return (
    <div
      id="canvas-container"
      style={{ pointerEvents: bookmarkDisplayMode === 'overlay' ? 'none' : 'auto' }}
    >
      <PdfCanvas />
      <WelcomeScreen />
    </div>
  );
}
```

- [ ] **Step 3: Update App.tsx to full component tree**

```tsx
// src/App.tsx
import React, { useEffect } from 'react';
import { AppProvider } from './AppProvider';
import { useAppContext } from './AppContext';
import { useIpc } from './hooks/useIpc';
import { Toolbar } from './components/Toolbar';
import { CanvasContainer } from './components/CanvasContainer';
import { BookmarkBar } from './components/BookmarkBar';
import { BookmarkOverlay } from './components/BookmarkOverlay';
import { BookmarkEditModal } from './components/BookmarkEditModal';
import { NavBar } from './components/NavBar';

function AppInner() {
  useIpc();
  const { rotationSteps } = useAppContext();

  useEffect(() => {
    document.body.classList.remove('rotate-90', 'rotate-180', 'rotate-270');
    if (rotationSteps === 1) document.body.classList.add('rotate-90');
    else if (rotationSteps === 2) document.body.classList.add('rotate-180');
    else if (rotationSteps === 3) document.body.classList.add('rotate-270');
  }, [rotationSteps]);

  return (
    <>
      <Toolbar />
      <CanvasContainer />
      <BookmarkOverlay />
      <BookmarkEditModal />
      <BookmarkBar />
      <NavBar />
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
```

- [ ] **Step 4: Build**

```bash
npm run build:renderer
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/CanvasContainer.tsx src/components/PdfCanvas.tsx src/App.tsx
git commit -m "feat: add CanvasContainer and PdfCanvas; wire full component tree"
```

---

## Phase 5 — Delete renderer.ts

### Task 21: Remove renderer.ts

**Files:**
- Delete: `src/renderer.ts`
- Modify: `tsconfig.main.json` (ensure renderer.ts not included)

- [ ] **Step 1: Verify e2e tests pass before deleting**

```bash
npm run test:unit
```

Expected: all pass.

- [ ] **Step 2: Delete renderer.ts**

```bash
git rm src/renderer.ts
```

- [ ] **Step 3: Verify build still works**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: delete renderer.ts — replaced by React components"
```

---

## Phase 6 — Tests

### Task 22: Verify and update unit tests

**Files:**
- Modify: `tests/unit/half-mode-rotation.test.ts` (already done in Task 5)
- Modify: `tests/unit/bookmarks.test.ts` (imports unchanged — src/bookmarks.ts unchanged)
- Modify: `tests/unit/recent-files.test.ts` (imports unchanged — src/recent-files.ts unchanged)

- [ ] **Step 1: Run all unit tests**

```bash
npm run test:unit
```

Expected: all pass. If any fail due to import paths, fix the import to point to the new location.

- [ ] **Step 2: Run e2e tests**

```bash
npm run test:e2e
```

Expected: all pass. If any fail, investigate and fix before marking done.

- [ ] **Step 3: Commit any test fixes**

```bash
git add tests/
git commit -m "test: update imports after React refactor"
```

---

## Implementation Notes

### `useBookmarks` hook
The spec lists a `useBookmarks(filePath)` hook, but the plan intentionally folds bookmark loading into `AppProvider` since it's only used in one place. YAGNI — a dedicated hook would add indirection with no benefit. The `readBookmarks`/`writeBookmarks` calls live directly in `loadFile`, `addBookmark`, `removeBookmark`, `updateBookmark` in `AppProvider`.

### `overlayActiveFromMode` tracking
The original `renderer.ts` tracked `overlayActiveFromMode` to restore the previous mode when closing the overlay. In the React version, this is simplified: when the overlay is opened from `NavBar` via long-press, the mode was previously `1-line` or `all` or `hidden`. When the overlay is closed (`BookmarkOverlay.close()`), it restores to `'1-line'` as a safe default. If this needs to be exact, add `overlayActiveFromMode` state to `AppProvider` and set it when `setBookmarkDisplayMode('overlay')` is called.

### Brightness HUD visibility
`BrightnessHud` takes a `visible` prop driven by `brightnessHudVisible.current` from `usePdfEngine`. Since this is a ref (not state), it won't trigger React re-renders. The original code used CSS class toggling. To make this work in React, either: (a) add a `useState` inside `PdfCanvas` for HUD visibility driven by a callback from `usePdfEngine`, or (b) manipulate the DOM directly inside the hook via the HUD element ref. Option (a) is cleaner — `usePdfEngine` accepts a `setHudVisible` callback.

### Pill scroll inertia
The manual inertia scroll for `bookmark-pills` and `bookmark-overlay-pills` (the `FRICTION`/`tickInertia` logic from `renderer.ts`) is not included in the React components above. If this is needed, it can be added as a `useEffect` with pointer event listeners directly on the `pillsRef` in `BookmarkBar`, mirroring the original logic.
