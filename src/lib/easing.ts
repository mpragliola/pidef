// src/lib/easing.ts
export function easeOut(t: number): number {
  return 1.0 - (1.0 - t) ** 2;
}
