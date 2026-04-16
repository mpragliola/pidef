import { describe, it, expect } from 'vitest';

// Pure equivalent of remapHalfOnRotation from renderer.ts for testability.
// The renderer version closes over and mutates module-level state; this version
// takes all inputs as parameters and returns a new object — same logic, no DOM deps.
//
// firstHalf() by rotation: 0°→'top', 90°→'bottom', 180°→'bottom', 270°→'top'
// Flip rule: Portrait (steps 0/2) + CW, or Landscape (steps 1/3) + CCW.
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

  // 0°→90° CW (portrait+CW): firstHalf top→bottom, flip
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

  // 90°→180° CW (landscape+CW): firstHalf stays bottom, keep
  describe('landscape (steps=1) + CW → keep', () => {
    it('keeps top', () => {
      const result = remapHalfOnRotation(1, 1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });

    it('keeps bottom', () => {
      const result = remapHalfOnRotation(1, 1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });
  });

  // 180°→270° CW (portrait+CW): firstHalf bottom→top, flip
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

  // 270°→0° CW (landscape+CW): firstHalf stays top, keep
  describe('landscape (steps=3) + CW → keep', () => {
    it('keeps top', () => {
      const result = remapHalfOnRotation(3, 1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });

    it('keeps bottom', () => {
      const result = remapHalfOnRotation(3, 1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });
  });

  // 0°→270° CCW (portrait+CCW): firstHalf stays top, keep
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

  // 90°→0° CCW (landscape+CCW): firstHalf bottom→top, flip
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

  // 180°→90° CCW (portrait+CCW): firstHalf stays bottom, keep
  describe('portrait (steps=2) + CCW → keep', () => {
    it('keeps top', () => {
      const result = remapHalfOnRotation(2, -1, 'top', 'bottom', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'bottom' });
    });

    it('keeps bottom', () => {
      const result = remapHalfOnRotation(2, -1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });
  });

  // 270°→180° CCW (landscape+CCW): firstHalf top→bottom, flip
  describe('landscape (steps=3) + CCW → flip', () => {
    it('flips top to bottom', () => {
      const result = remapHalfOnRotation(3, -1, 'top', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'top' });
    });

    it('flips bottom to top', () => {
      const result = remapHalfOnRotation(3, -1, 'bottom', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'bottom' });
    });
  });
});
