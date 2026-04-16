# Half-mode rotation position preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the user's visual half-mode position when rotating the page, so the same content area stays visible after rotation instead of jumping to the wrong half.

**Architecture:** Add a pure `remapHalfOnRotation(prevSteps, delta)` function in `renderer.ts` that flips `halfPage` and `animFromHalf` when the rotation direction would move the content to the other half. Call it in both rotate button handlers before updating `rotationSteps`.

**Tech Stack:** TypeScript, Vitest (unit tests)

---

## Files

- Modify: `src/renderer.ts` — add `remapHalfOnRotation`, call in both rotate handlers
- Create: `tests/unit/half-mode-rotation.test.ts` — unit tests for the remap logic

---

### Task 1: Write failing unit tests for `remapHalfOnRotation`

**Files:**
- Create: `tests/unit/half-mode-rotation.test.ts`

The function signature to test:

```ts
remapHalfOnRotation(
  prevSteps: number,       // rotationSteps BEFORE the rotation
  delta: 1 | -1,           // +1 = CW, -1 = CCW
  halfPage: 'top' | 'bottom',
  animFromHalf: 'top' | 'bottom',
  halfMode: boolean
): { halfPage: 'top' | 'bottom'; animFromHalf: 'top' | 'bottom' }
```

The mapping rules (derived from spatial reasoning):
- Portrait (prevSteps 0 or 2) + CW → flip both values
- Portrait (prevSteps 0 or 2) + CCW → keep both values
- Landscape (prevSteps 1 or 3) + CW → keep both values
- Landscape (prevSteps 1 or 3) + CCW → flip both values
- If `halfMode` is false → always return unchanged values

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest';

// Pure implementation of the remap logic — copy this exactly from what
// will be added to renderer.ts, so tests run without DOM dependencies.
function remapHalfOnRotation(
  prevSteps: number,
  delta: 1 | -1,
  halfPage: 'top' | 'bottom',
  animFromHalf: 'top' | 'bottom',
  halfMode: boolean
): { halfPage: 'top' | 'bottom'; animFromHalf: 'top' | 'bottom' } {
  if (!halfMode) return { halfPage, animFromHalf };
  const prevIsPortrait = prevSteps % 2 === 0;
  const shouldFlip = (prevIsPortrait && delta === 1) || (!prevIsPortrait && delta === -1);
  if (!shouldFlip) return { halfPage, animFromHalf };
  return {
    halfPage: halfPage === 'top' ? 'bottom' : 'top',
    animFromHalf: animFromHalf === 'top' ? 'bottom' : 'top',
  };
}

describe('remapHalfOnRotation', () => {
  describe('halfMode off — no changes', () => {
    it('does not remap when halfMode is false (portrait CW)', () => {
      const result = remapHalfOnRotation(0, 1, 'top', 'top', false);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });

    it('does not remap when halfMode is false (landscape CCW)', () => {
      const result = remapHalfOnRotation(1, -1, 'bottom', 'bottom', false);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });
  });

  describe('portrait (steps=0) + CW → flip', () => {
    it('flips top to bottom', () => {
      const result = remapHalfOnRotation(0, 1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });

    it('flips bottom to top', () => {
      const result = remapHalfOnRotation(0, 1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });

    it('flips halfPage and animFromHalf independently', () => {
      const result = remapHalfOnRotation(0, 1, 'top', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'top' });
    });
  });

  describe('portrait (steps=2) + CW → flip', () => {
    it('flips top to bottom', () => {
      const result = remapHalfOnRotation(2, 1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });

    it('flips bottom to top', () => {
      const result = remapHalfOnRotation(2, 1, 'bottom', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'bottom' });
    });
  });

  describe('portrait (steps=0) + CCW → keep', () => {
    it('keeps top', () => {
      const result = remapHalfOnRotation(0, -1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });

    it('keeps bottom', () => {
      const result = remapHalfOnRotation(0, -1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });
  });

  describe('portrait (steps=2) + CCW → keep', () => {
    it('keeps top', () => {
      const result = remapHalfOnRotation(2, -1, 'top', 'bottom', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'bottom' });
    });
  });

  describe('landscape (steps=1) + CW → keep', () => {
    it('keeps top (left)', () => {
      const result = remapHalfOnRotation(1, 1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });

    it('keeps bottom (right)', () => {
      const result = remapHalfOnRotation(1, 1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });
  });

  describe('landscape (steps=3) + CW → keep', () => {
    it('keeps top (left)', () => {
      const result = remapHalfOnRotation(3, 1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });
  });

  describe('landscape (steps=1) + CCW → flip', () => {
    it('flips top to bottom', () => {
      const result = remapHalfOnRotation(1, -1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });

    it('flips bottom to top', () => {
      const result = remapHalfOnRotation(1, -1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });
  });

  describe('landscape (steps=3) + CCW → flip', () => {
    it('flips top to bottom', () => {
      const result = remapHalfOnRotation(3, -1, 'top', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'top' });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- tests/unit/half-mode-rotation.test.ts
```

Expected: all tests pass immediately (the logic is self-contained in the test file — this confirms the logic is correct before wiring into renderer.ts).

---

### Task 2: Add `remapHalfOnRotation` to `renderer.ts` and call it in rotate handlers

**Files:**
- Modify: `src/renderer.ts`

The function reads and mutates module-level `halfPage` and `animFromHalf` (matching how other similar helpers work in this file).

- [ ] **Step 1: Add the function to `renderer.ts`**

Find the `halfSrcRect` function (around line 490). Add the new function immediately after it:

```ts
// Remaps halfPage and animFromHalf when rotation changes the split axis.
// Call BEFORE updating rotationSteps.
// Portrait (steps 0/2) + CW, or Landscape (steps 1/3) + CCW: flip.
// All other cases: keep.
function remapHalfOnRotation(prevSteps: number, delta: 1 | -1): void {
  if (!halfMode) return;
  const prevIsPortrait = prevSteps % 2 === 0;
  const shouldFlip = (prevIsPortrait && delta === 1) || (!prevIsPortrait && delta === -1);
  if (!shouldFlip) return;
  halfPage = halfPage === 'top' ? 'bottom' : 'top';
  animFromHalf = animFromHalf === 'top' ? 'bottom' : 'top';
}
```

- [ ] **Step 2: Call it in the CW rotate handler**

Find this block (around line 150):

```ts
document.getElementById("btn-rotate-cw")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  rotationSteps = (rotationSteps + 1) % 4;
```

Change it to:

```ts
document.getElementById("btn-rotate-cw")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  remapHalfOnRotation(rotationSteps, 1);
  rotationSteps = (rotationSteps + 1) % 4;
```

- [ ] **Step 3: Call it in the CCW rotate handler**

Find this block (around line 163):

```ts
document.getElementById("btn-rotate-ccw")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  rotationSteps = (rotationSteps + 3) % 4; // +3 is same as -1 mod 4
```

Change it to:

```ts
document.getElementById("btn-rotate-ccw")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  remapHalfOnRotation(rotationSteps, -1);
  rotationSteps = (rotationSteps + 3) % 4; // +3 is same as -1 mod 4
```

- [ ] **Step 4: Run the full unit test suite**

```bash
npm run test:unit
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.ts tests/unit/half-mode-rotation.test.ts
git commit -m "fix: preserve half-mode position when rotating page"
```
