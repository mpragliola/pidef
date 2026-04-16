/**
 * App.tsx — root React entry point.
 *
 * Two-component structure
 * ───────────────────────
 * `App` (outer shell)
 *   └─ `AppProvider`  — provides AppContext with all shared state
 *       └─ `AppInner` — actual UI; consumes AppContext via useAppContext()
 *
 * Why the split?  `useAppContext()` (and all other context hooks) must be
 * called from a component that is rendered *inside* the corresponding
 * `<Provider>`.  If `App` called `useAppContext()` directly, it would throw
 * because it is the component that *renders* the Provider — it is not yet
 * inside it.  `AppInner` sits one level down, safely inside the Provider tree.
 */

// src/App.tsx
import React, { useEffect } from 'react';
import { AppProvider } from './AppProvider';
import { useAppContext } from './AppContext';
import { useIpc } from './hooks/useIpc';
import { Toolbar } from './components/Toolbar';
import { NavBar } from './components/NavBar';
import { BookmarkBar } from './components/BookmarkBar';
import { BookmarkOverlay } from './components/BookmarkOverlay';
import { BookmarkEditModal } from './components/BookmarkEditModal';

/**
 * AppInner contains the real application UI.
 *
 * It must live inside `<AppProvider>` so that `useAppContext()` and
 * `useIpc()` (which also reads context) work correctly.
 *
 * Component tree rendered here (top → bottom visually):
 *   Toolbar → BookmarkOverlay → BookmarkEditModal → BookmarkBar → NavBar
 * The PDF canvas itself is rendered by the legacy renderer (renderer.ts) into
 * a `<canvas>` element that already exists in index.html; React does not
 * own that element.
 */
function AppInner() {
  useIpc();
  const { rotationSteps } = useAppContext();

  /**
   * Sync the CSS rotation class on `document.body` whenever `rotationSteps`
   * changes.
   *
   * We apply the class to `document.body` (not to a React element) because
   * rotation is a whole-UI CSS transform — `transform: rotate(Ndeg)` on
   * `<body>` rotates every element in the app as a single unit, including the
   * PDF canvas, toolbar, nav bar, and all overlays.  There is no per-component
   * rotation logic; a single class on the root element is the correct and
   * minimal approach.
   */
  useEffect(() => {
    document.body.classList.remove('rotate-90', 'rotate-180', 'rotate-270');
    if (rotationSteps === 1) document.body.classList.add('rotate-90');
    else if (rotationSteps === 2) document.body.classList.add('rotate-180');
    else if (rotationSteps === 3) document.body.classList.add('rotate-270');
  }, [rotationSteps]);

  return (
    <>
      <Toolbar />
      <BookmarkOverlay />
      <BookmarkEditModal />
      <BookmarkBar />
      <NavBar />
    </>
  );
}

/**
 * App is the top-level exported component mounted by the React entry point.
 *
 * Its only responsibility is to wrap `AppInner` in `AppProvider` so that the
 * entire component tree has access to application state via context.
 */
export function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
