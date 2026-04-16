# pidef

A minimal Electron PDF reader optimized for **Ubuntu Touchscreen Laptops** and touch-first navigation. Designed as a music note reader with fast, responsive swipe navigation and full-screen display for sheet music reading.

## Purpose

pidef is built specifically for touch-based document reading, particularly for musicians using sheet music and lead sheets. With optimized gesture support and full-screen presentation mode, it provides an ideal reading experience on touchscreen devices.

## Optimization for Touchscreen Laptops

**All UI elements must prioritize touch-friendly functionality and sizing:**

- **Minimum touch target size**: All buttons and interactive elements must be **minimum 44x44px** (preferably 48x48px) for reliable finger operation
- **Touch padding**: Adequate spacing between buttons to prevent accidental mis-taps
- **Swipe gestures**: Natural left/right swipes for page turning with intuitive visual feedback; no hover-dependent interactions
- **Full-screen mode**: Press F11 or tap the fullscreen button to maximize reading area and minimize UI clutter
- **Responsive animations**: 220ms page transitions keep the experience smooth and tactile on touchscreen devices
- **Snap-back feedback**: Visual feedback when you almost swipe a page (150ms snap-back animation) with no reliance on mouse hover states
- **Touch-friendly controls**: All navigation buttons and sliders must be operable with fingers; no small icons or precision clicks required

## Running

```bash
npm install
npm start
# or with a file:
npm run build && npx electron dist/main.js path/to/file.pdf

# Tests
npm test             # unit tests (vitest)
npm run test:unit    # unit tests only
npm run test:e2e     # e2e tests (playwright)
```

Requires Node.js 18+.

## Architecture

Electron app with three source files:

- **`src/main.ts`** — Electron main process. Creates the `BrowserWindow`, handles file dialogs, fullscreen toggle, and CLI file argument via IPC.
- **`src/preload.ts`** — context bridge exposing `window.pidef` API (file dialog, fullscreen, IPC listeners) to the renderer.
- **`src/renderer.ts`** — all PDF rendering + animation logic. Uses `pdfjs-dist` to render pages into `OffscreenCanvas`/`ImageBitmap` objects that are blitted onto the visible `<canvas>` each frame. Animation is driven by `requestAnimationFrame`.

Supporting files:
- **`src/index.html`** — HTML shell with toolbar, canvas container, and nav bar.
- **`src/styles.scss`** — all styling (compiled to `dist/styles.css`).
- **`src/bookmarks.ts`** — bookmark management logic (add, remove, list, persist).
- **`src/recent-files.ts`** — recent files list persistence and management.

### State machine (renderer)

```
IDLE      → static current page
DRAGGING  → pointer down, page follows dx
SNAP      → released below threshold, snapping back
ANIMATING → page change committed; cross-fade + slide
```

**Half-mode**: When active, the page is split into left/right halves. Navigation cycles through halves before turning pages. Two surfaces are rendered; clip rect and half-pan offset control which half is visible. `halfMode` and `activeHalf` state are persisted across file reloads.

## Key constants

| Name | Default | Purpose |
|------|---------|---------|
| `ANIM_MS` | 220 ms | Slide animation duration |
| `SNAP_MS` | 150 ms | Snap-back animation duration |
| `THRESHOLD_PX` | 100 px | Horizontal pixels to commit a page change |
| `SLIDE_PX` | 40 px | Incoming page slides this many px before settling |
| `PRERENDER_FWD` | 2 | Pages ahead to pre-render in background |
| `halfMode` | false | Split page into two halves for portrait-oriented content |

## Rotation model

`rotationSteps` (0–3) drives a CSS `transform: rotate(Ndeg)` on `<body>`. The **entire UI rotates as a unit** — canvas bitmaps, surface rendering, and all PDF logic are completely unaffected. There is no axis-switching, no width/height swap, no different split direction per rotation.

**The only places `rotationSteps` matters:**
1. Applying the CSS class (`rotate-90` / `rotate-180` / `rotate-270`) via `applyUiRotation()`
2. Mapping screen-space pointer deltas to visual deltas (`toVisualDx`, `toVisualDy`)
3. Repositioning `position: fixed` UI panels that must track the "visual" edges (e.g. the bookmark overlay)

**Never** branch on `rotationSteps` inside surface/canvas rendering or `halfSrcRect` — it's wrong and will cause bugs.

### `position: fixed` overlays

Because the **entire UI** rotates as a single CSS transform on `<body>`, every element — including `position: fixed` ones — lives in the already-rotated coordinate space. "Visual right" is always CSS `right: 0`. No per-rotation repositioning is needed. Just use normal CSS as if there were no rotation.

## Navigation

| Input | Action |
|-------|--------|
| Swipe left / right (≥ 100 px) | Next / prev page |
| Right arrow, Page Down, Space | Next page |
| Left arrow, Page Up, Backspace | Prev page |
| F11 | Toggle fullscreen |
| Escape | Exit fullscreen |
| Ctrl+O | Open file dialog |

# Rules for you

- don't build or test npm. Ask me to do it separately in the terminal, so we don't waste tokens
- don't take my solutions for granted. Ask question to refine the scope and propose better solutions when available
- after each change, evaluate always if you have to do related changes to:
  - ignore files (.gitignore, .claudeignore, ...)
  - env files
  - README and documentation files
  - test cases (add new cases, modify existing when relevant, remove obsolete cases)