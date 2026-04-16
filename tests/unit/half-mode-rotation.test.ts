import { describe, it, expect } from 'vitest';

// Pure equivalent of halfSrcRect from renderer.ts for testability.
// 'top' always means the user's physical top of screen after rotation:
//   0°:   upper half of surface
//   90°:  right half of surface (PDF right side → physical top after 90° CW)
//   180°: lower half of surface (PDF bottom → physical top after 180°)
//   270°: left half of surface (PDF left side → physical top after 270° CW)
function halfSrcRect(
  half: 'top' | 'bottom',
  rotationSteps: number,
  w: number,
  h: number
): [number, number, number, number] {
  if (rotationSteps === 1) {
    const fullW = w * 2;
    return half === 'top'
      ? [fullW / 2, 0, fullW / 2, h]
      : [0, 0, fullW / 2, h];
  }
  if (rotationSteps === 3) {
    const fullW = w * 2;
    return half === 'top'
      ? [0, 0, fullW / 2, h]
      : [fullW / 2, 0, fullW / 2, h];
  }
  if (rotationSteps === 2) {
    const fullH = h * 2;
    return half === 'top'
      ? [0, fullH / 2, w, fullH / 2]
      : [0, 0, w, fullH / 2];
  }
  // 0°
  const fullH = h * 2;
  return half === 'top'
    ? [0, 0, w, fullH / 2]
    : [0, fullH / 2, w, fullH / 2];
}

const W = 100, H = 200;

describe('halfSrcRect — top always = physical top of screen', () => {
  describe('0° — top/bottom split, top = upper half', () => {
    it("'top' = upper half", () => {
      expect(halfSrcRect('top', 0, W, H)).toEqual([0, 0, W, H]);
    });
    it("'bottom' = lower half", () => {
      expect(halfSrcRect('bottom', 0, W, H)).toEqual([0, H, W, H]);
    });
  });

  describe('90° CW — left/right split, top = right half (PDF right → physical top)', () => {
    it("'top' = right half", () => {
      expect(halfSrcRect('top', 1, W, H)).toEqual([W, 0, W, H]);
    });
    it("'bottom' = left half", () => {
      expect(halfSrcRect('bottom', 1, W, H)).toEqual([0, 0, W, H]);
    });
  });

  describe('180° — top/bottom split, top = lower half (PDF bottom → physical top)', () => {
    it("'top' = lower half", () => {
      expect(halfSrcRect('top', 2, W, H)).toEqual([0, H, W, H]);
    });
    it("'bottom' = upper half", () => {
      expect(halfSrcRect('bottom', 2, W, H)).toEqual([0, 0, W, H]);
    });
  });

  describe('270° CW — left/right split, top = left half (PDF left → physical top)', () => {
    it("'top' = left half", () => {
      expect(halfSrcRect('top', 3, W, H)).toEqual([0, 0, W, H]);
    });
    it("'bottom' = right half", () => {
      expect(halfSrcRect('bottom', 3, W, H)).toEqual([W, 0, W, H]);
    });
  });
});
