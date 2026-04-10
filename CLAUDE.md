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
```

## Dependencies

```bash
npm install
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

### State machine (renderer)

```
IDLE      → static current page
DRAGGING  → pointer down, page follows dx
SNAP      → released below threshold, snapping back
ANIMATING → page change committed; cross-fade + slide
```

## Key constants

| Name | Default | Purpose |
|------|---------|---------|
| `ANIM_MS` | 220 ms | Slide animation duration |
| `SNAP_MS` | 150 ms | Snap-back animation duration |
| `THRESHOLD_PX` | 100 px | Horizontal pixels to commit a page change |
| `SLIDE_PX` | 40 px | Incoming page slides this many px before settling |
| `PRERENDER_FWD` | 2 | Pages ahead to pre-render in background |

## Navigation

| Input | Action |
|-------|--------|
| Swipe left / right (≥ 100 px) | Next / prev page |
| Right arrow, Page Down, Space | Next page |
| Left arrow, Page Up, Backspace | Prev page |
| F11 | Toggle fullscreen |
| Escape | Exit fullscreen |
| Ctrl+O | Open file dialog |

## Use Case: Music Note Reader

pidef excels as a sheet music reader for musicians:

- **Hands-free**: Swipe to turn pages without needing to press buttons
- **Full-screen display**: Maximize sheet music visibility by toggling fullscreen (F11)
- **Quick page navigation**: Buttons at the bottom for precise page control during practice
- **Smooth animations**: Reduced motion fatigue during long practice sessions
- **Touch-optimized**: Works seamlessly on Ubuntu touchscreen laptops and tablets
