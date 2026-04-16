import { describe, it, expect } from 'vitest';

// Pure equivalent of halfSrcRect from renderer.ts.
// Always top/bottom split regardless of rotation — CSS rotation transforms the whole UI.
function halfSrcRect(
  half: 'top' | 'bottom',
  w: number,
  h: number
): [number, number, number, number] {
  const fullH = h * 2;
  return half === 'top'
    ? [0, 0, w, fullH / 2]
    : [0, fullH / 2, w, fullH / 2];
}

const W = 100, H = 200;

describe('halfSrcRect — always top/bottom split, rotation handled by CSS', () => {
  it("'top' = upper half", () => {
    expect(halfSrcRect('top', W, H)).toEqual([0, 0, W, H]);
  });

  it("'bottom' = lower half", () => {
    expect(halfSrcRect('bottom', W, H)).toEqual([0, H, W, H]);
  });

  it('top + bottom together cover the full surface', () => {
    const [, ty, , th] = halfSrcRect('top', W, H);
    const [, by, , bh] = halfSrcRect('bottom', W, H);
    expect(ty).toBe(0);
    expect(by).toBe(th);
    expect(th + bh).toBe(H * 2);
  });
});
