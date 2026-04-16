import { describe, it, expect } from 'vitest';

// Pure equivalent of remapHalfOnRotation from renderer.ts for testability.
// The renderer version closes over and mutates module-level state; this version
// takes all inputs as parameters and returns a new object — same logic, no DOM deps.
//
// Flip rule: landscape (steps 1/3) + CW, or portrait (steps 0/2) + CCW.
// These are the transitions where firstHalf() changes value (rotationSteps crosses ≥2 boundary).
function remapHalfOnRotation(
  prevSteps: number,
  delta: 1 | -1,
  halfPage: 'top' | 'bottom',
  animFromHalf: 'top' | 'bottom',
  halfMode: boolean
): { halfPage: 'top' | 'bottom'; animFromHalf: 'top' | 'bottom' } {
  if (!halfMode) return { halfPage, animFromHalf };
  const prevIsLandscape = prevSteps % 2 === 1;
  const shouldFlip = (prevIsLandscape && delta === 1) || (!prevIsLandscape && delta === -1);
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

  // steps 0→1 (portrait CW): firstHalf stays 'top', no flip
  describe('portrait (steps=0) + CW → keep', () => {
    it('keeps top', () => {
      const result = remapHalfOnRotation(0, 1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });

    it('keeps bottom', () => {
      const result = remapHalfOnRotation(0, 1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });
  });

  // steps 1→2 (landscape CW): firstHalf changes top→bottom, flip
  describe('landscape (steps=1) + CW → flip', () => {
    it('flips top to bottom', () => {
      const result = remapHalfOnRotation(1, 1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });

    it('flips bottom to top', () => {
      const result = remapHalfOnRotation(1, 1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });

    it('flips halfPage and animFromHalf independently', () => {
      const result = remapHalfOnRotation(1, 1, 'top', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'top' });
    });
  });

  // steps 2→3 (portrait CW): firstHalf stays 'bottom', no flip
  describe('portrait (steps=2) + CW → keep', () => {
    it('keeps top', () => {
      const result = remapHalfOnRotation(2, 1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });

    it('keeps bottom', () => {
      const result = remapHalfOnRotation(2, 1, 'bottom', 'top', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'top' });
    });
  });

  // steps 3→0 (landscape CW): firstHalf changes bottom→top, flip
  describe('landscape (steps=3) + CW → flip', () => {
    it('flips top to bottom', () => {
      const result = remapHalfOnRotation(3, 1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });

    it('flips bottom to top', () => {
      const result = remapHalfOnRotation(3, 1, 'bottom', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'bottom' });
    });
  });

  // steps 1→0 (landscape CCW): firstHalf stays 'top', no flip
  describe('landscape (steps=1) + CCW → keep', () => {
    it('keeps top', () => {
      const result = remapHalfOnRotation(1, -1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });

    it('keeps bottom', () => {
      const result = remapHalfOnRotation(1, -1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });
  });

  // steps 2→1 (portrait CCW): firstHalf changes bottom→top, flip
  describe('portrait (steps=2) + CCW → flip', () => {
    it('flips top to bottom', () => {
      const result = remapHalfOnRotation(2, -1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });

    it('flips bottom to top', () => {
      const result = remapHalfOnRotation(2, -1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });
  });

  // steps 3→2 (landscape CCW): firstHalf stays 'bottom', no flip
  describe('landscape (steps=3) + CCW → keep', () => {
    it('keeps top', () => {
      const result = remapHalfOnRotation(3, -1, 'top', 'bottom', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'bottom' });
    });
  });

  // steps 0→3 (portrait CCW): firstHalf changes top→bottom, flip
  describe('portrait (steps=0) + CCW → flip', () => {
    it('flips top to bottom', () => {
      const result = remapHalfOnRotation(0, -1, 'top', 'top', true);
      expect(result).toEqual({ halfPage: 'bottom', animFromHalf: 'bottom' });
    });

    it('flips bottom to top', () => {
      const result = remapHalfOnRotation(0, -1, 'bottom', 'bottom', true);
      expect(result).toEqual({ halfPage: 'top', animFromHalf: 'top' });
    });
  });
});
