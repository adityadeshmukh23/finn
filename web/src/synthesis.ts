import type { Card } from './api'
import type { Timeline } from './company'
import { lastMaterialBefore } from './company'
import { resultsWithoutFigures, rowFigure } from './figure'
import { dayMonth } from './format'
import { eventLabel } from './rank'

/**
 * The line at the top of Today. Templates only, no model: every clause is filled from one card's own fields
 * and links to that row. It reports what happened and when; it never says one thing caused another.
 */
export interface Clause { symbol: string; text: string }

const MAX_CLAUSES = 2

// Keeps "M&A" and "CEO/CFO", lowers "Board change".
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)

export function clauseFor(card: Card, windowStart: string, timeline: Timeline | null): string {
  const name = card.company
  const fig = rowFigure(card)
  if (card.lead.category === 'market' && fig) {
    const last = lastMaterialBefore(timeline?.[card.symbol], windowStart)
    return `${name} ${fig.value} ${fig.label}${last ? `; ${dayMonth(last.ts)} filing: ${lower(eventLabel(last.reason))}` : ''}`
  }
  if (card.lead.category === 'results') {
    if (resultsWithoutFigures(card)) return `${name} results filed, figures withheld`
    const r = card.results
    const basis = r?.status === 'extracted' && r.period ? ` (${r.period} qtr)` : ''
    if (fig) return `${name} ${fig.label.replace(' YoY', '')} ${fig.value} YoY${basis}`
  }
  return `${name}: ${lower(eventLabel(card.lead.reason))}`
}

/** The top rows in rank order. Results with nothing to show don't get a clause while anything else can speak. */
export function synthesis(cards: Card[], windowStart: string, timeline: Timeline | null): Clause[] {
  const speaking = cards.filter((c) => !resultsWithoutFigures(c))
  return (speaking.length ? speaking : cards).slice(0, MAX_CLAUSES)
    .map((c) => ({ symbol: c.symbol, text: clauseFor(c, windowStart, timeline) }))
}

/** The Compact closing line. The count at the top already says what's left to look at. */
export function compactEnd(handled: number, filtered: number): string {
  return `${handled > 0 ? `${handled} handled, ` : ''}${filtered > 0 ? `${filtered} filtered. ` : ''}Nothing else is waiting.`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The last line of a briefing. "Handled" only ever counts what the investor actually cleared. */
export function briefingEnd(left: number, handled: number, filtered: number): string {
  const f = `${filtered} filtered`
  if (left === 0) return `${handled} handled, ${f}. Nothing else is waiting.`
  const look = `${plural(left, 'company', 'companies')} to look at`
  return `${handled > 0 ? `${handled} handled, ` : ''}${look}, ${f}. Nothing else is waiting.`
}
