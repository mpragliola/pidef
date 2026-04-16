import { describe, it, expect } from 'vitest';
import { halfSrcRect } from '../../src/lib/pdf-geometry';

// Use H=150 so fullH=300, fullH/2=150==H is NOT coincidentally equal to H*2/2 with H=200
const W = 100, H = 150;

describe('halfSrcRect — always top/bottom split, rotation handled by CSS', () => {
  it("'top' = upper half of the doubled surface", () => {
    // surface is H*2 tall; top half occupies [0, 0, W, H]
    expect(halfSrcRect('top', true, W, H)).toEqual([0, 0, W, H]);
  });

  it("'bottom' = lower half of the doubled surface", () => {
    // bottom half starts at y=H (midpoint of the H*2 surface)
    expect(halfSrcRect('bottom', true, W, H)).toEqual([0, H, W, H]);
  });

  it('top + bottom together cover the full doubled surface', () => {
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
