import type { Person, Results, Tier } from './api'
import { closeTime, type Session } from './market'

/** One filing in a company's timeline: the same classification and verified reads as the briefing. */
export interface TimelineItem {
  id: string
  ts: string
  category: string
  tier: Tier
  reason: string
  base: number      // event weight, the same one the briefing ranks by
  headline: string
  url: string
  read: { page: number; quote: string } | null
  results?: Results
  people?: Person[]
}

export type Timeline = Record<string, TimelineItem[]>

const LOOKBACK_DAYS = 7
const DAY_MS = 86_400_000

/** Filings on or before the as-of moment: a past date never sees a later filing. Newest first. */
export const filingsAsOf = (rows: TimelineItem[] | undefined, end: string): TimelineItem[] => {
  const e = new Date(end).getTime()
  return (rows ?? []).filter((r) => new Date(r.ts).getTime() <= e)
}

/** The last `n` sessions closed by the as-of moment, oldest first. */
export const sessionsAsOf = (rows: Session[] | undefined, end: string, n = 20): Session[] => {
  const e = new Date(end).getTime()
  return (rows ?? []).filter((r) => closeTime(r[0]) <= e).slice(-n)
}

/** Which session a filing belongs to: the first close at or after it, so a filing after hours marks the next day. */
export function sessionIndexFor(ts: string, sessions: Session[]): number | null {
  const t = new Date(ts).getTime()
  const i = sessions.findIndex((s) => closeTime(s[0]) >= t)
  return i === -1 ? null : i
}

/**
 * What a price card can point to: the heaviest event on the last day the company filed something material,
 * within a week before the window opened. Heaviest, not latest: a CEO exit beats the investor deck filed after it.
 */
export function lastMaterialBefore(rows: TimelineItem[] | undefined, start: string): TimelineItem | null {
  const s = new Date(start).getTime()
  const recent = (rows ?? []).filter((r) => {
    const t = new Date(r.ts).getTime()
    return r.tier !== 'routine' && t <= s && s - t <= LOOKBACK_DAYS * DAY_MS
  })
  if (recent.length === 0) return null
  const day = recent[0].ts.slice(0, 10)
  return recent.filter((r) => r.ts.startsWith(day)).reduce((a, b) => (b.base > a.base ? b : a))
}

/** Same category on the same day reads as one line with a count. The heaviest filing speaks for the group. */
export interface FilingGroup { day: string; category: string; lead: TimelineItem; items: TimelineItem[] }

export function groupSameDay(rows: TimelineItem[]): FilingGroup[] {
  const groups = new Map<string, TimelineItem[]>()
  for (const r of rows) {
    const key = `${r.ts.slice(0, 10)}|${r.category}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.values()].map((items) => ({
    day: items[0].ts.slice(0, 10), category: items[0].category, items,
    lead: items.reduce((a, b) => (b.base > a.base ? b : a)),
  }))
}

export const material = (rows: TimelineItem[]) => rows.filter((r) => r.tier !== 'routine')
export const routine = (rows: TimelineItem[]) => rows.filter((r) => r.tier === 'routine')
export const latestResults = (rows: TimelineItem[]) => rows.find((r) => r.results)
export const latestPeople = (rows: TimelineItem[]) => rows.find((r) => r.people?.length)
