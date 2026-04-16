/**
 * BrightnessHud.tsx
 *
 * A small vertical progress bar that appears on the left edge of the canvas
 * while the user is actively dragging in the brightness-adjustment zone
 * (the leftmost strip of the canvas). It gives immediate visual feedback of
 * the current brightness level.
 *
 * The HUD is purely presentational: it receives the current brightness value
 * and a visibility flag from its parent, and renders (or hides) accordingly.
 * It is always mounted in the DOM; the `visible` prop adds/removes the CSS
 * class that controls its opacity so the show/hide transition can be animated
 * with CSS alone.
 */

import React from 'react';

/** The lowest brightness multiplier the user can dial down to. */
const BRIGHTNESS_MIN = 0.1;

/** The highest brightness multiplier (1.0 = no dimming). */
const BRIGHTNESS_MAX = 1.0;

/**
 * Props for {@link BrightnessHud}.
 */
interface Props {
  /**
   * Current brightness multiplier, expected to be in the range
   * [BRIGHTNESS_MIN, BRIGHTNESS_MAX] (i.e. 0.1 – 1.0).
   */
  brightness: number;

  /**
   * Whether the HUD should be visible. Set to `true` while the user is
   * dragging in the brightness zone; `false` at all other times.
   * The CSS class `visible` is applied when this is `true`, allowing a
   * smooth fade-in/out transition to be defined in the stylesheet.
   */
  visible: boolean;
}

/**
 * BrightnessHud — transient overlay that shows the brightness level as a
 * vertical bar on the left edge of the canvas.
 *
 * The fill height is computed as a percentage of the bar's full height,
 * linearly mapped from the [BRIGHTNESS_MIN, BRIGHTNESS_MAX] range to [0, 100].
 */
export function BrightnessHud({ brightness, visible }: Props) {
  // Map the raw brightness value from its [MIN, MAX] domain to a [0, 100]
  // percentage so the CSS `height` property fills the bar proportionally.
  // When brightness === BRIGHTNESS_MIN the bar is empty (0 %);
  // when brightness === BRIGHTNESS_MAX it is full (100 %).
  const pct = ((brightness - BRIGHTNESS_MIN) / (BRIGHTNESS_MAX - BRIGHTNESS_MIN)) * 100;

  return (
    <div id="brightness-hud" className={visible ? 'visible' : ''}>
      <div id="brightness-fill" style={{ height: `${pct.toFixed(1)}%` }} />
    </div>
  );
}
