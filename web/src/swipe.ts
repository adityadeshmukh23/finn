/** Swipe-to-dismiss rules. Pure, so the gesture's edges are testable. */
export const EDGE_GUARD_PX = 24     // iOS owns a swipe from the left edge: it's the back gesture
const MAX_DISTANCE_PX = 72
const WIDTH_SHARE = 0.2
const FLICK_MIN_PX = 30
const FLICK_PX_PER_MS = 0.5

export const swipeMayStart = (x: number) => x >= EDGE_GUARD_PX

/** Far enough for the screen (a fifth of it, at most 72 px), or a short fast flick. */
export function swipeDismisses(dx: number, ms: number, width: number): boolean {
  if (dx >= 0) return false
  const dist = -dx
  return dist >= Math.min(MAX_DISTANCE_PX, width * WIDTH_SHARE) || (dist >= FLICK_MIN_PX && dist / Math.max(ms, 1) >= FLICK_PX_PER_MS)
}
