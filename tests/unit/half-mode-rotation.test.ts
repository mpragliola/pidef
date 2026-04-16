import { describe, it, expect } from 'vitest';

// Pure equivalent of halfSrcRect from renderer.ts.
// Axes rotate with the document. 'top' = physical top of screen:
//   0°:   top/bottom split — 'top' = upper half
//   90°:  left/right split — 'top' = left half  (canvas left → physical top after 90° CW)
//   180°: top/bottom split — 'top' = lower half (canvas bottom → physical top after 180°)
//   270°: left/right split — 'top' = right half (canvas right → physical top after 270° CW)
function halfSrcRect(
  half: 'top' | 'bottom',
  rotationSteps: number,
  w: number,
  h: number
): [number, number, number, number] {
  if (rotationSteps === 1) {
    const fullW = w * 2;
    return half === 'top' ? [0, 0, fullW / 2, h] : [fullW / 2, 0, fullW / 2, h];
  }
  if (rotationSteps === 3) {
    const fullW = w * 2;
    return half === 'top' ? [fullW / 2, 0, fullW / 2, h] : [0, 0, fullW / 2, h];
  }
  const fullH = h * 2;
  if (rotationSteps === 2) {
    return half === 'top' ? [0, fullH / 2, w, fullH / 2] : [0, 0, w, fullH / 2];
  }
  return half === 'top' ? [0, 0, w, fullH / 2] : [0, fullH / 2, w, fullH / 2];
}

const W = 100, H = 200;

describe('halfSrcRect — axes rotate with document, top = physical top', () => {
  describe('0° — top/bottom split', () => {
    it("'top' = upper half", () => {
      expect(halfSrcRect('top', 0, W, H)).toEqual([0, 0, W, H]);
    });
    it("'bottom' = lower half", () => {
      expect(halfSrcRect('bottom', 0, W, H)).toEqual([0, H, W, H]);
    });
  });

  describe('90° CW — left/right split, canvas left = physical top', () => {
    it("'top' = left half", () => {
      expect(halfSrcRect('top', 1, W, H)).toEqual([0, 0, W, H]);
    });
    it("'bottom' = right half", () => {
      expect(halfSrcRect('bottom', 1, W, H)).toEqual([W, 0, W, H]);
    });
  });

  describe('180° — top/bottom split, canvas bottom = physical top', () => {
    it("'top' = lower half", () => {
      expect(halfSrcRect('top', 2, W, H)).toEqual([0, H, W, H]);
    });
    it("'bottom' = upper half", () => {
      expect(halfSrcRect('bottom', 2, W, H)).toEqual([0, 0, W, H]);
    });
  });

  describe('270° CW — left/right split, canvas right = physical top', () => {
    it("'top' = right half", () => {
      expect(halfSrcRect('top', 3, W, H)).toEqual([W, 0, W, H]);
    });
    it("'bottom' = left half", () => {
      expect(halfSrcRect('bottom', 3, W, H)).toEqual([0, 0, W, H]);
    });
  });
});
