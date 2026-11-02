import { describe as suite, expect, it } from 'vitest'
import { describe, fmtPct, noSessionNote, signalFor, type Market, type Session } from '../market'

const rows: Session[] = [
  ['2026-10-28', 100, 1.0, 1.1],
  ['2026-10-29', 88, -12.2, 49.0],
  ['2026-10-30', 82.4, -6.3, 42.0],
]
const t = { volX: 2, movePct: 4 }

suite('signalFor', () => {
  it('picks the most unusual crossing session inside the window', () => {
    const s = signalFor(rows, '2026-10-28T20:00:00+05:30', '2026-10-30T20:00:00+05:30', t)
    expect(s?.date).toBe('2026-10-29')
  })
  it('ignores sessions whose close is outside the window', () => {
    const s = signalFor(rows, '2026-10-29T20:00:00+05:30', '2026-10-30T20:00:00+05:30', t)
    expect(s?.date).toBe('2026-10-30')
  })
  it('returns null under the thresholds', () => {
    expect(signalFor(rows, '2026-10-27T20:00:00+05:30', '2026-10-28T20:00:00+05:30', t)).toBeNull()
  })
})

suite('describe', () => {
  it('leads with whatever crossed the line', () => {
    expect(describe({ date: 'x', close: 1, chg_pct: -6.3, vol_x: 42, vol_hit: true, move_hit: true })).toBe('−6.3% on 42× volume')
    expect(describe({ date: 'x', close: 1, chg_pct: 0.9, vol_x: 3.4, vol_hit: true, move_hit: false })).toBe('3.4× volume, price +0.9%')
  })
})

suite('noSessionNote', () => {
  const m = { sessions: { A: [['2026-10-09', 1, 0, 1], ['2026-10-12', 1, 0, 1]] } } as unknown as Market
  it('is null on a trading day', () => expect(noSessionNote(m, '2026-10-12')).toBeNull())
  it('names a weekend', () => expect(noSessionNote(m, '2026-10-11')).toMatch(/^Sunday,? 11 Oct: no trading session\.$/))
  it('hedges a weekday with no bar', () => expect(noSessionNote(m, '2026-10-13')).toMatch(/no price data, likely a market holiday/))
  it('still knows a weekend with no price data', () => expect(noSessionNote(null, '2026-10-10')).toMatch(/Saturday/))
})

suite('fmtPct', () => {
  it('signs what it can, and not what rounds to zero', () => {
    expect([fmtPct(6.26), fmtPct(-6.26), fmtPct(-0.04), fmtPct(0.04), fmtPct(0)]).toEqual(['+6.3%', '−6.3%', '0.0%', '0.0%', '0.0%'])
  })
})
