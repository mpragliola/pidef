# Half-mode position preservation on rotation

**Date:** 2026-04-16  
**Status:** Approved

## Problem

When half-mode is active and the user rotates the page, `halfPage` (`'top'`/`'bottom'`) is not remapped to the new orientation. The labels `'top'` and `'bottom'` refer to surface-space positions that change meaning when the split axis changes:

- Portrait (rotationSteps 0 or 2): split is vertical → `'top'` = upper half, `'bottom'` = lower half
- Landscape (rotationSteps 1 or 3): split is horizontal → `'top'` = left half, `'bottom'` = right half

After rotation, `halfPage` keeps its old value but the display logic interprets it under the new axis, so the wrong half is shown.

## Goal

Preserve the user's visual position through rotation. If the user is viewing the upper portion of a portrait page and rotates 90° CW, they should see the right portion of the landscape view (where the upper content now lives), not the left.

## Spatial mapping

| Previous axis | Rotation | halfPage before | halfPage after |
|---------------|----------|-----------------|----------------|
| portrait      | CW (+1)  | top             | bottom         |
| portrait      | CW (+1)  | bottom          | top            |
| portrait      | CCW (-1) | top             | top            |
| portrait      | CCW (-1) | bottom          | bottom         |
| landscape     | CW (+1)  | top (left)      | top            |
| landscape     | CW (+1)  | bottom (right)  | bottom         |
| landscape     | CCW (-1) | top (left)      | bottom         |
| landscape     | CCW (-1) | bottom (right)  | top            |

**Rule:** flip `halfPage` when rotating CW from portrait, or CCW from landscape. Keep it otherwise.

## Implementation

### New function: `remapHalfOnRotation`

```ts
function remapHalfOnRotation(prevSteps: number, delta: 1 | -1): void {
  if (!halfMode) return;
  const prevIsPortrait = prevSteps % 2 === 0; // rotationSteps 0 or 2
  const shouldFlip = (prevIsPortrait && delta === 1) || (!prevIsPortrait && delta === -1);
  if (shouldFlip) {
    halfPage = halfPage === 'top' ? 'bottom' : 'top';
    animFromHalf = animFromHalf === 'top' ? 'bottom' : 'top';
  }
}
```

`animFromHalf` is also remapped so any in-flight animation doesn't flash the wrong half.

### Call sites

Both rotate button handlers in `renderer.ts`, called **before** `rotationSteps` is updated:

**CW handler:**
```ts
remapHalfOnRotation(rotationSteps, 1);
rotationSteps = (rotationSteps + 1) % 4;
```

**CCW handler:**
```ts
remapHalfOnRotation(rotationSteps, -1);
rotationSteps = (rotationSteps + 3) % 4;
```

## Files changed

- `src/renderer.ts` — add `remapHalfOnRotation`, call it in both rotate handlers

## Out of scope

- No change to `halfSrcRect` or surface rendering logic
- No change to how `halfPage` is persisted or restored on file load
- No UI changes
