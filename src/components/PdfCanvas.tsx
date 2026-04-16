/**
 * PdfCanvas — the main rendering surface.
 *
 * Owns the <canvas> element and wires it to the usePdfEngine hook, which
 * drives all PDF rendering, animation, and pointer gesture handling.
 *
 * BrightnessHud is co-located here because its visibility is driven by the
 * same pointer state that usePdfEngine tracks (brightness drag zone).
 */
import React, { useState, useCallback } from 'react';
import { useAppContext } from '../AppContext';
import { usePdfEngine } from '../hooks/usePdfEngine';
import { BrightnessHud } from './BrightnessHud';

export function PdfCanvas() {
  const ctx = useAppContext();

  // Brightness HUD visibility is driven by usePdfEngine (which detects the
  // brightness drag zone) and surfaced here as React state so BrightnessHud
  // re-renders when it changes.
  const [hudVisible, setHudVisible] = useState(false);

  // Stable callback passed to usePdfEngine so it can signal HUD show/hide
  // without triggering unnecessary re-renders of the hook itself.
  const handleHudChange = useCallback((visible: boolean) => {
    setHudVisible(visible);
  }, []);

  const { canvasRef } = usePdfEngine(ctx, handleHudChange);

  return (
    <>
      {/* The canvas fills its container; touch-action:none disables browser
          native scroll/zoom so our pointer handlers get all events */}
      <canvas
        id="pdf-canvas"
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
      />
      <BrightnessHud brightness={ctx.brightness} visible={hudVisible} />
    </>
  );
}
