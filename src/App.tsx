/**
 * App.tsx — root of the React component tree.
 *
 * Split into two components:
 *  - App: mounts AppProvider (the context/state layer). Renders nothing itself.
 *  - AppInner: the actual UI. Must live inside AppProvider to access context.
 *
 * The CSS rotation (rotate-90/180/270 classes on <body>) is applied here via a
 * useEffect because the rotation is a whole-UI CSS transform, not a per-component
 * concern — it belongs at the root.
 */
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

/**
 * AppInner — rendered inside AppProvider so it can access AppContext.
 *
 * Responsible for:
 * - Wiring Electron IPC listeners (useIpc)
 * - Applying CSS rotation classes to <body>
 * - Rendering the full component layout in document order
 */
function AppInner() {
  useIpc();
  const { rotationSteps } = useAppContext();

  // Apply CSS rotation to <body> so the entire UI rotates as one unit.
  // This is how Pidef supports touchscreen laptops that can't rotate the OS display.
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
      {/* Overlays and modals rendered outside CanvasContainer so they sit above
          the canvas in z-order without being clipped by the container */}
      <BookmarkOverlay />
      <BookmarkEditModal />
      <BookmarkBar />
      <NavBar />
    </>
  );
}

/**
 * App — the top-level component.
 *
 * Wraps everything in AppProvider so the full state/action API is available
 * to all descendants via useAppContext().
 */
export function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
