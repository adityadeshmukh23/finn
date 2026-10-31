import type { Card, Digest, Item } from './api'

/** What the investor wants surfaced. Applied in the browser, so it works on live and recorded data alike. */
export interface AlertPrefs {
  minTier: 'medium' | 'high'
  muted: string[]          // categories never surfaced
}

export const DEFAULT_PREFS: AlertPrefs = { minTier: 'medium', muted: [] }
const KEY = 'finn.alerts'
export const MUTED_REASON = 'Muted by your alert settings'

// Categories the ranker can surface, in rough order of importance.
export const ALERT_CATEGORIES = [
  'management_change', 'results', 'M&A', 'litigation', 'pledging', 'credit_rating', 'fund_raise',
  'capex', 'press_release', 'insider_trading', 'earnings_call', 'bonus_split', 'dividend',
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
export function applyAlerts(d: Digest, p: AlertPrefs): Digest {
  if (p.minTier === 'medium' && p.muted.length === 0) return d
  const out: Item[] = []
  const cards: Card[] = []
  for (const c of d.cards) {
    const all = [c.lead, ...c.items]
    const keep = all.filter((it) => !muted(it, p)).sort((a, b) => b.score - a.score)
    out.push(...all.filter((it) => muted(it, p)))
    if (keep.length === 0) continue
    const extraHigh = keep.slice(1).filter((it) => it.tier === 'high').length
    cards.push({ ...c, lead: keep[0], items: keep.slice(1), score: Math.round((keep[0].score + 3 * extraHigh) * 10) / 10 })
  }
  cards.sort((a, b) => b.score - a.score)
  const hidden = out.length ? [{ reason: MUTED_REASON, count: out.length, items: out }, ...d.hidden] : d.hidden
  return {
    ...d,
    cards,
    hidden,
    counts: { ...d.counts, shown: d.counts.shown - out.length, hidden: d.counts.hidden + out.length },
  }
}
