import type { CSSProperties } from 'react'
import { badgeHue, badgeLetters } from '../badge'

/** Hidden from screen readers: the ticker beside it already says the name. No image, no request. */
export function Badge({ symbol }: { symbol: string }) {
  return <span aria-hidden="true" className="badge" style={{ '--badge-hue': badgeHue(symbol) } as CSSProperties}>{badgeLetters(symbol)}</span>
}
