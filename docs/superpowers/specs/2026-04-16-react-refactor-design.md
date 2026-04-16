# Pidef React Refactor — Design Spec

**Date:** 2026-04-16  
**Status:** Approved

## Overview

Convert Pidef's renderer from a monolithic ~1750-line `renderer.ts` (vanilla TypeScript, imperative DOM) to a React + TypeScript frontend. All existing functionality is preserved exactly. No new UI is added. The migration is incremental — the app stays runnable at every step.

---

## Decisions

| Topic | Decision |
|---|---|
| React scope | Full — React owns all state; canvas is a `useRef` |
| Animation hot path | `useRef` for RAF/drag state; `useState` for stable state |
| State sharing | Context for global/shared state; props for component-local state |
| Build tool | Vite (`@vitejs/plugin-react`) for renderer; `tsc` for main/preload |
| Logic split | Stateful logic in custom hooks; pure functions in `src/lib/` modules |
| Migration strategy | Incremental (Approach B) — phases, e2e tests green throughout |

---

## Component Tree

```
<App>
  <AppProvider>                ← all useState/useRef, exposes AppContext
    <Toolbar />                ← open, close, rotate, fullscreen, title
    <CanvasContainer>
      <PdfCanvas />            ← canvas ref + pointer/RAF logic via usePdfEngine()
      <BrightnessHud />        ← presentational, reads brightness from context
      <WelcomeScreen />        ← shown when no PDF; renders recent files list
    </CanvasContainer>
    <BookmarkBar />            ← 1-line / all / hidden modes + pill list
    <BookmarkOverlay />        ← full-screen overlay mode
    <BookmarkEditModal />      ← edit/delete modal
    <NavBar />                 ← first/prev/slider/next/last + sepia/invert/half/bookmarks
  </AppProvider>
</App>
```

Each component maps 1:1 to an existing HTML section in `index.html`. No new UI surfaces are introduced.

---

## Context Shape

```ts
// Stable state — useState, triggers re-renders
interface AppState {
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

// Actions — stable refs via useCallback
interface AppActions {
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
```

Component-local state (armed pill double-tap, long-press timer, inline add-bookmark input value) stays in component `useState` and is never promoted to context.

---

## Hooks (`src/hooks/`)

| Hook | Responsibility |
|---|---|
| `usePdfEngine(state, actions)` | All `useRef` hot-path: `dragX`, `animT`, `animStartTime`, `rafId`, `surfCache`, `rendering`, `currentSurf`, `animFromSurf`, `cacheWidth/Height`. RAF loop, pointer event handlers, canvas resize observer. Returns `canvasRef`. |
| `useBookmarks(filePath)` | Loads/saves bookmarks via `pidef` IPC. Exposes `nearestBookmarkIndex`. |
| `useLocalStorage(key, default)` | Thin read/write wrapper for `localStorage`. Used during init for persisted prefs. |
| `useIpc()` | Wires `pidef.onOpenFile` and `pidef.onToggleFullscreen` listeners. Calls actions from context. |

---

## Pure Utilities (`src/lib/`)

| Module | Contents |
|---|---|
| `pdf-geometry.ts` | `halfSrcRect()`, `toVisualDx()`, `toVisualDy()`, `isInBrightnessZone()`, `visualXFrac()` |
| `bookmark-utils.ts` | `findNearestBookmark()`, `formatPillContent()`, `extractLeadingChars()` |
| `easing.ts` | `easeOut()` |

Existing `src/bookmarks.ts` and `src/recent-files.ts` are already pure — no changes needed.

---

## Migration Sequence

### Phase 1 — Tooling
- Add `react`, `react-dom`, `@types/react`, `@types/react-dom`, `vite`, `@vitejs/plugin-react` as dev dependencies
- Add `vite.config.ts` configured for Electron renderer (no server, just build)
- Update `package.json` build script: `vite build` for renderer, `tsc` for main/preload
- Update `.gitignore` for Vite artifacts (`dist/`, `.vite/`)
- `renderer.ts` still runs unchanged at end of this phase

### Phase 2 — Extract pure utilities
- Move pure functions out of `renderer.ts` into `src/lib/pdf-geometry.ts`, `src/lib/bookmark-utils.ts`, `src/lib/easing.ts`
- Update `renderer.ts` to import from `src/lib/`
- Update unit test imports to point at new paths
- All existing unit tests pass at end of this phase

### Phase 3 — React scaffold
- Add `src/AppContext.ts`, `src/AppProvider.tsx`, `src/App.tsx`, `src/index.tsx`
- `AppProvider` holds all stable state as `useState`; initial values read from `localStorage` via `useLocalStorage`
- `usePdfEngine`, `useBookmarks`, `useIpc` hooks created — initially thin wrappers delegating to the same imperative logic
- `index.html` entry point changed from `renderer.js` to Vite-built `index.tsx`
- `renderer.ts` becomes dead code (not yet deleted)
- App renders and opens PDFs at end of this phase

### Phase 4 — Components
Build and wire up components one at a time in this order (each must pass e2e tests before moving on):
1. `<Toolbar />`
2. `<NavBar />`
3. `<WelcomeScreen />`
4. `<BrightnessHud />`
5. `<BookmarkBar />`
6. `<BookmarkOverlay />`
7. `<BookmarkEditModal />`
8. `<CanvasContainer />` (shell around canvas, welcome screen, brightness HUD)
9. `<PdfCanvas />` (last — most complex, owns `usePdfEngine`)

### Phase 5 — Delete renderer.ts
- All components wired, e2e tests pass
- Delete `renderer.ts`
- Remove any dead imports

### Phase 6 — Tests
- Update unit test imports to `src/lib/` paths (if not done in Phase 2)
- Add hook-level tests where valuable (e.g. `useBookmarks`)
- Full e2e suite passes

---

## File Structure (post-migration)

```
src/
  index.tsx                  ← Vite entry point
  App.tsx
  AppContext.ts
  AppProvider.tsx
  components/
    Toolbar.tsx
    NavBar.tsx
    CanvasContainer.tsx
    PdfCanvas.tsx
    BrightnessHud.tsx
    WelcomeScreen.tsx
    BookmarkBar.tsx
    BookmarkOverlay.tsx
    BookmarkEditModal.tsx
  hooks/
    usePdfEngine.ts
    useBookmarks.ts
    useLocalStorage.ts
    useIpc.ts
  lib/
    pdf-geometry.ts
    bookmark-utils.ts
    easing.ts
  bookmarks.ts               ← unchanged
  recent-files.ts            ← unchanged
  main.ts                    ← unchanged
  preload.ts                 ← unchanged
  styles.scss                ← unchanged
```

---

## What Does Not Change

- `src/main.ts` — Electron main process, no changes
- `src/preload.ts` — IPC bridge, no changes
- `src/bookmarks.ts`, `src/recent-files.ts` — pure modules, no changes
- `src/styles.scss` — all CSS classes/IDs stay identical; components use the same class names
- The `PidefAPI` interface and all IPC contracts — no changes
- The rotation model (CSS-only, whole-body transform) — no changes
- All animation constants (`ANIM_MS`, `SNAP_MS`, etc.) — moved into `usePdfEngine`, same values
- Touch behavior, drag thresholds, brightness zone logic — identical

---

## Testing Strategy

- **Unit tests:** Pure functions in `src/lib/` are directly testable with vitest, no DOM needed. Existing tests for `bookmarks.ts`, `recent-files.ts`, `half-mode-rotation.ts`, `pagination.ts`, `bookmark-modes.ts` continue to pass throughout.
- **E2e tests:** Playwright suite runs after each Phase 4 component is wired. Full suite must pass before Phase 5.
- **No new e2e tests** are required by this refactor — behavior is unchanged.
