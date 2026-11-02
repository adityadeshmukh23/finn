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

/**
 * Material filings that belong to a session: after the previous close, up to this one, so a filing after hours
 * belongs to the next day. The one source for the chart's dots and for what a price row says was filed.
 * `sessions` must be the full list, so the first session shown on a chart still knows its previous close.
 */
export function filedForSession(rows: TimelineItem[] | undefined, sessions: Session[] | undefined, date: string): TimelineItem[] {
  const i = (sessions ?? []).findIndex((s) => s[0] === date)
  if (i === -1) return []
  const from = i > 0 ? closeTime(sessions![i - 1][0]) : -Infinity
  const to = closeTime(date)
  return (rows ?? []).filter((r) => {
    const t = new Date(r.ts).getTime()
    return r.tier !== 'routine' && t > from && t <= to
  })
}

/** Every filing a holding made in a briefing window, material or routine. */
export const filingsInWindow = (rows: TimelineItem[] | undefined, start: string, end: string): TimelineItem[] => {
  const s = new Date(start).getTime(), e = new Date(end).getTime()
  return (rows ?? []).filter((r) => {
    const t = new Date(r.ts).getTime()
    return t > s && t <= e
  })
}

/** What FINN holds around a price or volume move. It says what was filed and when, never why the stock moved. */
export interface MoveContext {
  date: string                  // the session that crossed the threshold
  previous: string | null       // the session before it
  filed: TimelineItem[]         // material filings between those two closes
  last: TimelineItem | null     // the heaviest on the last filing day before the window
}

export function moveContext(rows: TimelineItem[] | undefined, sessions: Session[] | undefined, date: string, start: string): MoveContext {
  const i = (sessions ?? []).findIndex((s) => s[0] === date)
  return {
    date, previous: i > 0 ? sessions![i - 1][0] : null,
    filed: filedForSession(rows, sessions, date),
    last: lastMaterialBefore(rows, start),
  }
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

/** The book in one line: how many holdings closed up, down and flat at the as-of moment. */
export function bookTally(sessions: Record<string, Session[]>, end: string): { up: number; down: number; flat: number } {
  const tally = { up: 0, down: 0, flat: 0 }
  for (const rows of Object.values(sessions)) {
    const chg = sessionsAsOf(rows, end, 1)[0]?.[2]
    if (chg === undefined || chg === null) continue
    if (chg > 0) tally.up++
    else if (chg < 0) tally.down++
    else tally.flat++
  }
  return tally
}

export const material = (rows: TimelineItem[]) => rows.filter((r) => r.tier !== 'routine')
export const routine = (rows: TimelineItem[]) => rows.filter((r) => r.tier === 'routine')
export const latestResults = (rows: TimelineItem[]) => rows.find((r) => r.results)
export const latestPeople = (rows: TimelineItem[]) => rows.find((r) => r.people?.length)
