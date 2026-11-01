import { describe, expect, it } from 'vitest'
import { filingsAsOf, groupSameDay, lastMaterialBefore, sessionIndexFor, sessionsAsOf, type TimelineItem } from '../company'
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

describe('sessionIndexFor', () => {
  it('marks a filing in market hours on that day', () => expect(sessionIndexFor('2026-10-29T12:00:00+05:30', sessions)).toBe(1))
  it('marks an after-hours filing on the next close', () => expect(sessionIndexFor('2026-10-29T18:00:00+05:30', sessions)).toBe(2))
  it('has no session for a filing after the last close', () => expect(sessionIndexFor('2026-10-30T19:00:00+05:30', sessions)).toBeNull())
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
