import type { Card, Digest, Item } from './api'
import { applyMarket, type Market } from './market'
import { rankCards } from './rank'

/** What the investor wants surfaced. Applied in the browser, so it works on live and recorded data alike. */
export interface AlertPrefs {
  minTier: 'medium' | 'high'
  muted: string[]          // categories never surfaced
  volX: number             // volume alert: this many times the prior 20-session average
  movePct: number          // price alert: close-to-close move of at least ± this %
}

export const DEFAULT_PREFS: AlertPrefs = { minTier: 'medium', muted: [], volX: 2, movePct: 4 }
const KEY = 'finn.alerts'
export const MUTED_REASON = 'Muted by your alert settings'

// Categories the ranker can surface, in rough order of importance.
export const ALERT_CATEGORIES = [
  'management_change', 'results', 'M&A', 'litigation', 'pledging', 'credit_rating', 'fund_raise',
  'capex', 'press_release', 'insider_trading', 'earnings_call', 'bonus_split', 'dividend', 'market',
]

export function loadPrefs(): AlertPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT_PREFS
  }
}
export function savePrefs(p: AlertPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* session-only */ }
}

const muted = (it: Item, p: AlertPrefs) => p.muted.includes(it.category) || (p.minTier === 'high' && it.tier !== 'high')

/** Re-rank a digest under the investor's settings. Muted items move to the hidden list, never vanish. */
export function applyAlerts(raw: Digest, p: AlertPrefs, m: Market | null = null): Digest {
  const d = p.muted.includes('market') ? raw : applyMarket(raw, m, { volX: p.volX, movePct: p.movePct }, raw.names ?? {})
  if (p.minTier === 'medium' && p.muted.length === 0) return { ...d, cards: rankCards(d.cards) }
  const out: Item[] = []
  const cards: Card[] = []
  for (const c of d.cards) {
    const all = [c.lead, ...c.items]
    const keep = all.filter((it) => !muted(it, p)).sort((a, b) => b.score - a.score)
    out.push(...all.filter((it) => muted(it, p)))
    if (keep.length === 0) continue
    cards.push({ ...c, lead: keep[0], items: keep.slice(1) })
  }
  const hidden = out.length ? [{ reason: MUTED_REASON, count: out.length, items: out }, ...d.hidden] : d.hidden
  return {
    ...d,
    cards: rankCards(cards),
    hidden,
    counts: { ...d.counts, shown: d.counts.shown - out.length, hidden: d.counts.hidden + out.length },
  }
}
