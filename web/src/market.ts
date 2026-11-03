import type { Card, Digest, Item } from './api'
import * as fig from './fig'

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
  strength: number     // how far past the investor's lines, for ranking: price counts twice what volume does
}

export interface Thresholds { volX: number; movePct: number }

// NSE's cash session closes at 15:30 IST; an EOD bar belongs to a window if its close does.
export const closeTime = (d: string) => new Date(`${d}T15:30:00+05:30`).getTime()

/** The last session with a close at or before this moment: what "prices to" honestly means on a past date. */
export function lastSessionBy(m: Market, end: string): string | null {
  const e = new Date(end).getTime()
  let last: string | null = null
  for (const rows of Object.values(m.sessions)) {
    for (const [date] of rows) if (closeTime(date) <= e && (!last || date > last)) last = date
  }
  return last
}

/** A holding's session as of this moment, for the Book and the company file. */
export function sessionAt(rows: Session[] | undefined, end: string): Session | null {
  if (!rows) return null
  const e = new Date(end).getTime()
  for (let i = rows.length - 1; i >= 0; i--) if (closeTime(rows[i][0]) <= e) return rows[i]
  return null
}

/** "Sunday 11 Oct: no trading session." Read from the price data; a holiday is a weekday with no bar. Null on a normal session. */
export function noSessionNote(m: Market | null, day: string): string | null {
  const label = fig.weekdayDay(day)
  const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())
  if (!m) return weekend ? `${label}: no trading session.` : null
  if (Object.values(m.sessions).some((rows) => rows.some((r) => r[0] === day))) return null
  return weekend ? `${label}: no trading session.` : `${label}: no price data, likely a market holiday.`
}

const VOLUME_SHARE = 0.5

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
      const ranked = Math.max(volHit ? (vx! / t.volX) * VOLUME_SHARE : 0, moveHit ? Math.abs(chg!) / t.movePct : 0)
      best = { date, close, chg_pct: chg, vol_x: vx, vol_hit: volHit, move_hit: moveHit, strength: ranked }
    }
  }
  return best
}

/** "−12.2% on 49× volume", leading with whatever crossed the line. */
export function describe(sig: Signal): string {
  const move = sig.chg_pct === null ? '' : fig.pct(sig.chg_pct)
  const vol = sig.vol_x === null ? '' : `${fig.multiple(sig.vol_x)} volume`
  if (sig.move_hit && sig.vol_hit) return `${move} on ${vol}`
  if (sig.move_hit) return `${move} in a day${vol ? ` (${vol})` : ''}`
  return `${vol}${move ? `, price ${move}` : ''}`
}

export const MOVE_BASE = 65     // a move with no surfaced filing in the window: above board changes and order wins
export const moveAlone = (strength: number) => Math.min(25, 4 * strength)   // …plus this by how far past the lines it went

/** Attach signals to cards and add a card for any holding that moved with nothing surfaced in the window. */
export function applyMarket(d: Digest, m: Market | null, t: Thresholds, names: Record<string, string>): Digest {
  if (!m) return d
  const { start, end } = d.window
  const cards: Card[] = d.cards.map((c) => {
    const sig = signalFor(m.sessions[c.symbol], start, end, t)
    return sig ? { ...c, market: sig } : c
  })
  const have = new Set(cards.map((c) => c.symbol))
  for (const [sym, rows] of Object.entries(m.sessions)) {
    if (have.has(sym)) continue
    const sig = signalFor(rows, start, end, t)
    if (!sig) continue
    const lead: Item = {
      id: `market-${sym}-${sig.date}`,
      symbol: sym,
      category: 'market',
      tier: 'high',
      reason: 'Unusual price or volume',
      headline: describe(sig),
      why: '',
      url: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(sym)}`,
      ts: new Date(closeTime(sig.date)).toISOString(),
      nse_category: '',
      base: MOVE_BASE,
      score: MOVE_BASE + moveAlone(sig.strength),
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
