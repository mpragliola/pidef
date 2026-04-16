// src/lib/pdf-geometry.ts

const BRIGHTNESS_ZONE_PX = 60;

export function halfSrcRect(
  half: 'top' | 'bottom',
  halfMode: boolean,
  cacheWidth: number,
  cacheHeight: number
): [number, number, number, number] {
  const w = cacheWidth;
  const h = cacheHeight;
  if (!halfMode) return [0, 0, w, h];
  const fullH = h * 2;
  return half === 'top'
    ? [0, 0, w, fullH / 2]
    : [0, fullH / 2, w, fullH / 2];
}

export function toVisualDx(dx: number, dy: number, rotationSteps: 0 | 1 | 2 | 3): number {
  switch (rotationSteps) {
    case 1: return dy;
    case 2: return -dx;
    case 3: return -dy;
    default: return dx;
  }
}

export function toVisualDy(dx: number, dy: number, rotationSteps: 0 | 1 | 2 | 3): number {
  switch (rotationSteps) {
    case 1: return -dx;
    case 2: return -dy;
    case 3: return dx;
    default: return dy;
  }
}

// cacheWidth and cacheHeight must be CSS display pixels (i.e. canvas.clientWidth/Height),
// NOT the physical bitmap dimensions (canvas.width/height which are DPR-scaled).
export function isInBrightnessZone(
  clientX: number,
  clientY: number,
  rotationSteps: 0 | 1 | 2 | 3,
  cacheWidth: number,
  cacheHeight: number
): boolean {
  switch (rotationSteps) {
    case 1: return clientY < BRIGHTNESS_ZONE_PX;
    case 2: return clientX > (cacheWidth - BRIGHTNESS_ZONE_PX);
    case 3: return clientY > (cacheHeight - BRIGHTNESS_ZONE_PX);
    default: return clientX < BRIGHTNESS_ZONE_PX;
  }
}

export function visualXFrac(
  clientX: number,
  clientY: number,
  rotationSteps: 0 | 1 | 2 | 3,
  cacheWidth: number
): number {
  switch (rotationSteps) {
    case 1: return clientY / cacheWidth;
    case 2: return (cacheWidth - clientX) / cacheWidth;
    case 3: return (cacheWidth - clientY) / cacheWidth;
    default: return clientX / cacheWidth;
  }
}
