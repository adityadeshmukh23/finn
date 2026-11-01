import { describe as suite, expect, it } from 'vitest'
import { describe, signalFor, type Session } from '../market'

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
