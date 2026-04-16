/**
 * Coordinate-mapping helpers for the rotatable canvas UI.
 *
 * ## Rotation model
 *
 * The entire pidef UI (canvas, toolbar, overlays) is rotated as a single unit
 * by applying a CSS `transform: rotate(Ndeg)` on `<body>`. This means:
 *
 *   - PDF rendering and canvas bitmaps are completely unaware of rotation.
 *     They always render as if `rotationSteps === 0`.
 *   - "Visual space" is the coordinate system the *user* perceives on screen
 *     after the CSS rotation is applied.
 *   - "Screen space" (a.k.a. client space) is the raw coordinate system that
 *     the browser reports in pointer events (`clientX`, `clientY`). Because the
 *     DOM is rotated, screen-space axes no longer align with visual axes.
 *
 * `rotationSteps` encodes the rotation as an integer number of 90° clockwise
 * turns:
 *
 *   0 → 0°    (no rotation — screen == visual)
 *   1 → 90°   (screen right = visual down)
 *   2 → 180°  (screen right = visual left)
 *   3 → 270°  (screen right = visual up)
 *
 * ## Why these helpers exist
 *
 * Pointer drag deltas arrive in screen space. Page-turn logic needs them in
 * visual space (a leftward visual swipe should always mean "go back", regardless
 * of how the device is physically oriented). Similarly, hit-tests like the
 * brightness control zone must be expressed in visual coordinates.
 *
 * All functions here are pure, stateless transforms — they take raw values and
 * a `rotationSteps` and return the remapped result. No side-effects, no state.
 */

/**
 * Width of the brightness-control tap zone in CSS pixels.
 *
 * When the user taps or touches near the "visual left" edge of the canvas
 * (after accounting for rotation), the interaction is interpreted as a
 * brightness adjustment rather than a page swipe. This constant defines how
 * many CSS pixels from that edge count as "in the zone".
 */
const BRIGHTNESS_ZONE_PX = 60;

/**
 * Returns the source rectangle (x, y, width, height) within a cached bitmap
 * that corresponds to the requested half of the page.
 *
 * In half-mode the PDF page is split into two logical halves ("top" and
 * "bottom") so that portrait-oriented content (e.g. sheet music) can be
 * navigated one half at a time on a landscape screen. The cache bitmap is
 * rendered at double height to hold both halves.
 *
 * When half-mode is disabled the full bitmap is returned unchanged.
 *
 * @param half        - Which logical half to display: `'top'` or `'bottom'`.
 * @param halfMode    - Whether half-mode is currently active.
 * @param cacheWidth  - Width of the offscreen cache bitmap in pixels.
 * @param cacheHeight - Height of one half of the offscreen cache bitmap in
 *                      pixels. The full double-height bitmap is `cacheHeight * 2`.
 * @returns           - A `[x, y, width, height]` tuple for use as a
 *                      `drawImage` source rectangle.
 */
export function halfSrcRect(
  half: 'top' | 'bottom',
  halfMode: boolean,
  cacheWidth: number,
  cacheHeight: number
): [number, number, number, number] {
  const w = cacheWidth;
  const h = cacheHeight;
  // When half-mode is off, expose the entire bitmap as-is.
  if (!halfMode) return [0, 0, w, h];
  // The full double-height bitmap spans cacheHeight * 2 rows.
  const fullH = h * 2;
  return half === 'top'
    ? [0, 0, w, fullH / 2]          // top half: rows 0 … (fullH/2 - 1)
    : [0, fullH / 2, w, fullH / 2]; // bottom half: rows (fullH/2) … (fullH - 1)
}

/**
 * Maps a raw screen-space pointer delta to its visual-space horizontal
 * (left/right) component.
 *
 * Because the whole UI is CSS-rotated, a pointer movement that is physically
 * "down" on screen may be perceived by the user as "right". This function
 * corrects for that so that drag-detection logic always works in the visual
 * reference frame the user sees.
 *
 * Mapping per rotation:
 *   - 0° (default): screen dx → visual dx  (axes align, no change)
 *   - 90° CW:       screen dy → visual dx  (screen down = visual right)
 *   - 180°:        -screen dx → visual dx  (screen right = visual left)
 *   - 270° CW:     -screen dy → visual dx  (screen up = visual right)
 *
 * @param dx            - Horizontal pointer delta in screen/client space (px).
 * @param dy            - Vertical pointer delta in screen/client space (px).
 * @param rotationSteps - Current UI rotation (0–3 clockwise 90° steps).
 * @returns             - Horizontal delta in visual space (px).
 */
export function toVisualDx(dx: number, dy: number, rotationSteps: 0 | 1 | 2 | 3): number {
  switch (rotationSteps) {
    case 1: return dy;   // 90° CW:  screen down  = visual right
    case 2: return -dx;  // 180°:    screen right = visual left
    case 3: return -dy;  // 270° CW: screen up    = visual right
    default: return dx;  // 0°:      axes are aligned
  }
}

/**
 * Maps a raw screen-space pointer delta to its visual-space vertical
 * (up/down) component.
 *
 * Counterpart to `toVisualDx`. Used wherever vertical visual movement matters
 * (e.g. brightness-zone drag tracking).
 *
 * Mapping per rotation:
 *   - 0° (default):  screen dy → visual dy  (axes align, no change)
 *   - 90° CW:       -screen dx → visual dy  (screen left = visual down)
 *   - 180°:         -screen dy → visual dy  (screen down = visual up)
 *   - 270° CW:       screen dx → visual dy  (screen right = visual down)
 *
 * @param dx            - Horizontal pointer delta in screen/client space (px).
 * @param dy            - Vertical pointer delta in screen/client space (px).
 * @param rotationSteps - Current UI rotation (0–3 clockwise 90° steps).
 * @returns             - Vertical delta in visual space (px).
 */
export function toVisualDy(dx: number, dy: number, rotationSteps: 0 | 1 | 2 | 3): number {
  switch (rotationSteps) {
    case 1: return -dx;  // 90° CW:  screen left  = visual down
    case 2: return -dy;  // 180°:    screen down  = visual up
    case 3: return dx;   // 270° CW: screen right = visual down
    default: return dy;  // 0°:      axes are aligned
  }
}

/**
 * Returns `true` when the pointer position falls within the brightness-control
 * tap zone at the "visual left" edge of the canvas.
 *
 * The brightness zone is always at the visual left edge regardless of
 * rotation. After CSS rotation the visual left edge maps to different screen
 * edges depending on `rotationSteps`:
 *   - 0°:   visual left  = screen left   → clientX < BRIGHTNESS_ZONE_PX
 *   - 90°:  visual left  = screen top    → clientY < BRIGHTNESS_ZONE_PX
 *   - 180°: visual left  = screen right  → clientX > (width - BRIGHTNESS_ZONE_PX)
 *   - 270°: visual left  = screen bottom → clientY > (height - BRIGHTNESS_ZONE_PX)
 *
 * IMPORTANT: `cacheWidth` and `cacheHeight` must be CSS display pixels
 * (`canvas.clientWidth` / `canvas.clientHeight`), NOT the physical bitmap
 * dimensions (`canvas.width` / `canvas.height` which are scaled by the device
 * pixel ratio). `clientX`/`clientY` are also CSS pixels, so the comparison
 * must use the same unit.
 *
 * @param clientX       - Pointer X position in CSS pixels (from pointer event).
 * @param clientY       - Pointer Y position in CSS pixels (from pointer event).
 * @param rotationSteps - Current UI rotation (0–3 clockwise 90° steps).
 * @param cacheWidth    - Canvas display width in CSS pixels.
 * @param cacheHeight   - Canvas display height in CSS pixels.
 * @returns             - `true` if the pointer is inside the brightness zone.
 */
export function isInBrightnessZone(
  clientX: number,
  clientY: number,
  rotationSteps: 0 | 1 | 2 | 3,
  cacheWidth: number,
  cacheHeight: number
): boolean {
  switch (rotationSteps) {
    case 1: return clientY < BRIGHTNESS_ZONE_PX;                      // 90° CW:  zone is at screen top
    case 2: return clientX > (cacheWidth - BRIGHTNESS_ZONE_PX);       // 180°:    zone is at screen right
    case 3: return clientY > (cacheHeight - BRIGHTNESS_ZONE_PX);      // 270° CW: zone is at screen bottom
    default: return clientX < BRIGHTNESS_ZONE_PX;                     // 0°:      zone is at screen left
  }
}

/**
 * Returns the pointer's visual-horizontal position as a fraction of the
 * canvas width (0 = visual left, 1 = visual right).
 *
 * Used to compute a brightness adjustment amount proportional to where along
 * the visual horizontal axis the user tapped/dragged inside the brightness
 * zone. Because the canvas is CSS-rotated, the axis that maps to "visual
 * horizontal" differs by rotation step.
 *
 * Note: `cacheWidth` here is the CSS-pixel width of the canvas, used as the
 * denominator to normalise the position to a [0, 1] fraction.
 *
 * @param clientX       - Pointer X position in CSS pixels.
 * @param clientY       - Pointer Y position in CSS pixels.
 * @param rotationSteps - Current UI rotation (0–3 clockwise 90° steps).
 * @param cacheWidth    - Canvas display width in CSS pixels (the normalisation
 *                        denominator; represents visual width after rotation).
 * @returns             - Fractional visual-horizontal position in [0, 1].
 */
export function visualXFrac(
  clientX: number,
  clientY: number,
  rotationSteps: 0 | 1 | 2 | 3,
  cacheWidth: number
): number {
  switch (rotationSteps) {
    case 1: return clientY / cacheWidth;                  // 90° CW:  visual x runs along screen Y axis
    case 2: return (cacheWidth - clientX) / cacheWidth;   // 180°:    visual x is screen X, mirrored
    case 3: return (cacheWidth - clientY) / cacheWidth;   // 270° CW: visual x runs along screen Y axis, mirrored
    default: return clientX / cacheWidth;                 // 0°:      visual x == screen x
  }
}
