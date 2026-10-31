import type { Card, Digest, Item } from './api'

/**
 * Price and volume alerts. The numbers (day move, volume multiple vs the prior 20 sessions) are
 * computed and tested server-side (backend/finn/market.py); here we only compare them with the
 * investor's thresholds and decide which sessions fall inside the briefing window.
 */

export type Session = [date: string, close: number, chgPct: number | null, volX: number | null]

export interface Market {
  source: string
  as_of: string | null
  through: string | null
  provider: string
  message?: string
  sessions: Record<string, Session[]>
}

export interface Signal {
  date: string
  close: number
  chg_pct: number | null
  vol_x: number | null
  vol_hit: boolean
  move_hit: boolean
}

export interface Thresholds { volX: number; movePct: number }

// NSE's cash session closes at 15:30 IST; an EOD bar belongs to a window if its close does.
const closeTime = (d: string) => new Date(`${d}T15:30:00+05:30`).getTime()

/** The most unusual session in the window that crosses a threshold, or null. */
export function signalFor(rows: Session[] | undefined, start: string, end: string, t: Thresholds): Signal | null {
  if (!rows) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  let best: Signal | null = null
  let bestStrength = 0
  for (const [date, close, chg, vx] of rows) {
    const ct = closeTime(date)
    if (ct <= s || ct > e) continue
    const volHit = vx !== null && vx >= t.volX
    const moveHit = chg !== null && Math.abs(chg) >= t.movePct
    if (!volHit && !moveHit) continue
    const strength = Math.max(volHit ? vx! / t.volX : 0, moveHit ? Math.abs(chg!) / t.movePct : 0)
    if (strength > bestStrength) {
      bestStrength = strength
      best = { date, close, chg_pct: chg, vol_x: vx, vol_hit: volHit, move_hit: moveHit }
    }
  }
  return best
}

const fmtPct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`
const fmtX = (n: number) => `${n >= 10 ? Math.round(n) : n.toFixed(1)}×`

/** "−12.2% on 49× volume", leading with whatever crossed the line. */
export function describe(sig: Signal): string {
  const move = sig.chg_pct === null ? '' : fmtPct(sig.chg_pct)
  const vol = sig.vol_x === null ? '' : `${fmtX(sig.vol_x)} volume`
  if (sig.move_hit && sig.vol_hit) return `${move} on ${vol}`
  if (sig.move_hit) return `${move} in a day${vol ? ` (${vol})` : ''}`
  return `${vol}${move ? `, price ${move}` : ''}`
}

const MARKET_BOOST = 6         // per threshold crossed, added to a card that also has filings
const MARKET_ONLY_BASE = 65    // a move with no filing: above board changes and order wins
const MARKET_ONLY_MAX = 20     // …plus up to this much by how far past the threshold it went (49× volume ≈ results)

/** Attach signals to cards and add a card for any holding that moved with no filing in the window. */
export function applyMarket(d: Digest, m: Market | null, t: Thresholds, names: Record<string, string>): Digest {
  if (!m) return d
  const { start, end } = d.window
  const cards: Card[] = d.cards.map((c) => {
    const sig = signalFor(m.sessions[c.symbol], start, end, t)
    if (!sig) return c
    const boost = MARKET_BOOST * (Number(sig.vol_hit) + Number(sig.move_hit))
    return { ...c, market: sig, lead: { ...c.lead, score: c.lead.score + boost } }
  })
  const have = new Set(cards.map((c) => c.symbol))
  for (const [sym, rows] of Object.entries(m.sessions)) {
    if (have.has(sym)) continue
    const sig = signalFor(rows, start, end, t)
    if (!sig) continue
    const strength = Math.max(sig.vol_hit ? sig.vol_x! / t.volX : 0, sig.move_hit ? Math.abs(sig.chg_pct!) / t.movePct : 0)
    const lead: Item = {
      id: `market-${sym}-${sig.date}`,
      symbol: sym,
      category: 'market',
      tier: 'high',
      reason: 'Unusual move, no filing',
      headline: describe(sig),
      why: `No ${sym} filing in this window. Check for news, block deals or a sector move.`,
      url: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(sym)}`,
      ts: new Date(closeTime(sig.date)).toISOString(),
      nse_category: '',
      base: MARKET_ONLY_BASE,
      score: MARKET_ONLY_BASE + Math.min(MARKET_ONLY_MAX, 4 * strength),
      read: null,
    }
    cards.push({
      symbol: sym, company: names[sym] ?? sym, sector: '', size: '', score: lead.score, lead, items: [],
      routine_count: 0, folded: [], market: sig,
    })
  }
  const moved = new Set(cards.filter((c) => c.lead.category === 'market').map((c) => c.symbol))
  return { ...d, cards, quiet: d.quiet.filter((s) => !moved.has(s)) }
}
