/**
 * A company's monogram: letters from its ticker on a tint chosen by a stable hash, so a company keeps its colour across
 * screens and visits. Hues stay in cyan, blue, violet and magenta: red, green and amber mean sign and confidence here.
 */
export const BADGE_HUES = [190, 205, 220, 235, 250, 265, 280, 295, 310, 325]

/** FNV-1a. Nothing about a company but its ticker goes in, and the same ticker always comes out the same. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

export const badgeHue = (symbol: string) => BADGE_HUES[hash(symbol.toUpperCase()) % BADGE_HUES.length]

export const badgeLetters = (symbol: string) => symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2)
