/**
 * Easing functions for the RAF (requestAnimationFrame) animation loop.
 *
 * When animating page transitions (slide + cross-fade) or snap-back effects,
 * a raw linear interpolation looks mechanical. Easing curves map a linear
 * progress value `t ∈ [0, 1]` to a perceptually smoother output, so motion
 * starts fast and decelerates into the final position — giving animations a
 * natural, physical feel rather than a robotic one.
 *
 * These functions are pure math utilities: they take no state and have no
 * side-effects, making them trivially testable and reusable anywhere a
 * progress fraction needs to be remapped.
 */

/**
 * Quadratic ease-out curve.
 *
 * Maps a linear animation progress value `t` (0 = start, 1 = end) to a
 * smoothed value that decelerates as it approaches completion.
 *
 * Formula: `1 - (1 - t)²`
 *
 * - At t=0 the output is 0 (no movement yet).
 * - At t=1 the output is 1 (fully at the destination).
 * - In between, the curve is concave: fast early, slow late.
 *
 * A quadratic (degree-2) ease-out is lightweight and visually smooth enough
 * for short transitions (150–220 ms). Higher-degree polynomials would overshoot
 * or feel sluggish at these durations.
 *
 * @param t - Linear progress in [0, 1]. Values outside this range are accepted
 *            but will produce results outside [0, 1].
 * @returns  Eased progress in [0, 1].
 */
export function easeOut(t: number): number {
  return 1.0 - (1.0 - t) ** 2;
}
