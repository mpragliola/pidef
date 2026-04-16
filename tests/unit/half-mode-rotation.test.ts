import { describe, it, expect } from 'vitest';
import { halfSrcRect } from '../../src/lib/pdf-geometry';

const W = 100, H = 200;

describe('halfSrcRect — always top/bottom split, rotation handled by CSS', () => {
  it("'top' = upper half", () => {
    expect(halfSrcRect('top', true, W, H)).toEqual([0, 0, W, H]);
  });

  it("'bottom' = lower half", () => {
    expect(halfSrcRect('bottom', true, W, H)).toEqual([0, H, W, H]);
  });

  it('top + bottom together cover the full surface', () => {
    const [, ty, , th] = halfSrcRect('top', true, W, H);
    const [, by, , bh] = halfSrcRect('bottom', true, W, H);
    expect(ty).toBe(0);
    expect(by).toBe(th);
    expect(th + bh).toBe(H * 2);
  });

  it('returns full surface when halfMode is false', () => {
    expect(halfSrcRect('top', false, W, H)).toEqual([0, 0, W, H]);
  });
});
