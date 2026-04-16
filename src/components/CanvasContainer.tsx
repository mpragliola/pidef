/**
 * CanvasContainer — the flex-filling middle section between the toolbar and nav bar.
 *
 * When the bookmark overlay is active, pointer events on the canvas are disabled
 * so taps pass through to the overlay backdrop instead of triggering page changes.
 *
 * Contains:
 *  - PdfCanvas (the rendering surface + brightness HUD)
 *  - WelcomeScreen (shown only when no PDF is open, rendered on top of canvas area)
 */
import React from 'react';
import { useAppContext } from '../AppContext';
import { PdfCanvas } from './PdfCanvas';
import { WelcomeScreen } from './WelcomeScreen';

export function CanvasContainer() {
  const { bookmarkDisplayMode } = useAppContext();

  return (
    <div
      id="canvas-container"
      // Disable pointer events on the canvas when the overlay is open so that
      // taps on the backdrop close the overlay rather than navigating pages.
      style={{ pointerEvents: bookmarkDisplayMode === 'overlay' ? 'none' : 'auto' }}
    >
      <PdfCanvas />
      <WelcomeScreen />
    </div>
  );
}
