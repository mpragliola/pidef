# Half Mode — Design Spec

**Date:** 2026-04-16  
**Status:** Approved

## Overview

A new visualization mode ("Half mode") where each PDF page is split into two virtual halves — top and bottom — relative to the current surface rotation. Each half occupies the full screen and navigation treats them as separate steps. Toggled by a button; persisted per file.

---

## 1. State & Virtual Navigation

Two new state variables in `renderer.ts`:

```ts
let halfMode = false;
let halfPage: 'top' | 'bottom' = 'top';
```

The current reading position is `(currentPage, halfPage)`. All navigation routes through `goVirtualNext()` / `goVirtualPrev()`:

| Current position | Action | Result | Animation |
|-----------------|--------|--------|-----------|
| `(N, top)` | next | `(N, bottom)` | vertical pan |
| `(N, bottom)` | next | `(N+1, top)` | horizontal slide |
| `(N, bottom)` | prev | `(N, top)` | vertical pan |
| `(N, top)` | prev | `(N-1, bottom)` | horizontal slide |

- `goFirst()` / `goLast()` always land on `top` of first/last page.
- `goToPage()` always lands on `top` of the target page.
- Page slider operates on real PDF page numbers only.
- Bounds: at page 0 `top`, prev does nothing. At last page `bottom`, next does nothing.

---

## 2. Rendering

In Half mode, `renderPage()` renders each page into a surface whose **long axis is doubled** relative to the canvas:

- `rotationSteps` 0 or 2 (portrait on screen): surface is `(canvasW, canvasH * 2)`
- `rotationSteps` 1 or 3 (landscape on screen): surface is `(canvasW * 2, canvasH)`

This ensures the split always follows the visual reading direction regardless of rotation. The result is a full-page `ImageBitmap` cached normally under `pageIdx`.

`draw()` uses the 5-argument `ctx.drawImage()` form to clip to the relevant half:

For `rotationSteps` 0/2 (vertical split):
- `top` half: source `(0, 0, w, fullH/2)` → destination `(0, 0, w, h)`
- `bottom` half: source `(0, fullH/2, w, fullH/2)` → destination `(0, 0, w, h)`

For `rotationSteps` 1/3 (horizontal split, left=top, right=bottom):
- `top` half: source `(0, 0, fullW/2, h)` → destination `(0, 0, w, h)`
- `bottom` half: source `(fullW/2, 0, fullW/2, h)` → destination `(0, 0, w, h)`

Cache key: unchanged (`pageIdx` only). One full-page bitmap per page; both halves derived from it at draw time.

`bgScan()` and `prerenderAsync()` are unchanged in logic; they just render with the new doubled dimension.

Cache invalidation: switching half mode on/off clears `surfCache` and `rendering`, same as a resize.

---

## 3. Animations

### Horizontal slide (page change)
Unchanged. `animFromSurf` and `currentSurf` are full-page bitmaps; `draw()` clips them to the appropriate half during the animation. No changes to `beginPageChange()`.

### Vertical pan (half change, new)
New state value: `'half-pan'` added to the `State` type.

New constant: `HALF_PAN_MS = 100` (fast pan).

New function `beginHalfChange(direction: 1 | -1)`:
- `cancelAll()`
- `animFromSurf = currentSurf` (already cached, same page)
- `halfPage` is updated to the new half
- `currentSurf` = same cached bitmap (same page, no re-render needed)
- `animDir = direction` (used for vertical direction: +1 = pan down-to-up, -1 = pan up-to-down)
- `animMs = HALF_PAN_MS`
- `state = 'half-pan'`
- `startTick()`

In `draw()`, the `'half-pan'` branch:
- Slides `animFromSurf` out vertically (`-animDir * ease * h` offset)
- Slides `currentSurf` in from the opposite direction (`animDir * (1 - ease) * h` offset)
- Both clips target the respective half of each surface

### Drag/snap in Half mode
A horizontal drag that crosses `THRESHOLD_PX` evaluates `goVirtualNext/Prev`. If the resulting navigation is a half change (not a page change), the committed drag fires `beginHalfChange()` instead of `beginPageChange()`. The drag visual (page following finger horizontally) is unchanged — only the committed action differs.

---

## 4. Persistence & UI

### FileRecord extension
`FileRecord` in `recent-files.ts` and `renderer.ts` gains an optional field:

```ts
interface FileRecord {
  path: string;
  page: number;
  halfMode?: boolean;
}
```

On file open: `halfMode` is restored from the record; `halfPage` always resets to `'top'`.

A new IPC call `updateFileHalfMode(path, halfMode)` is added (or `updateFilePage` is extended) to persist the toggle. Called whenever `halfMode` is toggled.

### Button
A `btn-half` button added to the nav bar right side, after `btn-sharpen` and before `btn-toggle-bookmarks-nav`. Label: `½`. Toggles `halfMode`, clears surface cache, re-renders current page, saves to file record. Gets `.active` class when half mode is on.

### Page label
Unchanged — shows real PDF page numbers (`Page N / M`). No half indicator.

---

## Files Affected

| File | Change |
|------|--------|
| `src/renderer.ts` | Main implementation: new state, rendering, animations, navigation |
| `src/index.html` | Add `btn-half` button to nav bar |
| `src/recent-files.ts` | Add `halfMode` field to `FileRecord` |
| `src/main.ts` | Add IPC handler for persisting `halfMode` |
| `src/preload.ts` | Expose new IPC call via context bridge |
| `src/styles.scss` | Style `btn-half` active state if needed |
