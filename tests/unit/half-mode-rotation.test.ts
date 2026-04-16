import { describe, it, expect } from 'vitest';

// Pure equivalent of remapHalfOnRotation from renderer.ts for testability.
// The renderer version closes over and mutates module-level state; this version
// takes all inputs as parameters and returns a new object — same logic, no DOM deps.
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
