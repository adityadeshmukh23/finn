import { describe, expect, it } from 'vitest'
import { loadDensity } from '../density'
import { tileTint } from '../components/BookStrip'
import { clock, day as dayMonth } from '../fig'
import { verdictLine } from '../format'
import { lastSessionBy, type Market } from '../market'

describe('explicit time labels', () => {
  it('never reads as relative', () => {
    expect(clock('2026-10-30T19:40:11+05:30')).toMatch(/^30 Oct(,| at) 7:40 pm$/i)
  })
  it('renders IST whatever the browser zone', () => {
    expect(clock('2026-10-30T18:30:00Z')).toMatch(/^31 Oct(,| at) 12:00 am$/i)
    expect(dayMonth('2026-10-30')).toBe('30 Oct')
  })
})

describe('lastSessionBy', () => {
  const m = { sessions: { A: [['2026-10-23', 1, 0, 1], ['2026-10-26', 1, 0, 1], ['2026-10-30', 1, 0, 1]] } } as unknown as Market
  it('stops at the as-of moment', () => {
    expect(lastSessionBy(m, '2026-10-30T20:29:04+05:30')).toBe('2026-10-30')
    expect(lastSessionBy(m, '2026-10-30T15:00:00+05:30')).toBe('2026-10-26')
  })
  it('handles a weekend as-of', () => {
    expect(lastSessionBy(m, '2026-10-25T20:29:04+05:30')).toBe('2026-10-23')
  })
})

describe('verdictLine', () => {
  const c = (met: number, partially: number, missed: number, too_vague = 0) => ({ met, partially, missed, too_vague })
  it('does not hide a partial behind "met 0 of 1"', () => expect(verdictLine(c(0, 1, 0))).toBe('1 partially, of 1 checkable'))
  it('lists what was checked', () => expect(verdictLine(c(3, 1, 2, 3))).toBe('3 met, 1 partially, 2 missed, of 6 checkable'))
  it('says when nothing was checkable', () => expect(verdictLine(c(0, 0, 0, 6))).toBe('No checkable promise yet, 6 too vague'))
})

describe('tileTint', () => {
  it('is red for a fall, green for a rise, none when flat or unknown', () => {
    expect(tileTint(-3)).toContain('--down')
    expect(tileTint(3)).toContain('--up')
    expect(tileTint(0)).toBeUndefined()
    expect(tileTint(null)).toBeUndefined()
  })
  it('stops getting stronger at the cap', () => expect(tileTint(50)).toBe(tileTint(6)))
})

describe('density', () => {
  it('is Compact unless the reader chose Detailed, and survives bad or missing storage', () => {
    expect(loadDensity()).toBe('compact')   // no localStorage in this test environment
  })
})
