import { describe, expect, it } from 'vitest'
import { bookTally, filedForSession, filingsAsOf, filingsInWindow, groupSameDay, lastMaterialBefore, moveContext, sessionsAsOf, type TimelineItem } from '../company'
import type { Session } from '../market'

const item = (id: string, ts: string, tier: TimelineItem['tier'] = 'high', base = 50): TimelineItem =>
  ({ id, ts, tier, base, category: 'x', reason: '', headline: id, url: '', read: null })
const rows = [item('late', '2026-10-30T19:00:00+05:30'), item('routine', '2026-10-29T18:00:00+05:30', 'routine'), item('exit', '2026-10-29T12:00:00+05:30'), item('old', '2026-10-10T12:00:00+05:30')]
const sessions: Session[] = [['2026-10-28', 1, 0, 1], ['2026-10-29', 1, 0, 1], ['2026-10-30', 1, 0, 1]]

describe('as-of filters never look ahead', () => {
  it('drops later filings', () => {
    expect(filingsAsOf(rows, '2026-10-29T23:59:59+05:30').map((r) => r.id)).toEqual(['routine', 'exit', 'old'])
  })
  it('drops sessions not yet closed', () => {
    expect(sessionsAsOf(sessions, '2026-10-30T15:00:00+05:30').map((s) => s[0])).toEqual(['2026-10-28', '2026-10-29'])
  })
  it('keeps the last n, oldest first', () => {
    expect(sessionsAsOf(sessions, '2026-10-31T00:00:00+05:30', 2).map((s) => s[0])).toEqual(['2026-10-29', '2026-10-30'])
  })
})

describe('filedForSession', () => {
  const dated = [item('after', '2026-10-29T18:00:00+05:30'), item('hours', '2026-10-29T12:00:00+05:30'), item('note', '2026-10-29T13:00:00+05:30', 'routine'), item('late', '2026-10-30T19:00:00+05:30')]
  const ids = (d: string) => filedForSession(dated, sessions, d).map((r) => r.id)
  it('a filing in market hours belongs to that day', () => expect(ids('2026-10-29')).toEqual(['hours']))
  it('an after-hours filing belongs to the next close', () => expect(ids('2026-10-30')).toEqual(['after']))
  it('a filing after the last close has no session yet', () => expect(ids('2026-10-28')).toEqual([]))
  it('a session it does not know has nothing', () => expect(ids('2026-10-01')).toEqual([]))
  it('moveContext names the previous close and uses the same list', () => {
    const c = moveContext(dated, sessions, '2026-10-30', '2026-10-29T20:00:00+05:30')
    expect([c.previous, c.filed.map((r) => r.id)]).toEqual(['2026-10-29', ['after']])
  })
  it('filingsInWindow counts routine filings too', () => {
    expect(filingsInWindow(dated, '2026-10-29T00:00:00+05:30', '2026-10-29T23:00:00+05:30').map((r) => r.id)).toEqual(['after', 'hours', 'note'])
  })
})

describe('lastMaterialBefore', () => {
  it('skips routine and finds the exit a price card can point to', () => {
    expect(lastMaterialBefore(rows, '2026-10-29T20:00:00+05:30')?.id).toBe('exit')
  })
  it('prefers the heaviest event that day to the latest', () => {
    const day = [item('deck', '2026-10-29T18:24:00+05:30', 'medium', 35), item('ceo', '2026-10-29T15:00:00+05:30', 'high', 95), item('older', '2026-10-28T12:00:00+05:30', 'high', 99)]
    expect(lastMaterialBefore(day, '2026-10-29T20:00:00+05:30')?.id).toBe('ceo')
  })
  it('never reaches past the window start into later filings', () => {
    expect(lastMaterialBefore(rows, '2026-10-29T11:00:00+05:30')?.id).not.toBe('exit')
  })
  it('stops after a week', () => expect(lastMaterialBefore(rows, '2026-10-20T12:00:00+05:30')).toBeNull())
})

describe('groupSameDay', () => {
  const day = [item('deck', '2026-10-29T16:18:00+05:30', 'medium', 35), item('res', '2026-10-29T14:51:00+05:30', 'high', 90), item('ceo', '2026-10-29T15:00:00+05:30', 'high', 95), item('old', '2026-10-12T15:00:00+05:30', 'high', 90)]
  day[2].category = 'management_change'
  it('collapses one category on one day, led by its heaviest', () => {
    const g = groupSameDay(day)
    expect(g.map((x) => x.items.length)).toEqual([2, 1, 1])
    expect(g[0].lead.id).toBe('res')
  })
  it('keeps different categories and different days apart', () => {
    expect(groupSameDay(day).map((x) => x.lead.id)).toEqual(['res', 'ceo', 'old'])
  })
})

describe('bookTally', () => {
  const s = { A: [['2026-10-29', 1, -1, 1], ['2026-10-30', 1, 2, 1]], B: [['2026-10-30', 1, -3, 1]], C: [['2026-10-30', 1, 0, 1]], D: [['2026-10-30', 1, null, null]] } as Record<string, Session[]>
  it('counts the last close at the as-of moment', () => {
    expect(bookTally(s, '2026-10-30T20:00:00+05:30')).toEqual({ up: 1, down: 1, flat: 1 })
  })
  it('never looks ahead', () => {
    expect(bookTally(s, '2026-10-29T20:00:00+05:30')).toEqual({ up: 0, down: 1, flat: 0 })
  })
  it('a move that shows as 0.0% is flat, whichever way it rounded', () => {
    const near = { A: [['2026-10-30', 1, 0.04, 1]], B: [['2026-10-30', 1, -0.04, 1]], C: [['2026-10-30', 1, 0.05, 1]] } as Record<string, Session[]>
    expect(bookTally(near, '2026-10-30T20:00:00+05:30')).toEqual({ up: 1, down: 0, flat: 2 })
  })
})
